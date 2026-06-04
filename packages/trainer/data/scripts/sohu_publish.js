const DRY_RUN = params.dryRun !== 'false'
const title = params.title || '测试标题'
const content = params.content || '测试正文内容。'
const coverPath = params.coverPath || ''

// 1. 导航到新建文章编辑器（直达 URL，无需点击导航按钮）
await page.navigate('https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle?contentStatus=1')
await page.wait(2000)

// 2. 填写标题（普通 input）
await page.inputAfterClear('input[placeholder="请输入标题（5-72字）"]', title)
await page.wait(500)

// 3. 填写正文（Quill contenteditable）
await page.inputAfterClear('div.ql-editor', content)
await page.wait(1000)

// 4. 上传封面（可选）
// 流程：点击上传区打开弹窗 → 注入文件（AJAX 上传）→ 切到"本地上传"标签 → 确认
if (coverPath) {
	await page.click('.upload-file.mp-upload')
	await page.wait(500)
	await page.uploadFile('.upload-button input[type=file]', coverPath)
	await page.wait(2000)
	// 切换到"本地上传"标签
	await page.eval("document.querySelectorAll('.dialog-title h3')[1].click()")
	await page.wait(500)
	// 点确定（p.button.positive-button 是激活状态的确认按钮）
	await page.click('p.button.positive-button')
	await page.wait(3000)
	console.log('[sohu] 封面已上传')
}

// 5. 检查发布按钮（li.publish-report-btn.active）
const canPublish = await page.exists('li.publish-report-btn.active')

if (DRY_RUN) {
	console.log('[dry-run] 标题:', title)
	console.log('[dry-run] 正文长度:', content.length)
	console.log('[dry-run] 封面:', coverPath || '无封面')
	console.log('[dry-run] 发布按钮存在:', canPublish)
	console.log('[dry-run] 跳过发布。传 dryRun=false 执行真实发布。')
} else {
	if (!canPublish) throw new Error('发布按钮不可用，请检查内容')
	await page.click('li.publish-report-btn.active')
	await page.wait(2000)
	console.log('[sohu] 已点击发布按钮')
}
