import json
import pathlib
import time

import requests


CLIENT_ID = "1950a258-227b-4e31-a9cf-717495945fc2"
SCOPE = "https://api.powerplatform.com/.default offline_access openid profile"
BASE = "https://login.microsoftonline.com/organizations/oauth2/v2.0"

ROOT = pathlib.Path(r"C:\Aegis\KRI")
STATUS_PATH = ROOT / ".powerplatform-auth-status.json"
TOKEN_PATH = ROOT / ".powerplatform-auth-token.json"


def write_status(payload):
    STATUS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main():
    resp = requests.post(
        f"{BASE}/devicecode",
        data={"client_id": CLIENT_ID, "scope": SCOPE},
        timeout=30,
    )
    resp.raise_for_status()
    device = resp.json()
    write_status(
        {
            "state": "pending",
            "user_code": device["user_code"],
            "verification_uri": device["verification_uri"],
            "message": device["message"],
            "expires_in": device.get("expires_in"),
            "interval": device.get("interval", 5),
            "started_at": time.time(),
        }
    )

    interval = int(device.get("interval", 5))
    expires_at = time.time() + int(device.get("expires_in", 900))

    while time.time() < expires_at:
        token_resp = requests.post(
            f"{BASE}/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "client_id": CLIENT_ID,
                "device_code": device["device_code"],
            },
            timeout=30,
        )
        if token_resp.status_code == 200:
            token_json = token_resp.json()
            TOKEN_PATH.write_text(json.dumps(token_json, indent=2), encoding="utf-8")
            write_status(
                {
                    "state": "complete",
                    "user_code": device["user_code"],
                    "completed_at": time.time(),
                    "token_path": str(TOKEN_PATH),
                }
            )
            return

        try:
            err = token_resp.json()
        except Exception:
            err = {"error": "unknown", "error_description": token_resp.text}

        write_status(
            {
                "state": "polling",
                "user_code": device["user_code"],
                "error": err.get("error"),
                "error_description": err.get("error_description"),
                "updated_at": time.time(),
            }
        )

        if err.get("error") in ("authorization_pending", "slow_down"):
            time.sleep(interval + (5 if err.get("error") == "slow_down" else 0))
            continue
        if err.get("error") in ("expired_token", "access_denied"):
            write_status(
                {
                    "state": "failed",
                    "user_code": device["user_code"],
                    "error": err,
                    "failed_at": time.time(),
                }
            )
            return
        time.sleep(interval)

    write_status(
        {
            "state": "expired",
            "user_code": device["user_code"],
            "expired_at": time.time(),
        }
    )


if __name__ == "__main__":
    main()
