# Backend-Controlled Browser Training

## 🔴 第零原则：探索阶段禁止使用任何脚本

**探索阶段只允许：一次执行一个 curl 命令 → 看结果 → 再执行下一个。**

这不是建议，这是硬规定。违反此规则的后果：选择器是猜的，行为是假设的，脚本必然出问题。

**禁止的行为（无论理由多充分）：**
- ❌ 写一个 `.ts` 文件然后 `npx tsx` 运行来"探索"
- ❌ 把多个动作写在一个 curl 的 JS 代码里批量执行
- ❌ 用循环、条件判断、setTimeout 等控制流来"自动化探索"
- ❌ 在还没手动走完流程之前就开始写脚本

**正确的探索方式：**
```bash
# 第1步 — 只做导航，看结果
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"navigate","payload":{"url":"https://target.com"}}'
# → 看返回，确认成功了

# 第2步 — 只查 HTML，看结构
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"document.body.innerHTML.slice(0,3000)"}}'
# → 看返回，找选择器

# 第3步 — 只验证一个选择器
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"!!document.querySelector(\".target\")"}}'
# → 看 true/false，确认找到了

# 第4步 → 第5步 → ... 直到走完完整流程，才开始写脚本
```

---

## ⚠️ 第一原则：一次一个动作，看完反馈再继续

规则：
- 每次只执行**一个**动作（navigate / click / exists / queryAll / getCleanHtml 等）
- 立即查看返回结果
- 确认结果符合预期后，再执行下一个动作
- 走完全程，完全理解 DOM 结构和交互行为后，才开始写脚本

**禁止：**
- 探索阶段写循环或批量脚本
- 假设某个元素存在——必须先 `exists` 验证
- 一次性把多个操作放在一起执行
- 脚本写完不测试就收工——必须自己跑一遍确认结果
- **凭记忆或经验猜选择器，然后直接写脚本**

## ⚠️ 第二原则：模拟真人操作，优先滚动而非刷新

**真人不会处理完一条就刷新页面，而是一直往下滑浏览。**

规则：
- 优先通过滚动加载更多内容，而不是重新导航到列表页
- 在探索阶段必须验证页面的滚动行为——不同页面差异很大：
  - 无限滚动（滚到底部触发加载）
  - 固定批次（滚动不加载新内容，需要找「换一批」或翻页按钮）
  - 分页（有页码或下一页按钮）

**探索滚动行为的步骤：**

```bash
# 1. 记录初始卡片数量
cards_before = document.querySelectorAll('.item').length

# 2. 找到可滚动容器（window 还是某个 div）
# 从卡片向上遍历父元素，找 scrollHeight > clientHeight 的容器
(() => {
  let el = document.querySelector('.item').parentElement;
  while(el) {
    if(el.scrollHeight > el.clientHeight + 10)
      return {sel: el.className, sh: el.scrollHeight, ch: el.clientHeight};
    el = el.parentElement;
  }
  return {window: true, docH: document.documentElement.scrollHeight, innerH: window.innerHeight};
})()

# 3. 滚动到底部，等待 1.5s，再看卡片数量
window.scrollTo(0, document.documentElement.scrollHeight)  // 或 el.scrollTop = el.scrollHeight
// → 等待 1.5s
cards_after = document.querySelectorAll('.item').length
// 如果 cards_after > cards_before → 无限滚动，继续滚
// 如果相同 → 固定批次，找「换一批」或翻页按钮
```

## ⚠️ 第三原则：内容发布脚本测试阶段禁止真实提交

**适用场景**：知乎发文、头条发布、微博发帖、表单提交等——任何会产生对外可见内容的操作。

规则：
- 测试阶段只验证**输入是否正确填入**、**提交按钮是否变为可点击状态**
- **禁止**在测试阶段点击最终的发布/提交按钮
- 职位投递（BOSS直聘等）不受此限制——投递结果可撤回，风险低

**脚本必须提供两种模式**，通过 `params.dryRun` 控制：

