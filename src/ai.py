import os
import json
from groq import Groq
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=True)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.3-70b-versatile"  # current model with tool calling support

# --- Tool definitions for Groq ---
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_server_summary",
            "description": "Get live status of the Proxmox server — node CPU/RAM usage and list of all VMs and LXC containers with their current state.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "find_vm_by_name",
            "description": "Find a VM or LXC container by its name. Use this FIRST when the user refers to a VM/LXC by name instead of ID. Returns the vmid and type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Partial or full name of the VM/LXC to search for"}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "vm_action",
            "description": "Start, stop, reboot, or shutdown a VM (QEMU) by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vmid": {"type": "integer", "description": "The VM ID number, e.g. 125"},
                    "action": {"type": "string", "enum": ["start", "stop", "reboot", "shutdown"], "description": "Action to perform"}
                },
                "required": ["vmid", "action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "lxc_action",
            "description": "Start, stop, reboot, or shutdown an LXC container by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vmid": {"type": "integer", "description": "The LXC container ID number"},
                    "action": {"type": "string", "enum": ["start", "stop", "reboot", "shutdown"], "description": "Action to perform"}
                },
                "required": ["vmid", "action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_password",
            "description": "Look up credentials (username AND password) from the 1Password vault by the name of the service or website. Use when someone asks for login credentials, a password, a username, or account details. Always returns both username and password when available.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Name of the service, website, or app to look up, e.g. 'Netflix', 'WiFi', 'Gmail'"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "lxc_exec",
            "description": "Execute a shell command inside an LXC container.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vmid": {"type": "integer", "description": "The LXC container ID"},
                    "command": {"type": "string", "description": "Shell command to run inside the container"}
                },
                "required": ["vmid", "command"]
            }
        }
    }
]

# --- Tool execution ---
def _execute_tool(name: str, args: dict) -> str:
    from src.proxmox import get_summary, vm_action, lxc_action, lxc_exec
    try:
        if name == "find_vm_by_name":
            from src.proxmox import list_all
            items = list_all()
            query = args["name"].lower().strip()
            matches = [i for i in items if query in i.get("name", "").lower()]
            if not matches:
                query_words = query.split()
                matches = [i for i in items if any(qw in i.get("name", "").lower() for qw in query_words)]
            if not matches:
                def similarity(a, b):
                    a, b = a.lower(), b.lower()
                    return sum(1 for c in a if c in b) / max(len(a), 1)
                matches = [i for i in items if similarity(query, i.get("name", "")) >= 0.6]
            if not matches:
                all_names = [i.get('name') for i in items]
                return f"ERROR: No VM or LXC found matching '{args['name']}'. Available machines: {all_names}. Try a different name."
            return json.dumps([{"name": i.get("name"), "vmid": i.get("vmid"), "type": i["type"], "status": i.get("status")} for i in matches])
        elif name == "get_server_summary":
            return get_summary()
        elif name == "vm_action":
            vmid = args["vmid"]
            action = args["action"]
            # Check current status first to avoid pointless actions
            from src.proxmox import list_all
            items = list_all()
            match = next((i for i in items if i.get("vmid") == vmid), None)
            if match:
                status = match.get("status")
                if action == "start" and status == "running":
                    return f"INFO: VM {vmid} is already running. No action taken."
                if action == "stop" and status == "stopped":
                    return f"INFO: VM {vmid} is already stopped. No action taken."
                if match["type"] == "lxc":
                    return f"ERROR: {vmid} is an LXC container, not a VM. Use lxc_action instead."
            result = vm_action(node="pve", vmid=vmid, action=action)
            return f"SUCCESS: VM {vmid} {action} dispatched. Task ID: {result}"
        elif name == "lxc_action":
            vmid = args["vmid"]
            action = args["action"]
            from src.proxmox import list_all
            items = list_all()
            match = next((i for i in items if i.get("vmid") == vmid), None)
            if match:
                status = match.get("status")
                if action == "start" and status == "running":
                    return f"INFO: LXC {vmid} is already running. No action taken."
                if action == "stop" and status == "stopped":
                    return f"INFO: LXC {vmid} is already stopped. No action taken."
                if match["type"] == "vm":
                    return f"ERROR: {vmid} is a VM, not an LXC container. Use vm_action instead."
            result = lxc_action(node="pve", vmid=vmid, action=action)
            return f"SUCCESS: LXC {vmid} {action} dispatched. Task ID: {result}"
        elif name == "get_password":
            from src.onepassword import get_password
            result = get_password(args["query"])
            if result.startswith("INFO:"):
                return result + " — relay this password to the user now, do not call any more tools."
            return result
        elif name == "lxc_exec":
            result = lxc_exec(node="pve", vmid=args["vmid"], command=args["command"])
            return f"SUCCESS: Exec result: {result}"
        else:
            return f"ERROR: Unknown tool '{name}'."
    except Exception as e:
        return f"ERROR: {str(e)}. Try a different approach or report back what went wrong."

# --- Main reply function ---
def get_reply(chat_history: list[dict], last_user_message: str = "") -> str:
    import logging

    # Keep system prompt + last 10 messages to avoid context issues with Groq tool calling
    system = [m for m in chat_history if m["role"] == "system"]
    non_system = [m for m in chat_history if m["role"] != "system"]
    messages = system + non_system[-10:]

    # Agentic loop — keep calling tools until model gives a final text reply
    for _ in range(5):  # max 5 tool rounds to avoid infinite loops
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=1024,
            parallel_tool_calls=False  # force sequential tool calls
        )

        msg = response.choices[0].message
        logging.info(f"[AI] tool_calls: {msg.tool_calls}")
        logging.info(f"[AI] content: {msg.content}")

        # No tool calls — model is done, return final reply
        if not msg.tool_calls:
            return msg.content

        # Execute all tool calls in this round
        messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": msg.tool_calls})

        for tool_call in msg.tool_calls:
            name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)
            result = _execute_tool(name, args)
            logging.info(f"[AI] tool result for {name}: {result}")
            messages.append({
                "tool_call_id": tool_call.id,
                "role": "tool",
                "name": name,
                "content": result
            })

    return "Something went wrong, couldn't complete the action."
