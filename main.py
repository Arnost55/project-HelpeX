import time
import logging
import os
from src.beeper import get_chats, get_messages, send_message
from src.ai import get_reply
from src.memory import get_history, add_message, clear_history

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

POLL_INTERVAL = 3       # seconds between polls
COOLDOWN_SECONDS = 10   # min seconds between replies per chat

seen_message_ids: set[str] = set()
last_reply_time: dict[str, float] = {}         # chat_id -> last reply timestamp
pending_confirmations: dict[str, dict] = {}    # chat_id -> {"action": ..., "vmid": ..., "type": ...}


# --- Whitelist loaders ---

def _load_chats_whitelist(path: str = "chats_whitelist.txt") -> tuple[list[str], list[str]]:
    """
    Returns (patterns, exclusions).
    Patterns support wildcards: * = all, *telegram* = contains 'telegram'.
    Lines starting with ! (after stripping) are exclusions.
    """
    patterns = []
    exclusions = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                entry = line.split("#")[0].strip()
                if not entry:
                    continue
                if entry.startswith("!") and "*" not in entry:
                    # ! prefix without wildcard = exclusion (exact chat ID)
                    exclusions.append(entry)
                else:
                    patterns.append(entry)
    except FileNotFoundError:
        logging.warning("chats_whitelist.txt not found — no chats will be processed")
    return patterns, exclusions


def _is_chat_allowed(chat_id: str, patterns: list[str], exclusions: list[str]) -> bool:
    import fnmatch
    # Exclusions take priority
    if chat_id in exclusions:
        return False
    for pattern in patterns:
        if pattern == "*" or fnmatch.fnmatch(chat_id, pattern):
            return True
    # Also allow exact matches
    return chat_id in patterns

def _load_password_whitelist(path: str = "password_whitelist.txt") -> set[str]:
    try:
        with open(path, encoding="utf-8") as f:
            return {line.split("#")[0].strip() for line in f if line.split("#")[0].strip()}
    except FileNotFoundError:
        logging.warning("password_whitelist.txt not found — password tool disabled for all chats")
        return set()

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


# --- Helpers ---

def _is_topic_allowed(chat_id: str, text: str, topic_whitelist: dict[str, list[str]]) -> bool:
    text_lower = text.lower()
    keywords = []
    if chat_id in topic_whitelist:
        keywords += topic_whitelist[chat_id]
    if "*" in topic_whitelist:
        keywords += topic_whitelist["*"]
    if not keywords:
        return True
    return any(kw in text_lower for kw in keywords)


def _error_reply(error: str) -> str:
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


def _is_confirmation(text: str) -> bool:
    """Returns True if the message looks like a yes confirmation."""
    t = text.lower().strip()
    return t in {"yes", "yeah", "yep", "y", "confirm", "do it", "go ahead", "áno", "jo", "jj", "ok", "okay"}

def _is_denial(text: str) -> bool:
    """Returns True if the message looks like a no / cancel."""
    t = text.lower().strip()
    return t in {"no", "nope", "n", "cancel", "abort", "nie", "zruš", "nechaj"}


# --- Load config ---
CHAT_PATTERNS, CHAT_EXCLUSIONS = _load_chats_whitelist()
PASSWORD_WHITELIST = _load_password_whitelist()
TOPIC_WHITELIST = _load_topic_whitelist()


# --- Main chat processor ---

def process_chat(chat: dict):
    chat_id = chat["id"]

    if not _is_chat_allowed(chat_id, CHAT_PATTERNS, CHAT_EXCLUSIONS):
        return

    raw = get_messages(chat_id, limit=10)
    messages = raw.get("items", raw) if isinstance(raw, dict) else raw

    for msg in reversed(messages):
        msg_id = msg.get("id")
        if msg_id in seen_message_ids:
            continue

        seen_message_ids.add(msg_id)

        if msg.get("isFromMe"):
            own_text = msg.get("text", "").strip()
            if own_text:
                add_message(chat_id, "assistant", own_text)
            continue

        text = msg.get("text", "").strip()
        if not text:
            continue

        now = time.time()
        if now - last_reply_time.get(chat_id, 0) < COOLDOWN_SECONDS:
            logging.info(f"[{chat_id}] Cooldown active, skipping.")
            continue

        # --- Confirmation gate ---
        if chat_id in pending_confirmations:
            pending = pending_confirmations[chat_id]

            if _is_confirmation(text):
                del pending_confirmations[chat_id]
                logging.info(f"[{chat_id}] Confirmed destructive action: {pending}")
                add_message(chat_id, "user", text)

                # Execute the confirmed action
                try:
                    from src.proxmox import vm_action, lxc_action
                    vmid = pending["vmid"]
                    action = pending["action"]
                    vm_type = pending["type"]
                    node = pending.get("node", "pve")

                    if vm_type == "vm":
                        vm_action(node=node, vmid=vmid, action=action)
                    else:
                        lxc_action(node=node, vmid=vmid, action=action)

                    reply = f"done, {action} dispatched for {pending.get('name', vmid)}"
                except Exception as e:
                    reply = _error_reply(str(e))

                add_message(chat_id, "assistant", reply)
                send_message(chat_id, reply)
                last_reply_time[chat_id] = time.time()
                logging.info(f"[{chat_id}] Replied after confirmation: {reply}")
                continue

            elif _is_denial(text):
                del pending_confirmations[chat_id]
                logging.info(f"[{chat_id}] Destructive action cancelled by user")
                add_message(chat_id, "user", text)
                reply = "ok, cancelled"
                add_message(chat_id, "assistant", reply)
                send_message(chat_id, reply)
                last_reply_time[chat_id] = time.time()
                continue

            else:
                # Not a yes/no — clear the pending action and process normally
                del pending_confirmations[chat_id]
                logging.info(f"[{chat_id}] Pending confirmation abandoned, processing new message normally")

        # --- Normal flow ---
        add_message(chat_id, "user", text)

        if not _is_topic_allowed(chat_id, text, TOPIC_WHITELIST):
            logging.info(f"[{chat_id}] Message outside topic whitelist, staying silent: {text}")
            continue

        logging.info(f"[{chat_id}] New message: {text}")

        history = get_history(chat_id)
        try:
            reply, confirmation_needed = get_reply(
                history,
                last_user_message=text,
                chat_id=chat_id,
                password_whitelist=PASSWORD_WHITELIST
            )
        except Exception as e:
            logging.error(f"[{chat_id}] get_reply failed: {e}")
            if "400" in str(e) or "tool_use_failed" in str(e):
                logging.warning(f"[{chat_id}] Clearing history due to corrupted tool context")
                clear_history(chat_id)
            reply = _error_reply(str(e))
            confirmation_needed = None

        if not reply or not reply.strip():
            reply = "something went wrong, didn't get a response"

        # If the AI wants to do a destructive action, hold it and ask first
        if confirmation_needed:
            pending_confirmations[chat_id] = confirmation_needed
            name = confirmation_needed.get("name", confirmation_needed.get("vmid"))
            action = confirmation_needed["action"]
            reply = f"you sure you want to {action} {name}? (yes/no)"
            logging.info(f"[{chat_id}] Asking confirmation for: {confirmation_needed}")

        add_message(chat_id, "assistant", reply)
        send_message(chat_id, reply)
        last_reply_time[chat_id] = time.time()
        logging.info(f"[{chat_id}] Replied: {reply}")


def main():
    logging.info("HelpeX agent starting...")

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