```javascript
// 脚本中的标准模式切换写法
const DRY_RUN = params.dryRun !== 'false'; // 默认 dry run，必须显式传 false 才真实提交

// ... 填写内容 ...

// 填写完后必须等待 React 处理状态更新，再检查按钮
await page.wait(1000);

// ⚠️ 按钮可用状态检测：用 getAttr 判断 disabled 属性，禁止用 CSS :not([disabled])
const btnExists = await page.exists('button.submit-btn');
let canSubmit = false;
if (btnExists) {
  const disabledAttr = await page.getAttr('button.submit-btn', 'disabled');
  canSubmit = disabledAttr === null; // null = 属性不存在 = 按钮可用
}

if (DRY_RUN) {
  console.log('[dry-run] 填写完成，提交按钮可点击:', canSubmit);
  console.log('[dry-run] 跳过提交。传 params.dryRun=false 执行真实发布。');
} else {
  if (!canSubmit) throw new Error('提交按钮不可点击');
  await page.click('button.submit-btn');
  console.log('已发布');
}
```

**前端（Trainer Scripts 面板）需要为此类脚本展示两个运行按钮**：
- 「试填写」→ 自动传入 `{ dryRun: 'true' }`
- 「发布」→ 弹确认框后传入 `{ dryRun: 'false' }`

脚本在 `manifest.json` 中通过 `"publishable": true` 标记自己需要此行为。

---

## ⚠️ 第六原则：测试时每个动作后必须立即截图（autoScreenshot 标配）

**弹窗、Toast、校验提示往往只闪现 1-2 秒就消失。事后截图永远捕捉不到。唯一的办法是动作执行后立刻截图。**

### 脚本中（RemotePage）— 用 `page.autoScreenshot(true)` 一键开启

```typescript
// 放在任何测试/探索脚本的第一行
page.autoScreenshot(true)          // 默认每个动作后 1000ms 截图
page.autoScreenshot(true, 600)     // 600ms，更快捕捉短暂弹窗
page.autoScreenshot(true, 1000, 'data/screenshots/my_test')  // 自定义目录

// 之后所有 click / input / uploadFile / select / sendKey 都自动截图
await page.click('.btn')           // → 自动保存 001_click_.btn.png
await page.input('textarea', 'x') // → 自动保存 002_input_textarea.png
```

截图按顺序编号（001, 002...），文件名含动作和选择器，方便事后回看整个操作序列。

### curl 探索时 — 动作和截图必须写在同一条命令里

```bash
# ✅ 正确：点击和截图在同一个 && 链里，截图紧跟动作
python -c "...click..." && curl ...screenshot... | python ...save...

# ❌ 错误：先点击，隔一轮再截图——弹窗早就消失了
python -c "...click..."
# （下一条命令）
curl ...screenshot...
```

**禁止：**
- ❌ 执行完动作，等"看看效果"再手动截图
- ❌ 用事后截图验证点击/输入是否成功

---

## ⚠️ 第五原则：每个操作之间必须等待至少 1 秒

**页面是异步的。点击、输入、上传之后，React 重渲染、网络请求、动画都需要时间。不等就执行下一步，必定出现元素未就绪的错误。**

规则：
- 每次 `click` / `input` / `uploadFile` 之后，至少 `await page.wait(1000)`
- 上传文件后等待更长：`await page.wait(2000)`（上传有网络请求）
- 导航后等待更长：`await page.wait(1500)`（页面渲染）
- 弹窗出现/消失后：`await page.wait(1000)`

```typescript
// ✅ 正确
await page.click('.btn');
await page.wait(1000);             // 等弹窗出现
await page.uploadFile(sel, path);
await page.wait(2000);             // 等上传完成
await page.click('text:确定');
await page.wait(1000);             // 等弹窗关闭

// ❌ 错误 — 操作紧连，下一步找不到元素
await page.click('.btn');
await page.uploadFile(sel, path);  // 弹窗还没出来，findElement 失败
await page.click('text:确定');
```

