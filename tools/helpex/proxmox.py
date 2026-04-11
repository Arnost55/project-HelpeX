"""
HelpeX Proxmox Tool - VM/LXC management and SSH execution.
"""
import os
import sys
import tempfile
import subprocess
import httpx
from pathlib import Path
from fuzzywuzzy import fuzz
from dotenv import load_dotenv

# Load .env before accessing env vars
load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent.parent / ".env", override=True)

from tools.helpex.base import HelpeXTool


class ProxmoxTool(HelpeXTool):
    name = "proxmox"
    version = "1.0.0"

    # Tool definitions for LLM
    tool_defs = [
        {
            "type": "function",
            "function": {
                "name": "get_server_summary",
                "description": "Get Proxmox node status and list of all VMs and LXCs with their current state.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "machine_action",
                "description": "Start, stop, reboot, or shutdown a VM or LXC by name. Uses fuzzy matching to find the VM/LXC.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Name or partial name of the VM/LXC"
                        },
                        "action": {
                            "type": "string",
                            "enum": ["start", "stop", "reboot", "shutdown"],
                            "description": "Action to perform"
                        }
                    },
                    "required": ["name", "action"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "ssh_exec",
                "description": "Execute a command on a remote server via SSH. Use 'ssh' as the query to connect to the main Proxmox host, or specify a server name to look up in 1Password.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Server name to look up in 1Password SSH vault (e.g., 'pve', 'homeassistant', 'docker')"
                        },
                        "command": {
                            "type": "string",
                            "description": "Command to execute on the remote server"
                        }
                    },
                    "required": ["query", "command"]
                }
            }
        }
    ]

    @property
    def tools(self):
        return self.tool_defs

    # Cached list of VMs/LXCs
    _cache: dict = {}
    _cache_time: float = 0

    def init(self):
        """Validate Proxmox credentials."""
        self.host = os.getenv("PROXMOX_HOST")
        self.token_id = os.getenv("PROXMOX_TOKEN_ID")
        self.token_secret = os.getenv("PROXMOX_TOKEN_SECRET")
        self.node = "pve"

        if not all([self.host, self.token_id, self.token_secret]):
            raise RuntimeError("Missing PROXMOX_HOST, PROXMOX_TOKEN_ID, or PROXMOX_TOKEN_SECRET")

        # Test connection
        try:
            self._get("/nodes")
        except Exception as e:
            raise RuntimeError(f"Failed to connect to Proxmox: {e}")

    def _get(self, path: str):
        url = f"{self.host}/api2/json{path}"
        headers = {"Authorization": f"PVEAPIToken={self.token_id}={self.token_secret}"}
        with httpx.Client(verify=False) as client:
            r = client.get(url, headers=headers)
            r.raise_for_status()
            return r.json().get("data", {})

    def _post(self, path: str, body: dict = None):
        url = f"{self.host}/api2/json{path}"
        headers = {"Authorization": f"PVEAPIToken={self.token_id}={self.token_secret}"}
        with httpx.Client(verify=False) as client:
            r = client.post(url, headers=headers, json=body or {})
            r.raise_for_status()
            return r.json().get("data", {})

    def get_nodes(self):
        return self._get("/nodes")

    def get_node_status(self, node: str = "pve"):
        return self._get(f"/nodes/{node}/status")

    def list_vms(self, node: str = "pve"):
        return self._get(f"/nodes/{node}/qemu")

    def list_lxc(self, node: str = "pve"):
        return self._get(f"/nodes/{node}/lxc")

    def list_all(self, node: str = "pve"):
        vms = [{"type": "vm", **v} for v in self.list_vms(node)]
        lxcs = [{"type": "lxc", **l} for l in self.list_lxc(node)]
        return vms + lxcs

    def find_by_name(self, name: str) -> dict | None:
        """Fuzzy find a VM or LXC by name."""
        all_items = self.list_all(self.node)

        # Try exact match first
        for item in all_items:
            if item.get("name", "").lower() == name.lower():
                return item

        # Fuzzy match
        best_score = 0
        best_match = None
        for item in all_items:
            item_name = item.get("name", f"id-{item.get('vmid')}")
            score = fuzz.ratio(name.lower(), item_name.lower())
            if score > best_score and score >= 60:
                best_score = score
                best_match = item

        return best_match

    def vm_action(self, vmid: int, action: str):
        """Perform action on a VM."""
        return self._post(f"/nodes/{self.node}/qemu/{vmid}/status/{action}")

    def lxc_action(self, vmid: int, action: str):
        """Perform action on an LXC."""
        return self._post(f"/nodes/{self.node}/lxc/{vmid}/status/{action}")

    def get_server_summary(self) -> str:
        """Get node status and all VMs/LXCs."""
        try:
            status = self.get_node_status(self.node)
            cpu = round(status.get("cpu", 0) * 100, 1)
            mem = status.get("memory", {})
            mem_used = round(mem.get("used", 0) / 1024**3, 2)
            mem_total = round(mem.get("total", 0) / 1024**3, 2)
            items = self.list_all(self.node)
            lines = [f"Node: {self.node} | CPU: {cpu}% | RAM: {mem_used}/{mem_total} GB\n"]
            for i in items:
                emoji = "🖥️" if i["type"] == "vm" else "📦"
                state = i.get("status", "?")
                name = i.get("name", f"id-{i.get('vmid')}")
                vmid = i.get("vmid")
                lines.append(f"{emoji} [{i['type'].upper()}] {name} (id:{vmid}) — {state}")
            return "\n".join(lines)
        except Exception as e:
            return f"Proxmox error: {e}"

    def machine_action(self, name: str, action: str) -> str:
        """Start/stop/reboot/shutdown a VM or LXC by name."""
        item = self.find_by_name(name)
        if not item:
            return f"No VM/LXC found matching '{name}'"

        vmid = item["vmid"]
        item_type = item["type"]
        item_name = item.get("name", f"id-{vmid}")

        # Map action
        api_action = action
        if action == "reboot":
            # Proxmox doesn't have 'reboot' — stop then start
            try:
                if item_type == "vm":
                    self.vm_action(vmid, "stop")
                else:
                    self.lxc_action(vmid, "stop")
                import time
                time.sleep(3)
                if item_type == "vm":
                    self.vm_action(vmid, "start")
                else:
                    self.lxc_action(vmid, "start")
                return f"Rebooting {item_name} (id:{vmid})..."
            except Exception as e:
                return f"Failed to reboot {item_name}: {e}"

        try:
            if item_type == "vm":
                self.vm_action(vmid, api_action)
            else:
                self.lxc_action(vmid, api_action)
            return f"{action.capitalize()} requested for {item_name} (id:{vmid})"
        except Exception as e:
            return f"Failed to {action} {item_name}: {e}"

    def ssh_exec(self, query: str, command: str) -> str:
        """Execute command via SSH using credentials from 1Password."""
        # Import here to avoid circular dependency
        from tools.helpex.onepassword import OnepasswordTool

        onepassword = OnepasswordTool()
        onepassword.init()

        entry = onepassword.get_ssh_entry(query)
        if isinstance(entry, str):
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
                os.unlink(key_path)
            except Exception:
                pass

    def execute(self, tool_name: str, params: dict) -> str:
        """Execute a tool by name."""
        if tool_name == "get_server_summary":
            return self.get_server_summary()
        elif tool_name == "machine_action":
            return self.machine_action(params["name"], params["action"])
        elif tool_name == "ssh_exec":
            return self.ssh_exec(params["query"], params["command"])
        else:
            raise ValueError(f"Unknown tool: {tool_name}")


# Singleton instance
tool = ProxmoxTool()