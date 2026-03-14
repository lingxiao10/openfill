import {
	ChevronDown,
	Copy,
	CornerUpLeft,
	Eye,
	EyeOff,
	Loader2,
	Scale,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { DEMO_API_KEY, DEMO_BASE_URL, DEMO_MODEL, isTestingEndpoint } from '@/agent/constants'
import type { ExtConfig, LanguagePreference } from '@/agent/useAgent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Trans } from '@/utils/Trans'

interface ConfigPanelProps {
	config: ExtConfig | null
	onSave: (config: ExtConfig) => Promise<void>
	onClose: () => void
}

export function ConfigPanel({ config, onSave, onClose }: ConfigPanelProps) {
	const [apiKey, setApiKey] = useState(config?.apiKey ?? DEMO_API_KEY)
	const [baseURL, setBaseURL] = useState(config?.baseURL ?? DEMO_BASE_URL)
	const [model, setModel] = useState(config?.model ?? DEMO_MODEL)
	const [language, setLanguage] = useState<LanguagePreference>(config?.language)
	const [maxSteps, setMaxSteps] = useState<number | undefined>(config?.maxSteps)
	const [systemInstruction, setSystemInstruction] = useState(config?.systemInstruction ?? '')
	const [experimentalLlmsTxt, setExperimentalLlmsTxt] = useState(config?.experimentalLlmsTxt ?? false)
	const [showDownloadLogs, setShowDownloadLogs] = useState(config?.showDownloadLogs ?? false)
	const [doubaoApiKey, setDoubaoApiKey] = useState(config?.doubaoApiKey ?? '')
	const [doubaoSearchEndpoint, setDoubaoSearchEndpoint] = useState(config?.doubaoSearchEndpoint ?? 'doubao-seed-1-8-251228')
	const [searchEnabled, setSearchEnabled] = useState(config?.searchEnabled ?? false)
	const [showDoubaoKey, setShowDoubaoKey] = useState(false)
	const [advancedOpen, setAdvancedOpen] = useState(false)
	const [saving, setSaving] = useState(false)
	const [userAuthToken, setUserAuthToken] = useState('')
	const [copied, setCopied] = useState(false)
	const [showToken, setShowToken] = useState(false)
	const [showApiKey, setShowApiKey] = useState(false)
	const [showPrivacy, setShowPrivacy] = useState(false)

	useEffect(() => {
		setApiKey(config?.apiKey ?? DEMO_API_KEY)
		setBaseURL(config?.baseURL ?? DEMO_BASE_URL)
		setModel(config?.model ?? DEMO_MODEL)
		setLanguage(config?.language)
		setMaxSteps(config?.maxSteps)
		setSystemInstruction(config?.systemInstruction ?? '')
		setExperimentalLlmsTxt(config?.experimentalLlmsTxt ?? false)
		setShowDownloadLogs(config?.showDownloadLogs ?? false)
		setDoubaoApiKey(config?.doubaoApiKey ?? '')
		setDoubaoSearchEndpoint(config?.doubaoSearchEndpoint ?? 'doubao-seed-1-8-251228')
		setSearchEnabled(config?.searchEnabled ?? false)
	}, [config])

	useEffect(() => {
		let interval: NodeJS.Timeout | null = null
		const fetchToken = async () => {
			const result = await chrome.storage.local.get('PageAgentExtUserAuthToken')
			const token = result.PageAgentExtUserAuthToken
			if (typeof token === 'string' && token) {
				setUserAuthToken(token)
				if (interval) { clearInterval(interval); interval = null }
			}
		}
		fetchToken()
		interval = setInterval(fetchToken, 1000)
		return () => { if (interval) clearInterval(interval) }
	}, [])

	const handleCopyToken = async () => {
		if (userAuthToken) {
			await navigator.clipboard.writeText(userAuthToken)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}

	const handleSave = async () => {
		setSaving(true)
		try {
			await onSave({
				apiKey, baseURL, model, language,
				maxSteps: maxSteps || undefined,
				systemInstruction: systemInstruction || undefined,
				experimentalLlmsTxt,
				showDownloadLogs,
				doubaoApiKey: doubaoApiKey || undefined,
				doubaoSearchEndpoint: doubaoSearchEndpoint || undefined,
				searchEnabled,
			})
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="flex flex-col gap-4 p-4 relative">
			<div className="flex items-center justify-between">
				<h2 className="text-base font-semibold">{Trans.t('settings')}</h2>
				<Button variant="ghost" size="icon-sm" onClick={onClose} className="absolute top-2 right-3 cursor-pointer">
					<CornerUpLeft className="size-3.5" />
				</Button>
			</div>

			{/* User Auth Token */}
			<div className="flex flex-col gap-1.5 p-3 bg-muted/50 rounded-md border">
				<label className="text-xs font-medium text-muted-foreground">{Trans.t('user_auth_token')}</label>
				<p className="text-[10px] text-muted-foreground mb-1">{Trans.t('user_auth_token_desc')}</p>
				<div className="flex gap-2 items-center">
					<Input
						readOnly
						value={
							userAuthToken
								? showToken
									? userAuthToken
									: `${userAuthToken.slice(0, 4)}${'•'.repeat(userAuthToken.length - 8)}${userAuthToken.slice(-4)}`
								: Trans.t('loading')
						}
						className="text-xs h-8 font-mono bg-background"
					/>
					<Button variant="outline" size="icon" className="h-8 w-8 shrink-0 cursor-pointer" onClick={() => setShowToken(!showToken)} disabled={!userAuthToken}>
						{showToken ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
					</Button>
					<Button variant="outline" size="icon" className="h-8 w-8 shrink-0 cursor-pointer" onClick={handleCopyToken} disabled={!userAuthToken}>
						{copied ? <span>✓</span> : <Copy className="size-3" />}
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-xs text-muted-foreground">{Trans.t('base_url')}</label>
				<Input placeholder="https://api.openai.com/v1" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} className="text-xs h-8" />
			</div>

			{isTestingEndpoint(baseURL) && (
				<div className="p-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 text-[11px] text-muted-foreground leading-relaxed">
					<Scale className="size-3 inline-block mr-1 -mt-0.5 text-amber-600" />
					{Trans.t('testing_api_notice')}
				</div>
			)}

			<div className="flex flex-col gap-1.5">
				<label className="text-xs text-muted-foreground">{Trans.t('model')}</label>
				<Input placeholder="gpt-5.2" value={model} onChange={(e) => setModel(e.target.value)} className="text-xs h-8" />
				<p className="text-[11px] text-amber-600 font-medium">{Trans.t('model_recommend')}</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-xs text-muted-foreground">{Trans.t('api_key')}</label>
				<div className="flex gap-2 items-center">
					<Input type={showApiKey ? 'text' : 'password'} placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="text-xs h-8" />
					<Button variant="outline" size="icon" className="h-8 w-8 shrink-0 cursor-pointer" onClick={() => setShowApiKey(!showApiKey)}>
						{showApiKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
					</Button>
				</div>
			</div>

			<button
				type="button"
				onClick={() => setAdvancedOpen(!advancedOpen)}
				className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer mt-1 font-bold"
			>
				{Trans.t('advanced')}
				<ChevronDown className="size-3 transition-transform" style={{ transform: advancedOpen ? 'rotate(0deg)' : 'rotate(90deg)' }} />
			</button>

			{advancedOpen && (
				<>
					<div className="flex flex-col gap-1.5">
						<label className="text-xs text-muted-foreground">{Trans.t('max_steps')}</label>
						<Input
							type="number" placeholder="40" min={1} max={200}
							value={maxSteps ?? ''}
							onChange={(e) => setMaxSteps(e.target.value ? Number(e.target.value) : undefined)}
							className="text-xs h-8 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<label className="text-xs text-muted-foreground">{Trans.t('system_instruction')}</label>
						<textarea
							placeholder={Trans.t('system_instruction_ph')}
							value={systemInstruction}
							onChange={(e) => setSystemInstruction(e.target.value)}
							rows={3}
							className="text-xs rounded-md border border-input bg-background px-3 py-2 resize-y min-h-[60px]"
						/>
					</div>
					<label className="flex items-center justify-between cursor-pointer">
						<span className="text-xs text-muted-foreground">{Trans.t('experimental_llms_txt')}</span>
						<Switch checked={experimentalLlmsTxt} onCheckedChange={setExperimentalLlmsTxt} />
					</label>
					<label className="flex items-center justify-between cursor-pointer">
						<span className="text-xs text-muted-foreground">{Trans.t('show_download_logs')}</span>
						<Switch checked={showDownloadLogs} onCheckedChange={setShowDownloadLogs} />
					</label>


					{/* Web Search (Doubao) */}
					<div className="mt-2 pt-2 border-t border-border/40">
						<div className="flex items-center justify-between mb-1">
							<span className="text-xs font-medium text-foreground">{Trans.t('search_section')}</span>
							<Switch checked={searchEnabled} onCheckedChange={setSearchEnabled} />
						</div>
						<p className="text-[10px] text-muted-foreground mb-2">{Trans.t('search_desc')}</p>
						<div className="flex flex-col gap-2">
							<div className="flex flex-col gap-1">
								<label className="text-xs text-muted-foreground">{Trans.t('doubao_api_key')}</label>
								<div className="flex gap-2 items-center">
									<Input
										type={showDoubaoKey ? 'text' : 'password'}
										placeholder="..."
										value={doubaoApiKey}
										onChange={(e) => setDoubaoApiKey(e.target.value)}
										className="text-xs h-8"
									/>
									<Button variant="outline" size="icon" className="h-8 w-8 shrink-0 cursor-pointer" onClick={() => setShowDoubaoKey(!showDoubaoKey)}>
										{showDoubaoKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
									</Button>
								</div>
							</div>
							<div className="flex flex-col gap-1">
								<label className="text-xs text-muted-foreground">{Trans.t('doubao_search_endpoint')}</label>
								<Input
									placeholder={Trans.t('doubao_search_endpoint_ph')}
									value={doubaoSearchEndpoint}
									onChange={(e) => setDoubaoSearchEndpoint(e.target.value)}
									className="text-xs h-8"
								/>
							</div>
							<a
								href="https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=model"
								target="_blank"
								rel="noopener noreferrer"
								className="text-[10px] text-primary hover:underline cursor-pointer"
							>
								{Trans.t('doubao_get_key')}
							</a>
						</div>
					</div>
				</>
			)}

			<div className="flex gap-2 mt-2">
				<Button variant="outline" onClick={onClose} className="flex-1 h-8 text-xs cursor-pointer">
					{Trans.t('cancel')}
				</Button>
				<Button onClick={handleSave} disabled={saving} className="flex-1 h-8 text-xs cursor-pointer">
					{saving ? <Loader2 className="size-3 animate-spin" /> : Trans.t('save')}
				</Button>
			</div>

			{/* Footer */}
			<div className="mt-4 mb-4 pt-4 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
				<span>{Trans.t('version')} <span className="font-mono">v{__VERSION__}</span></span>
				<button
					type="button"
					onClick={() => setShowPrivacy(!showPrivacy)}
					className="flex items-center gap-1 hover:text-foreground cursor-pointer"
				>
					{Trans.t('privacy')}
					<ChevronDown className="size-3 transition-transform" style={{ transform: showPrivacy ? 'rotate(0deg)' : 'rotate(90deg)' }} />
				</button>
			</div>

			{showPrivacy && (
				<div className="mb-4 p-3 rounded-md border border-border/50 bg-muted/30 text-[10px] text-muted-foreground leading-relaxed">
					{Trans.t('privacy_text')}
				</div>
			)}

			<div className="text-[10px] text-muted-foreground bg-background fixed bottom-0 w-full flex justify-around">
				<span className="leading-loose">OpenFill Extension</span>
			</div>
		</div>
	)
}
