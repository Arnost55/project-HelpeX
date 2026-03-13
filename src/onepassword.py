import os
import asyncio
from dotenv import load_dotenv, dotenv_values
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=ROOT / ".env", override=True)

TOKEN = os.getenv("OP_SERVICE_ACCOUNT_TOKEN")

# Load all vault names from any OP_VAULT_* or OP_VAULT key in .env
def _load_vault_names() -> list[str]:
    values = dotenv_values(ROOT / ".env")
    vaults = []
    for key, val in values.items():
        if key == "OP_VAULT" or key.startswith("OP_VAULT_"):
            if val and val.strip():
                vaults.append(val.strip())
    return vaults if vaults else ["Family"]

VAULT_NAMES = _load_vault_names()

# Cache: vault name -> vault id
_vault_id_cache: dict[str, str] = {}


def _fuzzy_score(query: str, title: str) -> float:
    from difflib import SequenceMatcher
    query = query.lower().strip()
    title = title.lower().strip()
    if query == title:
        return 1.0
    if query in title or title in query:
        return 0.9
    return SequenceMatcher(None, query, title).ratio()


async def _get_credentials_async(query: str) -> str:
    from onepassword.client import Client

    client = await Client.authenticate(
        auth=TOKEN,
        integration_name="HelpeX",
        integration_version="v1.0.0",
    )

    # Resolve vault IDs for all configured vaults
    if len(_vault_id_cache) < len(VAULT_NAMES):
        vaults = await client.vaults.list()
        for v in vaults:
            if v.title in VAULT_NAMES and v.title not in _vault_id_cache:
                _vault_id_cache[v.title] = v.id

    if not _vault_id_cache:
        return f"ERROR: None of the configured vaults found: {VAULT_NAMES}"

    # Search all vaults, collect scored matches
    all_scored = []
    for vault_name, vault_id in _vault_id_cache.items():
        items = await client.items.list(vault_id=vault_id)
        for item in items:
            score = _fuzzy_score(query, item.title)
            all_scored.append((item, vault_name, vault_id, score))

    all_scored.sort(key=lambda x: x[3], reverse=True)

    if not all_scored or all_scored[0][3] < 0.4:
        return f"ERROR: No item found matching '{query}' in vaults: {list(_vault_id_cache.keys())}."

    best_item, best_vault, best_vault_id, _ = all_scored[0]

    # Fetch full item to get fields
    full_item = await client.items.get(vault_id=best_vault_id, item_id=best_item.id)

    username = None
    password = None
    ssh_key = None

    for field in full_item.fields:
        t = field.title.lower()
        if not username and t in ("username", "email", "user", "login", "e-mail"):
            username = field.value
        elif not password and t in ("password", "heslo"):
            password = field.value
        elif not ssh_key and t in ("private key", "ssh key", "key", "private_key"):
            ssh_key = field.value

    # Fallback for password via secret reference
    if not password:
        try:
            password = await client.secrets.resolve(f"op://{best_vault}/{best_item.title}/password")
        except Exception:
            pass

    parts = [f"INFO: Credentials for '{best_item.title}' (vault: {best_vault}):"]
    if username:
        parts.append(f"username: {username}")
    if password:
        parts.append(f"password: {password}")
    if ssh_key:
        parts.append(f"SSH key: {ssh_key}")
    if len(parts) == 1:
        return f"ERROR: Found '{best_item.title}' but couldn't extract any credentials."
    return " | ".join(parts)


def get_password(query: str) -> str:
    try:
        return asyncio.run(_get_credentials_async(query))
    except Exception as e:
        return f"ERROR: 1Password lookup failed: {e}"
