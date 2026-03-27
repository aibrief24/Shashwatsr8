"""
Retroactive patch: Find all arXiv articles that don't have arxiv_figure or arxiv_pool
image_source_type (they may have old generic og:image or rss types) and reset them to
arxiv_pool using the new seeding. Also clear any ar5iv figures that might have slipped
through old (pre-hardening) validation.
"""
from database import query, execute
from ingestor import _pick_image, _is_valid_arxiv_figure_url

rows = query("""
    SELECT id, title, article_url, image_url, image_source_type
    FROM articles
    WHERE article_url LIKE '%arxiv.org%' AND status = 'published'
    ORDER BY published_at DESC
""")
print(f"Found {len(rows)} arXiv articles")

needs_fix = []
for row in rows:
    src_type = row.get('image_source_type') or ''
    img_url = row.get('image_url') or ''
    
    # Acceptable: arxiv_figure (validated figure) or arxiv_pool
    if src_type == 'arxiv_figure':
        # Re-validate the figure URL with the new stricter validator
        if _is_valid_arxiv_figure_url(img_url):
            print(f"  [OK figure] {img_url[:65]}")
            continue
        else:
            print(f"  [BAD figure, will reset] {img_url[:65]}")
            needs_fix.append(row)
    elif src_type == 'arxiv_pool':
        print(f"  [OK pool] ...{img_url[-40:]}")
        continue
    else:
        print(f"  [WRONG TYPE '{src_type}', will reset] {img_url[:65]}")
        needs_fix.append(row)

print(f"\nResetting {len(needs_fix)} arXiv articles to arxiv_pool...")
for row in needs_fix:
    article_id = str(row['id'])
    title = row.get('title', '')
    new_img = _pick_image(article_id, is_arxiv=True, title=title)
    execute(
        "UPDATE articles SET image_url = %s, image_source_type = 'arxiv_pool' WHERE id = %s::uuid",
        (new_img, article_id)
    )
    print(f"  FIXED: {row['title'][:55]}")

print(f"\nDone! Patched {len(needs_fix)} articles.")
