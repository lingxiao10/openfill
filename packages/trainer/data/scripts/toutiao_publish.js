const DRY_RUN = params.dryRun !== 'false'
const title = params.title || '测试标题'
const content = params.content || '测试正文内容。'
const coverPath = params.coverPath || ''
const firstPublish = params.firstPublish === 'true'

// 1. 导航
await page.navigate('https://mp.toutiao.com/profile_v4/graphic/publish')
await page.wait(1500)

// 2. 输入标题
await page.input('textarea', title)
await page.wait(1000)

// 3. 输入正文
await page.input('.ProseMirror', content)
await page.wait(1000)

// 4. 封面
if (coverPath) {
	await page.click('.article-cover-add')
	await page.wait(1500)
	await page.uploadFile('.byte-btn-size-huge', coverPath)
	await page.wait(2000)
	await page.click('text:确定')
	await page.wait(1000)
} else {
	await page.click('text:无封面')
	await page.wait(1000)
}

// 5. 头条首发（需正文 ≥ 100 字；必须点 label 内的 input，不能点 label 本身）
if (firstPublish) {
	if (content.length < 100)
		throw new Error('头条首发要求正文不少于100字，当前：' + content.length + '字')
	await page.wait(2000)
	// 必须点 input[type=checkbox] 本身，不能点 label（自定义 checkbox 组件限制）
	await page.eval(
		"document.querySelectorAll('label.checkbot-item input[type=checkbox]')[0]?.click()"
	)
	await page.wait(1500)
}

// 6. 等待 React 更新，检查发布按钮
await page.wait(1000)
const disabled = await page.getAttr('button.byte-btn-primary.publish-btn', 'disabled')
const canPublish = disabled === null

if (DRY_RUN) {
	console.log('[dry-run] 标题:', title)
	console.log('[dry-run] 正文长度:', content.length)
	console.log('[dry-run] 封面:', coverPath || '无封面')
	console.log('[dry-run] 头条首发:', firstPublish)
	console.log('[dry-run] 发布按钮可点击:', canPublish)
	console.log('[dry-run] 跳过发布。传 dryRun=false 执行真实发布。')
} else {
	if (!canPublish) throw new Error('发布按钮不可点击，请检查内容是否符合要求')
	await page.click('button.byte-btn-primary.publish-btn')
	await page.wait(2000)
	console.log('[toutiao] 已点击发布按钮')
	await page.click('text:确认发布')
	await page.wait(2000)
	console.log('[toutiao] 已点击确认发布')
}
