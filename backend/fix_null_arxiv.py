from database import query, execute
from ingestor import _pick_image, _is_valid_image_url

# Fix all arXiv articles that either have NULL image or an obviously broken/gen image
rows = query("""
    SELECT id, article_url, image_url, image_source_type FROM articles 
    WHERE article_url LIKE '%arxiv.org%'
""")
print(f"Total arXiv articles: {len(rows)}")

fixed = 0
for row in rows:
    article_id = str(row['id'])
    current_url = row.get('image_url')
    source_type = row.get('image_source_type', '')
    
    needs_fix = (
        not current_url or
        current_url.strip() == '' or
        source_type not in ('arxiv_pool', 'arxiv_figure_scrape')
    )
    
    if needs_fix:
        new_img = _pick_image(article_id, is_arxiv=True)
        execute(
            "UPDATE articles SET image_url = %s, image_source_type = 'arxiv_pool' WHERE id = %s::uuid",
            (new_img, article_id)
        )
        fixed += 1
        print(f"  Fixed: {article_id[:8]}.. -> {new_img[:60]}")

print(f"\nDone. Fixed {fixed} of {len(rows)} arXiv articles.")
