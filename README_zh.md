# OpenFill

> **AI 驱动的浏览器自动化助手 — 用自然语言控制任意网页。**

<div align="center">

### [🚀 从 Chrome 应用商店安装](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20应用商店-OpenFill-blue?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

</div>

填写表单、页面导航、信息提取、自动化重复操作 — 只需用中文或英文描述你想做的事。OpenFill 完全运行在 Chrome 侧边栏中，无需任何后端。

[English Documentation](./README.md)

---

## 为什么选择 OpenFill？

大多数网页自动化工具需要 Python、无头浏览器或复杂的配置。OpenFill 不一样：

- **无需后端** — 完全在浏览器中运行，不依赖任何服务器
- **自带大模型** — 使用你自己的 API Key（OpenAI、DeepSeek、通义千问、Claude 代理等均可）
- **应对复杂 UI** — 日期选择器、下拉框、级联选择器、标签输入，全部自动处理
- **多会话并行** — 同时运行多个独立任务，每个会话拥有独立历史记录
- **可信事件注入** — 调试器模式通过 CDP 注入真实事件，兼容拒绝合成输入的网站

---

## 功能特性

| 功能 | 说明 |
|---|---|
| **自然语言控制** | 用中文或英文描述任务，代理自动执行 |
| **多会话并行** | 支持多个独立会话同时运行，各自拥有独立历史 |
| **复杂 UI 处理** | 自动将复杂组件委托给专注子代理处理 |
| **网络搜索** | 可选实时网络搜索（基于豆包/火山引擎 Ark） |
| **兼容任意 OpenAI 接口** | 支持 OpenAI、DeepSeek、通义千问等任何兼容接口 |
| **两种构建模式** | 标准模式（合成事件）和调试器模式（CDP 可信事件） |
| **历史记录持久化** | 会话历史存储在 IndexedDB，刷新页面后依然保留 |
| **国际化** | 中英文界面，自动检测浏览器语言 |

---

## 30 秒上手

**[从 Chrome 应用商店安装 OpenFill](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)**

1. 点击 Chrome 工具栏中的 OpenFill 图标，打开侧边栏
2. 进入**设置** → 填写 LLM API Key、接口地址和模型名称
3. 打开任意网页，输入任务，按 **Enter** 即可

### 任务示例

```
填写注册表单：姓名填张三，邮箱填 zhangsan@example.com，职位选择工程师
```

```
在这个页面搜索"机器学习"并提取所有文章标题
```

```
找到"无线耳机"商品页，将第一个结果加入购物车
```

```
打开设置页面，将通知偏好改为"仅邮件"
```

### 多会话

点击会话标签栏的 **+** 按钮新建并行会话。每个会话有独立的代理实例和历史记录，可以同时对不同页面执行多个任务。

### 会话内继续对话

在同一会话中继续输入消息即可接着上次进度继续——代理会保留会话内的完整历史记录。

---

## 配置说明

打开 OpenFill 侧边栏 → 点击**设置**图标。

### LLM 配置（必填）

OpenFill 兼容任何 OpenAI 格式的接口服务。

| 字段 | 说明 | 示例 |
|---|---|---|
| **API Key** | LLM 服务商的 API 密钥 | `sk-...` |
| **API Endpoint** | OpenAI 兼容接口的 Base URL | `https://api.openai.com/v1` |
| **Model** | 模型名称 | `gpt-4o`、`deepseek-chat`、`qwen-max` |

**推荐模型：** `gpt-4o`、`deepseek-chat`、`qwen-max`

> 任何支持 `/v1/chat/completions` 格式的服务商均可使用。

### 网络搜索（可选）

让代理在执行内容密集型任务（写作、调研、事实核查）前自动搜索互联网。

基于**豆包（火山引擎 Ark）**实现，需要火山引擎 API Key。

| 字段 | 说明 | 默认值 |
|---|---|---|
| **启用搜索** | 开关 | 开（填写 Key 后自动启用） |
| **豆包 API Key** | 火山引擎 Ark API Key | — |
| **模型 / Endpoint ID** | 支持 `web_search` 的豆包模型 | `doubao-seed-1-8-251228` |

获取 Key：[火山引擎 Ark 控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)

### 高级设置

