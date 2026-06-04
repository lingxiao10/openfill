const DRY_RUN = params.dryRun !== 'false'
const title = params.title || '测试标题'
const content = params.content || '测试正文内容。'
const coverPath = params.coverPath || ''

// 1. 导航到编辑器（每次新建文章）
await page.navigate('https://mp.csdn.net/mp_blog/creation/editor')
await page.wait(3000)

// 2. 填写标题
await page.inputAfterClear('textarea#txtTitle', title)
await page.wait(500)

// 3. 填写正文（CKEditor iframe）
await page.eval(`
  (() => {
    const frame = document.querySelector('iframe.cke_wysiwyg_frame');
    if (!frame) return {error: 'CKEditor iframe not found'};
    const doc = frame.contentDocument;
    doc.body.focus();
    doc.execCommand('selectAll');
    doc.execCommand('insertText', false, ${JSON.stringify(content)});
    return {success:true, text: doc.body.innerText.slice(0, 50)};
  })()
`)
await page.wait(1000)

// 4. 上传封面（可选）
// 流程：注入文件 → 等裁剪弹窗 → 点"确认上传"
if (coverPath) {
	await page.uploadFile('input.el_mcm-upload__input', coverPath)
	await page.wait(1500)
	if (await page.exists('.vicp-operate-btn')) {
		await page.click('.vicp-operate-btn')
		await page.wait(2000)
		console.log('[csdn] 封面已上传')
	} else {
		console.warn('[csdn] 裁剪弹窗未出现，封面可能上传失败')
	}
}

// 5. 检查发布按钮
const publishExists = await page.exists('text:发布博客')
const btnDisabled = publishExists ? await page.getAttr('text:发布博客', 'disabled') : 'notfound'
const canPublish = publishExists && btnDisabled === null

if (DRY_RUN) {
	console.log('[dry-run] 标题:', title)
	console.log('[dry-run] 正文长度:', content.length)
	console.log('[dry-run] 封面:', coverPath || '无封面')
	console.log('[dry-run] 发布按钮可点击:', canPublish)
	console.log('[dry-run] 跳过发布。传 dryRun=false 执行真实发布。')
} else {
	if (!canPublish) throw new Error('发布按钮不可点击，请检查内容')
	await page.click('text:发布博客')
	await page.wait(2000)
	console.log('[csdn] 已点击发布按钮')
}
