import os
from collections import defaultdict
from dotenv import load_dotenv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=ROOT / ".env", override=True)

_histories: dict[str, list[dict]] = defaultdict(list)

def _load_system_prompt() -> str:
    prompt_file = os.getenv("SYSTEM_PROMPT_FILE", "system_prompt.txt")
    prompt_path = ROOT / prompt_file
    if prompt_path.exists():
        return prompt_path.read_text(encoding="utf-8").strip()
    raise FileNotFoundError(f"System prompt file not found: {prompt_path}")

def get_history(chat_id: str) -> list[dict]:
    system_prompt = _load_system_prompt()
    return [{"role": "system", "content": system_prompt}] + list(_histories[chat_id])

def add_message(chat_id: str, role: str, content: str):
    _histories[chat_id].append({"role": role, "content": content})
    if len(_histories[chat_id]) > 50:
        _histories[chat_id] = _histories[chat_id][-50:]

def clear_history(chat_id: str):
    _histories[chat_id] = []
