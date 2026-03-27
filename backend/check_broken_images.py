import requests
from database import query, execute
from ingestor import _pick_image

# Find articles where image_url might be broken or unusable
rows = query("""
    SELECT id, title, article_url, image_url, image_source_type 
    FROM articles 
    WHERE (image_url IS NOT NULL AND image_url != '')
    ORDER BY published_at DESC
    LIMIT 60
""")

broken = []
for row in rows:
    url = row.get('image_url', '')
    if url:
        # Quick check: reject obvious known-bad patterns
        url_lower = url.lower()
        bad_patterns = [
            'static.arxiv.org', 
            'arxiv.org/static',
            'arxiv.org/icons',
            '1x1', 
            'pixel',
            'tracking'
        ]
        if any(p in url_lower for p in bad_patterns):
            broken.append(row)
            print(f"  BAD PATTERN: {url[:80]}")
            continue
            
        # Check if URL resolves (fast HEAD request)
        try:
            resp = requests.head(url, timeout=3, allow_redirects=True, 
                                 headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code >= 400:
                broken.append(row)
                print(f"  HTTP {resp.status_code}: {url[:80]}")
        except Exception as e:
            broken.append(row)
            print(f"  ERROR ({type(e).__name__}): {url[:80]}")

print(f"\nTotal broken: {len(broken)} out of {len(rows)} checked")

# Fix the broken ones
for row in broken:
    article_id = str(row['id'])
    is_arxiv = "arxiv.org" in (row.get('article_url') or '')
    new_img = _pick_image(article_id, is_arxiv=is_arxiv)
    pool_type = "arxiv_pool" if is_arxiv else "fallback_pool"
    execute(
        "UPDATE articles SET image_url = %s, image_source_type = %s WHERE id = %s::uuid",
        (new_img, pool_type, article_id)
    )
    print(f"  FIXED: {row['title'][:55]}")
    
print(f"\nPatched {len(broken)} broken images.")
