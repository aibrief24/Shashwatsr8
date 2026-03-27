from database import query, execute
from ingestor import _pick_image
from collections import defaultdict

print("Scanning for repeated image URLs across all articles...")
rows = query("""
    SELECT id, title, article_url, image_url, image_source_type
    FROM articles WHERE status = 'published'
    ORDER BY published_at ASC
""")

# Group articles by image_url
image_groups = defaultdict(list)
for row in rows:
    url = row.get('image_url')
    if url:
        image_groups[url].append(row)

# Find groups with more than 1 article (duplicates)
duplicate_groups = {url: arts for url, arts in image_groups.items() if len(arts) > 1}
print(f"Found {len(duplicate_groups)} image URLs shared across multiple articles:")

total_reassigned = 0
for img_url, articles in sorted(duplicate_groups.items(), key=lambda x: -len(x[1])):
    print(f"\n  [{len(articles)}x repeated] ...{img_url[-50:]}")
    # Keep the FIRST article with this image as-is, reassign the rest 
    for article in articles[1:]:
        article_id = str(article['id'])
        title = article.get('title', '')
        is_arxiv = "arxiv.org" in (article.get('article_url') or '')
        
        # Use title + id for maximum entropy
        new_img = _pick_image(article_id, is_arxiv=is_arxiv, title=title)
        
        # Make sure we don't accidentally pick the same duplicate URL again
        attempt = 0
        while new_img == img_url and attempt < 5:
            new_img = _pick_image(article_id + str(attempt), is_arxiv=is_arxiv, title=title + str(attempt))
            attempt += 1
        
        pool_type = "arxiv_pool" if is_arxiv else "fallback_pool"
        execute(
            "UPDATE articles SET image_url = %s, image_source_type = %s WHERE id = %s::uuid",
            (new_img, pool_type, article_id)
        )
        total_reassigned += 1
        print(f"    -> Reassigned: {title[:50]}")

print(f"\n✅ Done! Reassigned {total_reassigned} duplicate articles to unique pool images.")
