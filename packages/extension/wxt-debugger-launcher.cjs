// Launcher for WXT dev server in debugger mode — used by PM2
process.env.BUILD_MODE = 'debugger'
process.env.WXT_HEADLESS = '1'
import('../../node_modules/wxt/bin/wxt.mjs').catch((e) => {
	console.error('[wxt-debugger-launcher] Failed to start:', e)
	process.exit(1)
})
