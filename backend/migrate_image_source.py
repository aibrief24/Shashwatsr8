from database import execute
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    try:
        execute("ALTER TABLE articles ADD COLUMN IF NOT EXISTS image_source_type VARCHAR(50);")
        logger.info("Successfully added image_source_type column to articles table.")
    except Exception as e:
        logger.error(f"Migration failed: {e}")
