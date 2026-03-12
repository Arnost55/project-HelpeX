import os
import asyncio
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=True)

TOKEN = os.getenv("OP_SERVICE_ACCOUNT_TOKEN")
VAULT_NAME = os.getenv("OP_VAULT", "Family")

_vault_id_cache = None


def _fuzzy_score(query: str, title: str) -> float:
    query = query.lower().strip()
    title = title.lower().strip()
    if query == title:
        return 1.0
    if query in title or title in query:
        return 0.9
    query_words = set(query.split())
    title_words = set(title.split())
    if query_words == title_words:
        return 0.85
    overlap = query_words & title_words
    if overlap:
        return 0.5 + 0.3 * (len(overlap) / max(len(query_words), len(title_words)))
    # Character overlap fallback
    q_chars = set(query.replace(" ", ""))
    t_chars = set(title.replace(" ", ""))
    char_overlap = len(q_chars & t_chars) / max(len(q_chars), len(t_chars))
    return char_overlap * 0.3


async def _get_password_async(query: str) -> str:
    global _vault_id_cache

    from onepassword.client import Client

    client = await Client.authenticate(
        auth=TOKEN,
        integration_name="HelpeX",
        integration_version="v1.0.0",
    )

    # Get vault ID (cached)
    if not _vault_id_cache:
        vaults = await client.vaults.list()
        for v in vaults:
            if v.title.lower() == VAULT_NAME.lower():
                _vault_id_cache = v.id
                break
        if not _vault_id_cache:
            return f"ERROR: Vault '{VAULT_NAME}' not found."

    # List all items and fuzzy match
    items = await client.items.list(vault_id=_vault_id_cache)
    scored = [(item, _fuzzy_score(query, item.title)) for item in items]
    scored.sort(key=lambda x: x[1], reverse=True)

    if not scored or scored[0][1] < 0.3:
        return f"ERROR: No item found in 1Password matching '{query}'."

    best_item = scored[0][0]

    # Resolve both username and password via secret references
    username, password = None, None
    try:
        username = await client.secrets.resolve(f"op://{VAULT_NAME}/{best_item.title}/username")
    except Exception:
        pass
    try:
        password = await client.secrets.resolve(f"op://{VAULT_NAME}/{best_item.title}/password")
    except Exception:
        pass

    # Fallback: fetch full item and scan fields
    if not username or not password:
        full_item = await client.items.get(vault_id=_vault_id_cache, item_id=best_item.id)
        for field in full_item.fields:
            t = field.title.lower()
            if not username and t in ("username", "meno", "email", "e-mail", "login"):
                username = field.value
            if not password and t in ("password", "heslo"):
                password = field.value

    if not username and not password:
        return f"ERROR: Found item '{best_item.title}' but couldn't extract any credentials."

    parts = [f"INFO: Credentials for '{best_item.title}':"]
    if username:
        parts.append(f"Username: {username}")
    if password:
        parts.append(f"Password: {password}")
    return " | ".join(parts)


def get_password(query: str) -> str:
    try:
        return asyncio.run(_get_password_async(query))
    except Exception as e:
        return f"ERROR: 1Password lookup failed: {e}"
