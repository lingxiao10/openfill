const DRY_RUN = params.dryRun !== 'false'
const title = params.title || '测试标题'
const content = params.content || '测试正文内容'
const coverPath = params.coverPath || ''

// 1. 导航
await page.navigate('https://zhuanlan.zhihu.com/write')
await page.wait(2000)

// 2. 关闭可能出现的弹窗
if (await page.exists('.Modal-closeButton')) {
	await page.click('.Modal-closeButton')
	await page.wait(800)
}

// 3. 填写标题（React textarea）
if (!(await page.exists('textarea.Input'))) throw new Error('标题框未找到')
await page.input('textarea.Input', title)
await page.wait(500)

// 4. 填写正文（Draft.js contenteditable）
// 使用 pasteText 而非 input：长文本时 execCommand('insertText') 会截断，
// ClipboardEvent paste 由 Draft.js 原生处理，支持任意长度多行内容。
if (!(await page.exists('.public-DraftEditor-content'))) throw new Error('正文编辑器未找到')
await page.pasteText('.public-DraftEditor-content', content)
await page.wait(500)

// 5. 上传封面（input[type=file] 直接注入，不需要点按钮打开对话框）
if (coverPath) {
	await page.uploadFile('.UploadPicture-input', coverPath)
	await page.wait(1500)
	console.log('[zhihu] 封面已上传')
}

// 6. 检查发布按钮
await page.wait(1000)
const btnExists = await page.exists('button.Button--primary.Button--blue')
let publishEnabled = false
if (btnExists) {
	const disabled = await page.getAttr('button.Button--primary.Button--blue', 'disabled')
	publishEnabled = disabled === null
}
console.log('[zhihu] 发布按钮可点击:', publishEnabled)

if (DRY_RUN) {
	console.log('[dry-run] 标题:', title)
	console.log('[dry-run] 正文长度:', content.length)
	console.log('[dry-run] 封面:', coverPath || '无封面')
	console.log('[dry-run] 发布按钮可点击:', publishEnabled)
	console.log('[dry-run] 跳过发布。传 dryRun=false 执行真实发布。')
} else {
	if (!publishEnabled) throw new Error('发布按钮不可点击，请检查内容')
	await page.click('button.Button--primary.Button--blue')
	await page.wait(2000)
	const finalUrl = await page.getCurrentUrl()
	console.log('[zhihu] 已发布，当前 URL:', finalUrl.slice(0, 80))
}
