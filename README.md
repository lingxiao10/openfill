# OpenFill

> **A GUI agent that can live inside websites you don't own.**

<div align="center">

### [🚀 Install from Chrome Web Store](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-OpenFill-blue?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

</div>

[中文文档](./README_zh.md)

---

## The Problem with Most Browser Agents

Most GUI agents — including the excellent [PageAgent](https://github.com/alibaba/page-agent) — require the website developer to embed the agent into their own app. That's powerful if you own the site.

But what about the other 99% of the web?

**OpenFill lives inside websites you don't own, didn't build, and can't modify.** Drop it onto any page via Chrome's side panel — enterprise dashboards, SaaS tools, legacy intranets — and start automating.

---

## 95% Task Completion vs. 74% Baseline

The hardest part of web automation isn't navigation — it's **complex UI components**: date pickers, cascading dropdowns, multi-select tag inputs, rich text editors. These are where most agents fail.

OpenFill solves this with **sub-agent delegation**: when the main agent encounters a complex component, it spawns a focused sub-agent with a narrower context and specialized instructions for that exact component type.

| Approach | Task Completion Rate |
|---|---|
| Baseline agent (PageAgent-style) | 74% |
| OpenFill with sub-agent delegation | **95%** |

The main agent handles navigation and form logic. The sub-agent handles the hard part. Neither gets confused by the other's context.

---

## Why It Can "Live Inside" Any Website

Standard browser extensions interact with pages from the outside — they can read the DOM but injecting trusted input is often blocked by sites that check `event.isTrusted`.

OpenFill ships with two modes:

**Standard mode** — synthetic events. Works on the vast majority of sites with no special permissions.

**Debugger mode** — uses the Chrome DevTools Protocol (CDP) to inject truly trusted keyboard and mouse events (`isTrusted = true`). Enterprise apps, financial dashboards, HR systems — the ones that explicitly reject synthetic input — become fully automatable.

This is what makes OpenFill genuinely universal.

---

## Features

- **Works on any website** — no integration, no cooperation from the site required
- **Sub-agent delegation** — complex UI components handled by focused sub-agents (95% task completion)
- **Two input modes** — Standard (synthetic) and Debugger (CDP trusted events)
- **Multi-session** — run parallel agent sessions, each with independent history
- **Any OpenAI-compatible LLM** — OpenAI, DeepSeek, Qwen, or any `/v1/chat/completions` endpoint
- **Optional web search** — real-time search via Doubao (Volcengine Ark)
- **Persistent history** — IndexedDB storage, survives page reloads
- **Internationalization** — English and Chinese, auto-detected

---

## Install

**[Get OpenFill on the Chrome Web Store](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)**

1. Click the OpenFill icon → side panel opens
2. Settings → enter your LLM API key, endpoint, model
3. Go to any website. Type your task. Press **Enter**.

### Example tasks

```
Fill the registration form: Name: Alice, Email: alice@example.com, Role: Engineer
```
```
Find the date range picker and set it to last 30 days
```
```
Navigate to Settings and change the notification preference to "Email only"
```
```
Extract all invoice numbers from this page into a list
```

---

## Configuration

### LLM (required)

| Field | Example |
|---|---|
| API Key | `sk-...` |
| API Endpoint | `https://api.openai.com/v1` |
| Model | `gpt-4o`, `deepseek-chat`, `qwen-max` |

Any provider with an OpenAI-compatible `/v1/chat/completions` endpoint works.

### Web Search (optional)

Real-time search before content-heavy tasks. Powered by **Doubao (Volcengine Ark)**.
Get a key: [Volcengine Ark Console](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)

Model: `doubao-seed-1-8-251228`

### Advanced

| Setting | Default |
|---|---|
| Max Steps | 50 |
| System Instruction | — |
| Show Download Logs | Off |

---

## Development

### Prerequisites

- Node.js `>=20.19` / npm `>=10` / Chrome

### Setup

```bash
git clone <repo-url>
cd page-agent
npm install
```

### Dev (standard mode)

```bash
# Windows
rebuild-and-start-standard.bat
# Mac/Linux
./rebuild-and-start-standard.sh
# Manual
npm run build:libs && npm run dev:ext
```

### Dev (debugger mode)

```bash
# Windows
rebuild-and-start-debugger.bat
# Mac/Linux
./rebuild-and-start-debugger.sh
# Manual
BUILD_MODE=debugger npm run dev:ext
```

### Load in Chrome

1. `chrome://extensions` → enable Developer mode
2. Load unpacked → `packages/extension/.output/chrome-mv3/chrome-mv3`
3. Click the OpenFill icon

### Build for distribution

```bash
npm run build:ext                        # standard ZIP
BUILD_MODE=debugger npm run build:ext    # debugger ZIP
```

Output: `packages/extension/.output/*.zip`

---

## Architecture

```
page-agent/
├── packages/
│   ├── core/             ← agent loop, sub-agent delegation, prompts
│   ├── extension/        ← Chrome extension, side panel UI
│   ├── llms/             ← OpenAI-compatible LLM client
│   ├── page-controller/  ← DOM reader & event injection
│   └── ui/               ← shared React components
└── *.bat / *.sh          ← build & dev scripts
```

| File | Purpose |
|---|---|
| `packages/core/src/PageAgentCore.ts` | Agent loop, sub-agent delegation |
| `packages/core/src/prompts/system_prompt.md` | System prompt |
| `packages/extension/src/agent/SessionManager.ts` | Multi-session lifecycle |
| `packages/extension/src/agent/MultiPageAgent.ts` | Extension agent wrapper |
| `packages/extension/src/agent/TabsController.ts` | Tab tracking |
| `packages/page-controller/src/dom/index.ts` | DOM flat tree / browser state |

---

## License

MIT

---

<div align="center">

**[Install OpenFill on the Chrome Web Store](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)**

If OpenFill saves you time, a ⭐ on GitHub means a lot.

</div>
