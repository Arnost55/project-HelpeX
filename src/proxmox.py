import httpx
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=True)

PROXMOX_HOST = os.getenv("PROXMOX_HOST")
TOKEN_ID = os.getenv("PROXMOX_TOKEN_ID")
TOKEN_SECRET = os.getenv("PROXMOX_TOKEN_SECRET")

HEADERS = {
    "Authorization": f"PVEAPIToken={TOKEN_ID}={TOKEN_SECRET}"
}

def _get(path: str):
    url = f"{PROXMOX_HOST}/api2/json{path}"
    with httpx.Client(verify=False) as client:
        r = client.get(url, headers=HEADERS)
        r.raise_for_status()
        return r.json().get("data", {})

def _post(path: str, body: dict = None):
    url = f"{PROXMOX_HOST}/api2/json{path}"
    with httpx.Client(verify=False) as client:
        r = client.post(url, headers=HEADERS, json=body or {})
        r.raise_for_status()
        return r.json().get("data", {})

def get_nodes():
    return _get("/nodes")

def get_node_status(node: str = "pve"):
    return _get(f"/nodes/{node}/status")

def list_vms(node: str = "pve"):
    return _get(f"/nodes/{node}/qemu")

def list_lxc(node: str = "pve"):
    return _get(f"/nodes/{node}/lxc")

def list_all(node: str = "pve"):
    vms = [{"type": "vm", **v} for v in list_vms(node)]
    lxcs = [{"type": "lxc", **l} for l in list_lxc(node)]
    return vms + lxcs

def vm_action(node: str, vmid: int, action: str):
    return _post(f"/nodes/{node}/qemu/{vmid}/status/{action}")

def lxc_action(node: str, vmid: int, action: str):
    return _post(f"/nodes/{node}/lxc/{vmid}/status/{action}")

def lxc_exec(node: str, vmid: int, command: str):
    return _post(f"/nodes/{node}/lxc/{vmid}/exec", {"command": ["bash", "-c", command]})

def ssh_exec(query: str, command: str) -> str:
    """
    Look up SSH credentials from 1Password by query (server name),
    then run command on the remote host via SSH using the private key.
    Internal use only — never expose credentials to user.
    """
    import tempfile
    import subprocess
    from src.onepassword import get_ssh_entry

    entry = get_ssh_entry(query)
    if isinstance(entry, str):  # error string
        return entry

    private_key = entry["private_key"]
    user = entry["user"]
    host = entry["host"]

    # Write private key to temp file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as f:
        f.write(private_key)
        if not private_key.endswith("\n"):
            f.write("\n")
        key_path = f.name

    try:
        import stat
        os.chmod(key_path, stat.S_IRUSR | stat.S_IWUSR)  # 600

        result = subprocess.run(
            [
                "ssh",
                "-i", key_path,
                "-o", "StrictHostKeyChecking=no",
                "-o", "BatchMode=yes",
                "-o", "ConnectTimeout=10",
                f"{user}@{host}",
                command
            ],
            capture_output=True,
            text=True,
            timeout=30
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()
        if result.returncode == 0:
            return f"SUCCESS: {stdout}" if stdout else "SUCCESS: Command ran with no output."
        else:
            return f"ERROR (exit {result.returncode}): {stderr or stdout}"
    except subprocess.TimeoutExpired:
        return f"ERROR: SSH command timed out on {host}."
    except FileNotFoundError:
        return "ERROR: ssh binary not found. Is OpenSSH installed?"
    except Exception as e:
        return f"ERROR: SSH exec failed: {e}"
    finally:
        try:
            os.unlink(key_path)  # always delete key from disk
        except Exception:
            pass


def get_summary(node: str = "pve") -> str:
    try:
        status = get_node_status(node)
        cpu = round(status.get("cpu", 0) * 100, 1)
        mem = status.get("memory", {})
        mem_used = round(mem.get("used", 0) / 1024**3, 2)
        mem_total = round(mem.get("total", 0) / 1024**3, 2)
        items = list_all(node)
        lines = [f"Node: {node} | CPU: {cpu}% | RAM: {mem_used}/{mem_total} GB\n"]
        for i in items:
            emoji = "🖥️" if i["type"] == "vm" else "📦"
            state = i.get("status", "?")
            name = i.get("name", f"id-{i.get('vmid')}")
            vmid = i.get("vmid")
            lines.append(f"{emoji} [{i['type'].upper()}] {name} (id:{vmid}) — {state}")
        return "\n".join(lines)
    except Exception as e:
        return f"Proxmox error: {e}"
