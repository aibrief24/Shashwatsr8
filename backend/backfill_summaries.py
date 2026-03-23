import os
import sys
import logging
logger = logging.getLogger(__name__)
import requests
from bs4 import BeautifulSoup
from database import query, execute
from ingestor import _generate_summary

# Add minimal retry logic for robustness
def scrape_article_text(url: str) -> str:
    """Attempt a basic scrape to provide content for the summarizer."""
    if "arxiv.org" in url:
        # Use ar5iv as a text source
        ar5iv_url = url.replace("arxiv.org/abs/", "ar5iv.org/html/").replace("arxiv.org/pdf/", "ar5iv.org/html/")
        target = ar5iv_url
    else:
        target = url
        
    try:
        res = requests.get(
            target,
            timeout=10,
            headers={"User-Agent": "Mozilla/5.0 (compatible; AIBrief24Bot/1.0)"},
            allow_redirects=True
        )
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, "html.parser")
            # Extract main readable text, stripping navs/footers
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            text = soup.get_text(separator=" ", strip=True)
            return text[:4000]  # Cap at safe context length
    except Exception as e:
        logger.warning(f"Failed to scrape {url} for text: {e}")
    return ""

def backfill():
    # Find active articles with very short summaries (under 130 chars usually implies 1-2 small sentences)
    # We also check recent articles first
    rows = query("""
        SELECT id, title, article_url, summary 
        FROM articles 
        WHERE status = 'published' AND LENGTH(summary) < 150
        ORDER BY published_at DESC
        LIMIT 200
    """)
    
    if not rows:
        logger.info("No overly short summaries found in the database.")
        return

    logger.info(f"Checking {len(rows)} articles for short summaries...")

    for row in rows:
        article_id = row['id']
        title = row['title']
        url = row['article_url']
        old_summary = row['summary']
        
        # Determine if it's genuinely too short (e.g., just a single sentence)
        sentences = [s.strip() for s in old_summary.split('.') if len(s.strip()) > 5]
        if len(sentences) >= 3 and len(old_summary) > 100:
            # It's probably a tight but dense 3 sentences. Skip it.
            continue
            
        logger.info(f"Targeting: {title[:50]}... | Old length: {len(old_summary)}")
        
        # Try to get more content than we originally had from the RSS
        content = scrape_article_text(url)
        
        # If scrape fails, use title + old summary as seed, but ask for elaboration
        if not content or len(content) < 200:
            logger.info("Scrape failed, elaborating on title and old summary.")
            content = f"Article Title: {title}\nBrief snippet: {old_summary}"
            
        # Call the newly upgraded prompt
        new_summary = _generate_summary(title, content)
        
        if len(new_summary) > len(old_summary) + 20:
            logger.info(f"Upgraded! New length: {len(new_summary)}")
            execute("UPDATE articles SET summary = %s WHERE id = %s", (new_summary, article_id))
        else:
            logger.warning("Generation yielded similarly short output. Skipping.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    backfill()
