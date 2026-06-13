import sys
import logging
import json
from database import query
from notifier import send_expo_notifications

logging.basicConfig(level=logging.INFO)

def test_push():
    # 1. Check DB tokens
    rows = query("SELECT token, platform, user_id, created_at FROM push_tokens ORDER BY created_at DESC")
    print(f"Total registered tokens in DB: {len(rows) if rows else 0}")
    if not rows:
        print("No tokens found. Run the app and login to register a token.")
        return

    print("Latest 3 tokens:")
    for r in rows[:3]:
        print(f" - {r['token']} (platform: {r['platform']}, user: {r['user_id']}, created: {r['created_at']})")

    # 2. Grab latest token
    target_token = rows[0]["token"]
    print(f"\nSending test push to latest token: {target_token}")

    # 3. Call notification sender
    res = send_expo_notifications(
        [target_token],
        "AIBrief24 Test Push",
        "This is a test notification from the debug script.",
        data={"type": "test", "deep_link": "aibrief24://"}
    )

    # 4. Print exact response
    print("\n[EXPO SEND RESPONSE]")
    print(json.dumps(res, indent=2))

if __name__ == "__main__":
    test_push()
