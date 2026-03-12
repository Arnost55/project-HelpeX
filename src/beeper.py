import httpx
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=True)

BEEPER_BASE_URL = os.getenv("BEEPER_BASE_URL", "http://localhost:23373")
BEEPER_TOKEN = os.getenv("BEEPER_TOKEN")

HEADERS = {
    "Authorization": f"Bearer {BEEPER_TOKEN}",
    "Content-Type": "application/json"
}


def get_chats():
    """Fetch all chats from Beeper."""
    r = httpx.get(f"{BEEPER_BASE_URL}/v1/chats", headers=HEADERS)
    r.raise_for_status()
    data = r.json()
    return data.get("items", data)


def get_messages(chat_id: str, limit: int = 20):
    """Fetch recent messages from a specific chat."""
    r = httpx.get(
        f"{BEEPER_BASE_URL}/v1/chats/{chat_id}/messages",
        headers=HEADERS,
        params={"limit": limit}
    )
    r.raise_for_status()
    return r.json()


def send_message(chat_id: str, text: str):
    """Send a message to a specific chat."""
    r = httpx.post(
        f"{BEEPER_BASE_URL}/v1/chats/{chat_id}/messages",
        headers=HEADERS,
        json={"text": text}
    )
    r.raise_for_status()
    return r.json()
