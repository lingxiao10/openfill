# OpenFill

**AI 驱动的浏览器自动化助手。** 用自然语言控制网页——填写表单、页面导航、信息提取、自动化重复操作，通过 Chrome 侧边栏完成所有任务。

[English Documentation](./README.md)

---

## 功能特性

- **自然语言控制** — 用中文或英文描述你想做的事，AI 自动完成
- **多会话并行** — 支持多个独立会话同时运行，每个会话拥有独立历史记录
- **复杂 UI 处理** — 自动将复杂组件（日期选择器、下拉框、级联选择器、标签输入）委托给专注子代理处理
- **网络搜索** — 可选的实时网络搜索（基于豆包/火山引擎），增强代理知识
- **支持任何 OpenAI 兼容 LLM** — 兼容 OpenAI、DeepSeek、通义千问等任何 OpenAI 兼容接口
- **两种构建模式** — 标准模式（合成事件）和调试器模式（CDP 可信事件），最大化兼容性
- **历史记录持久化** — 会话历史存储在 IndexedDB，刷新页面后依然保留
- **国际化** — 中英文界面，自动检测浏览器语言

---

## 环境要求

- **Node.js** `>=20.19`（或 `>=22.13`，或 `>=24`）
- **npm** `>=10`
- **Chrome** 浏览器（Chromium 系浏览器同样支持）

---

## 安装

> **重要：** 所有操作开始前，必须先执行 `npm install` 安装全部工作区依赖。

```bash
# 1. 克隆仓库
git clone <repo-url>
cd page-agent

# 2. 安装所有依赖（必须先执行）
npm install
```

---

## 开发

### 快速启动（仅启动插件，不重新构建 lib）

适用于 `npm install` 之后、lib 已构建的情况。

**Windows：**
```bat
start.bat
```

**Mac / Linux：**
```bash
chmod +x start.sh
./start.sh
```

**手动命令：**
```bash
npm run dev:ext
```

---

### 标准模式（推荐）

重新构建所有库，然后启动插件开发服务器（热重载）。

**Windows：**
```bat
rebuild-and-start-standard.bat
```

**Mac / Linux：**
```bash
chmod +x rebuild-and-start-standard.sh
./rebuild-and-start-standard.sh
```

**手动命令：**
```bash
npm run build:libs
npm run dev:ext
```

> **标准模式** 使用合成浏览器事件（`isTrusted = false`），适用于绝大多数网站。

---

### 调试器模式（用于拦截合成事件的网站）

部分应用（如企业 HR 系统、金融管理后台）会检查 `event.isTrusted` 并拒绝合成输入。调试器模式通过 Chrome DevTools Protocol（CDP）注入真实的可信键盘事件。

**Windows：**
```bat
rebuild-and-start-debugger.bat
```

**Mac / Linux：**
```bash
chmod +x rebuild-and-start-debugger.sh
./rebuild-and-start-debugger.sh
```

**手动命令：**
```bash
npm run build:libs
BUILD_MODE=debugger npm run dev:ext
```

> 调试器模式会在 Chrome manifest 中自动添加 `debugger` 权限，构建脚本已自动处理。

---

### 调试日志模式

启动本地日志服务器（`http://localhost:7373`），重新构建库，然后启动插件。用于诊断代理行为。

**Windows：**
```bat
debug-rebuild-and-start.bat
```

**Mac / Linux：**
```bash
chmod +x debug-rebuild-and-start.sh
./debug-rebuild-and-start.sh
```

| 地址 | 功能 |
|---|---|
| `http://localhost:7373` | 查看实时日志 |
| `http://localhost:7373/clear` | 清除日志文件 |

日志同时写入项目根目录的 `debug.log` 文件。

---

## 在 Chrome 中加载插件

1. 访问 `chrome://extensions`
2. 开启右上角**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择输出目录：
   - **标准开发模式：** `packages/extension/.output/chrome-mv3/chrome-mv3`
   - **调试器开发模式：** `packages/extension/.output/chrome-mv3-debugger/chrome-mv3`
5. 点击 Chrome 工具栏中的 OpenFill 图标即可打开侧边栏

> WXT 开发服务器会自动热重载大多数更改。如果修改了库代码（`packages/core`、`packages/llms` 等），需要重新运行构建脚本。

---

## 构建发布版本

### 标准构建（ZIP）

**Windows：**
```bat
build-ext-standard.bat
```

**Mac / Linux：**
```bash
chmod +x build-ext-standard.sh
./build-ext-standard.sh
```

