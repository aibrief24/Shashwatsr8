import os
import logging
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# ── Connection pool ───────────────────────────────────────────────────────────
# ThreadedConnectionPool is fine for FastAPI+uvicorn (thread-per-request model),
# but psycopg2 pools do NOT validate connections before handing them out.
# We add pre-ping + retry logic below to handle stale/dead connections.

_pool = psycopg2.pool.ThreadedConnectionPool(
    minconn=2,
    maxconn=10,
    host=os.environ.get("SUPABASE_DB_HOST"),
    port=int(os.environ.get("SUPABASE_DB_PORT", "6543")),
    user=os.environ.get("SUPABASE_DB_USER"),
    password=os.environ.get("SUPABASE_DB_PASSWORD"),
    database=os.environ.get("SUPABASE_DB_NAME", "postgres"),
    connect_timeout=10,
)

# ── Retriable error detection ─────────────────────────────────────────────────

_RETRIABLE_MESSAGES = (
    "connection timed out",
    "could not send data",
    "could not receive data",
    "server closed the connection",
    "connection already closed",
    "terminating connection",
    "connection reset by peer",
    "SSL connection has been closed",
    "broken pipe",
)


def _is_retriable(exc: Exception) -> bool:
    """Return True if the exception indicates a dead/stale connection."""
    msg = str(exc).lower()
    return any(phrase in msg for phrase in _RETRIABLE_MESSAGES)


# ── Pre-ping helper ──────────────────────────────────────────────────────────

def _get_conn():
    """Get a connection from the pool and verify it is alive (pre-ping).

    If the connection is dead, discard it and get a fresh one.  This prevents
    the 'stale connection' cascade that causes all endpoints to fail.
    """
    conn = _pool.getconn()
    try:
        # Lightweight pre-ping: SELECT 1 inside a read-only transaction
        conn.isolation_level  # raises if connection object is broken
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        # If we got here the connection is alive.  Reset any aborted txn state.
        if conn.status != psycopg2.extensions.STATUS_READY:
            conn.rollback()
        return conn
    except Exception:
        # Connection is dead — discard it (close=True) so the pool drops it
        # and opens a fresh one next time.
        logger.warning("[DB] Pre-ping failed — discarding stale connection")
        try:
            _pool.putconn(conn, close=True)
        except Exception:
            pass
        # Get a brand-new connection (pool will create one to replace the closed one)
        conn = _pool.getconn()
        return conn


def _put_conn(conn):
    """Return a connection to the pool.  If it looks broken, discard it."""
    try:
        if conn.closed:
            _pool.putconn(conn, close=True)
        else:
            _pool.putconn(conn)
    except Exception:
        pass


# ── Core query functions with retry ──────────────────────────────────────────

def query(sql: str, params=None, fetch_one=False):
    """Execute a SELECT query and return results.  Retries once on stale connection."""
    last_exc = None
    for attempt in range(2):
        conn = _get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                if cur.description:
                    return dict(cur.fetchone()) if fetch_one else [dict(r) for r in cur.fetchall()]
                conn.commit()
                return None
        except Exception as e:
            last_exc = e
            try:
                conn.rollback()
            except Exception:
                pass
            if attempt == 0 and _is_retriable(e):
                logger.warning(f"[DB] Retriable error on query (attempt 1), retrying: {e}")
                _put_conn(conn)
                continue
            raise
        finally:
            if attempt == 1 or (last_exc is None) or not _is_retriable(last_exc):
                _put_conn(conn)
    # Should not reach here, but just in case:
    raise last_exc  # type: ignore[misc]


def execute(sql: str, params=None):
    """Execute a write query (INSERT/UPDATE/DELETE).  Retries once on stale connection."""
    last_exc = None
    for attempt in range(2):
        conn = _get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                conn.commit()
                return
        except Exception as e:
            last_exc = e
            try:
                conn.rollback()
            except Exception:
                pass
            if attempt == 0 and _is_retriable(e):
                logger.warning(f"[DB] Retriable error on execute (attempt 1), retrying: {e}")
                _put_conn(conn)
                continue
            raise
        finally:
            if attempt == 1 or (last_exc is None) or not _is_retriable(last_exc):
                _put_conn(conn)
    raise last_exc  # type: ignore[misc]


def insert_returning(sql: str, params=None):
    """Execute an INSERT … RETURNING query.  Retries once on stale connection."""
    last_exc = None
    for attempt in range(2):
        conn = _get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                conn.commit()
                if cur.description:
                    return dict(cur.fetchone())
                return None
        except Exception as e:
            last_exc = e
            try:
                conn.rollback()
            except Exception:
                pass
            if attempt == 0 and _is_retriable(e):
                logger.warning(f"[DB] Retriable error on insert_returning (attempt 1), retrying: {e}")
                _put_conn(conn)
                continue
            raise
        finally:
            if attempt == 1 or (last_exc is None) or not _is_retriable(last_exc):
                _put_conn(conn)
    raise last_exc  # type: ignore[misc]


# ── Health check ──────────────────────────────────────────────────────────────

def health_check_db() -> dict:
    """Run SELECT 1 and return status dict.  Used by /api/health/db endpoint."""
    conn = None
    try:
        conn = _get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            row = cur.fetchone()
        return {"status": "ok", "result": row[0] if row else None}
    except Exception as e:
        logger.error(f"[DB] Health check failed: {e}")
        return {"status": "error", "detail": str(e)}
    finally:
        if conn:
            _put_conn(conn)
