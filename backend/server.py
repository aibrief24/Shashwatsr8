from fastapi import FastAPI, APIRouter, HTTPException, Request, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from auth import (
    supabase_signup, supabase_login, supabase_get_user,
    supabase_refresh_token, supabase_reset_password, supabase_logout,
    get_current_user,
)
from database import query, execute, insert_returning
from notifier import send_expo_notifications

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CATEGORIES = [
    "Latest", "AI Tools", "AI Startups", "AI Models", "AI Research",
    "Funding News", "Product Launches", "Big Tech AI", "Open Source AI"
]

# ─── DB Migrations ────────────────────────────────────────────────────────────

def _run_migrations():
    """Create missing tables and ensure data integrity constraints."""
    conn = None
    try:
        from database import _pool
        conn = _pool.getconn()
        with conn.cursor() as cur:
            # ── core tables ────────────────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS push_tokens (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    token TEXT UNIQUE NOT NULL,
                    platform TEXT DEFAULT 'unknown',
                    user_id TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS notification_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    article_id TEXT,
                    status TEXT,
                    provider_response TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            # ── notification_jobs ──────────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS notification_jobs (
                    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    article_id    UUID NOT NULL,
                    status        TEXT NOT NULL DEFAULT 'pending',
                    attempt_count INT  NOT NULL DEFAULT 0,
                    max_attempts  INT  NOT NULL DEFAULT 3,
                    scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    processed_at  TIMESTAMPTZ,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    error         TEXT
                )
            """)
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_jobs_article
                    ON notification_jobs(article_id)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_notif_jobs_status_sched
                    ON notification_jobs(status, scheduled_at)
            """)

            # ── push_tokens hygiene columns ────────────────────────────────────
            for col_sql in [
                "ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS is_active       BOOLEAN     DEFAULT true",
                "ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ",
                "ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS last_error       TEXT",
                "ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW()",
            ]:
                cur.execute(col_sql)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active)
            """)

            # ── articles: production notification tracking ──────────────────────
            for col_sql in [
                "ALTER TABLE articles ADD COLUMN IF NOT EXISTS notification_status  TEXT",
                "ALTER TABLE articles ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ",
                "ALTER TABLE articles ADD COLUMN IF NOT EXISTS notification_error   TEXT",
            ]:
                cur.execute(col_sql)

            # ── notification_logs: richer per-send records ─────────────────────
            for col_sql in [
                "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS job_id         TEXT",
                "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS token          TEXT",
                "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS ticket_id      TEXT",
                "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS receipt_status TEXT",
                "ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS error          TEXT",
            ]:
                cur.execute(col_sql)

            # ── article_url unique index ───────────────────────────────────────
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_article_url
                ON articles(article_url)
                WHERE article_url IS NOT NULL AND article_url != ''
            """)

            # ── source_url fixes (idempotent) ──────────────────────────────────
            cur.execute("""
                UPDATE articles a
                SET source_url = regexp_replace(s.url, '^(https?://[^/]+).*', '\\1')
                FROM sources s
                WHERE a.source_name = s.name
                  AND (a.source_url IS NULL OR a.source_url = '')
            """)
            sources_fixed = cur.rowcount
            cur.execute("""
                UPDATE articles
                SET source_url = regexp_replace(source_url, '^(https?://[^/]+).*', '\\1')
                WHERE source_url ~ '^https?://[^/]+/.+'
            """)
            cur.execute("""
                UPDATE articles
                SET source_url = regexp_replace(article_url, '^(https?://[^/]+).*', '\\1')
                WHERE (source_url IS NULL OR source_url = '')
                  AND article_url IS NOT NULL AND article_url != ''
            """)
            domain_fixed = cur.rowcount

            conn.commit()
        logger.info(f"Migrations done: notification_jobs, push_tokens hygiene, articles tracking, notification_logs upgraded. source_url fixed for {sources_fixed + domain_fixed} articles")
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        logger.warning(f"Migration warning: {e}")
    finally:
        if conn:
            try:
                from database import _pool
                _pool.putconn(conn)
            except Exception:
                pass

_run_migrations()

app = FastAPI(title="AIBrief24 API")
api_router = APIRouter(prefix="/api")

# ─── Models ───────────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str
    password: str
    name: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class BookmarkRequest(BaseModel):
    article_id: str

class PushTokenRequest(BaseModel):
    token: str
    platform: str = "unknown"

