from fastapi import FastAPI, APIRouter, HTTPException, Request
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
            # 1. push_tokens table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS push_tokens (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    token TEXT UNIQUE NOT NULL,
                    platform TEXT DEFAULT 'unknown',
                    user_id TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            # 2. Unique index on article_url to prevent duplicates
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_article_url
                ON articles(article_url)
                WHERE article_url IS NOT NULL AND article_url != ''
            """)

            # 3. Fix source_url: set to homepage domain from sources table
            cur.execute("""
                UPDATE articles a
                SET source_url = regexp_replace(s.url, '^(https?://[^/]+).*', '\\1')
                FROM sources s
                WHERE a.source_name = s.name
                  AND (a.source_url IS NULL OR a.source_url = '')
            """)
            sources_fixed = cur.rowcount

            # 4. Clean any source_url that still has a path component (feed URLs etc.)
            cur.execute("""
                UPDATE articles
                SET source_url = regexp_replace(source_url, '^(https?://[^/]+).*', '\\1')
                WHERE source_url ~ '^https?://[^/]+/.+'
            """)
            path_fixed = cur.rowcount

            # 5. Final fallback: extract domain from article_url for any remaining missing source_url
            cur.execute("""
                UPDATE articles
                SET source_url = regexp_replace(article_url, '^(https?://[^/]+).*', '\\1')
                WHERE (source_url IS NULL OR source_url = '')
                  AND article_url IS NOT NULL AND article_url != ''
            """)
            domain_fixed = cur.rowcount

            conn.commit()
        logger.info(f"Migrations done: push_tokens ready, unique index on article_url, "
                    f"source_url fixed for {sources_fixed + domain_fixed} articles")
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
        rows = query(
            "SELECT * FROM articles WHERE status = 'published' AND category = %s ORDER BY published_at DESC LIMIT %s OFFSET %s",
            (category, limit, offset)
        )
        total_rows = query("SELECT count(*) as cnt FROM articles WHERE status = 'published' AND category = %s", (category,))
    else:
        rows = query(
            "SELECT * FROM articles WHERE status = 'published' AND published_at >= NOW() - INTERVAL '2 days' ORDER BY published_at DESC LIMIT %s OFFSET %s",
            (limit, offset)
        )
        total_rows = query("SELECT count(*) as cnt FROM articles WHERE status = 'published' AND published_at >= NOW() - INTERVAL '2 days'")
        
        # Fallback if there are barely any articles in the 48 hour window
        if (not rows or len(rows) < limit) and offset == 0:
            rows = query(
                "SELECT * FROM articles WHERE status = 'published' AND published_at >= NOW() - INTERVAL '7 days' ORDER BY published_at DESC LIMIT %s OFFSET %s",
                (limit, offset)
            )
            total_rows = query("SELECT count(*) as cnt FROM articles WHERE status = 'published' AND published_at >= NOW() - INTERVAL '7 days'")
            
    total = total_rows[0]["cnt"] if total_rows else 0

    # ── arXiv curation for home feed ─────────────────────────────────────────
    # Cap arXiv at MAX_ARXIV items and prevent consecutive arXiv cards
    if not category or category == "Latest":
        MAX_ARXIV = 2
        rows = rows or []
        arxiv_items = [r for r in rows if "arxiv.org" in (r.get("article_url") or "").lower()]
        non_arxiv = [r for r in rows if r not in arxiv_items]

        # Keep only the freshest MAX_ARXIV arXiv papers (already sorted by date)
        kept_arxiv = arxiv_items[:MAX_ARXIV]

        # Interleave: place arXiv cards with gaps (never back-to-back)
        curated = []
        arxiv_q = list(kept_arxiv)
        gap = 0
        for art in non_arxiv:
            curated.append(art)
            gap += 1
            # Insert an arXiv card every ~4 non-arXiv cards
            if arxiv_q and gap >= 4:
                curated.append(arxiv_q.pop(0))
                gap = 0
        # Append any remaining arXiv at the end (still respects the cap)
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
def register_push_token(req: PushTokenRequest):
    try:
        execute(
            "INSERT INTO push_tokens (token, platform) VALUES (%s, %s) ON CONFLICT (token) DO UPDATE SET platform = %s",
            (req.token, req.platform, req.platform)
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

# ─── Admin ────────────────────────────────────────────────────────────────────

@api_router.post("/admin/ingest")
def trigger_ingestion():
    """Trigger content ingestion pipeline. Sends push notifications only for newly added articles."""
    try:
        from ingestor import run_ingestion
        result = run_ingestion()

        new_ids = result.get("new_article_ids", [])
        push_result = {"sent": 0, "errors": 0}

        if new_ids:
            try:
                token_rows = query("SELECT token FROM push_tokens")
                tokens = [r['token'] for r in (token_rows or [])]
                if tokens:
                    count = len(new_ids)
                    # Fetch one representative article title for the notification
                    sample_rows = query(
                        "SELECT title FROM articles WHERE id = %s::uuid LIMIT 1",
                        (new_ids[0],)
                    )
                    sample_title = sample_rows[0]["title"][:60] if sample_rows else "New AI stories"
                    push_result = send_expo_notifications(
                        tokens,
                        "🤖 New on AIBrief24",
                        f"{count} new article{'s' if count > 1 else ''} — {sample_title}",
                        data={"type": "new_articles", "article_id": new_ids[0]}
                    )

                # Mark all new articles as notification_sent regardless of token count
                from database import _pool as pool_ref
                conn = pool_ref.getconn()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE articles SET notification_sent = true WHERE id = ANY(%s::uuid[])",
                            (new_ids,)
                        )
                        conn.commit()
                finally:
                    pool_ref.putconn(conn)
            except Exception as e:
                logger.warning(f"Post-ingest notification error: {e}")

        result["push"] = push_result
        return result
    except Exception as e:
        logger.error(f"Ingestion error: {e}")
        raise HTTPException(500, f"Ingestion failed: {str(e)}")

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
