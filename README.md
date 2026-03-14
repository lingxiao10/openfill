# OpenFill

**AI-powered browser automation assistant.** Control web pages with natural language — fill forms, navigate sites, extract information, and automate repetitive tasks through a Chrome side panel.

[中文文档](./README_zh.md)

---

## Features

- **Natural language control** — describe what you want in plain English or Chinese; the agent figures out how to do it
- **Multi-session support** — run multiple parallel agent sessions, each with independent history
- **Complex UI handling** — automatically delegates difficult components (date pickers, dropdowns, cascading selectors, tag inputs) to a focused sub-agent
- **Web search** — optional real-time web search via Doubao (Volcengine Ark) to augment agent knowledge
- **Any OpenAI-compatible LLM** — works with OpenAI, DeepSeek, Qwen, or any OpenAI-compatible API endpoint
- **Two build modes** — Standard mode (synthetic events) and Debugger mode (CDP trusted events) for maximum site compatibility
- **Persistent history** — session history stored in IndexedDB, survives page reloads
- **Internationalization** — English and Chinese UI, auto-detected from browser language

---

## Prerequisites

- **Node.js** `>=20.19` (or `>=22.13`, or `>=24`)
- **npm** `>=10`
- **Chrome** browser (Chromium-based browsers should also work)

---

## Setup

> **Important:** Run `npm install` before anything else. This installs all workspace dependencies.

```bash
# 1. Clone the repository
git clone <repo-url>
cd page-agent

# 2. Install all dependencies (required first step)
npm install
```

---

## Development

### Quick start (extension only, no lib rebuild)

Assumes libraries are already built. Use after `npm install` on a fresh clone if you just want to start the extension dev server.

**Windows:**
```bat
start.bat
```

**Mac / Linux:**
```bash
chmod +x start.sh
./start.sh
```

**Manual:**
```bash
npm run dev:ext
```

---

### Standard mode (recommended for most cases)

Rebuilds all libraries, then launches the extension in development mode with hot reload.

**Windows:**
```bat
rebuild-and-start-standard.bat
```

**Mac / Linux:**
```bash
chmod +x rebuild-and-start-standard.sh
./rebuild-and-start-standard.sh
```

**Manual:**
```bash
npm run build:libs
npm run dev:ext
```

> **Standard mode** uses synthetic browser events (`isTrusted = false`). Works on the vast majority of sites.

---

### Debugger mode (for sites that block synthetic events)

Some applications (e.g., enterprise HR systems, financial dashboards) check `event.isTrusted` and reject synthetic input. Debugger mode uses the Chrome DevTools Protocol (CDP) to inject truly trusted keyboard events.

**Windows:**
```bat
rebuild-and-start-debugger.bat
```

**Mac / Linux:**
```bash
chmod +x rebuild-and-start-debugger.sh
./rebuild-and-start-debugger.sh
```

**Manual:**
```bash
npm run build:libs
BUILD_MODE=debugger npm run dev:ext
```

> Debugger mode adds the `debugger` permission to the Chrome manifest. This is handled automatically by the build scripts.

---

### Debug logging mode

Starts a local log server at `http://localhost:7373`, rebuilds libs, then launches the extension. Useful for diagnosing agent behavior.

**Windows:**
```bat
debug-rebuild-and-start.bat
```

**Mac / Linux:**
```bash
chmod +x debug-rebuild-and-start.sh
./debug-rebuild-and-start.sh
```

| Endpoint | Purpose |
|---|---|
| `http://localhost:7373` | View live logs |
| `http://localhost:7373/clear` | Clear log file |

Logs are also written to `debug.log` in the project root.

---

## Loading the Extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the output folder:
   - **Standard dev:** `packages/extension/.output/chrome-mv3/chrome-mv3`
   - **Debugger dev:** `packages/extension/.output/chrome-mv3-debugger/chrome-mv3`
5. Click the OpenFill icon in the Chrome toolbar to open the side panel

> After making source changes, the WXT dev server hot-reloads most changes automatically. For library (`packages/core`, `packages/llms`, etc.) changes, re-run the rebuild script.

---

## Building for Distribution

### Standard build (ZIP)

**Windows:**
```bat
build-ext-standard.bat
```

**Mac / Linux:**
```bash
chmod +x build-ext-standard.sh
./build-ext-standard.sh
```

**Manual:**
```bash
npm run build:ext
```

Output ZIP: `packages/extension/.output/*.zip` (also copied to `.output/` at the project root)

---

### Debugger build (ZIP)

**Windows:**
```bat
build-ext-debugger.bat
```

**Mac / Linux:**
```bash
chmod +x build-ext-debugger.sh
./build-ext-debugger.sh
```

**Manual:**
```bash
BUILD_MODE=debugger npm run build:ext
```