class ResetPasswordRequest(BaseModel):
    email: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# ─── Helper: serialize rows ──────────────────────────────────────────────────

def _serialize(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if k == '_id':
            continue
        if isinstance(v, uuid.UUID):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out

def _serialize_list(rows: list) -> list:
    return [_serialize(r) for r in rows]

# ─── Helper: upsert profile ──────────────────────────────────────────────────

def _upsert_profile(user_id: str, email: str, name: str = ""):
    """Store basic user profile data. Uses 'users' table as profile store."""
    try:
        execute(
            "INSERT INTO users (id, email) VALUES (%s, %s) ON CONFLICT (id) DO UPDATE SET email = %s",
            (user_id, email, email)
        )
    except Exception as e:
        logger.warning(f"Profile upsert error (non-blocking): {e}")

# ─── Auth (Supabase Auth) ────────────────────────────────────────────────────

@api_router.post("/auth/signup")
def signup(req: SignupRequest):
    data = supabase_signup(req.email, req.password)
    user = data.get("user", {}) or {}
    session = data.get("session") or data  # session may be at top level
    access_token = data.get("access_token") or (session.get("access_token") if isinstance(session, dict) else None)
    refresh_token = data.get("refresh_token") or (session.get("refresh_token") if isinstance(session, dict) else None)
    user_id = user.get("id", "")
    email = user.get("email", req.email)

    # Create profile entry
    if user_id:
        _upsert_profile(user_id, email, req.name)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": user_id,
            "email": email,
            "name": req.name or email.split("@")[0],
        },
    }


@api_router.post("/auth/login")
def login(req: LoginRequest):
    data = supabase_login(req.email, req.password)
    user = data.get("user", {}) or {}
    user_id = user.get("id", "")
    email = user.get("email", req.email)

    # Upsert profile on login
    if user_id:
        _upsert_profile(user_id, email)

    # Get display name from profile
    name = email.split("@")[0]
    try:
        rows = query("SELECT name FROM profiles WHERE id = %s", (user_id,))
        if rows and rows[0].get("name"):
            name = rows[0]["name"]
    except Exception:
        pass

    return {
        "access_token": data.get("access_token", ""),
        "refresh_token": data.get("refresh_token", ""),
        "user": {
            "id": user_id,
            "email": email,
            "name": email.split("@")[0] if email else "",
        },
    }


@api_router.get("/auth/me")
def get_me(request: Request):
    payload = get_current_user(request)
    user_id = payload["sub"]
    email = payload["email"]
    name = email.split("@")[0] if email else ""
    return {"id": user_id, "email": email, "name": name}


@api_router.post("/auth/refresh")
def refresh(req: RefreshTokenRequest):
    data = supabase_refresh_token(req.refresh_token)
    user = data.get("user", {}) or {}
    return {
        "access_token": data.get("access_token", ""),
        "refresh_token": data.get("refresh_token", ""),
        "user": {
            "id": user.get("id", ""),
            "email": user.get("email", ""),
        },
    }


@api_router.post("/auth/reset-password")
def reset_password(req: ResetPasswordRequest):
    return supabase_reset_password(req.email)


