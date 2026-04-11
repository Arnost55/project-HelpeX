# Comparison: OpenClaw vs. HelpeX

## 1️⃣ Purpose & Vision
| Feature | OpenClaw | HelpeX |
|--------|----------|--------|
| **Core goal** | Personal AI assistant that runs locally, connects to many chat channels (WhatsApp, Telegram, Slack, Discord, etc.) and provides voice, canvas, and tool integrations. | Personal IT secretary that reads Beeper messages (Telegram, WhatsApp, Signal, etc.) and manages home‑server infrastructure (VMs, SSH commands, service status, passwords). |
| **Target user** | Individual wanting an always‑on, multi‑platform AI with rich UI. | IT‑savvy user wanting automation‑focused assistant for server control. |
| **Deployment** | Node.js gateway daemon (npm/pnpm, Docker, Nix). | Python 3.14 service (`python dev/main.py`). |

## 2️⃣ Architecture Overview
| Layer | OpenClaw | HelpeX |
|------|----------|--------|
| **Control Plane** | `Gateway` (WebSocket server) orchestrates sessions, channels, cron, web UI, Canvas host. | `main.py` polling loop → reads Beeper, invokes `src/ai.py`. |
| **Agents / Workers** | **Pi agents** (RPC) run per‑workspace; can be isolated per channel. | `src/ai.py` → Groq LLM interaction, tool calls. |
| **Channel Integration** | Dedicated adapters for >20 services (WhatsApp, Telegram, Slack, Discord, etc.) written in TypeScript/Node. | Single `Beeper` client (`src/beeper.py`). |
| **Plugins / Extensibility** | **Tools & Skills** platform (browser, canvas, cron, webhook, custom skills). Plugins installed via `openclaw skill add`. | **Sandboxed plugin system** (`dev/plugins/`) – each plugin must expose `run(app, inbox, outbox)`. |
| **UI / Front‑end** | macOS menu‑bar app, iOS/Android nodes, **Live Canvas** (interactive visual workspace). | No UI; purely CLI/terminal driven. |
| **Security** | DM pairing code, per‑channel allowlists, security guide; secrets via env vars. | Three‑layer SSH‑key protection, confirmation gate for destructive VM actions, 1Password integration. |
| **Persistence** | Session/message storage in local files/SQLite; optional Docker volumes. | Chat histories persisted in `chats.json`. |
| **Config** | `openclaw.yml` gateway config + CLI `openclaw onboard`. | `.env` for credentials, whitelist text files for chat/channel filters. |

## 3️⃣ Tech Stack
| Component | OpenClaw | HelpeX |
|-----------|----------|--------|
| **Language** | Node.js (TypeScript) – Node 24 (or 22). | Python 3.14. |
| **CLI** | `openclaw` (global npm binary). | `python dev/main.py`. |
| **Dependencies** | `pnpm`/`npm` packages: `discord.js`, `grammY`, `Baileys`, `tsx`, etc. | `groq`, `httpx`, `python‑dotenv`, `1Password SDK`, `Proxmox API`. |
| **Build / Distribution** | NPM packages, Docker image, Nix flake, binary releases. | Git repo, local execution. |
| **Testing / CI** | GitHub Actions CI (badge in README). | No CI configured. |
| **License** | MIT. | Apache 2.0. |

## 4️⃣ Extensibility & Plugin Model
- **OpenClaw**: Skills are loaded by the gateway; each runs in its own Node process and can access the full tool API (browser, canvas, cron, webhooks). Installation via `openclaw skill add …`.
- **HelpeX**: Plugins live under `dev/plugins/`, must expose `run(app, inbox, outbox)`. Loaded as sandboxed subprocesses via `plugins/loader.py`.

## 5️⃣ Security & Reliability
| Concern | OpenClaw | HelpeX |
|---------|----------|--------|
| **Incoming DM handling** | Pairing codes, per‑channel allowlists (`dmPolicy`). | Confirmation gate for destructive actions; whitelist for password‑access channels. |
| **Secret management** | Env vars, optional external secret stores. | 1Password vault integration, three‑layer SSH key protection. |
| **Process isolation** | Separate processes for agents and gateway; crash‑resilient. | Sandbox processes for each plugin (multiprocessing). |
| **Error handling** | Retries, streaming, chunking, automatic session recovery. | `src/ai.py` catches tool errors, clears history on corrupted context. |

## 6️⃣ Cross‑Project Opportunities
| Idea | OpenClaw → HelpeX | HelpeX → OpenClaw |
|------|-------------------|-------------------|
| **Multi‑channel gateway** | Reuse OpenClaw’s channel adapters (Telegram, WhatsApp, Slack) to broaden HelpeX beyond Beeper. | Offer HelpeX’s Proxmox/1Password integrations as optional OpenClaw skills. |
| **Live Canvas dashboard** | Embed HelpeX’s Proxmox summary inside OpenClaw Canvas for a visual server dashboard. | Add a Canvas widget to display OpenClaw’s Canvas (or remote UI) inside HelpeX. |
| **Voice wake / talk mode** | Use OpenClaw’s voice‑wake node for hands‑free HelpeX commands. | Apply HelpeX’s confirmation gate as a safety layer for OpenClaw voice commands. |
| **Skill / tool ecosystem** | Publish HelpeX’s VM/SSH tools as OpenClaw skills (`openclaw skill add vm-control`). | Adopt OpenClaw’s skill loader pattern for future HelpeX plugin extensions. |
| **Packaging** | Use Docker/Nix install scripts from OpenClaw to provide a reproducible HelpeX container. | Mirror OpenClaw’s onboarding CLI flow for HelpeX (`helpex onboard`). |

## 7️⃣ Next Steps & Verification
1. **Create comparison file** – (this document).
2. **Add to repo** and commit.
3. **Run basic sanity checks**:
   - `openclaw onboard --install-daemon` should start the gateway.
   - `python dev/main.py` should still run HelpeX without errors.
4. **Prototype integration**:
   - Install OpenClaw’s Telegram adapter, send a test message, and confirm HelpeX (via Beeper) can forward it.
   - Create a simple OpenClaw Canvas plugin that shows the output of `helpex get_server_summary`.
5. **Document findings** in this markdown and share for review.

---
*All sections are concise for quick scanning; the comparison points can be expanded as needed.*
