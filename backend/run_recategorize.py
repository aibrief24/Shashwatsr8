import sys
import collections
from database import query, execute, _pool
from ingestor import _detect_category_strict, _calculate_ai_relevance, CATEGORY_RULES

def run():
    print("Fetching all articles...")
    rows = query("SELECT id, title, summary, category, source_name FROM articles")
    if not rows:
        print("No articles found.")
        return
        
    updated_counts = collections.defaultdict(int)
    rejected_count = 0
    examples = []
    
    conn = _pool.getconn()
    try:
        with conn.cursor() as cur:
            # First ensure metadata columns exist
            cur.execute("""
                ALTER TABLE articles 
                ADD COLUMN IF NOT EXISTS ai_relevance_score FLOAT DEFAULT 0.0,
                ADD COLUMN IF NOT EXISTS category_confidence_score FLOAT DEFAULT 0.0,
                ADD COLUMN IF NOT EXISTS original_category TEXT;
            """)
            
            for row in rows:
                old_cat = row.get('category')
                title = str(row.get('title', ''))
                summary = str(row.get('summary', ''))
                
                # Full string from DB for relevance
                relevance = _calculate_ai_relevance(title, summary)
                
                if relevance < 1.0:
                    rejected_count += 1
                    cur.execute("DELETE FROM articles WHERE id = %s", (row['id'],))
                    if len(examples) < 5:
                        examples.append(f"[DELETED non-AI] {title}")
                    continue
                
                new_cat, conf = _detect_category_strict(title, summary)
                
                if old_cat != new_cat:
                    updated_counts[new_cat] += 1
                    cur.execute(
                        "UPDATE articles SET category = %s, original_category = %s, ai_relevance_score = %s, category_confidence_score = %s WHERE id = %s",
                        (new_cat, old_cat, relevance, conf, row['id'])
                    )
                    if len(examples) < 15:
                        examples.append(f"[{old_cat} -> {new_cat}] {title}")
                else:
                    cur.execute(
                        "UPDATE articles SET ai_relevance_score = %s, category_confidence_score = %s WHERE id = %s",
                        (relevance, conf, row['id'])
                    )
            conn.commit()
    finally:
        _pool.putconn(conn)
        
    print(f"\nRecategorization complete!")
    print(f"Total processed: {len(rows)}")
    print(f"Total deleted as non-AI: {rejected_count}")
    print("\nCategorization shifts:")
    for cat, count in updated_counts.items():
        print(f"  {cat}: +{count} articles")
        
    print("\nExamples of changes:")
    for ex in examples:
        print(f"  {ex}")

    # Print final category logic summary
    print("\nFinal Category Rules Summary:")
    print("Uses Title (3x multiplier) and Summary (1x multiplier)\n")
    for cat, rules in CATEGORY_RULES.items():
        print(f"  {cat} (Threshold: {rules['threshold']})")
        print(f"    Required: {', '.join(rules.get('required', []))}")
        print(f"    Bonus: {', '.join(rules.get('bonus', []))}")
        print(f"    Penalty: {', '.join(rules.get('penalty', []))}")
        print("")

if __name__ == "__main__":
    run()
