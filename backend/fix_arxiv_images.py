from database import query, execute
from ingestor import _pick_image, _fetch_og_image

def fix_arxiv_images():
    rows = query("SELECT id, title, image_url, article_url FROM articles WHERE article_url LIKE '%arxiv.org%'")
    if not rows:
        print("No arXiv articles found.")
        return

    updated_count = 0
    for row in rows:
        article_id = str(row['id'])
        article_url = row['article_url']
        
        # We will override with the deterministic ARXIV_IMAGE_POOL fallback 
        # to ensure the feed looks instantly uniform but varied.
        new_image_url = _pick_image(article_id, is_arxiv=True)
        
        # Try to execute update
        execute(
            "UPDATE articles SET image_url = %s, image_source_type = 'arxiv_pool' WHERE id = %s::uuid",
            (new_image_url, article_id)
        )
        updated_count += 1
        
    print(f"Successfully retroactively updated {updated_count} arXiv articles with new premium images.")

if __name__ == "__main__":
    fix_arxiv_images()
