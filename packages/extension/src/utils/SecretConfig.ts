/**
 * SecretConfig — browser extension version.
 * Reads secrets from Vite build-time env vars (injected from .env, gitignored).
 *
 * .env              ← gitignored, real values
 * .env.example      ← committed, empty template
 */
export class SecretConfig {
	static getDoubao(): { api_key: string } {
		return {
			api_key: import.meta.env.VITE_DOUBAO_API_KEY ?? '',
		}
	}
}
