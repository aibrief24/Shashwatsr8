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

# Pool of high-quality, varied AI/tech themed images from Unsplash
# Enough variety to keep the feed visually interesting
IMAGE_POOL = [
    # AI/Abstract/Neural
    "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=800&q=80",
    "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80",
    "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80",
    "https://images.unsplash.com/photo-1561736778-92e52a7769ef?w=800&q=80",
    "https://images.unsplash.com/photo-1555255707-c07966088b7b?w=800&q=80",
    # Tech/Computers
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80",
    "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&q=80",
    "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80",
    "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80",
    "https://images.unsplash.com/photo-1488229297570-58520851e68a?w=800&q=80",
    # Data/Network
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80",
    "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800&q=80",
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80",
    "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80",
    "https://images.unsplash.com/photo-1617042375876-a13e36732a04?w=800&q=80",
    # Business/Startup
    "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&q=80",
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
    "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=800&q=80",
    "https://images.unsplash.com/photo-1573164713712-03790a178651?w=800&q=80",
    # Science/Research
    "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=800&q=80",
    "https://images.unsplash.com/photo-1582719471384-894fbb16e074?w=800&q=80",
    "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80",
    "https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=800&q=80",
    "https://images.unsplash.com/photo-1639762681057-408e52192e55?w=800&q=80",
]


def _pick_image(seed: str) -> str:
    """Deterministically pick a varied image from the pool based on a seed string."""
    idx = int(seed.replace("-", "")[:8], 16) % len(IMAGE_POOL)
    return IMAGE_POOL[idx]


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


def _extract_image(entry) -> str | None:
    """Try to extract an image URL from a feed entry. Returns None if not found."""
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
    return None


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
            # Use feed image if available, otherwise pick a varied one from the pool
            image_url = _extract_image(entry) or _pick_image(article_id)
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
