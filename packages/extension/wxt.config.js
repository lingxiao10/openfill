import tailwindcss from '@tailwindcss/vite'
import { mkdirSync, readFileSync } from 'node:fs'
import { defineConfig } from 'wxt'

const chromeProfile = '.wxt/chrome-data'
mkdirSync(chromeProfile, { recursive: true })

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

const isDebuggerMode = process.env.BUILD_MODE === 'debugger'
console.log(`[wxt] BUILD_MODE=${process.env.BUILD_MODE ?? 'standard'} → debugger=${isDebuggerMode}`)

// See https://wxt.dev/api/config.html
export default defineConfig({
	srcDir: 'src',
	modules: ['@wxt-dev/module-react'],
	webExt: {
		chromiumProfile: chromeProfile,
		keepProfileChanges: true,
		chromiumArgs: ['--hide-crash-restore-bubble'],
	},
	vite: () => ({
		plugins: [tailwindcss()],
		define: {
			__VERSION__: JSON.stringify(pkg.version),
			__DEBUGGER_MODE__: JSON.stringify(isDebuggerMode),
		},
		optimizeDeps: {
			force: true,
		},
		build: {
			minify: false,
			chunkSizeWarningLimit: 2000,
			cssCodeSplit: true,
			rollupOptions: {
				onwarn: function (message, handler) {
					if (message.code === 'EVAL') return
					handler(message)
				},
			},
		},
	}),
	outDir: isDebuggerMode ? '.output/chrome-mv3-debugger' : '.output/chrome-mv3',
	zip: {
		artifactTemplate: isDebuggerMode
			? 'openfill-ext-{{version}}-{{browser}}-debugger.zip'
			: 'openfill-ext-{{version}}-{{browser}}.zip',
	},
	manifest: {
		key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoI5eUxE3xj9/M94eZnm02LmyIVFGUtovINw1bfAQdnbKrF1q3nRIneFZ9FnsM6RIGzXYjeF9jJBvxnLYqyz7LoC4qcGFP0oLD/m8bZXlIyH5fnszKhLIblwNSG0TgfaGrXxm/RaKaa1tjmkVerWVAt6l+p9gT5j95vpMlj8HKJZyF2ZvYqe6sogc8z0IJIgS40sjoOb3xcA7UOw6qIqd3ho6zh+nHaTXRCPboMANfBHzulRuk1tTqiSNQdwPHUylBKVyqCxmp6A9yGnMMylO0h1ix32xiL5hhmHcdrgF+J3Xc7MXeD0G2iYp+3yRrkRFDZVG9XeTO9nJ0HAFypVirwIDAQAB',
		default_locale: 'en',
		name: '__MSG_extName__',
		description: '__MSG_extDescription__',
		permissions: ['tabs', 'tabGroups', 'sidePanel', 'storage', ...(isDebuggerMode ? ['debugger'] : [])],
		host_permissions: ['<all_urls>'],
		icons: {
			16: 'assets/icon-16.png',
			32: 'assets/icon-32.png',
			48: 'assets/icon-48.png',
			128: 'assets/icon-128.png',
		},
		action: {
			default_title: '__MSG_extActionTitle__',
		},
		web_accessible_resources: [
			{
				resources: ['main-world.js'],
				matches: ['*://*/*'],
			},
		],
		side_panel: {
			default_path: 'sidepanel/index.html',
		},
	},
})
