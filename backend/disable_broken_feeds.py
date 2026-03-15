from database import query, execute
from ingestor import ingest_source

def run():
    sources = query("SELECT * FROM sources WHERE active = true")
    disabled = 0
    for s in sources:
        res = ingest_source(s, dry_run=True)
        if res.get("feed_error"):
            print(f"Disabling {s['name']}...")
            execute("UPDATE sources SET active = false WHERE id = %s", (s['id'],))
            disabled += 1
            
    print(f"Disabled {disabled} broken feeds.")

if __name__ == '__main__':
    run()
