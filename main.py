import time
import logging
from src.beeper import get_chats, get_messages, send_message
from src.ai import get_reply
from src.memory import get_history, add_message, clear_history

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

# PASSWORD_WHITELIST: loaded from password_whitelist.txt (one chat ID per line, # = comment)
def _load_password_whitelist(path: str = "password_whitelist.txt") -> set[str]:
    try:
        with open(path, encoding="utf-8") as f:
            return {line.split("#")[0].strip() for line in f if line.split("#")[0].strip()}
    except FileNotFoundError:
        logging.warning(f"password_whitelist.txt not found — password tool disabled for all chats")
        return set()

PASSWORD_WHITELIST = _load_password_whitelist()


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
        try:
            reply = get_reply(history, last_user_message=text, chat_id=chat_id, password_whitelist=PASSWORD_WHITELIST)
        except Exception as e:
            logging.error(f"[{chat_id}] get_reply failed: {e}")
            if "400" in str(e) or "tool_use_failed" in str(e):
                logging.warning(f"[{chat_id}] Clearing history due to corrupted tool context")
                clear_history(chat_id)
            reply = "you're not authorized for this, sorry"
        if not reply or not reply.strip():
            reply = "something went wrong, didn't get a response"
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
