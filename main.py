import time
import logging
import os
from src.beeper import get_chats, get_messages, send_message
from src.ai import get_reply
from src.memory import get_history, add_message, clear_history

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

POLL_INTERVAL = 3  # seconds between polls
COOLDOWN_SECONDS = 10  # min seconds between replies per chat
seen_message_ids: set[str] = set()
last_reply_time: dict[str, float] = {}  # chat_id -> last reply timestamp

# WHITELIST: only these chat IDs will be processed
WHITELISTED_CHAT_IDS: set[str] = {
    "!VTNn6ycF9Ra-t5budt4ouG-3XuE:ba_BOFedZbMtGo9iKjIobXdnlYx08w.local-telegram.localhost",
}

# PASSWORD_WHITELIST: loaded from password_whitelist.txt
def _load_password_whitelist(path: str = "password_whitelist.txt") -> set[str]:
    try:
        with open(path, encoding="utf-8") as f:
            return {line.split("#")[0].strip() for line in f if line.split("#")[0].strip()}
    except FileNotFoundError:
        logging.warning("password_whitelist.txt not found — password tool disabled for all chats")
        return set()

# TOPIC_WHITELIST: loaded from topic_whitelist.txt
# Returns dict: { chat_id -> [keywords] }
# Special key "*" applies to all chats
def _load_topic_whitelist(path: str = "topic_whitelist.txt") -> dict[str, list[str]]:
    result = {}
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.split("#")[0].strip()
                if not line or "|" not in line:
                    continue
                chat_id, keywords = line.split("|", 1)
                chat_id = chat_id.strip()
                keywords = [k.strip().lower() for k in keywords.split(",") if k.strip()]
                if chat_id and keywords:
                    result[chat_id] = keywords
    except FileNotFoundError:
        logging.warning("topic_whitelist.txt not found — no topic restrictions applied")
    return result

def _is_topic_allowed(chat_id: str, text: str, topic_whitelist: dict[str, list[str]]) -> bool:
    """Returns True if the bot should reply, False if it should stay silent."""
    text_lower = text.lower()

    # Collect keywords that apply to this chat (specific + global *)
    keywords = []
    if chat_id in topic_whitelist:
        keywords += topic_whitelist[chat_id]
    if "*" in topic_whitelist:
        keywords += topic_whitelist["*"]

    # If no topic restriction for this chat, always reply
    if not keywords:
        return True

    # Only reply if at least one keyword matches
    return any(kw in text_lower for kw in keywords)


PASSWORD_WHITELIST = _load_password_whitelist()

def _error_reply(error: str) -> str:
    """Ask the model to produce a natural, casual reply explaining the error."""
    try:
        from groq import Groq
        c = Groq(api_key=os.getenv("GROQ_API_KEY"))
        resp = c.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a casual assistant texting someone. In one short sentence, explain that something went wrong based on the error below. Be natural, don't be technical, don't mention API or code."},
                {"role": "user", "content": f"Error: {error}"}
            ],
            max_tokens=60
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return "something went wrong, try again later"

TOPIC_WHITELIST = _load_topic_whitelist()


def process_chat(chat: dict):
    chat_id = chat["id"]

    if chat_id not in WHITELISTED_CHAT_IDS:
        return

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
                add_message(chat_id, "assistant", own_text)
            continue

        text = msg.get("text", "").strip()
        if not text:
            continue

        # Cooldown check
        now = time.time()
        if now - last_reply_time.get(chat_id, 0) < COOLDOWN_SECONDS:
            logging.info(f"[{chat_id}] Cooldown active, skipping.")
            continue

        # Topic whitelist check — still add to memory so context is preserved
        add_message(chat_id, "user", text)

        if not _is_topic_allowed(chat_id, text, TOPIC_WHITELIST):
            logging.info(f"[{chat_id}] Message outside topic whitelist, staying silent: {text}")
            continue

        logging.info(f"[{chat_id}] New message: {text}")

        history = get_history(chat_id)
        try:
            reply = get_reply(history, last_user_message=text, chat_id=chat_id, password_whitelist=PASSWORD_WHITELIST)
        except Exception as e:
            logging.error(f"[{chat_id}] get_reply failed: {e}")
            if "400" in str(e) or "tool_use_failed" in str(e):
                logging.warning(f"[{chat_id}] Clearing history due to corrupted tool context")
                clear_history(chat_id)
            reply = _error_reply(str(e))
        if not reply or not reply.strip():
            reply = "something went wrong, didn't get a response"
        add_message(chat_id, "assistant", reply)
        send_message(chat_id, reply)
        last_reply_time[chat_id] = time.time()
        logging.info(f"[{chat_id}] Replied: {reply}")


def main():
    logging.info("Jarvis agent starting...")

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
