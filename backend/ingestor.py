"""Content ingestion pipeline for AIBrief24.

Fetches articles from RSS sources, generates AI summaries with OpenAI,
deduplicates, and saves to Supabase.

Usage:
    python ingestor.py              # Run full ingestion
    python ingestor.py --dry-run    # Preview without saving
"""
import os
import sys
import uuid
import logging
import feedparser
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from database import query, execute

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# ─── OpenAI setup ─────────────────────────────────────────────────────────────
try:
    import openai
    _openai_client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    _openai_available = bool(os.environ.get("OPENAI_API_KEY"))
except Exception:
    _openai_available = False
    _openai_client = None

# ─── Category detection ───────────────────────────────────────────────────────
CATEGORY_KEYWORDS = {
    "AI Models": ["gpt", "llm", "model", "transformer", "claude", "gemini", "mistral", "llama", "benchmark"],
    "AI Tools": ["tool", "plugin", "api", "sdk", "platform", "app", "software", "copilot", "assistant"],
    "AI Startups": ["startup", "founded", "raises", "series a", "seed round", "company", "team"],
    "Funding News": ["funding", "investment", "raise", "million", "billion", "valuation", "vc"],
    "Product Launches": ["launch", "release", "announce", "update", "version", "new feature", "ships"],
    "Big Tech AI": ["google", "microsoft", "apple", "meta", "amazon", "openai", "anthropic", "deepmind"],
    "Open Source AI": ["open source", "open-source", "github", "hugging face", "community", "free model"],
    "AI Research": ["research", "paper", "study", "findings", "arxiv", "algorithm", "academic"],
}

DEFAULT_CATEGORY = "AI Tools"
DEFAULT_IMAGE = "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=800&q=80"


def _detect_category(title: str, text: str) -> str:
    combined = f"{title} {text}".lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in combined for kw in keywords):
            return cat
    return DEFAULT_CATEGORY


def _generate_summary(title: str, content: str) -> str:
    """Use OpenAI to generate a 2-3 sentence summary."""
    if not _openai_available or not content.strip():
        # Fallback: use first 400 chars of content
        return (content[:400] + "...") if len(content) > 400 else content

    try:
        resp = _openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": "You are a concise AI news summarizer. Write 2-3 clear, informative sentences that capture the key points. No fluff, no markdown.",
                },
                {
                    "role": "user",
                    "content": f"Summarize this article:\n\nTitle: {title}\n\nContent: {content[:3000]}",
                },
            ],
            max_tokens=150,
            temperature=0.4,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        logger.warning(f"OpenAI summary failed: {e}")
        return (content[:400] + "...") if len(content) > 400 else content


def _article_exists(article_url: str) -> bool:
    try:
        rows = query("SELECT id FROM articles WHERE article_url = %s LIMIT 1", (article_url,))
        return bool(rows)
    except Exception:
        return False


def _extract_image(entry) -> str:
    """Try to extract an image URL from a feed entry."""
    # media:content
    if hasattr(entry, "media_content") and entry.media_content:
        url = entry.media_content[0].get("url", "")
        if url:
            return url
    # media:thumbnail
    if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
        url = entry.media_thumbnail[0].get("url", "")
        if url:
            return url
    # enclosures
    for enc in getattr(entry, "enclosures", []):
        if "image" in enc.get("type", ""):
            return enc.get("href", "")
    return DEFAULT_IMAGE


def ingest_source(source: dict, dry_run: bool = False) -> int:
    """Ingest articles from a single RSS source. Returns count of new articles."""
    count = 0
    try:
        feed = feedparser.parse(source["url"], request_headers={"User-Agent": "AIBrief24/1.0"})
        if feed.bozo and not feed.entries:
            logger.warning(f"Bad feed from {source['name']}: {feed.bozo_exception}")
            return 0

        for entry in feed.entries[:15]:  # Max 15 per source
            url = entry.get("link", "").strip()
            if not url:
                continue
            if _article_exists(url):
                continue

            title = entry.get("title", "Untitled").strip()
            content = entry.get("summary", "") or entry.get("description", "") or ""

            # Parse publish date
            published = entry.get("published_parsed") or entry.get("updated_parsed")
            if published:
                try:
                    pub_dt = datetime(*published[:6], tzinfo=timezone.utc)
                except Exception:
                    pub_dt = datetime.now(timezone.utc)
            else:
                pub_dt = datetime.now(timezone.utc)

            summary = _generate_summary(title, content)
            category = source.get("category_hint") or _detect_category(title, summary)
            image_url = _extract_image(entry)
            article_id = str(uuid.uuid4())

            if dry_run:
                logger.info(f"[DRY RUN] Would add: {title[:60]}")
                count += 1
                continue

            execute(
                """
                INSERT INTO articles (
                    id, title, summary, image_url, source_name, article_url,
                    category, published_at, status, is_breaking
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'published', false)
                ON CONFLICT DO NOTHING
                """,
                (article_id, title, summary, image_url, source["name"], url, category, pub_dt),
            )
            count += 1
            logger.info(f"Added [{category}]: {title[:70]}")

    except Exception as e:
        logger.error(f"Error ingesting {source.get('name', 'unknown')}: {e}")

    return count


def run_ingestion(dry_run: bool = False) -> dict:
    """Run the full content ingestion pipeline."""
    try:
        sources = query("SELECT * FROM sources WHERE active = true ORDER BY name")
    except Exception as e:
        return {"status": "error", "message": str(e), "total": 0}

    if not sources:
        return {"status": "no_sources", "total": 0, "results": []}

    logger.info(f"Starting ingestion of {len(sources)} sources (dry_run={dry_run})")

    total = 0
    results = []
    for source in sources:
        n = ingest_source(source, dry_run=dry_run)
        total += n
        if n > 0:
            results.append({"source": source["name"], "new_articles": n})

    logger.info(f"Ingestion complete: {total} new articles")
    return {
        "status": "done",
        "total": total,
        "sources_processed": len(sources),
        "results": results,
        "dry_run": dry_run,
    }


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    print(f"{'[DRY RUN] ' if dry else ''}Starting AIBrief24 content ingestion...")
    result = run_ingestion(dry_run=dry)
    print(f"\nResult: {result['status']}")
    print(f"Total new articles: {result['total']}")
    print(f"Sources processed: {result.get('sources_processed', 0)}")
    if result.get("results"):
        print("\nBreakdown:")
        for r in result["results"]:
            print(f"  {r['source']}: {r['new_articles']} new articles")
