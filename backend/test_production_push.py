import os
import json
import sys
import time
import requests
import uuid
import datetime
import psycopg2
from dotenv import load_dotenv

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"

def send_expo(tokens, title, body, data):
    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": data,
            "sound": "default",
            "priority": "high",
            "channelId": "default",
        }
        for token in tokens
    ]
    res = requests.post(
        EXPO_PUSH_URL,
        json=messages,
        headers={"Accept": "application/json", "Content-Type": "application/json"}
    ).json()
    return res

load_dotenv()
try:
    print("Connecting to Supabase...", flush=True)
    conn = psycopg2.connect(
        user=os.getenv("SUPABASE_DB_USER"),
        password=os.getenv("SUPABASE_DB_PASSWORD"),
        host=os.getenv("SUPABASE_DB_HOST", "").replace(":6543", ":5432"),
        port=os.getenv("SUPABASE_DB_PORT", "5432"),
        database=os.getenv("SUPABASE_DB_NAME", "postgres"),
        connect_timeout=10
    )
    
    article_id = str(uuid.uuid4())
    a_title = "Anthropic Announces Claude 4: The Next Frontier in AGI"
    a_summary = "In a surprise release, Anthropic has unveiled Claude 4, showcasing unprecedented reasoning capabilities, native multi-modal processing, and extended context windows exceeding 2 million tokens."
    a_cat = "AI Models"

    with conn.cursor() as cur:
        # 1. Insert test article
        print(f"Injecting test article: {a_title}", flush=True)
        cur.execute("""
            INSERT INTO articles (id, title, summary, content, article_url, source_name, source_url, image_url, category, is_breaking, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            article_id, a_title, a_summary, a_summary,
            f"https://anthropic.com/news/claude-4-{article_id}", "Anthropic", "anthropic.com",
            "https://images.unsplash.com/photo-1620712943543-bcc4688e7485",
            a_cat, True, "published"
        ))
        
        # 2. Fetch tokens
        cur.execute("SELECT token FROM push_tokens ORDER BY created_at DESC LIMIT 10")
        rows = cur.fetchall()
        
        if not rows:
            print("NO_TOKENS", flush=True)
            sys.exit(0)
            
        tokens = [r[0] for r in rows]
        print(f"Found {len(tokens)} active tokens.", flush=True)

        # 3. Notification Decision & Payload
        body_text = a_title[:100] + ("..." if len(a_title) > 100 else "")
        print(f"Constructing Payload -> Title: AIBrief24 | Body: {body_text}", flush=True)

        res = send_expo(tokens, "AIBrief24", body_text, {"type": "new_article", "article_id": article_id, "category": a_cat, "deep_link": f"aibrief24://article/{article_id}"})
        print(f"\n[TICKET_RESULT]\n{json.dumps(res)}", flush=True)
        
        # 4. Log to notification_logs
        cur.execute(
            "INSERT INTO notification_logs (article_id, status, provider_response) VALUES (%s, %s, %s)",
            (article_id, "sent", str(res))
        )
        cur.execute(
            "UPDATE articles SET notification_sent = true WHERE id = %s",
            (article_id,)
        )
        conn.commit()

    # 5. Extract ticket IDs and wait for receipt
    ticket_ids = []
    for item in res.get("data", []):
        if item.get("status") == "ok" and item.get("id"):
            ticket_ids.append(item["id"])
            
    if not ticket_ids:
        print("\nTICKET FAILED TO GENERATE - NO RECEIPT CHECK.", flush=True)
        sys.exit(0)

    print(f"\nWaiting 8 seconds for Expo FCM receipt generation for {len(ticket_ids)} tickets...", flush=True)
    time.sleep(8)
    
    receipt_res = requests.post(
        EXPO_RECEIPTS_URL,
        json={"ids": ticket_ids},
        headers={"Accept": "application/json", "Content-Type": "application/json"}
    ).json()
    
    print(f"\n[RECEIPT_RESULT]\n{json.dumps(receipt_res, indent=2)}", flush=True)

except Exception as e:
    print(f"ERROR: {e}", flush=True)
