// End-to-End Encryption utilities using @chatereum/react-e2ee
// Import E2EE only on client side to avoid SSR issues
let E2EE: any;
if (typeof window !== 'undefined') {
	E2EE = (await import('@chatereum/react-e2ee')).default;
}

const PRIVATE_KEY_STORAGE_KEY = 'e2ee_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'e2ee_public_key';

export interface KeyPair {
	private_key: string;
	public_key: string;
}

export interface EncryptedMessage {
	cipher_text: string;
	aes_key: string;
	iv: string;
}

/**
 * Generate a new RSA key pair for E2E encryption
 */
export async function generateKeyPair(): Promise<KeyPair> {
	if (!E2EE) {
		throw new Error('E2EE library not available (client-side only)');
	}
	const keys = await E2EE.getKeys();
	return keys;
}

/**
 * Store the private key in browser storage (localStorage)
 * WARNING: Private key should NEVER be sent to the server!
 */
export function storePrivateKey(privateKey: string): void {
	if (typeof window !== 'undefined') {
		localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privateKey);
	}
}

/**
 * Get the stored private key from browser storage
 */
export function getStoredPrivateKey(): string | null {
	if (typeof window !== 'undefined') {
		return localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
	}
	return null;
}

/**
 * Store the public key in browser storage (for convenience)
 */
export function storePublicKey(publicKey: string): void {
	if (typeof window !== 'undefined') {
		localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKey);
	}
}

/**
 * Get the stored public key from browser storage
 */
export function getStoredPublicKey(): string | null {
	if (typeof window !== 'undefined') {
		return localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
	}
	return null;
}

/**
 * Check if user has encryption keys set up
 */
export function hasEncryptionKeys(): boolean {
	return getStoredPrivateKey() !== null && getStoredPublicKey() !== null;
}

/**
 * Encrypt a message with the recipient's public key
 */
export async function encryptMessage(
	message: string,
	recipientPublicKey: string
): Promise<EncryptedMessage> {
	if (!E2EE) {
		throw new Error('E2EE library not available (client-side only)');
	}
	const encrypted = await E2EE.encryptPlaintext({
		public_key: recipientPublicKey,
		plain_text: message
	});
	return encrypted;
}

/**
 * Decrypt a message with your private key
 */
export async function decryptMessage(
	encryptedMessage: EncryptedMessage,
	privateKey: string
): Promise<string> {
	if (!E2EE) {
		throw new Error('E2EE library not available (client-side only)');
	}
	const decrypted = await E2EE.decryptForPlaintext({
		encrypted_text: encryptedMessage,
		private_key: privateKey
	});
	return decrypted;
}

/**
 * Clear all stored encryption keys (logout)
 */
export function clearEncryptionKeys(): void {
	if (typeof window !== 'undefined') {
		localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
		localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
	}
}

