import sys
import uuid
import feedparser
from datetime import datetime, timezone
import logging

try:
    from database import execute
except Exception:
    pass

import ingestor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_test():
    fake_id = uuid.uuid4().hex[:8]
    
    # Mocking feedparser to inject an exact test article guaranteed to hit High-Signal rules
    class FakeEntry(dict):
        def get(self, key, default=None):
            return self[key] if key in self else default

    class MockResult:
        def __init__(self, entry):
            self.bozo = 0
            self.entries = [entry]
            self.feed = {"title": "Test Feed"}

    def fake_parse(url, *args, **kwargs):
        entry = FakeEntry({
            "title": f"Google DeepMind Launches OpenAI GPT-5 Competitor {fake_id}",
            "summary": "Anthropic and Google unveil state-of-the-art parameters for artificial intelligence models. This is definitively an AI Model release and should trigger a push.",
            "link": f"https://techcrunch.com/fake-cron-test-{fake_id}",
            "published_parsed": datetime.now(timezone.utc).timetuple()
        })
        return MockResult(entry)

    logger.info("Mocking feedparser...")
    feedparser.parse = fake_parse

    # Add a mock source to the database temporarily just for this test execution
    # Wait, run_ingestion pulls sources from the database. 
    # The fake_parse will intercept ANY source URL and return our fake article.
    # So as long as there is at least 1 active source in DB, it will process it!
    
    logger.info("Running automatic ingestion (CRON SIMULATION)...")
    res = ingestor.run_ingestion(dry_run=False)
    
    print("\n\n=== E2E CRON SIMULATION RESULTS ===")
    print(f"Status: {res['status']}")
    print(f"Total inserted: {res['total']}")
    if "metrics" in res:
        print(f"Jobs Created inside ingestion hook: {res['metrics'].get('jobs_created')}")
        print(f"run_pending_jobs invoked: {res['metrics'].get('run_pending_jobs_invoked')}")
    
if __name__ == "__main__":
    run_test()
