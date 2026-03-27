from database import query, execute
from ingestor import _pick_image

# Find ALL articles with null or empty image_url
rows = query("SELECT id, title, article_url, image_url, image_source_type FROM articles WHERE image_url IS NULL OR TRIM(image_url) = ''")
print(f"Found {len(rows)} articles with no image_url:")
for r in rows:
    print(f"  - [{r.get('image_source_type','?')}] {r['title'][:60]}")

fixed = 0
for row in rows:
    article_id = str(row['id'])
    is_arxiv = "arxiv.org" in (row.get('article_url') or '')
    new_img = _pick_image(article_id, is_arxiv=is_arxiv)
    pool_type = "arxiv_pool" if is_arxiv else "fallback_pool"
    execute(
        "UPDATE articles SET image_url = %s, image_source_type = %s WHERE id = %s::uuid",
        (new_img, pool_type, article_id)
    )
    fixed += 1
    print(f"  Fixed [{pool_type}]: {row['title'][:50]}")

print(f"\nFixed {fixed} articles total.")
