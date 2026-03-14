# page-agent 关键记录

## 两种构建模式 (BUILD_MODE)
- `standard`（默认）：普通 content script，合成事件 `isTrusted=false`
- `debugger`：manifest 含 `debugger` 权限，input/send_keys 走 CDP，`isTrusted=true`
- 入口：`rebuild-and-start-standard/debugger.bat` / `build-ext-standard/debugger.bat`
- `set BUILD_MODE=debugger` → wxt.config.js 读取，`__DEBUGGER_MODE__` define 注入全局
- Debugger 模式流程：background 拦截 `input_text`/`send_keys` → CS `focus_element` → CDP `Input.insertText`/`dispatchKeyEvent`
- 关键文件：`CdpInputController.ts`（CDP封装）、`RemotePageController.background.ts`（拦截）、`PageController.focusElement()`（轻量focus）

## inputTextElement (packages/page-controller/src/actions.ts)
- contenteditable: 用 `document.execCommand('insertText', false, text)`，先用 Selection/Range 全选再替换
  - 原因：execCommand 触发的事件 isTrusted=true，编辑器的 MutationObserver 能正确响应，发布按钮会变为可用
  - **多行文本**：`execCommand('insertText')` 不支持 `\n`（Chrome 会截断/忽略换行）。
    逐行 `insertText+insertLineBreak` 会导致 Draft.js/Slate 等 React 编辑器每行触发重渲染，产生 DOM/Range 错误。
    修复：含 `\n` 时用 `execCommand('insertHTML', false, html)`（`\n`→`<br>`），一次性插入，只触发一次事件周期
  - fallback：synthetic InputEvent + innerText（适用于简单 React/Vue contenteditable）
- input/textarea: **逐字符键盘模拟** `typeCharByChar()`，每个字符触发完整序列：
  `keydown → keypress（仅可打印字符）→ native setter（累积值）→ InputEvent(data=char) → keyup`
  - `\n` 特殊处理：触发 Enter keydown/keypress/keyup；textarea 额外追加 `\n` 到 value + `insertLineBreak` input 事件
  - 输入前先清空（setter('')+ deleteContentBackward），输入后 `change`
  - 每字符间隔 `TYPING_DELAY`（config.ts，默认 0.05s）
  - 命名 key（Enter/Tab/Escape 等）用 `NAMED_KEY_CODE` + `NAMED_KEY_CODE_STR` 映射正确的 keyCode/code
  - `dispatchCharKeyEvent`: key/code/keyCode/shiftKey/charCode + isTrusted defineProperty 欺骗

## Bug: TabsController 无法追踪 target=_blank 打开的新标签页（已修复）
- **现象**：AI 点击 `target=_blank` 链接后，新 tab 不在 browser_state 里，AI 误判点击失败反复重点
- **根因**：`tabChangeHandler` 条件是 `tab.groupId === this.tabGroupId`，初始时 `tabGroupId=null`，Chrome 新标签 `groupId=-1`，永远不匹配
- **修复**（TabsController.ts）：增加 `isOpenedByOurTab` 条件——通过 `tab.openerTabId` 判断新 tab 是否由我们控制的 tab 打开
- **关键文件**：`packages/extension/src/agent/TabsController.ts` `tabChangeHandler` 的 `created` 分支

---
# basic — LLM Tool + Pay Utils

## 结构
```
basic/
├── frontend/
│   ├── main.tsx                      # React 入口（createRoot）
│   ├── App.tsx                       # 根组件（当前渲染 ChatApp）
│   ├── utils/
│   │   ├── Trans.ts                  # i18n，Trans.t({en,zh})，自动检测语言
│   │   ├── storage/Storage.ts        # localStorage 统一封装（静态方法）
│   │   ├── llm-tool/
│   │   │   ├── types.ts              # Provider / Scheme / ChatMessage
│   │   │   ├── config.ts             # DEFAULT_PROVIDERS + STORAGE_KEYS
│   │   │   ├── LLMProvider.ts        # 方案 CRUD + active 管理（静态方法）
│   │   │   └── LLMChat.ts            # stream() / send()，OpenAI 兼容（静态方法）
│   │   └── pay/
│   │       ├── types.ts              # 前端支付接口 + 组件 Props
│   │       ├── Trans.ts              # PayTrans（支付专用 i18n）
│   │       ├── PayApiClient.ts       # 静态 HTTP 客户端（静态方法）
│   │       └── index.ts
│   └── components/
│       ├── llm-tool/
│       │   ├── ChatApp.tsx           # 主容器（全局状态 + 流式逻辑）
│       │   ├── Sidebar.tsx           # 方案列表
│       │   ├── ChatArea.tsx          # 消息 + 输入框
│       │   └── SchemeModal.tsx       # 新建/编辑方案弹窗
│       └── pay/
│           ├── PayModal.tsx          # 统一支付弹窗（渠道选择→支付→完成）
│           ├── PayPalButton.tsx      # PayPal SDK 按钮
│           ├── WeChatPayPanel.tsx    # 微信支付面板（JSAPI / H5）
│           └── index.ts
└── backend/
    └── utils/pay/
        ├── types.ts                  # 所有支付接口定义
        ├── PayConfig.ts              # 静态配置（读 env vars）
        ├── SignTool.ts               # MD5签名/XML/随机数（静态方法）
        ├── WeChatPayTool.ts          # 微信支付 v2（静态方法）
        ├── PayPalTool.ts             # PayPal REST API v2（静态方法）
        ├── OrderTool.ts              # 统一入口（create/query/verify）
        └── index.ts
```

## 开发
```bash
# 前端（Vite + React）
cd frontend && npm run dev    # 需要 package.json + vite.config

# 后端（Express + TypeScript）
cd backend && npx ts-node-dev src/app.ts
```

## 关键约定
- 全部 TypeScript + React（前端）
- 存储全走 Storage.ts（localStorage）
- 语言全走 Trans.t({en,zh})，支持切换
- 所有工具类全静态方法，无需实例化
- 内置 LLM Provider: OpenAI / DeepSeek / OpenRouter / Groq / Custom
- 支付渠道：wechat_jsapi / wechat_xcx / wechat_h5 / paypal / paypal_subscription
- amount 统一用最小单位（分/cents），display 时÷100

## 配置机制（所有后端项目通用）
- `secret_json_default.json` — 模板，提交 git，值为空
- `secret_json.json` — gitignored，本地填真实值
- `shared_config.json` — 公开配置，提交 git
- 加载顺序：secret_json > secret_json_default > 代码默认值

## 后端支付配置（backend/config/secret_json.json）
- 不用 env vars，全部走 secret_json.json（gitignored）
- `wechat.gzh_app_id` → JSAPI / H5 支付（公众号）
- `wechat.apps[name]` → XCX 支付，用 xcxAppName 参数选择
  - apps: developer(wx647f4a89479b78c4) / biquge / feixie
- `wechat.mch_id` + `wechat.api_key` → 商户号 + 密钥（所有渠道共用）
- `paypal.mode` = "production" / "sandbox" → 自动选对应 client_id/secret
- `paypal.subscription_plans["codesleep-1"]` → plan_id 查询

## XCX 下单示例
```typescript
await OrderTool.create({
  channel: 'wechat_xcx',
  xcxAppName: 'developer',   // 选 apps.developer
  openid: user.openid,
  ...
});
```
