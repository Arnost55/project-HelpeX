import os
import httpx
from dotenv import load_dotenv
from pathlib import Path
from difflib import SequenceMatcher

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=ROOT / ".env", override=True)

HOMARR_URL = os.getenv("HOMARR_URL", "").rstrip("/")
HOMARR_API_KEY = os.getenv("HOMARR_API_KEY", "")

HEADERS = {"ApiKey": HOMARR_API_KEY}


def _get_apps() -> list[dict]:
    """Fetch all apps from Homarr via tRPC."""
    url = f"{HOMARR_URL}/api/trpc/app.all"
    with httpx.Client(timeout=10) as client:
        r = client.get(url, headers=HEADERS)
        r.raise_for_status()
        data = r.json()
        # tRPC wraps response in result.data.json
        return data.get("result", {}).get("data", {}).get("json", [])


def _ping_url(url: str) -> bool:
    """Returns True if the URL responds with a 2xx or 3xx status code."""
    try:
        with httpx.Client(timeout=5, follow_redirects=True) as client:
            r = client.get(url)
            return r.status_code < 400
    except Exception:
        return False


def _fuzzy_match(query: str, apps: list[dict]) -> list[dict]:
    query_lower = query.lower().strip()

    def score(name: str) -> float:
        n = name.lower()
        if query_lower == n: return 1.0
        if query_lower in n or n in query_lower: return 0.9
        return SequenceMatcher(None, query_lower, n).ratio()

    return [a for a in apps if score(a.get("name", "")) >= 0.4]


def get_app_status(query: str = None) -> str:
    """
    Get status of all apps or a specific app by name.
    Pings each app's ping URL (or main URL as fallback).
    Returns a human-readable status summary.
    """
    try:
        apps = _get_apps()
    except Exception as e:
        return f"ERROR: Could not fetch apps from Homarr: {e}"

    if not apps:
        return "ERROR: No apps found in Homarr."

    if query:
        apps = _fuzzy_match(query, apps)
        if not apps:
            return f"ERROR: No app found matching '{query}' in Homarr."

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

        up = _ping_url(ping_url)
        emoji = "🟢" if up else "🔴"
        status = "online" if up else "offline"
        results.append(f"{emoji} {name} — {status}")

    return "\n".join(results)
