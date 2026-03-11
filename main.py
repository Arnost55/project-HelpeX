import time
import logging
from beeper import get_chats, get_messages, send_message
from ai import get_reply
from memory import get_history, add_message

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

POLL_INTERVAL = 3  # seconds between polls
COOLDOWN_SECONDS = 10  # min seconds between replies per chat
seen_message_ids: set[str] = set()
last_reply_time: dict[str, float] = {}  # chat_id -> last reply timestamp

# WHITELIST: only these chat IDs will be processed
# Add chat IDs here manually before running
WHITELISTED_CHAT_IDS: set[str] = {
    "!VTNn6ycF9Ra-t5budt4ouG-3XuE:ba_BOFedZbMtGo9iKjIobXdnlYx08w.local-telegram.localhost",
}


def process_chat(chat: dict):
    chat_id = chat["id"]

    if chat_id not in WHITELISTED_CHAT_IDS:
        return  # skip non-whitelisted chats

    raw = get_messages(chat_id, limit=10)
    messages = raw.get("items", raw) if isinstance(raw, dict) else raw

    for msg in reversed(messages):
        msg_id = msg.get("id")
        if msg_id in seen_message_ids:
            continue

        seen_message_ids.add(msg_id)

        # Skip messages sent by us
        if msg.get("isFromMe"):
            own_text = msg.get("text", "").strip()
            if own_text:
                add_message(chat_id, "assistant", own_text)  # track in history
            continue

        text = msg.get("text", "").strip()
        if not text:
            continue

        # Cooldown check
        now = time.time()
        if now - last_reply_time.get(chat_id, 0) < COOLDOWN_SECONDS:
            logging.info(f"[{chat_id}] Cooldown active, skipping.")
            continue

        logging.info(f"[{chat_id}] New message: {text}")

        # Add to memory and get reply
        add_message(chat_id, "user", text)
        history = get_history(chat_id)
        reply = get_reply(history, last_user_message=text)
        add_message(chat_id, "assistant", reply)

        send_message(chat_id, reply)
        last_reply_time[chat_id] = time.time()
        logging.info(f"[{chat_id}] Replied: {reply}")


def main():
    logging.info("Jarvis agent starting...")

    # Seed seen messages on startup to avoid replying to old messages
    logging.info("Seeding seen messages...")
    chats = get_chats()
    for chat in chats:
        raw = get_messages(chat["id"], limit=20)
        messages = raw.get("items", raw) if isinstance(raw, dict) else raw
        for msg in messages:
            seen_message_ids.add(msg.get("id"))
    logging.info(f"Seeded {len(seen_message_ids)} messages. Listening...")

    while True:
        try:
            chats = get_chats()
            for chat in chats:
                process_chat(chat)
        except Exception as e:
            logging.error(f"Error: {e}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
