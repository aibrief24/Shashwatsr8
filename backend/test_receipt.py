import requests
import json

def check_receipt():
    url = "https://exp.host/--/api/v2/push/getReceipts"
    # Using the ID obtained from the successful send response
    ids = ["019d8774-4fb2-76da-87fb-017ba9688374"]
    
    res = requests.post(
        url,
        json={"ids": ids},
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    )
    
    print("\n[EXPO RECEIPT API RESPONSE]")
    print(json.dumps(res.json(), indent=2))

if __name__ == "__main__":
    check_receipt()
