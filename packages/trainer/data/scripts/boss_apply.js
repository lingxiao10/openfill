// BOSS直聘 Auto-Apply — generated 2026-05-21
// Manually explored step-by-step before writing this script.
//
// Exploration findings:
//   - Job card selector: .job-card-wrap (each has a unique a[href] as job ID)
//   - Detail panel: .job-detail-box (loads ~1s after clicking card)
//   - Apply button: .op-btn-chat (always shows 立即沟通, even after applying)
//   - After clicking 立即沟通, two possible outcomes:
//     a) .greet-boss-dialog appears → click .cancel-btn (留在此页) to stay on list
//     b) Page navigates to /web/geek/chat → navigate back to job list
//   - Cards with href IDs can be used to skip already-applied jobs
//
// params.maxJobs  — max jobs to apply to (default: 5)
// params.waitMs   — ms to wait between actions (default: 1000)

const MAX_JOBS = params.maxJobs ? parseInt(params.maxJobs) : 5
const WAIT = params.waitMs ? parseInt(params.waitMs) : 1000
const ENTRY = 'https://www.zhipin.com/web/geek/jobs'
const CARD = '.job-card-wrap'

let applied = 0
const appliedHrefs = new Set()

while (applied < MAX_JOBS) {
	// Ensure we're on the job list page
	const url = await page.getCurrentUrl()
	if (!url.includes('/web/geek/job')) {
		await page.navigate(ENTRY)
		await page.wait(2000)
	}

	// Get all cards with their unique hrefs
	const cards = await page.queryAll(CARD + ' a[href]', ['href', 'text'])
	if (cards.length === 0) {
		console.log('No more job cards found.')
		break
	}

	// Find first card not yet applied to
	const next = cards.find((c) => c.href && !appliedHrefs.has(c.href))
	if (!next) {
		console.log('All visible jobs already applied to.')
		break
	}

	// Click the card (find its index among all cards)
	const allCards = await page.queryAll(CARD + ' a[href]', ['href'])
	const idx = allCards.findIndex((c) => c.href === next.href)
	if (idx === -1) continue

	await page.clickNth(CARD, idx)
	await page.wait(WAIT)

	// Check detail panel loaded
	if (!(await page.exists('.job-detail-box'))) {
		console.log('Detail panel not loaded for card', idx, '— skipping')
		appliedHrefs.add(next.href)
		continue
	}

	// Check apply button
	if (!(await page.exists('.op-btn-chat'))) {
		console.log('No apply button for card', idx, '— skipping')
		appliedHrefs.add(next.href)
		continue
	}

	await page.click('.op-btn-chat')
	await page.wait(WAIT)

	// Handle outcome: dialog or navigation
	if (await page.exists('.greet-boss-dialog')) {
		// Dialog appeared — click 留在此页 to stay on job list
		await page.click('.greet-boss-dialog .cancel-btn')
		await page.wait(600)
	}
	// Whether dialog or redirect to chat, count as applied

	appliedHrefs.add(next.href)
	applied++
	console.log('Applied to job', applied, '/', MAX_JOBS, '—', next.text?.slice(0, 30))

	await page.wait(500)
}

console.log('Done. Applied to', applied, 'jobs.')
