from database import query, execute
from ingestor import ARXIV_IMAGE_POOL, _pick_image

# Force ALL arXiv articles to get ARXIV_IMAGE_POOL images
rows = query("SELECT id, article_url, image_url FROM articles WHERE article_url LIKE '%arxiv.org%'")
print(f"Updating {len(rows)} arXiv articles to ARXIV_IMAGE_POOL images...")

# Verify the pool
print(f"ARXIV_IMAGE_POOL has {len(ARXIV_IMAGE_POOL)} images")

for i, row in enumerate(rows):
    article_id = str(row['id'])
    new_img = _pick_image(article_id, is_arxiv=True)
    execute(
        "UPDATE articles SET image_url = %s, image_source_type = 'arxiv_pool' WHERE id = %s::uuid",
        (new_img, article_id)
    )
    print(f"  [{i+1}] {article_id[:8]}.. -> pool image #{ARXIV_IMAGE_POOL.index(new_img) if new_img in ARXIV_IMAGE_POOL else '?'}")

print(f"\nDone! All {len(rows)} arXiv articles now have distinct research pool images.")
