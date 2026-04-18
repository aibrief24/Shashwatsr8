import sys
import logging
import json
from database import query, insert_returning

# Load backend env vars happens safely in database.py import via dotenv

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_send_push_for_article.py <article_id>")
        sys.exit(1)
        
    article_id = sys.argv[1]
    
    print(f"\n--- Loading Article {article_id} ---")
    articles = query("SELECT id, title, summary FROM articles WHERE id = %s", (article_id,))
    
    if not articles:
        print(f"ERROR: Article {article_id} not found in Supabase.")
        sys.exit(1)
        
    article = articles[0]
    print(f"Article Title: {article['title']}")
    
    print("\n--- Fetching Push Tokens ---")
    all_tokens_count = query("SELECT count(*) as count FROM push_tokens")[0]['count']
    print(f"Total token records in DB: {all_tokens_count}")
    
    active_tokens = query("SELECT token FROM push_tokens WHERE is_active = true")
    # Filter invalid/test tokens strictly
    valid_tokens = [
        t['token'] for t in (active_tokens or [])
        if isinstance(t['token'], str) and "ExponentPushToken[" in t['token']
    ]
    
    print(f"Valid/Active Exponent tokens found: {len(valid_tokens)}")
    
    if not valid_tokens:
        print("No valid tokens to send. Exiting.")
        sys.exit(0)
        
    from notifier import send_expo_notifications
    title_text = "AIBrief24: " + article["title"][:60]
    body_text = (article["summary"][:120] + "...") if article["summary"] else "New article available."
    
    print("\n--- Sending Expo Push Notification ---")
    try:
        result = send_expo_notifications(
            valid_tokens,
            title_text,
            body_text,
            data={"article_id": article_id}
        )
        print(f"Expo Ticket Response: {json.dumps(result, indent=2)}")
    except Exception as e:
        print(f"ERROR: Expo Push failed: {e}")
        sys.exit(1)
        
    print("\n--- Inserting Notification Logs ---")
    logs_inserted = 0
    # send_expo_notifications typically returns {"sent": X, "errors": Y, "ticket_ids": [...]}
    ticket_ids = result.get("ticket_ids", [])
    
    # Ensure ticket_ids aligns with valid_tokens length for mapping
    # Note: Expo chunking might mean tickets map 1:1 with tokens sent.
    for i, token in enumerate(valid_tokens):
        ticket = ticket_ids[i] if i < len(ticket_ids) else "unknown"
        ticket_id_str = ticket.get("id", str(ticket)) if isinstance(ticket, dict) else str(ticket)
        status = "error" if isinstance(ticket, dict) and ticket.get("status") == "error" else "sent"
        error_msg = ticket.get("message", "") if isinstance(ticket, dict) else ""
        
        try:
            res = insert_returning("""
                INSERT INTO notification_logs (article_id, token, ticket_id, status, receipt_status, error)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (article_id, token, ticket_id_str, status, "pending", error_msg))
            if res:
                logs_inserted += 1
        except Exception as e:
            print(f"  [DB ERROR] Failed to insert log for {token[:20]}: {e}")
            
    print(f"Notification log insert result: Successfully inserted {logs_inserted} rows out of {len(valid_tokens)} attempts.")
    print("\nDONE.")

if __name__ == "__main__":
    main()
