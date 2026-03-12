import os
import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Connection pool - reuses connections instead of creating new ones each time
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


def query(sql: str, params=None, fetch_one=False):
    conn = _pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            if cur.description:
                return dict(cur.fetchone()) if fetch_one else [dict(r) for r in cur.fetchall()]
            conn.commit()
            return None
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        _pool.putconn(conn)


def execute(sql: str, params=None):
    conn = _pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        _pool.putconn(conn)


def insert_returning(sql: str, params=None):
    conn = _pool.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            conn.commit()
            if cur.description:
                return dict(cur.fetchone())
            return None
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        _pool.putconn(conn)
