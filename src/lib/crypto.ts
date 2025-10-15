// Client-side encryption utilities for E2E encrypted messaging

export class MessageEncryption {
	private keyPair: CryptoKeyPair | null = null;

	// Generate a new key pair for the user
	async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
		this.keyPair = await window.crypto.subtle.generateKey(
			{
				name: 'RSA-OAEP',
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: 'SHA-256'
			},
			true,
			['encrypt', 'decrypt']
		);

		const publicKey = await this.exportPublicKey(this.keyPair.publicKey);
		const privateKey = await this.exportPrivateKey(this.keyPair.privateKey);

		return { publicKey, privateKey };
	}

	// Export public key to base64 string
	private async exportPublicKey(key: CryptoKey): Promise<string> {
		const exported = await window.crypto.subtle.exportKey('spki', key);
		return this.arrayBufferToBase64(exported);
	}

	// Export private key to base64 string
	private async exportPrivateKey(key: CryptoKey): Promise<string> {
		const exported = await window.crypto.subtle.exportKey('pkcs8', key);
		return this.arrayBufferToBase64(exported);
	}

	// Import public key from base64 string
	async importPublicKey(keyString: string): Promise<CryptoKey> {
		const keyData = this.base64ToArrayBuffer(keyString);
		return await window.crypto.subtle.importKey(
			'spki',
			keyData,
			{
				name: 'RSA-OAEP',
				hash: 'SHA-256'
			},
			true,
			['encrypt']
		);
	}

	// Import private key from base64 string
	async importPrivateKey(keyString: string): Promise<CryptoKey> {
		const keyData = this.base64ToArrayBuffer(keyString);
		return await window.crypto.subtle.importKey(
			'pkcs8',
			keyData,
			{
				name: 'RSA-OAEP',
				hash: 'SHA-256'
			},
			true,
			['decrypt']
		);
	}

	// Encrypt a message using recipient's public key
	async encryptMessage(
		message: string,
		recipientPublicKey: string
	): Promise<{ encrypted: string; iv: string }> {
		// Generate a random AES key for this message
		const aesKey = await window.crypto.subtle.generateKey(
			{
				name: 'AES-GCM',
				length: 256
			},
			true,
			['encrypt', 'decrypt']
		);

		// Generate IV
		const iv = window.crypto.getRandomValues(new Uint8Array(12));

		// Encrypt the message with AES
		const encoder = new TextEncoder();
		const messageData = encoder.encode(message);
		const encryptedMessage = await window.crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv: iv
			},
			aesKey,
			messageData
		);

		// Export the AES key
		const exportedAesKey = await window.crypto.subtle.exportKey('raw', aesKey);

		// Encrypt the AES key with recipient's public key
		const publicKey = await this.importPublicKey(recipientPublicKey);
		const encryptedAesKey = await window.crypto.subtle.encrypt(
			{
				name: 'RSA-OAEP'
			},
			publicKey,
			exportedAesKey
		);

		// Combine encrypted AES key and encrypted message
		const combined = new Uint8Array(encryptedAesKey.byteLength + encryptedMessage.byteLength);
		combined.set(new Uint8Array(encryptedAesKey), 0);
		combined.set(new Uint8Array(encryptedMessage), encryptedAesKey.byteLength);

		return {
			encrypted: this.arrayBufferToBase64(combined.buffer),
			iv: this.arrayBufferToBase64(iv.buffer)
		};
	}

	// Decrypt a message using own private key
	async decryptMessage(
		encryptedData: string,
		ivString: string,
		privateKeyString: string
	): Promise<string> {
		const privateKey = await this.importPrivateKey(privateKeyString);
		const combined = this.base64ToArrayBuffer(encryptedData);
		const iv = this.base64ToArrayBuffer(ivString);

		// Split the combined data (first 256 bytes is encrypted AES key)
		const encryptedAesKey = combined.slice(0, 256);
		const encryptedMessage = combined.slice(256);

		// Decrypt the AES key
		const aesKeyData = await window.crypto.subtle.decrypt(
			{
				name: 'RSA-OAEP'
			},
			privateKey,
			encryptedAesKey
		);

		// Import the AES key
		const aesKey = await window.crypto.subtle.importKey(
			'raw',
			aesKeyData,
			{
				name: 'AES-GCM',
				length: 256
			},
			false,
			['decrypt']
		);

		// Decrypt the message
		const decryptedMessage = await window.crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: new Uint8Array(iv)
			},
			aesKey,
			encryptedMessage
		);

		const decoder = new TextDecoder();
		return decoder.decode(decryptedMessage);
	}

	// Helper: Convert ArrayBuffer to base64
	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	// Helper: Convert base64 to ArrayBuffer
	private base64ToArrayBuffer(base64: string): ArrayBuffer {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}

	// Store private key in localStorage (in production, use more secure storage)
	storePrivateKey(privateKey: string): void {
		localStorage.setItem('privateKey', privateKey);
	}

	// Retrieve private key from localStorage
	getPrivateKey(): string | null {
		return localStorage.getItem('privateKey');
	}

	// Clear private key from storage
	clearPrivateKey(): void {
		localStorage.removeItem('privateKey');
	}
}

// Singleton instance
export const messageEncryption = new MessageEncryption();

