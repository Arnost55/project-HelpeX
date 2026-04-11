"""
HelpeX Homarr Tool - Service status monitoring.
"""
import os
import httpx
from pathlib import Path
from dotenv import load_dotenv

# Load .env before accessing env vars
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent.parent / ".env", override=True)

from tools.helpex.base import HelpeXTool


class HomarrTool(HelpeXTool):
    name = "homarr"
    version = "1.0.0"

    tool_defs = [
        {
            "type": "function",
            "function": {
                "name": "get_service_status",
                "description": "Check the status of a specific service via Homarr. Returns whether it's online or offline.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Service/app name to check (fuzzy matched)"
                        }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_all_services_status",
                "description": "Check the status of all services configured in Homarr.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        }
    ]

    @property
    def tools(self):
        return self.tool_defs

    def init(self):
        """Validate Homarr credentials."""
        self.url = os.getenv("HOMARR_URL", "").rstrip("/")
        self.api_key = os.getenv("HOMARR_API_KEY", "")

        if not self.url:
            raise RuntimeError("Missing HOMARR_URL")
        if not self.api_key:
            raise RuntimeError("Missing HOMARR_API_KEY")

        self.headers = {"ApiKey": self.api_key}

        # Test connection
        try:
            self._get_apps()
        except Exception as e:
            raise RuntimeError(f"Failed to connect to Homarr: {e}")

    def _get_apps(self) -> list[dict]:
        """Fetch all apps from Homarr via tRPC."""
        url = f"{self.url}/api/trpc/app.all"
        with httpx.Client(timeout=10, verify=False) as client:
            r = client.get(url, headers=self.headers)
            r.raise_for_status()
            data = r.json()
            # tRPC wraps response in result.data.json
            return data.get("result", {}).get("data", {}).get("json", [])

    def _ping_url(self, url: str) -> bool:
        """Returns True if the URL responds with 2xx/3xx."""
        try:
            with httpx.Client(timeout=5, follow_redirects=True, verify=False) as client:
                r = client.get(url)
                return r.status_code < 400
        except Exception:
            return False

    def _fuzzy_match(self, query: str, apps: list[dict]) -> list[dict]:
        from difflib import SequenceMatcher
        query_lower = query.lower().strip()

        def score(name: str) -> float:
            n = name.lower()
            if query_lower == n:
                return 1.0
            if query_lower in n or n in query_lower:
                return 0.9
            return SequenceMatcher(None, query_lower, n).ratio()

        return [a for a in apps if score(a.get("name", "")) >= 0.4]

    def get_service_status(self, query: str) -> str:
        """Check status of a specific service."""
        try:
            apps = self._get_apps()
        except Exception as e:
            return f"ERROR: Could not fetch apps from Homarr: {e}"

        if not apps:
            return "ERROR: No apps found in Homarr."

        apps = self._fuzzy_match(query, apps)
        if not apps:
            return f"ERROR: No app found matching '{query}' in Homarr."

        return self._format_status(apps)

    def get_all_services_status(self) -> str:
        """Check status of all services."""
        try:
            apps = self._get_apps()
        except Exception as e:
            return f"ERROR: Could not fetch apps from Homarr: {e}"

        if not apps:
            return "ERROR: No apps found in Homarr."

        return self._format_status(apps)

    def _format_status(self, apps: list[dict]) -> str:
        results = []
        for app in apps:
            name = app.get("name", "unknown")
            ping_url = (
                app.get("pingUrl")
                or app.get("ping_url")
                or app.get("href")
                or app.get("url")
                or ""
            )

            if not ping_url:
                results.append(f"⚪ {name} — no URL configured")
                continue

            up = self._ping_url(ping_url)
            emoji = "🟢" if up else "🔴"
            status = "online" if up else "offline"
            results.append(f"{emoji} {name} — {status}")

        return "\n".join(results)

    def execute(self, tool_name: str, params: dict) -> str:
        if tool_name == "get_service_status":
            return self.get_service_status(params["query"])
        elif tool_name == "get_all_services_status":
            return self.get_all_services_status()
        else:
            raise ValueError(f"Unknown tool: {tool_name}")


# Singleton instance
tool = HomarrTool()