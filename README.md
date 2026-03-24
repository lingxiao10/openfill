# OpenFill

> **AI-powered browser automation — control any web page with natural language.**

<div align="center">

### [🚀 Install from Chrome Web Store](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-OpenFill-blue?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

</div>

Fill forms, navigate sites, extract data, and automate repetitive tasks — all by typing what you want in plain English or Chinese. OpenFill runs entirely in a Chrome side panel with no backend required.

[中文文档](./README_zh.md)

---

## Why OpenFill?

Most web automation tools require Python, headless browsers, or complex setup. OpenFill is different:

- **Zero backend** — runs entirely in the browser, no server needed
- **Any LLM** — bring your own API key (OpenAI, DeepSeek, Qwen, Claude via proxy, etc.)
- **Handles complex UIs** — date pickers, dropdowns, cascading selectors, tag inputs — automatically delegated to a focused sub-agent
- **Multi-session** — run several agent tasks in parallel, each with independent history
- **Trusted events** — optional Debugger mode uses CDP for sites that block synthetic input

---

## Features

| Feature | Details |
|---|---|
| **Natural language control** | Describe your task in English or Chinese; the agent handles the rest |
| **Multi-session** | Multiple parallel agent sessions, each with independent history |
| **Complex UI handling** | Automatically delegates difficult components to a focused sub-agent |
| **Web search** | Optional real-time search via Doubao (Volcengine Ark) |
| **Any OpenAI-compatible LLM** | OpenAI, DeepSeek, Qwen, or any `/v1/chat/completions` endpoint |
| **Two build modes** | Standard (synthetic events) and Debugger (CDP trusted events) |
| **Persistent history** | Session history in IndexedDB — survives page reloads |
| **Internationalization** | English and Chinese UI, auto-detected from browser language |

---

## Get Started in 30 Seconds

**[Install OpenFill from the Chrome Web Store](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)**

1. Click the OpenFill icon in Chrome toolbar to open the side panel
2. Go to **Settings** → enter your LLM API key, endpoint, and model name
3. Open any webpage, type your task, press **Enter**

### Example tasks

```
Fill in the registration form: Name: Alice, Email: alice@example.com, Role: Engineer
```

```
Search for "machine learning" on this page and extract all article titles
```

```
Navigate to the product page for "wireless headphones" and add the first result to the cart
```

```
Go to Settings and change the notification preference to "Email only"
```

### Multi-session

Click **+** in the session tab bar to open a new parallel session. Each session has its own independent agent and history. Run multiple tasks simultaneously across different pages.

---

## Configuration

Open the side panel → click the **Settings** icon.

### LLM Setup (required)

OpenFill works with any OpenAI-compatible API.

| Field | Description | Example |
|---|---|---|
| **API Key** | Your LLM provider API key | `sk-...` |
| **API Endpoint** | Base URL of the OpenAI-compatible API | `https://api.openai.com/v1` |
| **Model** | Model name | `gpt-4o`, `deepseek-chat`, `qwen-max` |

**Recommended models:** `gpt-4o`, `deepseek-chat`, `qwen-max`, `claude-opus-4-6` (via proxy)

> Any provider with an OpenAI-compatible `/v1/chat/completions` endpoint works.

### Web Search (optional)

Enables the agent to search the web in real time before performing content-heavy tasks (writing, research, fact-checking). Powered by **Doubao (Volcengine Ark)**.

| Field | Description | Default |
|---|---|---|
| **Enable Search** | Toggle web search on/off | On (when key is set) |
| **Doubao API Key** | Volcengine Ark API key | — |
| **Model / Endpoint ID** | Doubao model that supports `web_search` | `doubao-seed-1-8-251228` |

Get a key: [Volcengine Ark Console](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)

### Advanced Settings

| Setting | Description | Default |
|---|---|---|
| **Max Steps** | Maximum agent loop iterations per task | 50 |
| **System Instruction** | Extra instructions appended to the agent's system prompt | — |
| **Show Download Logs** | Show a button to download session logs | Off |

---

## Build Modes

| | Standard | Debugger |
|---|---|---|
| Input events | Synthetic (`isTrusted=false`) | CDP (`isTrusted=true`) |
| Extra permission | None | `debugger` |
| Use when | Most websites | Sites that block synthetic events |

Some enterprise apps (HR systems, financial dashboards) check `event.isTrusted` and reject synthetic input. Switch to Debugger mode for those.

---

## Development

### Prerequisites

- **Node.js** `>=20.19` (or `>=22.13`, or `>=24`)
- **npm** `>=10`
- **Chrome** browser

### Setup

```bash
git clone <repo-url>
cd page-agent
npm install
```

### Quick start

**Windows:** `start.bat`
**Mac/Linux:** `./start.sh`
**Manual:** `npm run dev:ext`

### Rebuild all libs + start

**Windows:** `rebuild-and-start-standard.bat`
**Mac/Linux:** `./rebuild-and-start-standard.sh`
**Manual:** `npm run build:libs && npm run dev:ext`

### Debugger mode dev

**Windows:** `rebuild-and-start-debugger.bat`
**Mac/Linux:** `./rebuild-and-start-debugger.sh`
**Manual:** `BUILD_MODE=debugger npm run dev:ext`

### Debug logging mode

Starts a local log server at `http://localhost:7373`, rebuilds libs, then launches the extension.

**Windows:** `debug-rebuild-and-start.bat`
**Mac/Linux:** `./debug-rebuild-and-start.sh`

### Loading the extension in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the output folder:
   - **Standard dev:** `packages/extension/.output/chrome-mv3/chrome-mv3`
   - **Debugger dev:** `packages/extension/.output/chrome-mv3-debugger/chrome-mv3`
5. Click the OpenFill icon in the Chrome toolbar

### Building for distribution

**Standard ZIP:**
`build-ext-standard.bat` / `./build-ext-standard.sh` / `npm run build:ext`

**Debugger ZIP:**
`build-ext-debugger.bat` / `./build-ext-debugger.sh` / `BUILD_MODE=debugger npm run build:ext`

Output: `packages/extension/.output/*.zip` (also copied to `.output/` at project root)

---

## Project Architecture

```
page-agent/                        ← monorepo root (npm workspaces)
├── packages/
│   ├── core/                      ← agent loop, tools, prompts
│   ├── extension/                 ← Chrome extension (side panel UI)
│   ├── llms/                      ← OpenAI-compatible LLM client
│   ├── page-controller/           ← DOM reader & actions
│   └── ui/                        ← shared React components
├── *.bat / *.sh                   ← build & dev scripts
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

## License

MIT

---

<div align="center">

**[Install OpenFill on Chrome Web Store](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)**

If you find OpenFill useful, a ⭐ on GitHub goes a long way!

</div>
