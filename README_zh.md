# OpenFill

> **一个可以"住进"任何你不拥有的网站的 GUI Agent。**

<div align="center">

### [🚀 从 Chrome 应用商店安装](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20应用商店-OpenFill-blue?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

</div>

[English Documentation](./README.md)

---

## 大多数浏览器 Agent 的困境

大多数 GUI Agent——包括优秀的 [PageAgent](https://github.com/alibaba/page-agent)——需要网站开发者把 Agent 嵌入到自己的应用里。如果你拥有这个网站，这很强大。

但互联网上 99% 的网站呢？

**OpenFill 可以住进那些你不拥有、没有构建、也无法修改的网站。** 通过 Chrome 侧边栏落地任意页面——企业管理后台、SaaS 工具、老旧内网系统——直接开始自动化。

---

## 任务完成率：74% → 95%

网页自动化最难的部分不是导航——而是**复杂 UI 组件**：日期选择器、级联下拉框、多选标签输入、富文本编辑器。这些是大多数 Agent 失败的地方。

OpenFill 通过**子代理委托**解决这个问题：当主代理遇到复杂组件时，会派发一个专注的子代理，携带更窄的上下文和针对该组件类型的专项指令。

| 方案 | 任务完成率 |
|---|---|
| 基准 Agent（PageAgent 方式） | 74% |
| OpenFill（子代理委托） | **95%** |

主代理负责导航和表单逻辑，子代理处理复杂部分。两者的上下文互不干扰。

---

## 为什么能"住进"任何网站

标准浏览器扩展从外部与页面交互——可以读取 DOM，但注入可信输入往往被检查 `event.isTrusted` 的网站拦截。

OpenFill 提供两种模式：

**标准模式** — 合成事件。适用于绝大多数网站，无需特殊权限。

**调试器模式** — 使用 Chrome DevTools Protocol（CDP）注入真实可信的键盘和鼠标事件（`isTrusted = true`）。企业应用、金融后台、HR 系统——那些明确拒绝合成输入的网站——全部可以自动化。

这就是 OpenFill 真正通用的原因。

---

## 功能特性

- **适配任意网站** — 无需集成，无需网站配合
- **子代理委托** — 复杂 UI 组件由专注子代理处理（任务完成率 95%）
- **两种输入模式** — 标准模式（合成事件）和调试器模式（CDP 可信事件）
- **多会话并行** — 多个独立会话同时运行，各自拥有独立历史
- **兼容任意 OpenAI 接口** — OpenAI、DeepSeek、通义千问等均可
- **可选网络搜索** — 基于豆包（火山引擎 Ark）的实时搜索
- **历史记录持久化** — IndexedDB 存储，刷新页面后依然保留
- **国际化** — 中英文界面，自动检测浏览器语言

---

## 安装使用

**[从 Chrome 应用商店安装 OpenFill](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)**

1. 点击 OpenFill 图标 → 侧边栏打开
2. 进入设置 → 填写 LLM API Key、接口地址、模型名称
3. 打开任意网站，输入任务，按 **Enter**

### 任务示例

```
填写注册表单：姓名填张三，邮箱填 zhangsan@example.com，职位选择工程师
```
```
找到日期范围选择器，设置为最近 30 天
```
```
打开设置页面，将通知偏好改为"仅邮件"
```
```
把这个页面上所有的发票编号提取成一个列表
```

---

## 配置说明

### LLM 配置（必填）

| 字段 | 示例 |
|---|---|
| API Key | `sk-...` |
| API Endpoint | `https://api.openai.com/v1` |
| Model | `gpt-4o`、`deepseek-chat`、`qwen-max` |

任何支持 `/v1/chat/completions` 格式的服务商均可使用。

### 网络搜索（可选）

执行内容密集型任务前自动搜索互联网。基于**豆包（火山引擎 Ark）**实现。
获取 Key：[火山引擎 Ark 控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)

模型：`doubao-seed-1-8-251228`

### 高级设置

| 设置 | 默认值 |
|---|---|
| 最大步数 | 50 |
| 系统指令 | — |
| 显示下载日志按钮 | 关 |

---

## 开发指南

### 环境要求

Node.js `>=20.19` / npm `>=10` / Chrome

### 安装

```bash
git clone <repo-url>
cd page-agent
npm install
```

### 开发（标准模式）

```bash
# Windows
rebuild-and-start-standard.bat
# Mac/Linux
./rebuild-and-start-standard.sh
# 手动
npm run build:libs && npm run dev:ext
```

### 开发（调试器模式）

```bash
# Windows
rebuild-and-start-debugger.bat
# Mac/Linux
./rebuild-and-start-debugger.sh
# 手动
BUILD_MODE=debugger npm run dev:ext
```

### 在 Chrome 中加载

1. `chrome://extensions` → 开启开发者模式
2. 加载已解压 → `packages/extension/.output/chrome-mv3/chrome-mv3`
3. 点击 OpenFill 图标

### 构建发布版本

```bash
npm run build:ext                        # 标准 ZIP
BUILD_MODE=debugger npm run build:ext    # 调试器 ZIP
```

输出：`packages/extension/.output/*.zip`

---

## 项目架构

```
page-agent/
├── packages/
│   ├── core/             ← 代理循环、子代理委托、提示词
│   ├── extension/        ← Chrome 插件、侧边栏 UI
│   ├── llms/             ← OpenAI 兼容 LLM 客户端
│   ├── page-controller/  ← DOM 读取与事件注入
│   └── ui/               ← 共享 React 组件
└── *.bat / *.sh          ← 构建与开发脚本
```

| 文件 | 用途 |
|---|---|
| `packages/core/src/PageAgentCore.ts` | 代理循环、子代理委托 |
| `packages/core/src/prompts/system_prompt.md` | 系统提示词 |
| `packages/extension/src/agent/SessionManager.ts` | 多会话生命周期 |
| `packages/extension/src/agent/MultiPageAgent.ts` | 插件代理封装 |
| `packages/extension/src/agent/TabsController.ts` | 标签页追踪 |
| `packages/page-controller/src/dom/index.ts` | DOM 平铺树 / 浏览器状态 |

---

## 开源许可

MIT

---

<div align="center">

**[立即从 Chrome 应用商店安装 OpenFill](https://chromewebstore.google.com/detail/openfill/kckdkidkpahhpkmojcjncjjmghkijdcp)**

如果 OpenFill 对你有帮助，欢迎在 GitHub 点个 ⭐

</div>
