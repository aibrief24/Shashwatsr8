import logging
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from database import query, execute
from image_optimizer import optimize_image_url

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

def main():
    rows = query("SELECT id, image_url FROM articles WHERE thumbnail_url IS NULL AND image_url IS NOT NULL AND status = 'published'")
    if not rows:
        logger.info("No articles need thumbnail backfilling.")
        return

    logger.info(f"Found {len(rows)} articles missing thumbnails.")
    
    count = 0
    for row in rows:
        article_id = row["id"]
        original_url = row["image_url"]

        if not original_url or not original_url.startswith("http"):
            continue

        logger.info(f"Processing ({count}/{len(rows)}): {original_url[:60]}")
        main_url, thumb_url = optimize_image_url(original_url)
        
        if thumb_url:
            execute(
                "UPDATE articles SET image_url = %s, thumbnail_url = %s WHERE id = %s",
                (main_url, thumb_url, article_id)
            )
            count += 1
            logger.info(f"Saved: {thumb_url[:60]}")
        else:
            logger.info("Failed to generate thumbnail, skipping.")

    logger.info(f"Done backfilling {count} thumbnails.")

if __name__ == "__main__":
    main()