---

## ⚠️ 第四原则：探索过程配合截图做多重验证

**单靠 DOM 查询不够——截图能确认视觉状态（输入框是否真的有内容、弹窗是否真的出现）。**

规则：
- 每次输入文字或点击关键元素后，截一张图验证视觉状态
- 遇到「找不到元素」或「行为不符预期」时，立即截图定位问题
- 截图保存到 `data/screenshots/` 便于事后分析

```bash
# 截图并保存（Base64 → 文件）
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"screenshot","payload":{}}' \
  | python -c "import sys,json,base64; d=json.load(sys.stdin); open('data/screenshots/snap.png','wb').write(base64.b64decode(d['dataUrl'].split(',')[1]))"
```

或直接在 RemotePage 中：
```typescript
const { dataUrl } = await page.screenshot()
// dataUrl 是 base64 PNG，写入文件或直接 Read 工具查看
```

---

**BOSS直聘推荐页（/web/geek/jobs）探索结论（2026-05-21）：**
- 滚动容器是 `window`，`document.documentElement.scrollHeight ≈ 1929px`
- 滚动到底部后卡片数量不变 → **固定批次，约 10-15 张，不支持滚动加载**
- 已投递的职位在重新导航后会从列表消失
- 无「换一批」按钮，批次用完后需重新进入页面获取新推荐

---

**如何手动执行单个动作（Claude 操作方式）：**

```bash
# 导航
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"navigate","payload":{"url":"https://example.com"}}'

# 获取 clean HTML（用于发现选择器）
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"(() => { return document.body.innerHTML.slice(0,3000); })()"}}'

# 检查元素是否存在
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"!!document.querySelector(\".job-card-wrap\")"}}'

# 点击元素
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"(() => { document.querySelector(\".btn\").click(); return {success:true}; })()"}}'
```

---

## 发现选择器的两种思路

### 思路 A：先看 HTML，再找选择器

适合页面结构陌生、不知道从哪里下手的情况。

```bash
# 1. 获取 clean HTML，保存分析
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"(() => { return document.body.innerHTML; })()"}}'
# → 把返回内容保存到 data/debug.html，用编辑器打开查看结构

# 2. 根据 HTML 结构确认选择器后，再去验证
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"!!document.querySelector(\".found-class\")"}}'
```

**优点**：对陌生页面最稳，能看到完整 DOM 层级。  
**缺点**：HTML 可能很大，需要人工分析。

---

### 思路 B：直接用宽泛查询扫描目标元素

适合目标元素有规律（按钮、弹窗、列表项等），不需要看完整 HTML。

```bash
# 扫描所有按钮/链接，看哪个文字匹配
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"[...document.querySelectorAll(\"a,button\")].map(el=>({cls:el.className.slice(0,50),text:el.innerText.trim()})).filter(x=>x.text)"}}'

# 扫描所有弹窗/对话框
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"[...document.querySelectorAll(\"[role=dialog],[class*=modal],[class*=dialog],[class*=popup]\")].map(el=>({cls:el.className.slice(0,60),text:el.innerText.trim().slice(0,80)}))"}}'

# 确认某个元素内的所有按钮（弹窗内容探索）
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"[...document.querySelector(\".target-dialog\").querySelectorAll(\"a,button,span\")].map(el=>({tag:el.tagName,cls:el.className,text:el.innerText.trim()}))"}}'
```

**优点**：快，不需要解析大段 HTML，适合探索交互状态（点击后出现的弹窗等）。  
**缺点**：依赖对页面结构的经验猜测，可能漏掉非常规写法。

---

**实际使用建议**：两种思路可以混用。导航到新页面后先用思路 B 快速扫一遍按钮和卡片；遇到找不到的元素再用思路 A 保存 HTML 仔细分析。

---

## 架构

