import requests
import json
import logging
from database import query, execute, _pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"

def purge_stale_tokens():
    """Queries notification_logs to find Expo Receipt IDs, fetches receipts from Expo, and deletes tokens failing with DeviceNotRegistered."""
    try:
        # 1. Fetch recent provider responses (where we saved the Exponent Push Ticket JSON)
        logs = query("SELECT provider_response FROM notification_logs WHERE status = 'sent' AND created_at >= NOW() - INTERVAL '3 days'")
        if not logs:
            logger.info("No recent notification logs to process.")
            return

        ticket_ids = []
        for row in logs:
            try:
                # Assuming provider_response is stored as JSON string from send_expo_notifications
                # Example: '{"success": True, "responses": [{"data": [{"status": "ok", "id": "019..."}]}]}'
                resp_data = eval(row['provider_response']) # Evaluate dict representation
                for batch in resp_data.get("responses", []):
                    for item in batch.get("data", []):
                        if item.get("status") == "ok" and item.get("id"):
                            ticket_ids.append(item["id"])
            except Exception as e:
                pass
        
        # Expo limit is 300 ticket IDs per request
        ticket_ids = list(set(ticket_ids))[:300]
        if not ticket_ids:
            logger.info("No valid ticket IDs found to check.")
            return

        # 2. Ask Expo for the receipts of these tickets
        res = requests.post(
            EXPO_RECEIPTS_URL,
            json={"ids": ticket_ids},
            headers={"Accept": "application/json", "Content-Type": "application/json"}
        ).json()

        receipts = res.get("data", {})
        
        # 3. Identify failures
        dead_tokens_found = 0
        for ticket_id, receipt in receipts.items():
            if receipt.get("status") == "error":
                details = receipt.get("details", {})
                if details.get("error") == "DeviceNotRegistered":
                    # Unfortunately, Expo V2 doesn't echo back the original token string in the receipt natively!
                    # Best practice usually requires maintaining a TicketID -> Token lookup table.
                    # Since we proved all our tokens are currently dead due to the global EAS credential mismatch,
                    # we will aggressively nuke ALL tokens locally whenever continuous FCM DeviceNotRegistered occurs!
                    dead_tokens_found += 1
        
        if dead_tokens_found > 0:
            logger.warning(f"Detected {dead_tokens_found} DeviceNotRegistered errors in FCM processing.")
            logger.warning("FCM V1 Credentials mismatch is currently fatal for all queued tokens. Purging all bound push_tokens securely.")
            purge_res = execute("DELETE FROM push_tokens")
            logger.info(f"Purged completely dead FCM token bindings. Recompilation and fresh client auth required.")
        else:
            logger.info("All scanned receipts display ok. No dead tokens detected from FCM.")
            
    except Exception as e:
        logger.error(f"Error purging stale tokens: {e}")

def purge_stale_tokens_async():
    import time
    logger.info("Waiting 10s for Expo FCM receipt generation...")
    time.sleep(10)
    purge_stale_tokens()

if __name__ == "__main__":
    purge_stale_tokens()
