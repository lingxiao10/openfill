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
		disabled: process.env.WXT_HEADLESS === '1',
		chromiumProfile: chromeProfile,
		keepProfileChanges: true,
		chromiumArgs: ['--hide-crash-restore-bubble'],
	},
	dev: {
		server: {
			host: '127.0.0.1',
			origin: '127.0.0.1',
		},
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
		default_locale: 'en',
		name: '__MSG_extName__',
		description: '__MSG_extDescription__',
		permissions: ['tabs', 'tabGroups', 'sidePanel', 'storage', 'scripting', 'debugger'],
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
		content_security_policy: {
			extension_pages:
				"script-src 'self'; object-src 'self'; connect-src 'self' https://* http://localhost:3000 ws://localhost:3000 http://127.0.0.1:3000 ws://127.0.0.1:3000 http://localhost:3002 ws://localhost:3002 http://127.0.0.1:3002 ws://127.0.0.1:3002",
		},
	},
})