```
Claude Code (Bash)
    │  HTTP POST /api/browser/cmd
    ▼
Trainer Server (port 3002)   ←→   WebSocket (/ws)   ←→   Chrome Extension (background)
    │                                                           │
    │  REST API                                       chrome.scripting.executeScript
    ▼                                                           │
data/scripts/                                              Page DOM (world: MAIN)
  manifest.json
  {id}.js
```

**关键思想**：逻辑（循环/判断）在 Node.js，浏览器只执行原子命令。

---

## 快速启动

```bash
# 终端1：启动 trainer 服务器
npm run dev:trainer

# Chrome：加载扩展
# chrome://extensions → Load unpacked → packages/extension/.output/chrome-mv3
# WXT dev 模式下热更新，不需要手动重载

# 验证连接
curl http://127.0.0.1:3002/api/bridge/status
# → {"connected":true}
```

---

## 训练新任务的完整流程

### 第一步：手动探索（必做，不可跳过）

```bash
# 1. 确认连接
curl http://127.0.0.1:3002/api/bridge/status

# 2. 导航到目标页面
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"navigate","payload":{"url":"https://example.com"}}'

# 3. 看 HTML，找选择器
curl -s -X POST http://127.0.0.1:3002/api/browser/cmd \
  -H "Content-Type: application/json" \
  -d '{"command":"execute_js","payload":{"code":"document.body.innerHTML.slice(0,5000)"}}'

# 4. exists 验证选择器
# 5. 点击/输入，截图确认
# 6. 重复直到走完完整流程
```

### 第二步：写训练脚本 `packages/trainer/src/tasks/{name}.ts`

**只有完成第一步之后才能开始写。** 脚本里填写的选择器必须是第一步中亲自验证过的。

```typescript
import { RemotePage } from '../runner/RemotePage.js'
import { ScriptStore } from '../runner/ScriptStore.js'

const page = new RemotePage()

// Phase 1: 探索 - 找稳定选择器（已在 curl 阶段验证过）
await page.navigate('https://example.com')
await page.wait(2000)
const html = await page.getCleanHtml()
console.log(html.slice(0, 5000))

// Phase 2: 执行任务验证逻辑
await page.click('.target-button')
if (await page.exists('text:确认')) {
  await page.click('text:确认')
}

// Phase 3: 保存为可复用脚本
ScriptStore.save(
  {
    id: 'my_task',
    name: '我的任务',
    category: '产品名称',
    description: '...',
    entryUrl: 'https://...',
    params: [],
    publishable: true,  // 如果有发布行为
  },
  `
  await page.click('.btn');
  if (await page.exists('text:Done')) console.log('Success');
  `
)
```

### 第三步：运行

```bash
cd packages/trainer && npx tsx src/tasks/my_task.ts
```

### 第四步：前端运行

扩展侧栏 → Trainer → Scripts → 按产品分类 → Run

---

## ⚠️ RemotePage API — 操作决策表（必读，禁止自创方案）

**所有输入问题已在 `buildInputJS` 中一次性解决。直接调 `page.input()`，永远不需要手写 JS 去操作 DOM。**

### 输入文字 → 优先用 `page.inputAfterClear()`，其次才是 `page.input()`

```typescript
// ★★★ 首选方案 — 先清空再输入（clear → wait 1s → input）
await page.inputAfterClear(selector, value)

// 次选 — 直接输入（适合确定为空的框，或 clear 会破坏状态的场景）
await page.input(selector, value)

// 搜索框专用 — 输入后按回车
await page.inputEnter(selector, value)
```

**为什么优先用 `inputAfterClear()`：**
- 许多输入框有默认占位文字或上次残留内容，直接 `input()` 会追加而不是替换
- 先 `clear()` 触发 React 的 deleteContentBackward，让框架重置内部状态
- 等 1 秒让 React/Draft.js 处理完清空事件，再写入新内容，避免竞态

**`page.input()` / `page.inputAfterClear()` 内部自动判断元素类型：**
- `isContentEditable === true`（Draft.js、富文本等）→ `execCommand('selectAll') + execCommand('insertText', value)`
- `<input>` / `<textarea>`（React 受控组件）→ `nativeInputValueSetter + input/change 事件`