@api_router.post("/auth/logout")
def logout(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            supabase_logout(token)
        except Exception:
            pass
    return {"success": True}

# ─── Articles ─────────────────────────────────────────────────────────────────

@api_router.get("/articles")
def get_articles(category: Optional[str] = None, limit: int = 50, offset: int = 0):
    if category and category != "Latest":
        rows = query("""
            SELECT * FROM (
                SELECT DISTINCT ON (LOWER(TRIM(title))) *
                FROM articles
                WHERE status = 'published' AND category = %s
                ORDER BY LOWER(TRIM(title)), published_at DESC
            ) sub
            ORDER BY published_at DESC
            LIMIT %s OFFSET %s
        """, (category, limit, offset))
        total_rows = query("SELECT count(DISTINCT LOWER(TRIM(title))) as cnt FROM articles WHERE status = 'published' AND category = %s", (category,))
    else:
        rows = query("""
            SELECT * FROM (
                SELECT DISTINCT ON (LOWER(TRIM(title))) *
                FROM articles
                WHERE status = 'published' 
                  AND published_at >= NOW() - INTERVAL '2 days'
                  AND title IS NOT NULL AND title != ''
                  AND summary IS NOT NULL AND summary != ''
                ORDER BY LOWER(TRIM(title)), published_at DESC
            ) sub
            ORDER BY published_at DESC
            LIMIT %s OFFSET %s
        """, (limit, offset))
        total_rows = query("SELECT count(DISTINCT LOWER(TRIM(title))) as cnt FROM articles WHERE status = 'published' AND published_at >= NOW() - INTERVAL '2 days'")
        
        # Extended fallback to 7 days if exact dedupe aggressively shrinks payload
        if (not rows or len(rows) < limit) and offset == 0:
            rows = query("""
                SELECT * FROM (
                    SELECT DISTINCT ON (LOWER(TRIM(title))) *
                    FROM articles
                    WHERE status = 'published' 
                      AND published_at >= NOW() - INTERVAL '7 days'
                      AND title IS NOT NULL AND title != ''
                      AND summary IS NOT NULL AND summary != ''
                    ORDER BY LOWER(TRIM(title)), published_at DESC
                ) sub
                ORDER BY published_at DESC
                LIMIT %s OFFSET %s
            """, (limit, offset))
            total_rows = query("SELECT count(DISTINCT LOWER(TRIM(title))) as cnt FROM articles WHERE status = 'published' AND published_at >= NOW() - INTERVAL '7 days'")
            
    total = total_rows[0]["cnt"] if total_rows else 0

    # ── arXiv curation for home feed ─────────────────────────────────────────
    # Cap arXiv at MAX_ARXIV items but prevent starving the feed if payload is too thin
    if not category or category == "Latest":
        MAX_ARXIV = 4
        rows = rows or []
        arxiv_items = [r for r in rows if "arxiv.org" in (r.get("article_url") or "").lower()]
        non_arxiv = [r for r in rows if r not in arxiv_items]

        # Only strictly clip arxiv items if we have plenty of standard content to form 15 items
        if len(non_arxiv) + min(len(arxiv_items), MAX_ARXIV) < 15:
            kept_arxiv = arxiv_items  # Rely on them heavily to backfill the feed target
        else:
            kept_arxiv = arxiv_items[:MAX_ARXIV]

        # Interleave: place arXiv cards with gaps (never back-to-back)
        curated = []
        arxiv_q = list(kept_arxiv)
        gap = 0
        for art in non_arxiv:
            curated.append(art)
            gap += 1
            # Insert an arXiv card every ~3 non-arXiv cards
            if arxiv_q and gap >= 3:
                curated.append(arxiv_q.pop(0))
                gap = 0
        # Append any remaining arXiv at the end
        curated.extend(arxiv_q)

        rows = curated

    return {"articles": _serialize_list(rows or []), "total": total}


@api_router.get("/articles/breaking")
def get_breaking():
    rows = query("SELECT * FROM articles WHERE is_breaking = true AND status = 'published' ORDER BY published_at DESC LIMIT 10")
    return {"articles": _serialize_list(rows or [])}


@api_router.get("/articles/search")
def search_articles(q: str = "", limit: int = 20):
    if not q:
        return {"articles": [], "total": 0}
    pattern = f"%{q}%"
    rows = query(
        "SELECT * FROM articles WHERE status = 'published' AND (title ILIKE %s OR summary ILIKE %s OR source_name ILIKE %s OR category ILIKE %s) ORDER BY published_at DESC LIMIT %s",
        (pattern, pattern, pattern, pattern, limit)
    )
    return {"articles": _serialize_list(rows or []), "total": len(rows or [])}


@api_router.get("/articles/{article_id}")
def get_article(article_id: str):
    rows = query("SELECT * FROM articles WHERE id = %s", (article_id,))
    if not rows:
        raise HTTPException(404, "Article not found")
    return _serialize(rows[0])

# ─── Categories ───────────────────────────────────────────────────────────────

@api_router.get("/categories")
def get_categories():
    rows = query("SELECT category, count(*) as cnt FROM articles WHERE status = 'published' GROUP BY category")
    counts = {r["category"]: r["cnt"] for r in (rows or [])}
    return {"categories": [{"name": c, "count": counts.get(c, 0)} for c in CATEGORIES]}

# ─── Bookmarks (uses Supabase Auth user ID) ──────────────────────────────────

@api_router.get("/bookmarks")
def get_bookmarks(request: Request):
    payload = get_current_user(request)
    uid = payload["sub"]
    rows = query(
        "SELECT a.* FROM articles a INNER JOIN bookmarks b ON a.id::text = b.article_id::text WHERE b.user_id = %s ORDER BY b.created_at DESC",
        (uid,)
    )
    return {"bookmarks": _serialize_list(rows or [])}


@api_router.post("/bookmarks")
def add_bookmark(req: BookmarkRequest, request: Request):
    payload = get_current_user(request)
    uid = payload["sub"]
    try:
        execute(
            "INSERT INTO bookmarks (user_id, article_id) VALUES (%s, %s::uuid) ON CONFLICT (user_id, article_id) DO NOTHING",
            (uid, req.article_id)
        )
    except Exception as e:
        logger.warning(f"Bookmark insert error: {e}")
    return {"success": True, "message": "Bookmarked"}


@api_router.delete("/bookmarks/{article_id}")
def remove_bookmark(article_id: str, request: Request):
    payload = get_current_user(request)
    uid = payload["sub"]
    execute("DELETE FROM bookmarks WHERE user_id = %s AND article_id::text = %s", (uid, article_id))
    return {"success": True, "message": "Removed"}


@api_router.get("/bookmarks/ids")
def get_bookmark_ids(request: Request):
    payload = get_current_user(request)
    uid = payload["sub"]
    rows = query("SELECT article_id FROM bookmarks WHERE user_id = %s", (uid,))
    return {"ids": [str(r["article_id"]) for r in (rows or [])]}

# ─── Push Notifications ──────────────────────────────────────────────────────

@api_router.post("/push/register")
def register_push_token(req: PushTokenRequest, request: Request):
    user_id = None
    try:
        payload = get_current_user(request)
        user_id = payload.get("sub")
    except Exception:
        pass

    try:
        execute(
            "INSERT INTO push_tokens (token, platform, user_id) VALUES (%s, %s, %s) ON CONFLICT (token) DO UPDATE SET platform = %s, user_id = %s",
            (req.token, req.platform, user_id, req.platform, user_id)
        )
    except Exception as e:
        logger.warning(f"Push token register error: {e}")
    return {"success": True}

@api_router.post("/push/send")
def send_notification(article_id: str = ""):
    rows = query("SELECT * FROM articles WHERE id = %s", (article_id,))
    if not rows:
        raise HTTPException(404, "Article not found")
    article = rows[0]
    title_text = f"AIBrief24: {str(article['title'])[:60]}"
    body_text = str(article.get('summary', ''))[:120] + "..."

    # Fetch all registered push tokens
    token_rows = query("SELECT token FROM push_tokens")
    token_list = [r['token'] for r in (token_rows or [])]

    # Send via Expo Push API
    result = send_expo_notifications(
        token_list,
        title_text,
        body_text,
        data={"article_id": article_id}
    )

    # Log notification
    try:
        insert_returning(
            "INSERT INTO notification_logs (article_id, status, provider_response) VALUES (%s, %s, %s) RETURNING id",
            (article_id, "sent", str(result))
        )
    except Exception as e:
        logger.warning(f"Notification log error: {e}")

    return {"success": True, "sent": result.get("sent", 0), "errors": result.get("errors", 0), "tokens": len(token_list)}

# ── Admin key guard ──────────────────────────────────────────────────────────
ADMIN_KEY = os.getenv("ADMIN_KEY", "")

def _require_admin(request: Request):
    if not ADMIN_KEY:
        return  # not configured — open in dev
    key = request.headers.get("X-Admin-Key", "")
    if key != ADMIN_KEY:
        raise HTTPException(401, "Unauthorized")

# ─── Admin ────────────────────────────────────────────────────────────────────

def _run_ingestion_background():
    """Background task: ingest articles then create notification jobs.
    Runs AFTER the HTTP response has already been sent.
    """
    logger.info("[INGEST] background task started")
    try:
        logger.info("[INGEST] before run_ingestion()")
        from ingestor import run_ingestion
        result = run_ingestion()
        logger.info("[INGEST] after run_ingestion()")

        new_ids = result.get("new_article_ids", [])
        logger.info(f"[INGEST] new_article_ids count: {len(new_ids)}")

        logger.info(f"[INGEST] background task done — articles={result.get('total',0)}")
    except Exception as e:
        logger.error(f"[INGEST] background task error: {e}")


@api_router.post("/admin/ingest")
def trigger_ingestion(background_tasks: BackgroundTasks, request: Request):
    """Return immediately. Heavy ingestion + job creation runs in the background."""
    logger.info("[INGEST] route entered")
    _require_admin(request)
    logger.info("[INGEST] returning response")
    background_tasks.add_task(_run_ingestion_background)
    return {"status": "accepted", "message": "Ingestion started in background. Poll /admin/notification-status to track progress."}


@api_router.post("/admin/process-notifications")
def process_notifications(request: Request):
    """Run the notification worker — claim pending jobs, send, poll receipts."""
    _require_admin(request)
    try:
        from notification_worker import run_pending_jobs
        result = run_pending_jobs(limit=50)
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Notification worker error: {e}")
        raise HTTPException(500, str(e))


@api_router.get("/admin/notification-status")
def notification_status(request: Request):
    """Return queue stats and token health — useful for monitoring."""
    _require_admin(request)
    try:
        from notification_worker import get_queue_status
        return get_queue_status()
    except Exception as e:
        logger.error(f"Notification status error: {e}")
        raise HTTPException(500, str(e))

@api_router.post("/admin/recategorize")
def recategorize_articles():
    """Re-categorize all 'Latest' articles using the improved keyword set."""
    try:
        from ingestor import _detect_category_strict
        rows = query("SELECT id, title, summary FROM articles")
        if not rows:
            return {"updated": 0, "message": "No articles need re-categorization"}

        updated = 0
        from database import _pool as pool_ref
        conn = pool_ref.getconn()
        try:
            with conn.cursor() as cur:
                for row in rows:
                    cat, _, _ = _detect_category_strict(str(row.get("title", "")), str(row.get("summary", "")))
                    if cat != "Latest":
                        cur.execute(
                            "UPDATE articles SET category = %s WHERE id = %s::uuid",
                            (cat, str(row["id"]))
                        )
                        updated += 1
                conn.commit()
        finally:
            pool_ref.putconn(conn)

        logger.info(f"Re-categorized {updated} articles")
        return {"updated": updated, "total_checked": len(rows)}
    except Exception as e:
        logger.error(f"Recategorize error: {e}")
        raise HTTPException(500, str(e))
def fix_article_images():
    """Update all articles with varied images from the pool using a single bulk SQL statement."""
    try:
        from ingestor import IMAGE_POOL
        from database import _pool
        n = len(IMAGE_POOL)
        case_parts = " ".join([f"WHEN ({i}) THEN '{img}'" for i, img in enumerate(IMAGE_POOL)])
        sql = f"""
            UPDATE articles
            SET image_url = CASE (ABS(HASHTEXT(id::text)) % {n})
              {case_parts}
              ELSE '{IMAGE_POOL[0]}'
            END
        """
        conn = _pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
                updated = cur.rowcount
                conn.commit()
        finally:
            _pool.putconn(conn)
        logger.info(f"Bulk-updated images for {updated} articles")
        return {"updated": updated, "message": f"Updated {updated} articles with varied images"}
    except Exception as e:
        logger.error(f"fix-images error: {e}")
        raise HTTPException(500, str(e))

# ─── Settings ─────────────────────────────────────────────────────────────────

@api_router.get("/settings")
def get_settings():
    rows = query("SELECT notifications_enabled_default, telegram_url, website_url FROM app_settings LIMIT 1")
    if rows:
        return _serialize(rows[0])
    return {"notifications_enabled_default": True, "telegram_url": "https://t.me/aibrief24", "website_url": "https://aibrief24.com/"}

# ─── Sources ──────────────────────────────────────────────────────────────────

@api_router.get("/sources")
def get_sources():
    rows = query("SELECT name, url, type, active, category_hint FROM sources ORDER BY name")
    return {"sources": _serialize_list(rows or []), "total": len(rows or [])}

# ─── Health ───────────────────────────────────────────────────────────────────

@api_router.get("/health")
def health():
    try:
        art_count = query("SELECT count(*) as cnt FROM articles")
        src_count = query("SELECT count(*) as cnt FROM sources")
        return {
            "status": "ok",
            "auth": "supabase_auth",
            "database": "supabase_postgres",
            "articles_count": art_count[0]["cnt"] if art_count else 0,
            "sources_count": src_count[0]["cnt"] if src_count else 0,
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@api_router.get("/")
def root():
    return {"app": "AIBrief24", "version": "2.0.0", "tagline": "AI News in 60 Seconds", "auth": "supabase"}

# ─── App Setup ────────────────────────────────────────────────────────────────

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
