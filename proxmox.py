import httpx
import os
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parent / ".env"
print(f"Loading .env from: {env_path}")
print(f"File exists: {env_path.exists()}")
load_dotenv(dotenv_path=env_path, override=True)

PROXMOX_HOST = os.getenv("PROXMOX_HOST")
TOKEN_ID = os.getenv("PROXMOX_TOKEN_ID")
TOKEN_SECRET = os.getenv("PROXMOX_TOKEN_SECRET")

print(f"HOST: {PROXMOX_HOST}")
print(f"TOKEN_ID: {TOKEN_ID}")
print(f"TOKEN_SECRET: {TOKEN_SECRET}")

HEADERS = {
    "Authorization": f"PVEAPIToken={TOKEN_ID}={TOKEN_SECRET}"
}

def _get(path: str):
    url = f"{PROXMOX_HOST}/api2/json{path}"
    with httpx.Client(verify=False) as client:
        r = client.get(url, headers=HEADERS)
        r.raise_for_status()
        return r.json().get("data", {})

def _post(path: str, body: dict = {}):
    url = f"{PROXMOX_HOST}/api2/json{path}"
    with httpx.Client(verify=False) as client:
        r = client.post(url, headers=HEADERS, json=body)
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
