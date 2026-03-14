"""
List all Beeper chats with their IDs and names.
Use this to find chat IDs for chats_whitelist.txt and password_whitelist.txt.

Usage:
    python tools/list_chats.py
"""

import sys
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.beeper import get_chats

def main():
    chats = get_chats()
    if not chats:
        print("No chats found. Is Beeper running with Remote Access enabled?")
        return

    print(f"Found {len(chats)} chat(s):\n")
    for chat in chats:
        chat_id = chat.get("id", "unknown")
        name = chat.get("name") or chat.get("displayName") or "unnamed"
        print(f"  {name}")
        print(f"  ID: {chat_id}")
        print()

if __name__ == "__main__":
    main()
