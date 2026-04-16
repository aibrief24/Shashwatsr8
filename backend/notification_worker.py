"""
notification_worker.py — Production async push notification worker for AIBrief24.

Flow:
  1. Claim pending jobs (FOR UPDATE SKIP LOCKED — safe for concurrent callers)
  2. For each job: decide policy, fetch active tokens, batch-send via Expo
  3. Store ticket IDs in notification_logs
  4. Poll Expo receipts (8s wait — decoupled into poll_receipts() for future separation)
  5. Update token hygiene, job status, article fields
"""
import logging
import time
import requests
from database import _pool

logger = logging.getLogger(__name__)

EXPO_PUSH_URL    = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts"

# ── Delivery Policy ────────────────────────────────────────────────────────────
# Change this constant to alter behaviour without touching the worker logic.
#   "all"         — notify for every new article
#   "high_signal" — only breaking / important categories
#   "digest"      — future batch mailer mode (not yet implemented)
DELIVERY_POLICY = "all"
HIGH_SIGNAL_CATEGORIES = {"AI Models", "Funding News", "Product Launches", "Big Tech AI"}

def _should_notify(article: dict) -> bool:
    if DELIVERY_POLICY == "all":
        return True
    if DELIVERY_POLICY == "high_signal":
        return bool(article.get("is_breaking")) or article.get("category") in HIGH_SIGNAL_CATEGORIES
    return False


# ── Low-level Expo helpers ─────────────────────────────────────────────────────

def _batch_send(tokens: list[str], title: str, body: str, data: dict) -> list[dict]:
    """Send in Expo-max batches of 100. Returns flat list of per-ticket dicts:
       {token, ticket_id, status, error}
    """
    valid = [t for t in tokens if t and t.startswith(("ExponentPushToken", "expo"))]
    results = []
    for i in range(0, len(valid), 100):
        batch_tokens = valid[i:i+100]
        messages = [
            {"to": t, "title": title, "body": body, "data": data,
             "sound": "default", "priority": "high", "channelId": "default"}
            for t in batch_tokens
        ]
        try:
            resp = requests.post(
                EXPO_PUSH_URL, json=messages,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                timeout=15,
            ).json()
            for idx, item in enumerate(resp.get("data", [])):
                results.append({
                    "token":     batch_tokens[idx],
                    "ticket_id": item.get("id"),
                    "status":    item.get("status"),
                    "error":     item.get("message") if item.get("status") != "ok" else None,
                })
        except Exception as e:
            logger.error(f"[PUSH] Batch send error: {e}")
            for t in batch_tokens:
                results.append({"token": t, "ticket_id": None, "status": "error", "error": str(e)})
    return results


def poll_receipts(ticket_ids: list[str]) -> dict:
    """Given a list of Expo ticket IDs, fetch their delivery receipts.
    Returns {ticket_id: receipt_dict}.
    Designed to be called separately from send phase when needed.
    """
    if not ticket_ids:
        return {}
    try:
        resp = requests.post(
            EXPO_RECEIPT_URL, json={"ids": ticket_ids},
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=15,
        ).json()
        return resp.get("data", {})
    except Exception as e:
        logger.error(f"[PUSH] Receipt poll error: {e}")
        return {}


# ── DB helpers (use raw connection to allow transactions) ─────────────────────

def _db_conn():
    return _pool.getconn()

def _db_put(conn):
    _pool.putconn(conn)


# ── Main worker entry point ────────────────────────────────────────────────────

