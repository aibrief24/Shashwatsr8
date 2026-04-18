import os
import httpx
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import Request, HTTPException

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
AUTH_URL = f"{SUPABASE_URL}/auth/v1"

_http = httpx.Client(timeout=15)

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
}


def supabase_signup(email: str, password: str):
    res = _http.post(
        f"{AUTH_URL}/signup",
        json={"email": email, "password": password},
        headers=HEADERS,
    )
    data = res.json()
    if res.status_code >= 400:
        msg = data.get("msg") or data.get("message") or data.get("error_description") or "Signup failed"
        raise HTTPException(res.status_code, msg)
    return data


def supabase_login(email: str, password: str):
    res = _http.post(
        f"{AUTH_URL}/token?grant_type=password",
        json={"email": email, "password": password},
        headers=HEADERS,
    )
    data = res.json()
    if res.status_code >= 400:
        msg = data.get("error_description") or data.get("msg") or data.get("message") or "Invalid email or password"
        raise HTTPException(res.status_code, msg)
    return data


def supabase_get_user(access_token: str):
    res = _http.get(
        f"{AUTH_URL}/user",
        headers={**HEADERS, "Authorization": f"Bearer {access_token}"},
    )
    data = res.json()
    if res.status_code >= 400:
        raise HTTPException(401, "Invalid or expired token")
    return data


def supabase_refresh_token(refresh_token: str):
    res = _http.post(
        f"{AUTH_URL}/token?grant_type=refresh_token",
        json={"refresh_token": refresh_token},
        headers=HEADERS,
    )
    data = res.json()
    if res.status_code >= 400:
        raise HTTPException(401, "Session expired, please login again")
    return data


def supabase_reset_password(email: str):
    res = _http.post(
        f"{AUTH_URL}/recover?redirect_to=aibrief24://reset-password",
        json={"email": email},
        headers=HEADERS,
    )
    if res.status_code >= 400:
        data = res.json()
        msg = data.get("msg") or data.get("message") or "Failed to send reset email"
        raise HTTPException(res.status_code, msg)
    return {"success": True, "message": "Password reset email sent"}


def supabase_update_password(access_token: str, new_password: str):
    res = _http.put(
        f"{AUTH_URL}/user",
        json={"password": new_password},
        headers={**HEADERS, "Authorization": f"Bearer {access_token}"},
    )
    if res.status_code >= 400:
        data = res.json()
        msg = data.get("msg") or data.get("message") or "Failed to update password"
        raise HTTPException(res.status_code, msg)
    return {"success": True, "message": "Password updated successfully"}


def supabase_exchange_code(code: str):
    # Try PKCE exchange. If code_verifier was empty when standard recovery was generated, it usually accepts empty parameters dynamically or defaults internally.
    res = _http.post(
        f"{AUTH_URL}/token?grant_type=pkce",
        json={"auth_code": code, "code_verifier": ""},
        headers=HEADERS,
    )
    if res.status_code >= 400:
        data = res.json()
        msg = data.get("error_description") or data.get("msg") or "Failed to exchange recovery code"
        raise HTTPException(res.status_code, msg)
    return res.json()


def supabase_logout(access_token: str):
    _http.post(
        f"{AUTH_URL}/logout",
        headers={**HEADERS, "Authorization": f"Bearer {access_token}"},
    )
    return {"success": True}


def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")
    token = auth_header.split(" ")[1]
    user = supabase_get_user(token)
    return {"sub": user.get("id", ""), "email": user.get("email", ""), "user": user}
