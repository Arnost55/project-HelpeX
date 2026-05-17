# JARVIS Project Manifest (2026)

## 🏗️ Architecture
- **Framework:** Electron + WebView2
- **Persistence:** Local `config.dat` (JSON/SQLite)
- **Tooling:** MCP (Model Context Protocol) via standard integration

## 🔐 Privacy & Session Logic
- **Incognito Flag:** `isIncognito` (Boolean). When TRUE, `SaveHistory` is blocked.
- **Session Isolation:** We use `partition: 'memory:incognito'` for private tabs.
- **UI Reset:** Triggered by changing the `key` prop on the Chat component to force a hard remount.

## 📡 IPC Registry (Source of Truth)
| Channel | Purpose | Backend Action |
| :--- | :--- | :--- |
| `delete-chat` | Full wipe of a specific ID | Unlinks file + Wipes Partition |
| `toggle-privacy`| Switch storage modes | Swaps WebView2 session partition |
| `save-config` | Update JARVIS settings | Writes to `config.dat` |

## 🛠️ Calibration Protocol
- MCP servers are registered via the standard integration (legacy custom config removed).
- Tools are "trained" via the `list-tools` command and cached in the local registry.
