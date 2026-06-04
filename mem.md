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

## 文档与脚本 (2026-03)
- README.md（英文）和 README_zh.md（中文）在项目根目录
- Mac/Linux 对应所有 .bat 的 .sh 脚本已创建（start/rebuild-and-start/build-ext 等8个）
- system_prompt_shared.md、system_prompt_subtask.md、system_prompt_additions.md 底部中文已全部改为英文

## 环境信息注入 (2026-03)
- `getEnvInfo()` 在 `packages/core/src/utils/index.ts`，返回 "OS / Browser" 字符串
- 在 `#assembleUserPrompt` 的 `<step_info>` 块注入 `Environment: <OS> / <Browser>`

## 多会话架构（2026-03）
- `SessionManager.ts`：管理多个并行 ChatSession，每个有独立 MultiPageAgent
- `useSessionManager.ts`：React hook 替换原 `useAgent`
- `SessionTabs.tsx`：会话标签栏 UI（+号新建，×关闭）
- 在同一会话内继续发消息：`execute(task, { continueSession: true })` 不清空 history，push `user_message` 事件
- `UserMessageEvent` 在 history 中显示为右对齐蓝色气泡
- `upsertSession`：按 sessionId 更新 DB 记录（每次任务完成时）
- `ConfigPanel` 仍从 `useAgent.ts` import `ExtConfig`/`LanguagePreference` 类型（保持不变）
- `utils/Trans.ts`：内联 `{en, zh}` 格式，Trans.t({en,zh})，自动检测浏览器语言，localStorage 存偏好
- `MultiSessionNotice.tsx`：首次打开弹窗，localStorage 记录是否已展示，国际化

## Trainer 训练与自动化系统（2026-05）

### 已完成（v1）
- `packages/trainer/`：独立 Node.js 服务（port 3002），`npm run dev:trainer` 启动
  - `TaskManager.ts`：文件存储，data/tasks/{taskId}/ 目录，管理 Task/Execution/Script
  - `server.ts`：Express REST API
- Extension：`src/trainer/TrainerClient.ts`、`ScriptRunner.ts`、`parseElementMap.ts`
- SessionManager：`onActionLog: TC.enrichAndQueue` + `executeInTrainerMode()`
- App.tsx：BookOpen 按钮 → TrainerPanel 视图

### v2 已实现（JS 脚本系统）

#### 核心变化：XML Sequence → JS Script
- **`trainer/script/ScriptExecutor.ts`**：`execute(spec, params, tabId, sender)` → `ScriptRunResult`
  - 脚本以 `new Function('page','params', code)()` 运行（sidepanel CSP 已加 `unsafe-eval`）
  - **CSS-first 选择器**：`.class` / `#id` / `[attr]` 直接 querySelector，无需前缀
  - **`getCleanHtml(scope?, limit=50000)`**：AI 用来发现真实 CSS class/id，去除 script/style/hash 类名
  - **增强 click**：全 MouseEvent 序列（mouseover→mousedown→mouseup→click）
  - **增强 input**：React/Vue 兼容原生 setter + 冒泡 input/change 事件
- **`trainer/TrainerTools.ts`**：5 个工具 `write_note`, `write_script`, `exec_script`, `finalize_script`, `complete_training`
  - `complete_training` REQUIRED 在 done 前调用，跳过则记录为 failed
  - `module-level _completionStatus` → SessionManager 读取
- **Trainer 服务器** (`packages/trainer/`)：AI 脚本存 `data/tasks/{id}/ai-scripts/`
- **TrainerPanel**：AI Scripts 标签页展示 `TrainerScript[]`

#### 关键约定
- 参数格式：`params="key1,key2"`，调用时 `params="key1=val1,key2=val2"`
- `getCleanHtml()` 在 Phase 2 写脚本前先调用，得到真实选择器
- note 工具只在训练模式注入（`createTrainerTools` 按需调用）

### v3 后端控制浏览器架构（2026-05）

**架构：** `Bash脚本 → POST /api/browser/cmd → BridgeServer(WS) → BridgeClient(Extension) → chrome.scripting.executeScript → 页面DOM`

**新文件：**
- `trainer/src/bridge/BridgeServer.ts`：WebSocket服务端，管理单个扩展连接，UUID pending map + 30s超时
- `trainer/src/runner/PageJsBuilder.ts`：构建页面内执行的JS字符串（click/input/exists/getText/queryAll/scroll/getCleanHtml）
- `trainer/src/runner/RemotePage.ts`：Node.js API，training脚本使用 `new RemotePage()` 控制浏览器
- `trainer/src/runner/ScriptStore.ts`：脚本管理，保存到 `data/scripts/manifest.json` + `{id}.js`
- `trainer/src/runner/ScriptRunner.ts`：`new Function` 执行保存的脚本
- `extension/src/trainer/BridgeClient.ts`：background WS客户端，自动重连3s，处理 execute_js/navigate/screenshot/get_active_tab