**禁止：**
- ❌ 不要手写 `el.value = ...`（React 不响应）
- ❌ 不要手写 `el.textContent = ...`（破坏 Draft.js 状态）
- ❌ 不要自己判断 `isContentEditable` 然后分支处理（已封装）
- ❌ 不要用 `execCommand` 直接操作（已封装）
- ❌ 不要逐字符模拟键盘（慢且不必要）
- ❌ 上传文件不要用 `.click()` 触发 OS 对话框——用 `page.uploadFile()`

### 检查按钮是否可点击 → 永远用 `getAttr` 判断 disabled

```typescript
// ✅ 正确
const disabled = await page.getAttr('button.submit', 'disabled');
const canClick = disabled === null; // null = 属性不存在 = 可点击

// ❌ 错误 — CSS :not([disabled]) 在 React 动态更新时不可靠
await page.exists('button.submit:not([disabled])');
```

### 填写后检查按钮状态 → 必须先等 1s

```typescript
await page.input(selector, value);
await page.wait(1000); // React 异步重渲染，不等就读到旧状态
const disabled = await page.getAttr('button.submit', 'disabled');
```

### ⭐ 上传本地文件 → 优先用 `page.uploadFile()`

**任何需要上传本地文件（图片、PDF、视频等）的场景，第一选择是 `page.uploadFile()`。**  
它在 Node.js 侧读文件并 base64 编码，通过 DataTransfer 直接注入到 `input[type=file]`，完全绕过 OS 文件选择对话框。

```typescript
// selector 可以是：
//   1. 直接指向 input[type=file] 本身
//   2. 触发上传的按钮/容器（会自动向下或向父层查找最近的 input[type=file]）
await page.uploadFile('input[type=file]', '/absolute/path/to/image.jpg')
await page.uploadFile('.upload-btn', '/path/to/cover.png')  // 自动找附近的 file input
await page.uploadFile('#upload-drag-input', '/path/to/file.pdf')
```

**`page.uploadFile()` 内部流程：**
1. Node.js `readFileSync` 读本地文件 → base64
2. 自动检测 MIME type（支持 jpg/png/gif/webp/bmp/pdf/mp4/mov）
3. 浏览器内用 `DataTransfer` 创建 File 对象 → 注入 `input.files`
4. 触发 `change` + `input` 事件
5. 若 selector 指向非 file input，自动向下找子 `input[type=file]`，或向父层找

**禁止：**
- ❌ 不要手写 base64 注入 JS（`page.uploadFile()` 已封装好）
- ❌ 不要尝试触发 OS 文件选择对话框（无法自动化）
- ❌ 不要用 `.click()` 点上传按钮期望出现文件选择器

**今日头条封面上传实战（已验证 2026-05-21）：**
```typescript
// 1. 点封面区的 + 按钮打开上传弹窗
await page.click('.article-cover-add')
await page.wait(800)
// 2. 上传文件（selector 指向触发按钮，自动找到其父容器内的 file input）
await page.uploadFile('.byte-btn-size-huge', '/path/to/cover.jpg')
await page.wait(1500)
// 3. 点确定
await page.click('text:确定')
```

**CSDN 封面上传实战（已验证 2026-05-25）：**
```typescript
// file input 已在 DOM，直接注入（无需点按钮）
await page.uploadFile('input.el_mcm-upload__input', '/path/to/cover.jpg')
await page.wait(1500)  // 等裁剪弹窗出现
await page.click('.vicp-operate-btn')  // 点"确认上传"
await page.wait(2000)  // 等上传完成
```

**搜狐号封面上传实战（已验证 2026-05-25）：**
```typescript
// 点击上传区 → 开弹窗 + 动态创建 file input
await page.click('.upload-file.mp-upload')
await page.wait(500)
// 注入文件（AJAX 上传）
await page.uploadFile('.upload-button input[type=file]', '/path/to/cover.jpg')
await page.wait(2000)
// 切到"本地上传"标签（h3[1]）
await page.eval("document.querySelectorAll('.dialog-title h3')[1].click()")
await page.wait(500)
// 点确认（已自动选中上传的图）
await page.click('p.button.positive-button')
await page.wait(3000)
```

