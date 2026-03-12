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

from auth import hash_password, verify_password, create_access_token, get_current_user
from database import query, execute, insert_returning

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

app = FastAPI(title="AIBrief24 API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CATEGORIES = [
    "Latest", "AI Tools", "AI Startups", "AI Models", "AI Research",
    "Funding News", "Product Launches", "Big Tech AI", "Open Source AI"
]

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

# ─── Helper: serialize rows ──────────────────────────────────────────────────

def _serialize(row: dict) -> dict:
    """Convert UUID/datetime fields to strings for JSON."""
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

# ─── Auth ─────────────────────────────────────────────────────────────────────

@api_router.post("/auth/signup")
def signup(req: SignupRequest):
    email = req.email.lower().strip()
    existing = query("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        raise HTTPException(400, "Email already registered")
    user_id = str(uuid.uuid4())
    name = req.name or email.split("@")[0]
    execute(
        "INSERT INTO users (id, email, name, password_hash) VALUES (%s, %s, %s, %s)",
        (user_id, email, name, hash_password(req.password))
    )
    token = create_access_token({"sub": user_id, "email": email})
    return {"token": token, "user": {"id": user_id, "email": email, "name": name}}


@api_router.post("/auth/login")
def login(req: LoginRequest):
    email = req.email.lower().strip()
    rows = query("SELECT id, email, name, password_hash FROM users WHERE email = %s", (email,))
    if not rows:
        raise HTTPException(401, "Invalid email or password")
    user = rows[0]
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    uid = str(user["id"])
    token = create_access_token({"sub": uid, "email": email})
    return {"token": token, "user": {"id": uid, "email": email, "name": user["name"]}}


@api_router.get("/auth/me")
def get_me(request: Request):
    payload = get_current_user(request)
    uid = payload.get("sub", "")
    rows = query("SELECT id, email, name FROM users WHERE id = %s", (uid,))
    if not rows:
        raise HTTPException(404, "User not found")
    return _serialize(rows[0])

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
            "SELECT * FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT %s OFFSET %s",
            (limit, offset)
        )
        total_rows = query("SELECT count(*) as cnt FROM articles WHERE status = 'published'")
    total = total_rows[0]["cnt"] if total_rows else 0
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

# ─── Bookmarks ────────────────────────────────────────────────────────────────

@api_router.get("/bookmarks")
def get_bookmarks(request: Request):
    payload = get_current_user(request)
    uid = payload["sub"]
    rows = query(
        "SELECT a.* FROM articles a INNER JOIN bookmarks b ON a.id = b.article_id WHERE b.user_id = %s ORDER BY b.created_at DESC",
        (uid,)
    )
    return {"bookmarks": _serialize_list(rows or [])}


@api_router.post("/bookmarks")
def add_bookmark(req: BookmarkRequest, request: Request):
    payload = get_current_user(request)
    uid = payload["sub"]
    try:
        execute(
            "INSERT INTO bookmarks (user_id, article_id) VALUES (%s, %s) ON CONFLICT (user_id, article_id) DO NOTHING",
            (uid, req.article_id)
        )
    except Exception as e:
        logger.warning(f"Bookmark insert error: {e}")
    return {"success": True, "message": "Bookmarked"}


@api_router.delete("/bookmarks/{article_id}")
def remove_bookmark(article_id: str, request: Request):
    payload = get_current_user(request)
    uid = payload["sub"]
    execute("DELETE FROM bookmarks WHERE user_id = %s AND article_id = %s", (uid, article_id))
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
    execute(
        "INSERT INTO push_tokens (token, platform) VALUES (%s, %s) ON CONFLICT (token) DO UPDATE SET platform = %s",
        (req.token, req.platform, req.platform)
    )
    return {"success": True}


@api_router.post("/push/send")
def send_notification(article_id: str = ""):
    rows = query("SELECT * FROM articles WHERE id = %s", (article_id,))
    if not rows:
        raise HTTPException(404, "Article not found")
    article = rows[0]
    title_text = f"AIBrief24: {str(article['title'])[:60]}"
    body_text = str(article['summary'])[:120] + "..."
    log_row = insert_returning(
        "INSERT INTO notification_logs (article_id, title, body, status, provider_response) VALUES (%s, %s, %s, %s, %s) RETURNING id, article_id, title, body, sent_at, status",
        (article_id, title_text, body_text, "queued", "Push notification queued for delivery")
    )
    return {"success": True, "log": _serialize(log_row) if log_row else {}}

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
            "database": "supabase",
            "articles_count": art_count[0]["cnt"] if art_count else 0,
            "sources_count": src_count[0]["cnt"] if src_count else 0,
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@api_router.get("/")
def root():
    return {"app": "AIBrief24", "version": "1.0.0", "tagline": "AI News in 60 Seconds"}

# ─── App Setup ────────────────────────────────────────────────────────────────

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