**手动命令：**
```bash
npm run build:ext
```

输出 ZIP：`packages/extension/.output/*.zip`（同时复制到项目根目录 `.output/`）

---

### 调试器构建（ZIP）

**Windows：**
```bat
build-ext-debugger.bat
```

**Mac / Linux：**
```bash
chmod +x build-ext-debugger.sh
./build-ext-debugger.sh
```

**手动命令：**
```bash
BUILD_MODE=debugger npm run build:ext
```

输出 ZIP：`packages/extension/.output/chrome-mv3-debugger/*.zip`（同时复制到 `.output/`）

---

## 配置说明

打开 OpenFill 侧边栏 → 点击**设置**图标。

### LLM 配置（必填）

OpenFill 兼容任何 OpenAI 接口格式的 LLM 服务。

| 字段 | 说明 | 示例 |
|---|---|---|
| **API Key** | LLM 服务商的 API 密钥 | `sk-...` |
| **API Endpoint** | OpenAI 兼容接口的 Base URL | `https://api.openai.com/v1` |
| **Model** | 模型名称 | `gpt-4o`、`deepseek-chat`、`qwen-max` |

**推荐模型：** `gpt-4o`、`deepseek-chat`、`qwen-max`

> 任何支持 `/v1/chat/completions` 格式的服务商均可使用。

---

### 网络搜索（可选）

让代理在执行内容密集型任务（写作、调研、事实核查）前自动搜索互联网。

基于**豆包（火山引擎 Ark）**实现，需要火山引擎 API Key。

| 字段 | 说明 | 默认值 |
|---|---|---|
| **启用搜索** | 开关 | 开（填写 Key 后自动启用） |
| **豆包 API Key** | 火山引擎 Ark API Key | — |
| **模型 / Endpoint ID** | 支持 `web_search` 的豆包模型 | `doubao-seed-1-8-251228` |

获取 Key：[火山引擎 Ark 控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)

---

### 高级设置

| 设置 | 说明 | 默认值 |
|---|---|---|
| **最大步数** | 每次任务的最大代理循环轮次 | 50 |
| **系统指令** | 追加到代理系统提示词的自定义指令 | — |
| **显示下载日志按钮** | 是否显示会话日志下载按钮 | 关 |

---

## 使用方法

1. 在 Chrome 中打开任意网页
2. 点击 OpenFill 图标打开侧边栏
3. 在设置中配置 LLM（仅首次需要）
4. 在输入框中用自然语言描述任务，按 **Enter** 或点击 **运行**

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

点击会话标签栏的 **+** 按钮新建并行会话。每个会话有独立的代理实例和历史记录，可以同时对不同标签页执行多个任务。

### 会话内继续对话

在同一会话中继续输入消息即可接着上次进度继续——代理会保留会话内的完整历史记录。

---

## 项目架构

```
page-agent/                        ← 单仓库根（npm workspaces）
├── packages/
│   ├── core/                      ← @page-agent/core  — 代理循环、工具、提示词
│   │   └── src/
│   │       ├── PageAgentCore.ts   ← 主代理类
│   │       ├── prompts/           ← 系统提示词 markdown 文件
│   │       ├── tools/             ← 内置代理工具
│   │       └── utils/doubao/      ← DoubaoClient（网络搜索）
│   ├── extension/                 ← Chrome 插件（@page-agent/ext）
│   │   └── src/
│   │       ├── agent/             ← SessionManager、MultiPageAgent、TabsController
│   │       ├── entrypoints/       ← 侧边栏 React UI
│   │       └── utils/             ← Trans（i18n）、DB、工具函数
│   ├── llms/                      ← @page-agent/llms  — OpenAI 兼容 LLM 客户端
│   ├── page-controller/           ← @page-agent/page-controller  — DOM 读取与操作
│   └── ui/                        ← @page-agent/ui    — 共享 React 组件
├── *.bat                          ← Windows 构建/开发脚本
├── *.sh                           ← Mac/Linux 构建/开发脚本
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

## 两种构建模式对比

| | 标准模式 | 调试器模式 |
|---|---|---|
| 输入事件 | 合成事件（`isTrusted=false`） | CDP（`isTrusted=true`） |
| 额外权限 | 无 | `debugger` |
| 适用场景 | 绝大多数网站 | 拦截合成事件的网站 |
| Manifest 目录 | `chrome-mv3` | `chrome-mv3-debugger` |

---

## 开源许可

MIT
