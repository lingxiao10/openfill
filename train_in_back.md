# Backend-Controlled Browser Training

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

## 训练新任务流程

### 1. 写训练脚本 `packages/trainer/src/tasks/{name}.ts`

```typescript
import { RemotePage } from '../runner/RemotePage.js'
import { ScriptStore } from '../runner/ScriptStore.js'

const page = new RemotePage()

// Phase 1: 探索 - 找稳定选择器
await page.navigate('https://example.com')
await page.wait(2000)
const html = await page.getCleanHtml()
console.log(html.slice(0, 5000))   // 检查结构，找 id/class

// Phase 2: 执行任务验证逻辑
await page.click('.target-button')
if (await page.exists('text:确认')) {
  await page.click('text:确认')
}

// Phase 3: 保存为可复用脚本
ScriptStore.save(
  { id: 'my_task', name: '我的任务', description: '...', entryUrl: 'https://...', params: [] },
  `
  await page.click('.btn');
  if (await page.exists('text:Done')) console.log('Success');
  `
)
```

### 2. 运行

```bash
cd packages/trainer && npx tsx src/tasks/my_task.ts
```

### 3. 前端运行

扩展侧栏 → Trainer → Scripts → Run

---

## RemotePage API

```typescript
// 导航
await page.navigate(url)          // navigate + wait 1.5s
await page.getCurrentUrl()        // → string

// 操作
await page.click(selector)        // 点击
await page.input(selector, value) // 填写（React/Vue 兼容）
await page.inputEnter(sel, value) // 填写 + 回车
await page.clickNth(sel, index)   // 点第N个（0-indexed）
await page.scroll('down', 2)      // 滚动2页
await page.wait(ms)               // 等待

// 查询
await page.exists(sel)            // → boolean
await page.getText(sel)           // → string
await page.getAttr(sel, 'href')   // → string|null
await page.queryAll(sel, ['text','href'])  // → [{text,href}]

// HTML 快照（发现选择器用）
await page.getCleanHtml()         // body cleaned HTML
await page.getCleanHtml('.scope') // 限定范围

// 截图
await page.screenshot('data/shot.png')
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
│   │   ├── RemotePage.ts         # Node.js 浏览器控制 API
│   │   ├── PageJsBuilder.ts      # JS 字符串构建器
│   │   ├── ScriptStore.ts        # 脚本文件管理
│   │   └── ScriptRunner.ts       # 脚本执行器
│   └── tasks/boss_apply.ts       # 示例训练脚本
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
