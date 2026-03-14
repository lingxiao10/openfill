/**
 * SecretConfig — browser-compatible stub.
 *
 * In Node.js test environments the doubao/test.ts imports this directly.
 * In the browser (extension) DoubaoConfig.setApiKey() is used instead,
 * so getDoubao() is never reached at runtime.
 */

export interface SecretDoubaoConfig {
	api_key?: string
}

export class SecretConfig {
	static getDoubao(): SecretDoubaoConfig {
		return {}
	}
}
