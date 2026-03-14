/**
 * DoubaoConfig — configuration manager for the Volcano Engine ARK (Doubao) client.
 *
 * By default reads the API key from backend/config/secret_json.json via SecretConfig.
 * Can also be configured programmatically with setApiKey() for portability
 * (useful when embedding this module in other projects without secret_json.json).
 *
 * Usage:
 *   // Option A: reads from secret_json.json automatically
 *   DoubaoClient.chat('hello');
 *
 *   // Option B: inject key directly (portable, no file dependency)
 *   DoubaoConfig.setApiKey('your-ark-api-key');
 *   DoubaoClient.chat('hello');
 */

import { SecretConfig } from '../../config/SecretConfig';
import type { DoubaoModel } from './DoubaoTypes';

export const DOUBAO_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

/** Default model — balanced reasoning and speed */
export const DOUBAO_DEFAULT_MODEL: DoubaoModel = 'doubao-seed-1-8-251228';

/** All available models */
export const DOUBAO_MODELS: DoubaoModel[] = [
  'doubao-seed-1-8-251228',
  'doubao-seed-2-0-pro-260215',
  'doubao-seed-2-0-lite-260215',
  'doubao-seed-2-0-mini-260215',
  'doubao-seed-2-0-code-preview-260215',
];

/**
 * Models where temperature and top_p are fixed by the server.
 * Passing custom values for these models is silently ignored by the API.
 */
export const DOUBAO_FIXED_SAMPLING_MODELS: DoubaoModel[] = [
  'doubao-seed-2-0-pro-260215',
  'doubao-seed-2-0-lite-260215',
];

// ─── DoubaoConfig ─────────────────────────────────────────────────────────────

let _apiKeyOverride: string | null = null;

export class DoubaoConfig {
  /**
   * Override the API key programmatically.
   * When set, secret_json.json is not read for the API key.
   */
  static setApiKey(key: string): void {
    _apiKeyOverride = key;
  }

  /**
   * Returns the ARK API key.
   * Priority: programmatic override → secret_json.json → throws
   */
  static getApiKey(): string {
    if (_apiKeyOverride) return _apiKeyOverride;
    const key = SecretConfig.getDoubao().api_key;
    if (!key) throw new Error(
      '[DoubaoConfig] Missing api key. ' +
      'Set doubao.api_key in secret_json.json or call DoubaoConfig.setApiKey().'
    );
    return key;
  }

  static getBaseUrl():     string       { return DOUBAO_BASE_URL; }
  static getDefaultModel(): DoubaoModel { return DOUBAO_DEFAULT_MODEL; }
  static getModels():      DoubaoModel[] { return [...DOUBAO_MODELS]; }

  /** True if temperature/top_p are locked for the given model */
  static isFixedSampling(model: DoubaoModel): boolean {
    return DOUBAO_FIXED_SAMPLING_MODELS.includes(model);
  }
}
