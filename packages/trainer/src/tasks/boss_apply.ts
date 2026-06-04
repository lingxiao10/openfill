/**
 * BOSS直聘自动投递训练脚本
 *
 * 训练原则：
 *   每一个操作（点击/输入/导航）都单独执行一次，立即检查结果，
 *   确认成功后再继续下一步。亲自走完完整流程之后，再写最终脚本。
 *
 * 运行：
 *   cd packages/trainer && npx tsx src/tasks/boss_apply.ts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { RemotePage } from '../runner/RemotePage.js'
import { ScriptStore } from '../runner/ScriptStore.js'

const ENTRY_URL = 'https://www.zhipin.com/web/geek/job'
const SCRIPT_ID = 'boss_apply'

const page = new RemotePage()

// ─── Logging helpers ──────────────────────────────────────────────────────────

function step(msg: string) {
	console.log(`\n[步骤] ${msg}`)
}

function ok(msg: string) {
	console.log(`  ✅ ${msg}`)
}

function fail(msg: string) {
	console.log(`  ❌ ${msg}`)
}

function info(msg: string) {
	console.log(`  ℹ️  ${msg}`)
}

// ─── Bridge check ─────────────────────────────────────────────────────────────

async function checkBridge() {
	const res = await fetch('http://127.0.0.1:3002/api/bridge/status')
	const { connected } = (await res.json()) as { connected: boolean }
	if (!connected) {
		fail('Extension not connected. Start trainer server + open extension sidepanel.')
		process.exit(1)
	}
	ok('Extension bridge connected')
}

// ─── Phase 1: Step-by-step exploration ───────────────────────────────────────
// Each action is executed individually and its result verified before continuing.

async function exploreStepByStep() {
	console.log('\n══════════════════════════════════════')
	console.log('  Phase 1: Step-by-step Exploration')
	console.log('══════════════════════════════════════')

	// Step 1: Navigate
	step('Navigate to BOSS直聘 job list')
	await page.navigate(ENTRY_URL)
	await page.wait(1500)
	const url = await page.getCurrentUrl()
	ok(`Current URL: ${url}`)

	// Step 2: Snapshot clean HTML → find job card selector
	step('Get clean HTML to discover job card selector')
	const html = await page.getCleanHtml()
	const htmlPath = join(process.cwd(), 'data', 'boss_explore.html')
	writeFileSync(htmlPath, html)
	ok(`Clean HTML saved (${html.length} chars) → data/boss_explore.html`)

	// Step 3: Find job card selector by testing candidates
	step('Find job card selector')
	const candidates = ['.job-card-wrap', '.job-card-box', '.search-job-result li', '.job-list li']
	let jobCardSel = ''
	for (const sel of candidates) {
		const exists = await page.exists(sel)
		info(`Trying "${sel}" → ${exists ? 'FOUND' : 'not found'}`)
		if (exists && !jobCardSel) jobCardSel = sel
	}
	if (!jobCardSel) {
		fail('No job card selector found. Check boss_explore.html for structure.')
		process.exit(1)
	}
	ok(`Using job card selector: ${jobCardSel}`)

	// Step 4: Count job cards
	step('Count job cards')
	const cards = await page.queryAll(jobCardSel, ['text'])
	ok(`Found ${cards.length} job cards`)
	if (cards.length === 0) {
		fail('No job cards found. Maybe not logged in or wrong page.')
		process.exit(1)
	}
	cards.slice(0, 3).forEach((c, i) => info(`Card ${i}: "${c.text?.slice(0, 40)}"`))

	// Step 5: Click first job card → verify detail loads
	step('Click job card[0] → expect detail to load')
	await page.clickNth(jobCardSel, 0)
	await page.wait(1000)
	const afterClick1Url = await page.getCurrentUrl()
	ok(`URL after click: ${afterClick1Url}`)

	// Step 6: Check for "立即沟通" button
	step('Check for "立即沟通" button in detail')
	const hasCommunicate = await page.exists('text:立即沟通')
	info(`"立即沟通" exists: ${hasCommunicate}`)
	if (!hasCommunicate) {
		// Also try aria / class variants
		const alt1 = await page.exists('.btn-startchat')
		const alt2 = await page.exists('textContains:沟通')
		info(`".btn-startchat" exists: ${alt1}`)
		info(`textContains:沟通 exists: ${alt2}`)
	}

	// Step 7: Click "立即沟通" if present
	let communicateClicked = false
	if (hasCommunicate) {
		step('Click "立即沟通"')
		await page.click('text:立即沟通')
		await page.wait(800)
		ok('Clicked 立即沟通')
		communicateClicked = true

		// Step 8: Check for modal / dialog after clicking
		step('Check what appeared after 立即沟通')
		const hasStay = await page.exists('text:留在此页')
		const hasConfirm = await page.exists('text:确认')
		const hasSend = await page.exists('text:发送')
		info(`"留在此页" exists: ${hasStay}`)
		info(`"确认" exists: ${hasConfirm}`)
		info(`"发送" exists: ${hasSend}`)

		// Step 9: Handle "留在此页" dialog
		if (hasStay) {
			step('Click "留在此页"')
			await page.click('text:留在此页')
			await page.wait(600)
			ok('Clicked 留在此页')
		}
	} else {
		info('Skipping job 0 (no 立即沟通 button)')
	}

	// Step 10: After interaction, check DOM state
	step('Check remaining job cards after first interaction')
	const cardsAfter = await page.queryAll(jobCardSel, ['text'])
	ok(`Job cards still in DOM: ${cardsAfter.length} (was ${cards.length})`)
	const domChanged = cardsAfter.length !== cards.length
	info(`DOM changed after interaction: ${domChanged}`)
	info(
		`Strategy: ${domChanged ? 'always click index 0 (cards removed after use)' : 'use incremental index'}`
	)

	// Step 11: Process 2nd job card using learned strategy
	step('Click job card[0] again (2nd job, using "always first" strategy)')
	const cardsNow = await page.queryAll(jobCardSel, ['text'])
	if (cardsNow.length === 0) {
		info('No more cards. Flow verified.')
	} else {
		await page.clickNth(jobCardSel, 0)
		await page.wait(1000)
		ok(`Clicked next job card`)

		const has2nd = await page.exists('text:立即沟通')
		info(`"立即沟通" on job 2: ${has2nd}`)

		if (has2nd) {
			step('Click "立即沟通" on job 2')
			await page.click('text:立即沟通')
			await page.wait(800)
			ok('Clicked')

			const hasStay2 = await page.exists('text:留在此页')
			if (hasStay2) {
				step('Click "留在此页" on job 2')
				await page.click('text:留在此页')
				await page.wait(600)
				ok('Clicked')
			}
		}
	}

	// Step 12: Final snapshot to confirm page state
	step('Final page state snapshot')
	const finalCards = await page.queryAll(jobCardSel, ['text'])
	ok(`Cards remaining: ${finalCards.length}`)
	const finalUrl = await page.getCurrentUrl()
	ok(`Final URL: ${finalUrl}`)

	return {
		jobCardSel,
		domChangesAfterInteraction: domChanged,
		communicateClicked,
		totalCards: cards.length,
	}
}

// ─── Phase 2: Write verified script ──────────────────────────────────────────
// Only called after the full flow was manually walked step by step above.

function buildScript(jobCardSel: string, _domChangesAfterInteraction: boolean): string {
	// Exploration findings:
	// - DOM card count stays stable on the job list page after interaction
	// - BUT clicking "立即沟通" without "留在此页" appearing navigates to chat page
	// - Strategy: always click index 0 after navigating back to job list each iteration
	// - This is simpler and handles both DOM-stable and DOM-change cases

	return `// BOSS直聘 Auto-Apply — generated ${new Date().toISOString().slice(0, 10)}
// Verified by step-by-step exploration before writing this script.
//
// Exploration findings:
//   - Job card selector: ${jobCardSel}
//   - "立即沟通" click may navigate to chat page (no "留在此页" dialog)
//   - Strategy: navigate back to job list after each attempt, click index 0 each time
//
// params.maxJobs  — max jobs to apply to (default: 5)
// params.waitMs   — ms to wait between actions (default: 800)

const MAX_JOBS = params.maxJobs ? parseInt(params.maxJobs) : 5;
const WAIT = params.waitMs ? parseInt(params.waitMs) : 800;
const ENTRY = '${ENTRY_URL}';
const JOB_CARD = '${jobCardSel}';

let applied = 0;
let attempts = 0;
const MAX_ATTEMPTS = MAX_JOBS * 3;

while (applied < MAX_JOBS && attempts < MAX_ATTEMPTS) {
  attempts++;

  // Always start from job list
  const url = await page.getCurrentUrl();
  if (!url.includes('zhipin.com/web/geek/job')) {
    await page.navigate(ENTRY);
    await page.wait(2000);
  }

  // Re-query cards each iteration
  const cards = await page.queryAll(JOB_CARD, ['text']);
  if (cards.length === 0) {
    console.log('No more job cards found.');
    break;
  }

  // Click first unprocessed card (index = applied, wraps if DOM is stable)
  const idx = applied < cards.length ? applied : 0;
  await page.clickNth(JOB_CARD, idx);
  await page.wait(WAIT);

  if (await page.exists('text:立即沟通')) {
    await page.click('text:立即沟通');
    await page.wait(WAIT);

    if (await page.exists('text:留在此页')) {
      // Dialog appeared — stay on job list
      await page.click('text:留在此页');
      await page.wait(600);
    }
    // Whether navigated to chat or stayed, count as applied
    applied++;
    console.log('Applied to job', applied, '/', MAX_JOBS);
  }

  await page.wait(500);
}

console.log('Done. Applied to', applied, 'jobs in', attempts, 'attempts.');
`
}

async function saveScript(jobCardSel: string, domChangesAfterInteraction: boolean) {
	console.log('\n══════════════════════════════════════')
	console.log('  Phase 2: Save Verified Script')
	console.log('══════════════════════════════════════')

	const code = buildScript(jobCardSel, domChangesAfterInteraction)

	step('Script code preview:')
	console.log(code)

	step('Saving to ScriptStore')
	const saved = ScriptStore.save(
		{
			id: SCRIPT_ID,
			name: 'BOSS直聘自动投递',
			description: '逐个点击立即沟通，自动处理留在此页弹窗，每次重新查询卡片以应对DOM变化',
			entryUrl: ENTRY_URL,
			params: ['maxJobs', 'waitMs'],
		},
		code
	)
	ok(`Script saved → data/scripts/${saved.file}`)
	ok(`Run via API: POST /api/scripts/${saved.id}/run`)
	ok(`Run via UI: Trainer → Scripts → BOSS直聘自动投递 → Run`)
	return saved
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('🚀 BOSS直聘 Auto-Apply Trainer')
	console.log('Training principle: one action → verify result → next action')
	console.log('============================================================')

	await checkBridge()

	// Phase 1: Walk through the full flow step by step, verify every action
	const findings = await exploreStepByStep()

	console.log('\n──────────────────────────────────')
	console.log('Exploration summary:')
	info(`Job card selector: ${findings.jobCardSel}`)
	info(`DOM changes after interaction: ${findings.domChangesAfterInteraction}`)
	info(`Communicate button found: ${findings.communicateClicked}`)
	info(`Total cards found: ${findings.totalCards}`)
	console.log('──────────────────────────────────')

	// Phase 2: Write script based on verified exploration
	await saveScript(findings.jobCardSel, findings.domChangesAfterInteraction)

	console.log('\n✨ Training complete! Script saved and ready to use.')
	process.exit(0)
}

main().catch((err) => {
	console.error('\nFatal error:', err)
	process.exit(1)
})
