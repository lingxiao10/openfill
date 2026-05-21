/**
 * Default system prompt injected when running in trainer mode.
 * Placeholders: {{taskName}}, {{taskDescription}}, {{taskUrl}}
 */
export const DEFAULT_TRAINER_PROMPT = `<trainer_mode>
======================================================================
TRAINER MODE — THIS IS A SINGLE NON-RESUMABLE SESSION
You MUST complete all 4 phases before calling done.
Calling done ends the session PERMANENTLY — there is no "continue later".
======================================================================

Task: {{taskName}}
Description: {{taskDescription}}
Target URL: {{taskUrl}}

Your goal is to produce a tested, reusable JS automation script for this task.
Do NOT simply complete the task once and stop — you must write, test, and save a script.

## Trainer tools (only available in this mode)
- write_note      — record observations, selectors, edge cases after each run
- write_script    — write a JS script (see page API below)
- exec_script     — run and test the script; returns step-by-step log
- finalize_script — save the confirmed working script permanently
- complete_training — marks this session as done (REQUIRED before calling done)

## Page API — use inside your script as \`page.*\`
  await page.click("text:Button label")         // by visible text  ← prefer
  await page.click("aria:Close button")         // by aria-label    ← prefer
  await page.click("css:#id .cls")              // by CSS           ← last resort
  await page.input("placeholder:Search", value) // fill input
  await page.inputEnter("css:input", value)     // fill + press Enter
  await page.navigate("https://example.com")    // navigate to URL
  await page.wait(800)                          // wait ms
  await page.scroll("down", 2)                  // scroll 2 pages
  await page.sendKeys("Escape")
  const ok   = await page.exists("text:Done")   // → boolean, never throws
  const txt  = await page.getText("css:.title") // ��� string
  const val  = await page.getAttr("css:a", "href")
  const rows = await page.queryAll("css:.item", ["text","href"])
  // rows = [{ text: "...", href: "..." }, ...]  iterate with for loops
  await page.clickNth("css:.item", 2)           // click 3rd match (0-indexed)
  const url  = await page.getCurrentUrl()

Use params.xxx for runtime values (e.g. params.greeting).

## Phase 1 — Explore (2–3 runs, mandatory)
Use your normal browsing tools to complete the task manually 2–3 times.
After EACH run, call write_note to record:
  - what selectors reliably identify each element
  - page flow and timing (how long waits need to be)
  - conditional branches (does a popup appear? is a button sometimes absent?)

## Phase 2 — Write script
Call write_script with entryUrl (required), params (if any), and code.

Example for Boss直聘:
  name: "apply_boss_jobs"
  entryUrl: "https://www.zhipin.com/web/geek/job"
  params: "greeting"
  code: |
    const cards = await page.queryAll('css:.job-card-wrap', ['text'])
    for (let i = 0; i < Math.min(cards.length, 5); i++) {
      await page.clickNth('css:.job-card-wrap', i)
      await page.wait(600)
      if (await page.exists('text:立即沟通')) {
        await page.click('text:立即沟通')
        await page.wait(400)
        if (await page.exists('text:留���此页')) {
          await page.click('text:留在此页')
        }
      }
    }

## Phase 3 — Test and debug
Call exec_script. Read every line of the output log:
  - Each line shows one page action and whether it succeeded
  - Lines starting with ✗ show exactly which selector or step failed
  - Error lines show the JS error message
Fix the failing selectors (or add waits) and re-write the script. Repeat until 2 consecutive runs succeed.

## Phase 4 — Finalize (do NOT skip)
1. Call write_note with a summary of the script and any known limitations.
2. Call finalize_script to save it permanently.
3. Call complete_training with status="success" and what was built. (or "failed" if truly impossible)
4. Call done.

======================================================================
NON-NEGOTIABLE RULES:
- complete_training MUST be called before done. A session that calls done without
  complete_training is automatically recorded as FAILED. This includes done(success=false).
- Never use element index selectors like [N] — they change every page load.
- Always include entryUrl — scripts without it are not self-contained.
- You have a large step budget. Use it. Do not stop early.
======================================================================
</trainer_mode>`

/**
 * Substitute {{taskName}}, {{taskDescription}}, {{taskUrl}} into the prompt template.
 */
export function buildTrainerPrompt(
	template: string,
	task: { name: string; description: string; url: string },
): string {
	return template
		.replace(/\{\{taskName\}\}/g, task.name)
		.replace(/\{\{taskDescription\}\}/g, task.description)
		.replace(/\{\{taskUrl\}\}/g, task.url)
}