def run_pending_jobs(limit: int = 50, admin_key: str = "") -> dict:
    """
    Claim up to `limit` pending notification jobs and process them.
    Returns summary dict.
    """
    conn = _db_conn()
    try:
        # ── 1. CLAIM jobs atomically ──────────────────────────────────────────
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE notification_jobs
                SET status        = 'processing',
                    attempt_count = attempt_count + 1,
                    updated_at    = NOW()
                WHERE id IN (
                    SELECT id FROM notification_jobs
                    WHERE status = 'pending'
                      AND attempt_count < max_attempts
                    ORDER BY scheduled_at
                    LIMIT %s
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, article_id, attempt_count
            """, (limit,))
            claimed = cur.fetchall()
            conn.commit()

        if not claimed:
            logger.info("[PUSH-WORKER] No pending jobs.")
            return {"processed": 0, "sent": 0, "failed": 0, "no_tokens": 0}

        logger.info(f"[PUSH-WORKER] Claimed {len(claimed)} job(s).")

        # ── 2. Fetch active tokens ONCE for this batch ────────────────────────
        with conn.cursor() as cur:
            cur.execute("SELECT token FROM push_tokens WHERE is_active = true ORDER BY created_at DESC LIMIT 200")
            token_rows = cur.fetchall()
        tokens = [r[0] for r in token_rows]

        summary = {"processed": 0, "sent": 0, "failed": 0, "no_tokens": 0}

        for job_id, article_id, attempt in claimed:
            job_id     = str(job_id)
            article_id = str(article_id)
            try:
                _process_job(conn, job_id, article_id, tokens)
                summary["processed"] += 1
                summary["sent"] += 1
            except _NoTokensError:
                summary["no_tokens"] += 1
                summary["processed"] += 1
                _mark_job(conn, job_id, "no_tokens",
                          "No active push tokens registered at send time.")
                _mark_article(conn, article_id, "no_tokens",
                              error="No active tokens at send time.")
            except Exception as e:
                logger.error(f"[PUSH-WORKER] Job {job_id} failed: {e}")
                summary["failed"] += 1
                # If exhausted retries → permanent failure; else reset to pending
                with conn.cursor() as cur:
                    cur.execute("SELECT attempt_count, max_attempts FROM notification_jobs WHERE id = %s", (job_id,))
                    row = cur.fetchone()
                if row and row[0] >= row[1]:
                    _mark_job(conn, job_id, "failed", str(e))
                    _mark_article(conn, article_id, "failed", error=str(e))
                else:
                    _mark_job(conn, job_id, "pending", str(e))  # will retry

        return summary

    finally:
        _db_put(conn)


class _NoTokensError(Exception):
    pass


def _process_job(conn, job_id: str, article_id: str, tokens: list[str]):
    """Core send + receipt flow for a single job."""

    # ── a. Fetch article ──────────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute("SELECT id, title, category, is_breaking FROM articles WHERE id = %s::uuid", (article_id,))
        row = cur.fetchone()
    if not row:
        raise Exception(f"Article {article_id} not found")

    article = {"id": str(row[0]), "title": row[1], "category": row[2], "is_breaking": row[3]}

    # ── b. Delivery policy check ──────────────────────────────────────────────
    if not _should_notify(article):
        logger.info(f"[PUSH-WORKER] Skipping {article_id} per delivery policy ({DELIVERY_POLICY})")
        _mark_job(conn, job_id, "sent", note="Skipped by delivery policy")
        _mark_article(conn, article_id, "skipped")
        return

    # ── c. Check tokens ───────────────────────────────────────────────────────
    if not tokens:
        raise _NoTokensError()

    title     = "AIBrief24"
    body      = (article["title"] or "")[:120]
    data      = {"type": "new_article", "article_id": article_id,
                 "deep_link": f"aibrief24://article/{article_id}"}

    # ── d. Batch send ─────────────────────────────────────────────────────────
    send_results = _batch_send(tokens, title, body, data)
    ticket_ids   = [r["ticket_id"] for r in send_results if r.get("ticket_id")]

    # ── e. Log each ticket into notification_logs ─────────────────────────────
    with conn.cursor() as cur:
        for r in send_results:
            cur.execute("""
                INSERT INTO notification_logs
                    (article_id, job_id, token, ticket_id, status, receipt_status, error)
                VALUES (%s, %s, %s, %s, %s, 'pending', %s)
            """, (article_id, job_id, r["token"], r.get("ticket_id"),
                  r["status"], r.get("error")))
        conn.commit()

    logger.info(f"[PUSH-WORKER] Sent to {len(send_results)} tokens, {len(ticket_ids)} tickets.")

    # ── f. Wait for Expo to relay to FCM (decoupled: poll_receipts is separate) ──
    if ticket_ids:
        time.sleep(8)
        receipts = poll_receipts(ticket_ids)
        _apply_receipts(conn, job_id, receipts, send_results)

    # ── g. Mark job and article done ──────────────────────────────────────────
    _mark_job(conn, job_id, "sent")
    _mark_article(conn, article_id, "sent")
    logger.info(f"[PUSH-WORKER] Job {job_id} → sent.")


def _apply_receipts(conn, job_id: str, receipts: dict, send_results: list):
    """Apply Expo receipt outcomes to push_tokens and notification_logs."""
    # Build a ticket_id → token lookup from send_results
    ticket_to_token = {r["ticket_id"]: r["token"] for r in send_results if r.get("ticket_id")}

    with conn.cursor() as cur:
        for ticket_id, receipt in receipts.items():
            token = ticket_to_token.get(ticket_id, "")
            status = receipt.get("status")
            details = receipt.get("details", {})
            err = details.get("error", "") or receipt.get("message", "")

            # Update log row
            cur.execute("""
                UPDATE notification_logs
                SET receipt_status = %s, error = COALESCE(error, %s)
                WHERE ticket_id = %s AND job_id = %s
            """, (status, err or None, ticket_id, job_id))

            if status == "ok":
                cur.execute("""
                    UPDATE push_tokens
                    SET last_success_at = NOW(), updated_at = NOW()
                    WHERE token = %s
                """, (token,))
            elif details.get("error") == "DeviceNotRegistered":
                cur.execute("""
                    UPDATE push_tokens
                    SET is_active = false, last_error = %s, updated_at = NOW()
                    WHERE token = %s
                """, (err, token))
                logger.warning(f"[PUSH-WORKER] Deactivated stale token: {token[:30]}...")

        conn.commit()


# ── Status helpers ─────────────────────────────────────────────────────────────

def _mark_job(conn, job_id: str, status: str, note: str = ""):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE notification_jobs
            SET status = %s, processed_at = NOW(), updated_at = NOW(),
                error = CASE WHEN %s != '' THEN %s ELSE error END
            WHERE id = %s
        """, (status, note, note, job_id))
        conn.commit()


def _mark_article(conn, article_id: str, status: str, error: str = ""):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE articles
            SET notification_status  = %s,
                notification_sent_at = CASE WHEN %s = 'sent' THEN NOW() ELSE notification_sent_at END,
                notification_error   = CASE WHEN %s != '' THEN %s ELSE notification_error END,
                notification_sent    = CASE WHEN %s = 'sent' THEN true ELSE notification_sent END
            WHERE id = %s::uuid
        """, (status, status, error, error, status, article_id))
        conn.commit()


# ── Queue stats ────────────────────────────────────────────────────────────────

def get_queue_status() -> dict:
    conn = _db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT status, COUNT(*) FROM notification_jobs GROUP BY status
            """)
            job_counts = {row[0]: row[1] for row in cur.fetchall()}

            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE is_active = true)  AS active,
                    COUNT(*) FILTER (WHERE is_active = false) AS inactive,
                    COUNT(*)                                   AS total
                FROM push_tokens
            """)
            r = cur.fetchone()
            token_counts = {"active": r[0], "inactive": r[1], "total": r[2]}

        return {"jobs": job_counts, "tokens": token_counts}
    finally:
        _db_put(conn)
