# CLAUDE.md — HelpeX (dev)

**IMPORTANT: Work in `dev/` directory. Never modify `stable/` or `openclaw/`.**

---

## What is this project?

**HelpeX** (codename: Jarvis) is a self-hosted Python AI agent that acts as a personal IT secretary. It connects to Beeper (a unified chat client), reads incoming messages across Telegram, WhatsApp, Signal, etc., and autonomously manages home server infrastructure — controlling VMs, running SSH commands, checking service status, and looking up passwords — all while replying in the user's natural tone.

The user is Arnošt, an IT guy in Slovakia. The agent impersonates him in chats. It speaks Slovak, Czech, and English depending on who's writing.

---

## Directory Structure

```
project-HelpeX/
├── dev/ # ← ACTIVE DEVELOPMENT — work here
│   ├── .env                    # Secrets (gitignored)
│   ├── .env.example            # Config template
│   ├── .gitignore
│   ├── main.py                 # Entry point — polling loop
│   ├── system_prompt.txt       # AI personality rules
│   ├── requirements.txt        # Python dependencies
│   ├── CLAUDE.md               # This file
│   ├── README.md               # Project docs
│   │
│   ├── src/                    # Core Python modules
│   │   ├── __init__.py
│   │   ├── ai.py               # Groq LLM + agentic tool calling loop
│   │   ├── beeper.py           # Beeper REST API client
│   │   ├── memory.py           # Per-chat history with disk persistence + summarization
│   │   ├── proxmox.py          # Proxmox REST API + SSH exec
│   │   ├── onepassword.py      # 1Password SDK integration
│   │   └── homarr.py           # Homarr service status checks
│   │
│   ├── tools/                  # Utilities
│   │   └── list_chats.py       # Utility: print all Beeper chat IDs
│   │
│   ├── ui/                     # Web UI (Flask + SocketIO)
│   │   ├── app.py              # Flask application
│   │   ├── __init__.py
│   │   ├── static/
│   │   └── templates/
│   │       └── index.html      # Live message feed + skill controls
│   │
│   ├── plugins/                # Plugin system (future)
│   │   ├── __init__.py         # Plugin loader
│   │   └── README.md
│   │
│   ├── chats_whitelist.txt     # Which chats agent listens to (gitignored)
│   ├── password_whitelist.txt  # Which chats can request passwords (gitignored)
│   ├── topic_whitelist.txt     # Per-chat topic restrictions (gitignored)
│   └── chats.json              # Persisted chat history (gitignored)
│
├── stable/                     # Frozen 1.0 release — do not modify
└── openclaw/                   # Reference implementation — do not modify
```

---

## How to run

```bash
cd dev
python main.py
```

Only use Python 3.14.

---

## Environment variables (dev/.env)

```
BEEPER_BASE_URL=http://localhost:23373
BEEPER_TOKEN=...
GROQ_API_KEY=...
PROXMOX_HOST=https://proxmoxserver.dev
PROXMOX_TOKEN_ID=agent@pam!agent
PROXMOX_TOKEN_SECRET=...
OP_SERVICE_ACCOUNT_TOKEN=...
OP_VAULT=Family
OP_VAULT_SSH=SSH
HOMARR_URL=https://homarr.proxmoxserver.dev
HOMARR_API_KEY=...
SYSTEM_PROMPT_FILE=system_prompt.txt
```

---

## Architecture

### Polling loop (`main.py`)

- Polls Beeper every 3 seconds
- Checks `chats_whitelist.txt` — wildcard patterns (`*`, `*telegram*`) and exact IDs; exclusions use `-` prefix
- Checks `topic_whitelist.txt` — per-chat keyword restrictions
- Checks `password_whitelist.txt` — which chats can use the password tool
- Confirmation gate: `stop`, `shutdown`, `reboot` ask yes/no before executing
- Pending confirmation abandoned if user sends anything other than yes/no

### AI loop (`src/ai.py`)

- Model: `llama-3.3-70b-versatile` via Groq
- `parallel_tool_calls=False` — sequential tool execution only
- Max 5 tool rounds per message
- **Text-format tool call recovery**: llama sometimes generates `<function=name>{...}</function>` in plain text instead of proper tool calls. Both the 400 error path and the inline reply path are caught and executed via `_parse_text_tool_call()`
- `<function=` tags are stripped from memory and never stored
- SSH key output is blocked at tool level, output filter, and memory level

### Tools available