**知乎 Draft.js 长文本输入（已验证 2026-05-25）：**
```typescript
// ✅ 正确 — pasteText 用 ClipboardEvent，Draft.js 原生处理任意长度多行文本
await page.pasteText('.public-DraftEditor-content', longContent)

// ❌ 错误 — page.input() 内部 execCommand('insertText') 对长字符串会截断
await page.input('.public-DraftEditor-content', longContent)
```
`pasteText` vs `input` 选择原则：
- 短文本或单行 → `input()` / `inputAfterClear()`
- Draft.js 长文本、多段落 → `pasteText()`（内部: selectAll + ClipboardEvent paste）

---

### 全部 API 速查

```typescript
// ── 导航 ──────────────────────────────────────────────────────────
await page.navigate(url)               // 导航并等待页面加载
await page.getCurrentUrl()             // → string

// ── 文件上传（第一选择）──────────────────────────────────────────
await page.uploadFile(selector, localPath) // ★★ 上传本地文件，绕过 OS 对话框

// ── 输入 / 操作（按优先级排列）────────────────────────────────────
await page.inputAfterClear(selector, value) // ★★★ 首选输入方案（clear → wait 1s → input）
await page.input(selector, value)           // 次选（确定为空时用）
await page.pasteText(selector, value)       // ★ Draft.js 长文本专用（ClipboardEvent paste）
await page.inputEnter(selector, value)      // 输入 + 回车（搜索框）
await page.clear(selector)                  // 单独清空输入框
await page.click(selector)             // 点击（触发完整 MouseEvent 序列）
await page.clickNth(selector, index)   // 点击第 N 个匹配元素（0-indexed）
await page.select(selector, optionText)// ★ 选择 <select> 下拉选项（按选项文字）
await page.sendKey(selector, combo)    // ★ 发送键盘组合键（selector 传 null 则发给当前焦点元素）
await page.scroll('down' | 'up', pages)// 滚动 N 页
await page.wait(ms)                    // 等待

// sendKey combo 示例：
//   'Enter', 'Escape', 'Tab', 'Backspace', 'Delete'
//   'ArrowDown', 'ArrowUp', 'Home', 'End'
//   'Ctrl+A', 'Ctrl+C', 'Ctrl+V', 'Ctrl+Z', 'Ctrl+Shift+Z'
//   'Shift+Enter'（富文本换行）

// ── 查询 ──────────────────────────────────────────────────────────
await page.exists(selector)            // → boolean
await page.getText(selector)           // → string（trimmed）
await page.getAttr(selector, attr)     // → string | null（null = 属性不存在）
await page.queryAll(selector, ['text','href','src'])  // → Record[]

// ── HTML 快照（探索选择器专用）─────────────────────────────────────
await page.getCleanHtml()              // 去噪后的 body HTML（限50000字符）
await page.getCleanHtml('.scope')      // 缩小范围，更快更准
await page.getFullHtml()               // 完整 outerHTML（大页面慎用）

// ── 高级（普通 API 无法覆盖的特殊场景才用，如 iframe 内操作）──────────
await page.eval(jsCode)                // 在页面执行任意 JS，返回结果

// ── 截图 ──────────────────────────────────────────────────────────
await page.screenshot()                // → base64 dataUrl
await page.screenshot('data/shot.png') // → 同时保存文件
```

---

## 选择器规则

| 格式 | 示例 |
|------|------|
| `.class` | `.job-card-wrap` |
| `#id` | `#submit-btn` |
| `[attr=val]` | `[data-testid=apply]` |
| `tag.class` | `button.btn-primary` |
| `text:xxx` | `text:立即沟通` |
| `textContains:xxx` | `textContains:沟通` |
| `aria:xxx` | `aria:关闭对话框` |
| `placeholder:xxx` | `placeholder:搜索` |

