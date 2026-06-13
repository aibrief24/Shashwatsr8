import uuid
from datetime import datetime, timezone
import logging

from database import execute, query, insert_returning
from notification_worker import run_pending_jobs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def inject_test_article():
    # 1. Craft a realistic AI tech article payload
    article_url = f"https://techcrunch.com/2026/04/17/openai-gpt-x-release-{uuid.uuid4().hex[:8]}"
    payload = {
        "title": "[TEST] Anthropic Unveils Next-Gen AI Agent Framework",
        "summary": "Anthropic has released a revolutionary new agentic framework designed to safely automate complex enterprise workflows, dramatically reducing hallucination rates by 40%.",
        "article_url": article_url,
        "source_name": "TechCrunch",
        "source_url": "techcrunch.com",
        "image_url": "https://techcrunch.com/wp-content/uploads/2023/07/anthropic-logo.jpg",
        "category": "Technology",
        "published_at": datetime.now(timezone.utc).isoformat()
    }

    print(f"Injecting article: {payload['title']}")
    
    # 2. Insert into articles table
    res = insert_returning("""
        INSERT INTO articles (title, summary, article_url, source_name, source_url, image_url, category, published_at)
        VALUES (%(title)s, %(summary)s, %(article_url)s, %(source_name)s, %(source_url)s, %(image_url)s, %(category)s, %(published_at)s)
        RETURNING id
    """, payload)
    
    article_id = res['id']
    print(f"Article inserted with ID: {article_id}")

    # 3. Queue the notification job
    execute("""
        INSERT INTO notification_jobs (article_id)
        VALUES (%s)
        ON CONFLICT (article_id) DO NOTHING
    """, (str(article_id),))
    print(f"Notification job queued for article {article_id}.")

    # 4. Trigger the notification worker synchronously
    print("\n--- Triggering Notification Worker ---")
    worker_result = run_pending_jobs()
    print("Worker result:", worker_result)

    # 5. Verify notification logs
    print("\n--- Checking Notification Logs ---")
    logs = query("""
        SELECT token, ticket_id, status, receipt_status, error, provider_response
        FROM notification_logs
        WHERE article_id = %s
    """, (str(article_id),))
    
    if not logs:
        print("WARNING: No notification logs found for this article.")
    else:
        for log in logs:
            print(f"- Token: {log['token'][:25]}... | Status: {log['status']} | Receipt: {log['receipt_status']}")

if __name__ == "__main__":
    inject_test_article()
