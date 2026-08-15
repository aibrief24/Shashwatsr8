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
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
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
    logger.info(f"[/auth/update-password] Supabase update user response status: {res.status_code}")
    logger.info(f"[/auth/update-password] Supabase update user response body: {res.text}")
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
    logger.info(f"[/auth/exchange-code] Supabase response status: {res.status_code}")
    logger.info(f"[/auth/exchange-code] Supabase response body: {res.text}")
    if res.status_code >= 400:
        data = res.json()
        msg = data.get("error_description") or data.get("msg") or "Failed to exchange recovery code"
        raise HTTPException(res.status_code, msg)
    return res.json()


def supabase_delete_user(user_id: str):
    """Permanently delete a Supabase Auth user via the Admin API.

    Requires SUPABASE_SERVICE_ROLE_KEY — the anon key cannot reach /admin/*.
    Raises HTTPException on any failure so callers never report a successful
    deletion while the auth user still exists.
    """
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            500,
            "Account deletion is not configured on this server: "
            "SUPABASE_SERVICE_ROLE_KEY is missing from the environment.",
        )

    res = _http.delete(
        f"{AUTH_URL}/admin/users/{user_id}",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        },
    )

    # Already gone — deletion is idempotent, the end state is what we wanted.
    if res.status_code == 404:
        logger.info(f"[/auth/account] Supabase user {user_id} already absent (404)")
        return {"success": True, "message": "Auth user already deleted"}

    if res.status_code >= 400:
        try:
            data = res.json()
            msg = data.get("msg") or data.get("message") or data.get("error_description") or res.text
        except Exception:
            msg = res.text
        logger.error(f"[/auth/account] Supabase admin delete failed ({res.status_code}): {msg}")
        raise HTTPException(res.status_code, f"Failed to delete auth user: {msg}")

    return {"success": True, "message": "Auth user deleted"}


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
