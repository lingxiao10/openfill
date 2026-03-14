/**
 * SecretConfig — Node.js only. THE single reader for secret_json.json.
 * Used by test scripts only. Never import this in browser extension code.
 *
 * Load order: secret_json.json → secret_json_default.json → {}
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface SecretDoubaoConfig {
  api_key?: string
}

interface SecretJson {
  doubao?: SecretDoubaoConfig
}

let _cache: SecretJson | null = null

function loadOnce(): SecretJson {
  if (_cache !== null) return _cache

  const secretPath  = path.join(__dirname, 'secret_json.json')
  const defaultPath = path.join(__dirname, 'secret_json_default.json')

  try {
    if (fs.existsSync(secretPath))  { _cache = JSON.parse(fs.readFileSync(secretPath,  'utf-8')); return _cache! }
    if (fs.existsSync(defaultPath)) { _cache = JSON.parse(fs.readFileSync(defaultPath, 'utf-8')); return _cache! }
  } catch (err) {
    console.error('[SecretConfig] Failed to load config:', err)
  }

  _cache = {}
  return _cache
}

export class SecretConfig {
  static getDoubao(): SecretDoubaoConfig {
    return loadOnce().doubao ?? {}
  }

  static reload(): void {
    _cache = null
    loadOnce()
  }
}