**API端点：**
- `GET /api/bridge/status` → `{connected: bool}`
- `POST /api/browser/cmd` → 转发命令到扩展
- `GET/POST /api/scripts` → ScriptStore列表/保存
- `GET/DELETE /api/scripts/:id` → 获取/删除
- `POST /api/scripts/:id/run` → ScriptRunner执行

**关键约定：**
- `chrome.scripting.executeScript` 需要 `scripting` 权限（已加）
- `world: 'MAIN'` 在页面JS上下文执行（可访问React/Vue状态）
- TrainerPanel 侧栏 Scripts 视图：按 `category` 字段分组显示（带分组标题线），Run按钮有 idle/running/success/failed 状态
- `train_in_back.md` 为完整使用文档
- **navigate/refresh 前必须清 beforeunload**：`window.onbeforeunload = null` 先于导航，否则原生 Leave 弹窗会卡住（截图抓不到）。`RemotePage.navigate()` 和新增 `RemotePage.refresh()` 已内置此逻辑。
- **重启 trainer 服务器**：运行根目录 `restart-trainer.bat`（杀 3002 端口进程 → 后台重启 → 等待就绪）。修改 RemotePage.ts / PageJsBuilder.ts 后必须重启才生效。Claude 可直接执行：`cmd /c C:\projects\page-agent1\page-agent\restart-trainer.bat`
- `ScriptRunner` 的 `RunResult` 包含 `logs: string[]`，脚本用 `console.log` 输出，调用方从响应 logs 字段读取
- 按钮是否禁用：用 `page.getAttr(sel, 'disabled')===null` 判断（比CSS `:not([disabled])` 可靠）
- 所有输入统一用 `page.input()`，内部自动处理 React/Draft.js/contenteditable，禁止手写 JS 操作 DOM
- **文件上传**用 `page.uploadFile(selector, localPath)`：Node.js 读文件→base64→DataTransfer 注入 `input[type=file]`，完全绕过 OS 对话框。selector 可指向触发按钮（自动向下/父层查找 file input）。已验证：今日头条封面 `.byte-btn-size-huge`
- 清空输入框用 `page.clear()`（React nativeInputValueSetter+deleteContentBackward / contenteditable execCommand selectAll+delete）
- 键盘组合键用 `page.sendKey(selector|null, combo)`，支持 Enter/Escape/Ctrl+A/Shift+Enter 等，来自 OpenFill page-controller
- 下拉选择用 `page.select(selector, optionText)`
- manifest.json `publishable:true` → 脚本需有 dryRun 模式，`const DRY_RUN = params.dryRun !== 'false'`
- `ScriptMeta` 字段：`id/name/category/description/entryUrl/params/publishable/file/createdAt/updatedAt`
- `RemotePage.eval(code)` → 执行任意浏览器JS（用于iframe操作等，比常规API更底层）
- 微信公众号编辑器内容在 iframe 内，需 `page.eval()` 访问 `iframe.contentDocument.body`，用 `execCommand` 填写