| 设置 | 说明 | 默认值 |
|---|---|---|
| **最大步数** | 每次任务的最大代理循环轮次 | 50 |
| **系统指令** | 追加到代理系统提示词的自定义指令 | — |
| **显示下载日志按钮** | 是否显示会话日志下载按钮 | 关 |

---

## 两种构建模式

| | 标准模式 | 调试器模式 |
|---|---|---|
| 输入事件 | 合成事件（`isTrusted=false`） | CDP（`isTrusted=true`） |
| 额外权限 | 无 | `debugger` |
| 适用场景 | 绝大多数网站 | 拦截合成事件的网站 |

部分企业应用（HR 系统、金融管理后台）会检查 `event.isTrusted` 并拒绝合成输入，此时切换为调试器模式即可。

---

## 开发指南

### 环境要求

- **Node.js** `>=20.19`（或 `>=22.13`，或 `>=24`）
- **npm** `>=10`
- **Chrome** 浏览器

### 安装

```bash
git clone <repo-url>
cd page-agent
npm install
```

### 快速启动

**Windows：** `start.bat`
**Mac/Linux：** `./start.sh`
**手动：** `npm run dev:ext`

### 重新构建所有库并启动

**Windows：** `rebuild-and-start-standard.bat`
**Mac/Linux：** `./rebuild-and-start-standard.sh`
**手动：** `npm run build:libs && npm run dev:ext`

### 调试器模式开发

**Windows：** `rebuild-and-start-debugger.bat`
**Mac/Linux：** `./rebuild-and-start-debugger.sh`
**手动：** `BUILD_MODE=debugger npm run dev:ext`

### 调试日志模式

启动本地日志服务器（`http://localhost:7373`），重新构建库，然后启动插件。

**Windows：** `debug-rebuild-and-start.bat`
**Mac/Linux：** `./debug-rebuild-and-start.sh`

### 在 Chrome 中加载插件（开发模式）

1. 访问 `chrome://extensions`
2. 开启右上角**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择输出目录：
   - **标准开发模式：** `packages/extension/.output/chrome-mv3/chrome-mv3`
   - **调试器开发模式：** `packages/extension/.output/chrome-mv3-debugger/chrome-mv3`
5. 点击 Chrome 工具栏中的 OpenFill 图标即可打开侧边栏

### 构建发布版本

**标准 ZIP：**
`build-ext-standard.bat` / `./build-ext-standard.sh` / `npm run build:ext`

**调试器 ZIP：**
`build-ext-debugger.bat` / `./build-ext-debugger.sh` / `BUILD_MODE=debugger npm run build:ext`

输出：`packages/extension/.output/*.zip`（同时复制到项目根目录 `.output/`）

---

## 项目架构

```
page-agent/                        ← 单仓库根（npm workspaces）
├── packages/
│   ├── core/                      ← 代理循环、工具、提示词
│   ├── extension/                 ← Chrome 插件（侧边栏 UI）
│   ├── llms/                      ← OpenAI 兼容 LLM 客户端
│   ├── page-controller/           ← DOM 读取与操作
│   └── ui/                        ← 共享 React 组件
├── *.bat / *.sh                   ← 构建与开发脚本
└── package.json                   ← 工作区根配置
```

### 关键文件

| 文件 | 用途 |
|---|---|
| `packages/core/src/PageAgentCore.ts` | 代理循环、推理、工具调度 |
| `packages/core/src/prompts/system_prompt.md` | 主代理系统提示词 |
| `packages/extension/src/agent/SessionManager.ts` | 多会话生命周期管理 |
| `packages/extension/src/agent/MultiPageAgent.ts` | 插件专用代理封装 |
| `packages/extension/src/agent/TabsController.ts` | Chrome 标签页追踪 |
| `packages/extension/src/entrypoints/sidepanel/App.tsx` | 侧边栏根组件 |
| `packages/extension/src/utils/Trans.ts` | 国际化工具 |
| `packages/llms/src/index.ts` | LLM 客户端（OpenAI 兼容） |
| `packages/page-controller/src/dom/index.ts` | DOM 平铺树 / 浏览器状态 |

---

## 开源许可

MIT

---

<div align="center">

**[立即从 Chrome 应用商店安装 OpenFill](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)**

如果 OpenFill 对你有帮助，欢迎在 GitHub 点个 ⭐

</div>
