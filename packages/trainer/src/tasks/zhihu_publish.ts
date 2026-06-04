/**
 * 知乎专栏发布脚本
 *
 * params:
 *   title      文章标题（必填）
 *   content    文章正文（必填）
 *   coverPath  封面图片本地绝对路径（可选，支持 JPEG/JPG/PNG）
 *   dryRun     'false' 才真实发布，默认 dry run
 *
 * 运行：cd packages/trainer && npx tsx src/tasks/zhihu_publish.ts
 */
import { RemotePage } from '../runner/RemotePage.js'
import { ScriptStore } from '../runner/ScriptStore.js'

const page = new RemotePage()

// ── Phase 1: 确认页面 ────────────────────────────────────────────────────────

await page.navigate('https://zhuanlan.zhihu.com/write')
await page.wait(2000)

const url = await page.getCurrentUrl()
if (!url.includes('zhuanlan.zhihu.com')) {
	throw new Error('未在知乎专栏，请先登录')
}
console.log('[zhihu] 页面就绪:', url)

// ── Phase 2: 保存可复用脚本 ─────────────────────────────────────────────────

ScriptStore.save(
	{
		id: 'zhihu_publish',
		name: '知乎专栏发布',
		category: '知乎',
		description: '发布知乎专栏文章，支持标题、正文、封面图',
		entryUrl: 'https://zhuanlan.zhihu.com/write',
		params: [
			{ name: 'title', label: '标题', type: 'text', required: true },
			{ name: 'content', label: '正文', type: 'textarea', required: true },
			{ name: 'coverPath', label: '封面路径', type: 'text', required: false },
		],
		publishable: true,
	},
	`
const DRY_RUN   = params.dryRun !== 'false';
const title     = params.title     || '测试标题';
const content   = params.content   || '测试正文内容';
const coverPath = params.coverPath || '';

// 1. 导航
await page.navigate('https://zhuanlan.zhihu.com/write');
await page.wait(2000);

// 2. 关闭可能出现的弹窗
if (await page.exists('.Modal-closeButton')) {
  await page.click('.Modal-closeButton');
  await page.wait(800);
}

// 3. 填写标题（React textarea）
if (!await page.exists('textarea.Input')) throw new Error('标题框未找到');
await page.input('textarea.Input', title);
await page.wait(500);

// 4. 填写正文（Draft.js contenteditable）
// 使用 pasteText 而非 input：长文本时 execCommand('insertText') 会截断，
// ClipboardEvent paste 由 Draft.js 原生处理，支持任意长度多行内容。
if (!await page.exists('.public-DraftEditor-content')) throw new Error('正文编辑器未找到');
await page.pasteText('.public-DraftEditor-content', content);
await page.wait(500);

// 5. 上传封面（input[type=file] 直接注入，不需要点按钮打开对话框）
if (coverPath) {
  await page.uploadFile('.UploadPicture-input', coverPath);
  await page.wait(1500);
  console.log('[zhihu] 封面已上传');
}

// 6. 检查发布按钮
await page.wait(1000);
const btnExists = await page.exists('button.Button--primary.Button--blue');
let publishEnabled = false;
if (btnExists) {
  const disabled = await page.getAttr('button.Button--primary.Button--blue', 'disabled');
  publishEnabled = disabled === null;
}
console.log('[zhihu] 发布按钮可点击:', publishEnabled);

if (DRY_RUN) {
  console.log('[dry-run] 标题:', title);
  console.log('[dry-run] 正文长度:', content.length);
  console.log('[dry-run] 封面:', coverPath || '无封面');
  console.log('[dry-run] 发布按钮可点击:', publishEnabled);
  console.log('[dry-run] 跳过发布。传 dryRun=false 执行真实发布。');
} else {
  if (!publishEnabled) throw new Error('发布按钮不可点击，请检查内容');
  await page.click('button.Button--primary.Button--blue');
  await page.wait(2000);
  const finalUrl = await page.getCurrentUrl();
  console.log('[zhihu] 已发布，当前 URL:', finalUrl.slice(0, 80));
}
`
)

console.log('[zhihu] 脚本已保存到 ScriptStore')
console.log('[zhihu] 脚本 ID: zhihu_publish')
