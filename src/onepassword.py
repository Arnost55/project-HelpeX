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


async def _resolve_vault_ids(client) -> None:
    """Populate _vault_id_cache for all configured vaults."""
    if len(_vault_id_cache) < len(VAULT_NAMES):
        vaults = await client.vaults.list()
        for v in vaults:
            if v.title in VAULT_NAMES and v.title not in _vault_id_cache:
                _vault_id_cache[v.title] = v.id


async def _get_credentials_async(query: str, vault_filter: str = None) -> str:
    from onepassword.client import Client

    client = await Client.authenticate(
        auth=TOKEN,
        integration_name="HelpeX",
        integration_version="v1.0.0",
    )

    await _resolve_vault_ids(client)

    if not _vault_id_cache:
        return f"ERROR: None of the configured vaults found: {VAULT_NAMES}"

    vaults_to_search = {k: v for k, v in _vault_id_cache.items() if k == vault_filter} if vault_filter else _vault_id_cache
    if vault_filter and not vaults_to_search:
        return f"ERROR: Vault '{vault_filter}' not found or not configured."

    all_scored = []
    for vault_name, vault_id in vaults_to_search.items():
        items = await client.items.list(vault_id=vault_id)
        for item in items:
            score = _fuzzy_score(query, item.title)
            all_scored.append((item, vault_name, vault_id, score))

    all_scored.sort(key=lambda x: x[3], reverse=True)

    if not all_scored or all_scored[0][3] < 0.4:
        return f"ERROR: No item found matching '{query}' in vaults: {list(_vault_id_cache.keys())}."

    best_item, best_vault, best_vault_id, _ = all_scored[0]
    full_item = await client.items.get(vault_id=best_vault_id, item_id=best_item.id)

    username = None
    password = None

    for field in full_item.fields:
        t = field.title.lower()
        if not username and t in ("username", "email", "user", "login", "e-mail"):
            username = field.value
        elif not password and t in ("password", "heslo"):
            password = field.value

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
    if len(parts) == 1:
        return f"ERROR: Found '{best_item.title}' but couldn't extract any credentials."
    return " | ".join(parts)


async def _get_ssh_entry_async(query: str) -> dict | str:
    """
    Returns a dict with keys: private_key, user, host, title
    or a string starting with ERROR:.
    The 'text' field in 1Password stores 'user@host'.
    """
    from onepassword.client import Client

    client = await Client.authenticate(
        auth=TOKEN,
        integration_name="HelpeX",
        integration_version="v1.0.0",
    )

    await _resolve_vault_ids(client)

    ssh_vault_name = os.getenv("OP_VAULT_SSH", "SSH")
    vault_id = _vault_id_cache.get(ssh_vault_name)
    if not vault_id:
        return f"ERROR: SSH vault '{ssh_vault_name}' not found."

    items = await client.items.list(vault_id=vault_id)
    scored = sorted(items, key=lambda i: _fuzzy_score(query, i.title), reverse=True)

    if not scored or _fuzzy_score(query, scored[0].title) < 0.4:
        names = [i.title for i in items]
        return f"ERROR: No SSH entry found matching '{query}'. Available: {names}"

    best = scored[0]
    full_item = await client.items.get(vault_id=vault_id, item_id=best.id)

    private_key = None
    user_host = None

    for field in full_item.fields:
        t = field.title.lower()
        if not private_key and t in ("private key", "private_key", "ssh key", "key"):
            private_key = field.value
        if not user_host and t in ("text", "host", "server", "target", "address"):
            user_host = field.value

    if not private_key:
        return f"ERROR: No private key field found in entry '{best.title}'."
    if not user_host:
        return f"ERROR: No text/host field found in entry '{best.title}'."

    # Parse user@host
    if "@" in user_host:
        user, host = user_host.split("@", 1)
    else:
        user = "root"
        host = user_host

    return {
        "title": best.title,
        "private_key": private_key,
        "user": user.strip(),
        "host": host.strip(),
    }


def get_password(query: str) -> str:
    try:
        return asyncio.run(_get_credentials_async(query))
    except Exception as e:
        return f"ERROR: 1Password lookup failed: {e}"


def get_ssh(query: str) -> str:
    """SSH-vault only lookup — never exposed to users."""
    ssh_vault = os.getenv("OP_VAULT_SSH", "SSH")
    try:
        return asyncio.run(_get_credentials_async(query, vault_filter=ssh_vault))
    except Exception as e:
        return f"ERROR: SSH vault lookup failed: {e}"


def get_ssh_entry(query: str) -> dict | str:
    """Returns parsed SSH entry dict for use by ssh_exec. Internal only."""
    try:
        return asyncio.run(_get_ssh_entry_async(query))
    except Exception as e:
        return f"ERROR: {e}"
