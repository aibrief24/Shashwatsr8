from database import query, execute
from ingestor import _pick_image

# Reassign all articles that currently use fallback pool images using the new 
# larger pool and title-entropy seeding for much better distribution
rows = query("""
    SELECT id, title, article_url, image_source_type
    FROM articles
    WHERE image_source_type IN ('fallback_pool', 'arxiv_pool')
    AND status = 'published'
""")
print(f"Reshuffling {len(rows)} fallback-pool articles with new seeding...")

# Track unique image assignments for deduplication
assigned_map = {}  # count per pool image

for row in rows:
    article_id = str(row['id'])
    title = row.get('title', '')
    is_arxiv = "arxiv.org" in (row.get('article_url') or '')
    
    # Use the new _pick_image with title entropy
    new_img = _pick_image(article_id, is_arxiv=is_arxiv, title=title)
    pool_type = "arxiv_pool" if is_arxiv else "fallback_pool"
    
    execute(
        "UPDATE articles SET image_url = %s, image_source_type = %s WHERE id = %s::uuid",
        (new_img, pool_type, article_id)
    )
    assigned_map[new_img] = assigned_map.get(new_img, 0) + 1

# Show distribution
print("\nImage distribution (url_end -> count):")
sorted_items = sorted(assigned_map.items(), key=lambda x: -x[1])
for url, count in sorted_items[:15]:
    print(f"  x{count} -> ...{url[-30:]}")
    
max_repeats = max(assigned_map.values()) if assigned_map else 0
print(f"\nMax repeated image: {max_repeats}x (across {len(rows)} fallback articles)")
print("Done!")
