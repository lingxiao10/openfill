const DRY_RUN = params.dryRun !== 'false'
const content = params.content || ''
const mediaPath = params.mediaPath || ''

if (!content && !mediaPath) throw new Error('content 或 mediaPath 至少需要一个')

// 1. 导航到主页（仅当不在 facebook 时）
const cur = await page.getCurrentUrl()
if (!cur.includes('facebook.com')) {
	await page.navigate('https://www.facebook.com/')
	await page.wait(2500)
}

// 2. 点击 News Feed 顶部 What's on your mind 入口
if (!(await page.exists("textContains:What's on your mind"))) {
	throw new Error("未找到发帖入口 What's on your mind，可能未登录")
}
await page.click("textContains:What's on your mind")
await page.wait(1500)

// 3. 输入正文（如有）— Lexical 编辑器
const editorSel = '[contenteditable=true][role=textbox]'
if (!(await page.exists(editorSel))) throw new Error('未找到 Composer 编辑器')
if (content) {
	await page.input(editorSel, content)
	await page.wait(800)
}

// 4. 上传媒体（如有）
//    Facebook composer 内的 file input 同时接受图片和视频。
//    selector 直接指向隐藏的 input，绕过 Photo/video 按钮触发的 OS 对话框。
if (mediaPath) {
	await page.uploadFile('[role=dialog] input[type=file]', mediaPath)
	// 视频可能需要更长上传/处理时间
	const isVideo = /\.(mp4|mov|m4v|webm|mkv|avi|wmv|flv|3gp|ogv)$/i.test(mediaPath)
	await page.wait(isVideo ? 6000 : 2500)
	console.log('[facebook] 媒体已注入:', mediaPath)
}

// 5. 检查 Post 按钮可点状态
await page.wait(1000)
const postBtnSel = '[role=dialog] [role=button][aria-label=Post]'
const btnExists = await page.exists(postBtnSel)
let canPost = false
if (btnExists) {
	const ariaDisabled = await page.getAttr(postBtnSel, 'aria-disabled')
	canPost = ariaDisabled !== 'true'
}
console.log('[facebook] Post 按钮可点击:', canPost)

if (DRY_RUN) {
	console.log('[dry-run] 正文:', content || '(无)')
	console.log('[dry-run] 媒体:', mediaPath || '(无)')
	console.log('[dry-run] Post 按钮可点击:', canPost)
	console.log('[dry-run] 跳过发布。传 dryRun=false 执行真实发布。')
	// 关闭 composer + 放弃草稿，避免污染状态
	if (await page.exists('[role=button][aria-label="Close composer dialogue"]')) {
		await page.click('[role=button][aria-label="Close composer dialogue"]')
		await page.wait(800)
		if (await page.exists('[role=button][aria-label="Delete draft"]')) {
			await page.click('[role=button][aria-label="Delete draft"]')
			await page.wait(500)
		}
	}
} else {
	if (!canPost) throw new Error('Post 按钮不可点击，请检查内容')
	await page.click(postBtnSel)
	// 视频上传后实际发布有上传到 CDN 的时间
	await page.wait(mediaPath ? 8000 : 3000)
	console.log('[facebook] 已发布')
}
