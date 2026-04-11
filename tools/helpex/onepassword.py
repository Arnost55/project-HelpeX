"""
HelpeX 1Password Tool - Credential lookup.
"""
import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv, dotenv_values

# Load .env before accessing env vars
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent.parent / ".env", override=True)

from tools.helpex.base import HelpeXTool


class OnepasswordTool(HelpeXTool):
    name = "onepassword"
    version = "1.0.0"

    tool_defs = [
        {
            "type": "function",
            "function": {
                "name": "get_password",
                "description": "Look up a password from 1Password. Searches the configured vault(s) for a matching entry and returns username and password.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query (item name or partial name)"
                        }
                    },
                    "required": ["query"]
                }
            }
        }
    ]

    @property
    def tools(self):
        return self.tool_defs

    def init(self):
        """Validate 1Password credentials."""
        self.token = os.getenv("OP_SERVICE_ACCOUNT_TOKEN")
        if not self.token:
            raise RuntimeError("Missing OP_SERVICE_ACCOUNT_TOKEN")

        # Load vault names
        root = Path(__file__).resolve().parent.parent.parent
        values = dotenv_values(root / ".env")
        vaults = []
        for key, val in values.items():
            if key == "OP_VAULT" or key.startswith("OP_VAULT_"):
                if val and val.strip():
                    vaults.append(val.strip())
        self.vault_names = vaults if vaults else ["Family"]
        self.ssh_vault_name = os.getenv("OP_VAULT_SSH", "SSH")

        # Cache for vault IDs
        self._vault_id_cache: dict[str, str] = {}

        # Test connection
        try:
            asyncio.run(self._resolve_vault_ids())
        except Exception as e:
            raise RuntimeError(f"Failed to connect to 1Password: {e}")

    async def _get_client(self):
        from onepassword.client import Client
        return await Client.authenticate(
            auth=self.token,
            integration_name="HelpeX",
            integration_version="v1.0.0",
        )

    async def _resolve_vault_ids(self):
        """Populate _vault_id_cache for all configured vaults."""
        client = await self._get_client()
        vaults = await client.vaults.list()
        for v in vaults:
            if v.title in self.vault_names and v.title not in self._vault_id_cache:
                self._vault_id_cache[v.title] = v.id
        self._client = client

    def _fuzzy_score(self, query: str, title: str) -> float:
        from difflib import SequenceMatcher
        query = query.lower().strip()
        title = title.lower().strip()
        if query == title:
            return 1.0
        if query in title or title in query:
            return 0.9
        return SequenceMatcher(None, query, title).ratio()

    async def _get_credentials_async(self, query: str, vault_filter: str = None) -> str:
        await self._resolve_vault_ids()

        if not self._vault_id_cache:
            return f"ERROR: None of the configured vaults found: {self.vault_names}"

        vaults_to_search = {k: v for k, v in self._vault_id_cache.items() if k == vault_filter} if vault_filter else self._vault_id_cache
        if vault_filter and not vaults_to_search:
            return f"ERROR: Vault '{vault_filter}' not found or not configured."

        all_scored = []
        for vault_name, vault_id in vaults_to_search.items():
            items = await self._client.items.list(vault_id=vault_id)
            for item in items:
                score = self._fuzzy_score(query, item.title)
                all_scored.append((item, vault_name, vault_id, score))

        all_scored.sort(key=lambda x: x[3], reverse=True)

        if not all_scored or all_scored[0][3] < 0.4:
            return f"ERROR: No item found matching '{query}' in vaults: {list(self._vault_id_cache.keys())}."

        best_item, best_vault, best_vault_id, _ = all_scored[0]
        full_item = await self._client.items.get(vault_id=best_vault_id, item_id=best_item.id)

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
                password = await self._client.secrets.resolve(f"op://{best_vault}/{best_item.title}/password")
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

    async def _get_ssh_entry_async(self, query: str) -> dict | str:
        """Returns dict with private_key, user, host, title or ERROR string."""
        await self._resolve_vault_ids()

        vault_id = self._vault_id_cache.get(self.ssh_vault_name)
        if not vault_id:
            return f"ERROR: SSH vault '{self.ssh_vault_name}' not found."

        items = await self._client.items.list(vault_id=vault_id)
        scored = sorted(items, key=lambda i: self._fuzzy_score(query, i.title), reverse=True)

        if not scored or self._fuzzy_score(query, scored[0].title) < 0.4:
            names = [i.title for i in items]
            return f"ERROR: No SSH entry found matching '{query}'. Available: {names}"

        best = scored[0]
        full_item = await self._client.items.get(vault_id=vault_id, item_id=best.id)

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

    def get_password(self, query: str) -> str:
        """Look up credentials from 1Password."""
        try:
            return asyncio.run(self._get_credentials_async(query))
        except Exception as e:
            return f"ERROR: 1Password lookup failed: {e}"

    def get_ssh_entry(self, query: str) -> dict | str:
        """Get SSH entry for ssh_exec. Internal use only."""
        try:
            return asyncio.run(self._get_ssh_entry_async(query))
        except Exception as e:
            return f"ERROR: {e}"

    def execute(self, tool_name: str, params: dict) -> str:
        if tool_name == "get_password":
            return self.get_password(params["query"])
        else:
            raise ValueError(f"Unknown tool: {tool_name}")


# Singleton instance
tool = OnepasswordTool()