**脚本分类（category）：**
- 知乎：`zhihu_publish.js`（已验证）params: title/content/coverPath/dryRun。封面：直接 uploadFile `.UploadPicture-input`（input[type=file]，无需点按钮），accept=jpeg/jpg/png。标题 `textarea.Input`，正文 `.public-DraftEditor-content`，发布 `button.Button--primary.Button--blue`
- BOSS直聘：`boss_apply.js`（已验证）
- 今日头条：`toutiao_publish.js`（已验证）params: title/content/coverPath/firstPublish/dryRun。封面：click `.article-cover-add` → uploadFile `.byte-btn-size-huge` → click `text:确定`。首发：`label.checkbot-item input[type=checkbox]` index=0（或中文includes均可），需正文≥100字。**中文在 eval() 字符串里完全正常**（ScriptStore UTF-8读写+JSON.stringify转义），之前报错原因是内容<100字触发弹窗被忽视
- 微信公众号：`wechat_oa_publish.js`（训练脚本 wechat_oa_publish.ts，待运行验证）
- WhatsApp：`whatsapp_send.js`（训练脚本 whatsapp_send.ts，用 data-testid 选择器，待运行验证）
- 搜狐号：`sohu_publish.js`（已验证 2026-05-25）params: title/content/coverPath/dryRun。直达URL `https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle?contentStatus=1`。标题 `input[placeholder="请输入标题（5-72字）"]`。正文 Quill `div.ql-editor`，page.inputAfterClear。封面：click `.upload-file.mp-upload`（开弹窗+动态创建file input）→ wait 500ms → uploadFile `.upload-button input[type=file]` → wait 2s → eval click `.dialog-title h3`[1]（本地上传标签）→ wait 500ms → click `p.button.positive-button` → wait 3s。发布按钮 `li.publish-report-btn.active`
- CSDN：`csdn_publish.js`（已验证 2026-05-25）params: title/content/coverPath/dryRun。标题 `textarea#txtTitle`。正文 CKEditor 在 `iframe.cke_wysiwyg_frame` 内，用 page.eval() + execCommand。封面：uploadFile `input.el_mcm-upload__input`（file input 已在DOM）→ wait 1.5s → click `.vicp-operate-btn`（裁剪弹窗确认上传）→ wait 2s。发布按钮 `text:发布博客`。等 3000ms 初始化
- 知乎：Draft.js 长文本问题修复：用 `page.pasteText()` 替代 `page.input()`，底层用 ClipboardEvent paste（Draft.js 原生处理）。execCommand('insertText') 会截断长字符串。已验证 1072 字、10段全部正确插入（2026-05-25）
- `RemotePage.pasteText(selector, value)`：新增方法，用 ClipboardEvent 注入文本，专用于 Draft.js 等编辑器长文本输入。`PageJsBuilder.buildPasteTextJS()` 对应实现

**发布平台配置（权威数据源）：**
- `packages/trainer/data/publish_platforms.json` — 所有发布平台的唯一配置文件
  - 字段：`id / name / scriptId / languages / hasCover / exclusive / enabled`
  - **只有 `enabled: true` 的平台才会被 gen_tool 发布系统使用**
  - gen_tool (`C:\projects\story2.0\gen_tool`) 在启动时从此文件读取 PLATFORMS（`PublishMediaStruct.ts`）
  - gen_tool 前端也通过 `/api/publish-media/platforms` API 动态加载，无需改前端代码
  - 新增/下线平台：只需修改此 JSON，重启 gen_tool 即可生效
  - 当前平台：toutiao(zh,exclusive) / zhihu(zh) / sohu(zh) / csdn(zh) / medium(en, enabled=false 待脚本完成)

**待探索（尚未有脚本）：**
- 微信公众号、WhatsApp — 必须先用 curl 手动探索 DOM，验证选择器后才能写脚本
- Medium — 编辑器加载极慢（需1分钟+），暂跳过；脚本完成后在 publish_platforms.json 改 enabled:true

**禁止：** 猜选择器直接写脚本。必须先 navigate → getCleanHtml → exists 验证 → 截图确认 → 走完全流程 → 才写 .ts 训练脚本。

## 豆包网络搜索工具（2026-03）
- 核心客户端：`packages/core/src/utils/doubao/DoubaoClient.ts`（静态方法）, `DoubaoConfig.ts`（setApiKey/getApiKey）, `DoubaoTypes.ts`
- `DoubaoClient` 和 `DoubaoConfig` 从 `@page-agent/core` 导出（已在 PageAgentCore.ts 中 re-export）
- `packages/core/src/config/SecretConfig.ts`：browser-compatible stub（始终返回 {}，Node测试用 packages/extension/config/SecretConfig.ts）
- Ark API base: `https://ark.cn-beijing.volces.com/api/v3`，默认模型 `doubao-seed-1-8-251228`
- `SessionManager.ts`：`buildSearchTool` 调 `DoubaoConfig.setApiKey(apiKey)` 后调 `DoubaoClient.search(query, 3, endpoint as DoubaoModel)`
- 配置字段（`AdvancedConfig`）：`doubaoApiKey`、`doubaoSearchEndpoint`（model名）、`searchEnabled`（默认true）
- `MultiPageAgent` 已修复：`customTools` = 外部工具 merge tab工具（之前外部customTools被覆盖）
- ConfigPanel 高级设置中新增搜索配置 UI（开关 + API Key + 接入点ID + 购买链接）
- 购买链接: `https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=model`

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

## 仓库卫生（2026-06）
- 运行时产物不入 git：`/data/`、`packages/data/`、`packages/trainer/data/{screenshots,test,tasks,*.png,*.html}` 均已 gitignore
- `packages/trainer/data/scripts/`（训练产出脚本）和 `publish_platforms.json` 保留入库
