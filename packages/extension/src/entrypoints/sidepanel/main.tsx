import React from 'react'
import ReactDOM from 'react-dom/client'

import { logStartupError } from '@/lib/startupLog'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

import '@/assets/index.css'

// Capture global JS errors
window.addEventListener('error', (e) => {
	logStartupError({
		type: 'error',
		message: e.message || 'Unknown error',
		stack: e.error?.stack,
		detail: { filename: e.filename, lineno: e.lineno, colno: e.colno },
	})
})

// Capture unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
	logStartupError({
		type: 'unhandledrejection',
		message: String(e.reason?.message ?? e.reason ?? 'Unhandled rejection'),
		stack: e.reason?.stack,
	})
})

// Sync dark mode with system preference
const syncDarkMode = () => {
	document.documentElement.classList.toggle(
		'dark',
		matchMedia('(prefers-color-scheme: dark)').matches
	)
}
syncDarkMode()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncDarkMode)

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	</React.StrictMode>
)
