/**
 * ScriptStore — manages automation scripts on disk.
 *
 * Manifest: data/scripts/manifest.json
 * Script files: data/scripts/{id}.js
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = join(process.cwd(), 'data', 'scripts')
const MANIFEST_FILE = join(DATA_DIR, 'manifest.json')

export interface ScriptMeta {
	id: string
	name: string
	description: string
	entryUrl?: string
	params: string[]
	file: string
	createdAt: string
	updatedAt: string
}

interface Manifest {
	scripts: ScriptMeta[]
}

function ensureDir(): void {
	mkdirSync(DATA_DIR, { recursive: true })
}

function readManifest(): Manifest {
	ensureDir()
	if (!existsSync(MANIFEST_FILE)) return { scripts: [] }
	return JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8')) as Manifest
}

function writeManifest(manifest: Manifest): void {
	ensureDir()
	writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2))
}

export const ScriptStore = {
	list(): ScriptMeta[] {
		return readManifest().scripts
	},

	get(id: string): ScriptMeta | null {
		return readManifest().scripts.find((s) => s.id === id) ?? null
	},

	getCode(id: string): string | null {
		const meta = ScriptStore.get(id)
		if (!meta) return null
		const file = join(DATA_DIR, meta.file)
		if (!existsSync(file)) return null
		return readFileSync(file, 'utf-8')
	},

	save(
		meta: Omit<ScriptMeta, 'file' | 'createdAt' | 'updatedAt'>,
		code: string,
	): ScriptMeta {
		ensureDir()
		const now = new Date().toISOString()
		const manifest = readManifest()
		const existing = manifest.scripts.find((s) => s.id === meta.id)
		const file = `${meta.id}.js`
		writeFileSync(join(DATA_DIR, file), code, 'utf-8')

		const entry: ScriptMeta = {
			...meta,
			file,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
		}

		if (existing) {
			Object.assign(existing, entry)
		} else {
			manifest.scripts.unshift(entry)
		}
		writeManifest(manifest)
		return entry
	},

	delete(id: string): boolean {
		const manifest = readManifest()
		const idx = manifest.scripts.findIndex((s) => s.id === id)
		if (idx === -1) return false
		const entry = manifest.scripts[idx]
		const file = join(DATA_DIR, entry.file)
		if (existsSync(file)) unlinkSync(file)
		manifest.scripts.splice(idx, 1)
		writeManifest(manifest)
		return true
	},

	dataDir(): string {
		return DATA_DIR
	},
}
