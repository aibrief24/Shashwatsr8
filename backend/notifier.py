"""Expo Push Notification sender for AIBrief24 (legacy compatibility layer).
For production use, call notification_worker.run_pending_jobs() instead.
"""
import logging
import requests

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
logger = logging.getLogger(__name__)


def send_expo_notifications(tokens: list, title: str, body: str, data: dict = None) -> dict:
    """Send push notifications to a list of Expo push tokens.

    Batches requests in groups of 100 (Expo API limit).
    Returns dict with sent/error counts AND per-ticket data for receipt polling.
    """
    if not tokens:
        return {"success": True, "sent": 0, "errors": 0, "total": 0, "tickets": []}

    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": "default",
            "priority": "high",
            "channelId": "default",
        }
        for token in tokens
        if token and token.startswith(("ExponentPushToken", "expo"))
    ]

    if not messages:
        logger.warning("No valid Expo push tokens found")
        return {"success": True, "sent": 0, "errors": 0, "total": 0, "tickets": []}

    sent = 0
    errors = 0
    tickets = []   # list of {token, ticket_id, status}

    for i in range(0, len(messages), 100):
        batch = messages[i: i + 100]
        try:
            res = requests.post(
                EXPO_PUSH_URL,
                json=batch,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
                timeout=15,
            )
            result = res.json()
            for idx, item in enumerate(result.get("data", [])):
                token = batch[idx]["to"]
                if item.get("status") == "ok":
                    sent += 1
                    tickets.append({"token": token, "ticket_id": item.get("id"), "status": "ok"})
                else:
                    errors += 1
                    tickets.append({"token": token, "ticket_id": None, "status": "error",
                                    "error": item.get("message")})
                    logger.warning(f"Push error for token {token[:30]}: {item}")
        except Exception as e:
            logger.error(f"Push batch error: {e}")
            errors += len(batch)

    logger.info(f"Push notifications: {sent} sent, {errors} errors")
    return {
        "success": True,
        "sent": sent,
        "errors": errors,
        "total": len(messages),
        "tickets": tickets,
    }
