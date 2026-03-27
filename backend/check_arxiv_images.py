from database import query
from ingestor import _pick_image, _is_valid_image_url

rows = query("SELECT id, title, image_url, article_url FROM articles WHERE article_url LIKE '%arxiv.org%'")
print(f"Total existing arXiv articles: {len(rows)}")

if rows:
    bad_count = 0
    for row in rows:
        url = row['image_url']
        if not url or 'arxiv-logo' in url or not _is_valid_image_url(url):
            bad_count += 1
            
    print(f"Found {bad_count} bad/generic images out of {len(rows)}")

    print("Sample current image URLs:")
    for r in rows[:3]:
        print(f" - {r['image_url']}")