Output ZIP: `packages/extension/.output/chrome-mv3-debugger/*.zip` (also copied to `.output/`)

---

## Configuration

Open the OpenFill side panel → click the **Settings** icon.

### LLM Setup (required)

OpenFill works with any OpenAI-compatible API.

| Field | Description | Example |
|---|---|---|
| **API Key** | Your LLM provider API key | `sk-...` |
| **API Endpoint** | Base URL of the OpenAI-compatible API | `https://api.openai.com/v1` |
| **Model** | Model name | `gpt-4o`, `deepseek-chat`, `qwen-max` |

**Recommended models:** `gpt-4o`, `claude-opus-4-6` (via proxy), `deepseek-chat`, `qwen-max`

> Any provider with an OpenAI-compatible `/v1/chat/completions` endpoint works.

---

### Web Search (optional)

Enables the agent to search the web in real time before performing content-heavy tasks (writing, research, fact-checking).

Powered by **Doubao (Volcengine Ark)** — requires a Volcengine API key.

| Field | Description | Default |
|---|---|---|
| **Enable Search** | Toggle web search on/off | On (when key is set) |
| **Doubao API Key** | Volcengine Ark API key | — |
| **Model / Endpoint ID** | Doubao model that supports `web_search` | `doubao-seed-1-8-251228` |

Get a key: [Volcengine Ark Console](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)

---

### Advanced Settings

| Setting | Description | Default |
|---|---|---|
| **Max Steps** | Maximum agent loop iterations per task | 50 |
| **System Instruction** | Extra instructions appended to the agent's system prompt | — |
| **Show Download Logs** | Show a button to download session logs | Off |

---

## Usage

1. Open any web page in Chrome
2. Click the OpenFill icon to open the side panel
3. Configure your LLM in Settings (first time only)
4. Type your task in natural language and press **Enter** or click **Run**

### Example tasks

```
Fill in the registration form with: Name: Alice, Email: alice@example.com, Role: Engineer
```

```
Search for "machine learning" on this page and extract all article titles
```

```
Navigate to the product page for "wireless headphones" and add the first result to the cart
```

```
Go to the Settings page and change the notification preference to "Email only"
```

### Multi-session

Click **+** in the session tab bar to open a new parallel session. Each session has its own independent agent and history. You can run multiple tasks simultaneously on different tabs.

### Continuing a session

Type a follow-up message in the same session to continue from where the agent left off — the agent remembers its history within the session.

---

## Project Architecture

```
page-agent/                        ← monorepo root (npm workspaces)
├── packages/
│   ├── core/                      ← @page-agent/core  — agent loop, tools, prompts
│   │   └── src/
│   │       ├── PageAgentCore.ts   ← main agent class
│   │       ├── prompts/           ← system prompt markdown files
│   │       ├── tools/             ← built-in agent tools
│   │       └── utils/doubao/      ← DoubaoClient (web search)
│   ├── extension/                 ← Chrome extension (@page-agent/ext)
│   │   └── src/
│   │       ├── agent/             ← SessionManager, MultiPageAgent, TabsController
│   │       ├── entrypoints/       ← side panel React UI
│   │       └── utils/             ← Trans (i18n), DB, helpers
│   ├── llms/                      ← @page-agent/llms  — OpenAI-compatible LLM client
│   ├── page-controller/           ← @page-agent/page-controller  — DOM reader & actions
│   └── ui/                        ← @page-agent/ui    — shared React components
├── *.bat                          ← Windows build/dev scripts
├── *.sh                           ← Mac/Linux build/dev scripts
└── package.json                   ← workspace root
```

### Key files

| File | Purpose |
|---|---|
| `packages/core/src/PageAgentCore.ts` | Agent loop, reasoning, tool dispatch |
| `packages/core/src/prompts/system_prompt.md` | Main agent system prompt |
| `packages/extension/src/agent/SessionManager.ts` | Multi-session lifecycle |
| `packages/extension/src/agent/MultiPageAgent.ts` | Extension-specific agent wrapper |
| `packages/extension/src/agent/TabsController.ts` | Chrome tab tracking |
| `packages/extension/src/entrypoints/sidepanel/App.tsx` | Side panel root component |
| `packages/extension/src/utils/Trans.ts` | i18n utility |
| `packages/llms/src/index.ts` | LLM client (OpenAI-compatible) |
| `packages/page-controller/src/dom/index.ts` | DOM flat tree / browser state |

---

## Build modes in detail

| | Standard | Debugger |
|---|---|---|
| Input events | Synthetic (`isTrusted=false`) | CDP (`isTrusted=true`) |
| Extra permission | None | `debugger` |
| Use when | Most websites | Sites that block synthetic events |
| Manifest key | `chrome-mv3` | `chrome-mv3-debugger` |

---

## License

MIT
