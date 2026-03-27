import requests
from database import query, execute
from ingestor import _pick_image

print("Full image audit across ALL published articles...")
rows = query("SELECT id, title, article_url, image_url, image_source_type FROM articles WHERE status = 'published' ORDER BY published_at DESC")
print(f"Total articles to check: {len(rows)}")

broken = []
for row in rows:
    url = row.get('image_url', '')
    if not url:
        broken.append((row, 'NULL'))
        continue
    # Skip Unsplash pool images we already know are good
    if 'unsplash.com' in url:
        try:
            resp = requests.head(url, timeout=3, allow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code >= 400:
                broken.append((row, f'HTTP_{resp.status_code}'))
        except Exception as e:
            broken.append((row, f'ERR'))

print(f"\nBroken/unreachable images found: {len(broken)}")
for row, reason in broken:
    print(f"  [{reason}] {row.get('image_url','NONE')[:70]}")
    print(f"         -> {row['title'][:60]}")

# Fix all of them
print(f"\nPatching {len(broken)} broken articles...")
for row, reason in broken:
    article_id = str(row['id'])
    is_arxiv = "arxiv.org" in (row.get('article_url') or '')
    new_img = _pick_image(article_id, is_arxiv=is_arxiv)
    pool_type = "arxiv_pool" if is_arxiv else "fallback_pool"
    execute(
        "UPDATE articles SET image_url = %s, image_source_type = %s WHERE id = %s::uuid",
        (new_img, pool_type, article_id)
    )
print("Done!")
