import os
import json
import sys
import time
import requests
import psycopg2
from dotenv import load_dotenv

# Re-implement bare notifier to prevent importing notifier.py which imports database
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
def send_expo(token):
    res = requests.post(
        EXPO_PUSH_URL,
        json=[{"to": token, "title": "AIBrief24 Test", "body": "End-to-End Test Payload"}],
        headers={"Accept": "application/json", "Content-Type": "application/json"}
    ).json()
    return res

load_dotenv()
try:
    print("Connecting...", flush=True)
    conn = psycopg2.connect(
        user=os.getenv("SUPABASE_DB_USER"),
        password=os.getenv("SUPABASE_DB_PASSWORD"),
        host=os.getenv("SUPABASE_DB_HOST", "").replace(":6543", ":5432"),
        port=os.getenv("SUPABASE_DB_PORT", "5432"),
        database=os.getenv("SUPABASE_DB_NAME", "postgres"),
        connect_timeout=10
    )
    with conn.cursor() as cur:
        cur.execute("SELECT token, created_at FROM push_tokens ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
    
    if not row:
        print("NO_TOKENS", flush=True)
        sys.exit(0)
    
    token = row[0]
    created = row[1]
    print(f"TOKEN: {token}", flush=True)
    print(f"CREATED: {created}", flush=True)

    res = send_expo(token)
    print(f"TICKET: {json.dumps(res)}", flush=True)

    ticket_id = res.get("data", [])[0].get("id")
    if not ticket_id:
        print("TICKET ID NOT FOUND", flush=True)
        sys.exit(0)
    
    print("\nWaiting 6 seconds...", flush=True)
    time.sleep(6)
    
    receipt_res = requests.post(
        "https://exp.host/--/api/v2/push/getReceipts",
        json={"ids": [ticket_id]},
        headers={"Accept": "application/json", "Content-Type": "application/json"}
    ).json()
    print(f"RECEIPT: {json.dumps(receipt_res)}", flush=True)
except Exception as e:
    print(f"ERROR: {e}", flush=True)