| Tool | What it does |
|------|--------------|
| `get_server_summary` | Proxmox node status + all VMs/LXCs |
| `machine_action` | Start/stop/reboot/shutdown VM or LXC **by name** — fuzzy lookup internally |
| `get_password` | 1Password lookup (Family vault) |
| `get_ssh_credentials` | 1Password SSH vault lookup — internal only, never shown to user |
| `ssh_exec` | SSH into a server and run a command |
| `get_service_status` | Check a specific service via Homarr |
| `get_all_services_status` | Check all services via Homarr |
| `lxc_exec` | Run command inside LXC via Proxmox API (unreliable, 501 on some setups) |

**Important**: `machine_action` takes a `name` string, not a vmid. It resolves the name to a vmid internally via fuzzy matching. Never pass a vmid directly.

### Memory (`src/memory.py`)

- In-memory dict, persisted to `chats.json` on every write
- Loaded from disk on startup (survives restarts)
- Max 20 messages per chat before summarization triggers
- Summarization: compresses oldest messages into a 3-5 sentence summary via Groq, keeps last 6 raw
- Tool results trimmed to 800 chars in memory, 1200 chars in live context
- Messages containing `<function=` are rejected and never stored

### Proxmox (`src/proxmox.py`)

- Auth: `PVEAPIToken={TOKEN_ID}={TOKEN_SECRET}` header
- `verify=False` — self-signed cert
- All responses wrapped in `"data"` key
- Node name: `pve`
- `restart` action doesn't exist in Proxmox API — use `reboot`
- `lxc_exec` endpoint returns 501 on this setup — unreliable

### 1Password (`src/onepassword.py`)

- Vaults loaded dynamically from any `OP_VAULT` or `OP_VAULT_*` env var
- `get_password()` — searches Family vault, returns username + password
- `get_ssh()` — searches SSH vault only, internal use
- `get_ssh_entry()` — returns parsed dict with `private_key`, `user`, `host` for `ssh_exec`
- SSH keys are never returned through `get_password` — stripped at the source

### Homarr (`src/homarr.py`)

- Homarr 1.x uses tRPC — auth header is `ApiKey: <id>.<token>` (not `Authorization: Bearer`)
- Endpoint: `GET /api/trpc/app.all`
- Status check priority: if app description contains a Proxmox ID (e.g. "container id 119") → check Proxmox API first; otherwise ping the URL
- 401/403 responses count as online (auth-protected server)
- SSL errors ignored (`verify=False`)

### SSH exec (`src/proxmox.py::ssh_exec`)

- Pulls SSH entry from 1Password by name
- `text` field in 1Password SSH entry = `user@host`
- `private key` field = the key
- Writes key to temp file with `600` permissions, runs command, deletes key immediately

---

## Key design decisions

1. **No `find_vm_by_name` tool** — was removed. `machine_action` handles name resolution internally so the model never needs to know a vmid.
2. **`get_service_status` before `ssh_exec`** — `ssh_exec` is explicitly for running commands, not status checks. The model is instructed to always check Homarr first.
3. **Three layers of SSH key protection**:
   - Tool level: `get_ssh_credentials` blocked if user is asking for it
   - Memory level: SSH key patterns stripped before storing
   - Output filter: regex scan of final reply before sending
4. **Text-format tool call recovery** — llama-3.3-70b-versatile occasionally generates `<function=name>{...}</function>` in plain text. Both 400 error path and inline reply path parse and execute these instead of failing.
5. **Confirmation gate** — stop/shutdown/reboot always ask yes/no first. The pending action stores the resolved vmid so execution doesn't re-lookup.
6. **`chats_whitelist.txt` syntax** — `*` = all, `*telegram*` = wildcard, exact IDs work as-is (IDs start with `!` which is fine), `-exactId` = exclusion.

---

## Known issues / TODOs

- `lxc_exec` returns 501 on this Proxmox setup — not usable for command execution inside containers; use `ssh_exec` instead
- Groq free tier: 100k tokens/day limit — hits fast during heavy testing
- llama-3.3-70b-versatile generates text-format tool calls under complex context — recovery code handles it but root cause is model behavior
- Proactive monitoring (alert when VM goes down) — not yet implemented
- Minecraft RCON integration — not yet implemented
- GPU upgrade planned → switch to local Ollama (Qwen 2.5 recommended for Slovak/Czech)

---

## Running utilities

```bash
# List all Beeper chat IDs
python tools/list_chats.py

# Run the agent
python main.py
```

---

## Future Roadmap (v2.0)

- [ ] Multi-channel adapters (Telegram, WhatsApp, Slack, Discord as plugins)
- [ ] Enhanced web UI with real-time updates
- [ ] Skill/plugin manifest system
- [ ] Voice-wake (optional)
- [ ] Per-skill permissions
- [ ] Proactive monitoring

---

## Notes

- The `openclaw/` directory is a reference implementation — don't modify
- The `stable/` directory is the frozen 1.0 release — don't modify
- All development happens in `dev/`