**优先用 `getCleanHtml()` 找 id/class，再用 CSS-first 选择器。**

---

## 脚本格式

```javascript
// 注入变量: page (RemotePage), params (object), runner (ScriptRunner)
const MAX = params.maxItems ? parseInt(params.maxItems) : 10;
const items = await page.queryAll('.item', ['text']);

for (let i = 0; i < Math.min(items.length, MAX); i++) {
  await page.clickNth('.item', i);
  await page.wait(500);
  if (await page.exists('text:确认')) {
    await page.click('text:确认');
  }
}

// 调用其他脚本（组合）
// await runner.run('sub_task', { param: 'value' });
```

---

## REST API

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/bridge/status` | 扩展是否已连接 |
| POST | `/api/browser/cmd` | 直接执行浏览器命令 |
| GET | `/api/scripts` | 列出所有脚本 |
| POST | `/api/scripts` | 保存脚本 `{meta, code}` |
| GET | `/api/scripts/:id` | 获取脚本含代码 |
| DELETE | `/api/scripts/:id` | 删除脚本 |
| POST | `/api/scripts/:id/run` | 运行 `{params}` |

---

## 目录结构

```
packages/trainer/
├── src/
│   ├── bridge/BridgeServer.ts    # WebSocket server
│   ├── runner/
│   │   ├── RemotePage.ts         # Node.js 浏览器控制 API（含 eval()）
│   │   ├── PageJsBuilder.ts      # JS 字符串构建器
│   │   ├── ScriptStore.ts        # 脚本文件管理（支持 category 字段）
│   │   └── ScriptRunner.ts       # 脚本执行器
│   └── tasks/boss_apply.ts       # 示例训练脚本（已验证）
└── data/scripts/
    ├── manifest.json
    └── *.js

packages/extension/src/trainer/
└── BridgeClient.ts               # background WS 客户端
```

---

## 常见问题

**Extension not connected** → 确认 trainer server 运行 + 扩展已加载 + 开过侧栏（激活 SW）

**Element not found** → 先 `getCleanHtml()` 检查结构，`writeFileSync('data/debug.html', html)` 保存分析

**navigate 后没变化** → 某些页面重定向登录，先手动登录

**navigate / refresh 被原生 Leave 弹窗卡住** → 浏览器的 `beforeunload` 对话框是系统 UI，截图抓不到。解决方法：**导航/刷新前必须先清除 beforeunload**。`RemotePage.navigate()` 和 `RemotePage.refresh()` 已内置此逻辑，直接用即可。手动 curl 测试时也需先执行：
```javascript
(function(){ window.onbeforeunload = null; return {success:true}; })()
```
然后再 navigate 或 reload。

**page.eval() 里的中文是否可用？** → ✅ 完全可用，任何执行路径下均正常：
- `ScriptStore` 显式 UTF-8 读写，中文不丢失
- `ScriptRunner` 用 `new Function()` 构造，Node.js 完整支持 Unicode
- `page.eval("...includes('中文')...")` → `JSON.stringify` 自动转义 → 浏览器正常执行
- **之前失效的真实原因**：内容 <100 字触发弹窗被忽视（无截图），或点了 label 而非 `input[type=checkbox]`

**自定义 checkbox（byte-checkbox、byted-checkbox 等）点击无效** → 必须点内部的 `input[type=checkbox]`，不能点 label/wrapper 本身：
```javascript
// ✅ 正确 — 点 input 本身
document.querySelectorAll('label.checkbot-item input[type=checkbox]')[0]?.click()
// 或用中文 includes（两种方式均可）
[...document.querySelectorAll('label')].find(l => l.innerText.includes('头条首发'))
  ?.querySelector('input[type=checkbox]')?.click()

// ❌ 错误 — 点 label 或 wrapper，checkbox 状态不会切换
document.querySelector('label.checkbot-item').click()
```
