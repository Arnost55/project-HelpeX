import os
import json
from groq import Groq
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

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
    from proxmox import get_summary, vm_action, lxc_action, lxc_exec
    try:
        if name == "find_vm_by_name":
            from proxmox import list_all
            items = list_all()
            query = args["name"].lower().strip()
            # Try substring match first
            matches = [i for i in items if query in i.get("name", "").lower()]
            # Fuzzy fallback — match if any word in query matches any word in name
            if not matches:
                query_words = query.split()
                matches = [
                    i for i in items
                    if any(qw in i.get("name", "").lower() for qw in query_words)
                ]
            # Character-level fuzzy fallback — match if 60%+ of query chars appear in name
            if not matches:
                def similarity(a, b):
                    a, b = a.lower(), b.lower()
                    matches_count = sum(1 for c in a if c in b)
                    return matches_count / max(len(a), 1)
                matches = [i for i in items if similarity(query, i.get("name", "")) >= 0.6]
            if not matches:
                all_names = [i.get('name') for i in items]
                return f"No VM or LXC found matching '{args['name']}'. Available: {all_names}"
            return json.dumps([{"name": i.get("name"), "vmid": i.get("vmid"), "type": i["type"], "status": i.get("status")} for i in matches])
        elif name == "get_server_summary":
            return get_summary()
        elif name == "vm_action":
            result = vm_action(node="pve", vmid=args["vmid"], action=args["action"])
            return f"VM {args['vmid']} {args['action']} — task: {result}"
        elif name == "lxc_action":
            result = lxc_action(node="pve", vmid=args["vmid"], action=args["action"])
            return f"LXC {args['vmid']} {args['action']} — task: {result}"
        elif name == "lxc_exec":
            result = lxc_exec(node="pve", vmid=args["vmid"], command=args["command"])
            return f"Exec result: {result}"
        else:
            return f"Unknown tool: {name}"
    except Exception as e:
        return f"Tool error: {e}"

# --- Main reply function ---
def get_reply(chat_history: list[dict], last_user_message: str = "") -> str:
    messages = list(chat_history)

    import logging

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
