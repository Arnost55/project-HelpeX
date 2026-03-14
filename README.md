# 🤖 project-HelpeX

> A self-hosted AI agent that acts as your personal IT secretary — monitors your servers, controls VMs, runs commands, and replies on your behalf over chat.

---

## 🧠 What is HelpeX?

**HelpeX** is a Python-based AI agent that runs 24/7 on your home server. It connects to your chat platform (via Beeper), reads incoming messages, and autonomously handles server management tasks — starting/stopping VMs, running shell commands over SSH, checking server health, and looking up credentials from 1Password — all while replying naturally in your tone.

It doesn't feel like a bot. It feels like you, but always online.

---

## ✨ Features

- 💬 **Chat-native** — Connects via Beeper, works across Telegram, WhatsApp, Signal, and more
- 🖥️ **Proxmox control** — Start, stop, reboot VMs and LXC containers by name or ID
- 🔒 **1Password integration** — Looks up credentials from your vault on request
- 🔑 **SSH execution** — Runs shell commands on remote servers using keys stored in 1Password
- 🧠 **Agentic tool loop** — Chains multiple tool calls automatically to complete complex tasks
- 🗂️ **Per-chat memory** — Maintains conversation history per chat for context-aware replies
- 🌍 **Multilingual** — Replies in Slovak, Czech, or English depending on who's writing
- 🔐 **SSH secret protection** — SSH keys are never exposed to users, used internally only
- ✅ **Confirmation gate** — Asks before executing destructive actions (stop, shutdown, reboot)
- 📋 **Per-chat permissions** — Password access and topic restrictions configurable per chat
- 🌐 **Wildcard chat filtering** — Listen to all chats, a platform, or specific IDs

---

## 🗂️ Project Structure

```
project-HelpeX/
├── .env                     # secrets and config (never commit)
├── .env.example             # template for setup
├── .gitignore
├── main.py                  # entry point — polling loop
├── system_prompt.txt        # AI personality and behavior rules
├── requirements.txt
├── chats_whitelist.txt      # which chats the agent listens to
├── password_whitelist.txt   # chat IDs allowed to request passwords
├── topic_whitelist.txt      # per-chat topic restrictions
└── src/
    ├── ai.py                # Groq LLM + agentic tool calling loop
    ├── beeper.py            # Beeper API client
    ├── memory.py            # per-chat conversation history
    ├── proxmox.py           # Proxmox REST API + SSH exec
    └── onepassword.py       # 1Password SDK integration
```

---

## ⚙️ Requirements

- Python 3.11+
- [Beeper Desktop](https://www.beeper.com/) running locally with Remote Access enabled
- Proxmox server with an API token
- 1Password with a Service Account and a vault for passwords + one for SSH keys
- OpenSSH installed on the machine running HelpeX (`ssh` must be in PATH)
- [Groq API key](https://console.groq.com/) (free tier works)

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/project-HelpeX.git
cd project-HelpeX
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in your `.env` — see `.env.example` for all required values.

### 4. Configure chat access

Edit `chats_whitelist.txt` — controls which chats the agent listens to:
```
*                   # listen to all chats
*telegram*          # only Telegram chats
*telegram* *signal* # Telegram and Signal
!specificChatId     # exclude a specific chat (takes priority)
```

Edit `password_whitelist.txt` — chat IDs allowed to request passwords from 1Password:
```
# one chat ID per line
!yourChatId:beeper.local
```

Optionally edit `topic_whitelist.txt` to restrict which topics a chat can ask about:
```
# chat_id | keyword1, keyword2
!mumChatId | password, wifi, server
```

### 5. Run

```bash
python main.py
```

---

## 🔐 Security Notes

- SSH private keys are stored in a dedicated 1Password vault and **never shown to users**
- If a user directly asks for SSH credentials, the request is blocked at the tool level and filtered from the reply
- Destructive VM actions (stop, shutdown, reboot) require explicit confirmation before executing
- Password access is opt-in per chat via `password_whitelist.txt`
- `.env`, whitelist files, and `chats.json` are all gitignored

---

## 🛠️ How It Works

1. **Poll** — HelpeX polls Beeper every few seconds for new messages
2. **Filter** — Chat whitelist and topic restrictions are checked before processing
3. **Think** — Message + chat history is sent to Groq (`llama-3.3-70b-versatile`)
4. **Act** — The model calls tools in a loop (up to 5 rounds) to complete the task
5. **Confirm** — Destructive actions pause and ask for confirmation before executing
6. **Reply** — Final response is sent back via Beeper in the user's language and tone

---

## 📌 Roadmap

- [x] Beeper message loop with per-chat history
- [x] Proxmox VM/LXC control by name
- [x] 1Password credential lookup
- [x] SSH command execution via keys from 1Password
- [x] SSH secret protection layer
- [x] Confirmation gate for destructive actions
- [x] Wildcard chat filtering
- [ ] Proactive monitoring — alerts when a VM goes down unexpectedly
- [ ] Minecraft RCON integration
- [ ] Migrate to local Ollama model after GPU upgrade

---

## 🤝 Contributing

Open an issue first to discuss what you'd like to change.

---

## 📄 License

Apache 2.0 — see [LICENSE](LICENSE) for details.

---

> Built to make home infrastructure effortless.
