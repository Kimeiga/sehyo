#!/usr/bin/env node

/**
 * CLI tool to test E2E encrypted messaging
 * 
 * Usage:
 *   node scripts/test-messaging.mjs alice bob "Hello from Alice!"
 *   node scripts/test-messaging.mjs bob alice "Hi Alice, this is Bob!"
 * 
 * This will:
 * 1. Login as the sender (creates test user if needed)
 * 2. Generate encryption keys if needed
 * 3. Encrypt and send the message
 * 4. Login as the recipient
 * 5. Fetch and decrypt the message
 */

import { webcrypto } from 'node:crypto';

// Polyfill for Node.js crypto
if (!globalThis.crypto) {
	globalThis.crypto = webcrypto;
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:5175';

// Simple E2E encryption implementation (matching the library)
class E2EE {
	static async getKeys() {
		const keyPair = await crypto.subtle.generateKey(
			{
				name: 'RSA-OAEP',
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: 'SHA-256'
			},
			true,
			['encrypt', 'decrypt']
		);

		const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
		const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

		return {
			public_key: this.pemEncode(publicKey, 'PUBLIC KEY'),
			private_key: this.pemEncode(privateKey, 'PRIVATE KEY')
		};
	}

	static async encryptPlaintext({ public_key, plain_text }) {
		// Import public key
		const publicKeyData = this.pemDecode(public_key);
		const publicCryptoKey = await crypto.subtle.importKey(
			'spki',
			publicKeyData,
			{ name: 'RSA-OAEP', hash: 'SHA-256' },
			true,
			['encrypt']
		);

		// Generate AES key
		const aesKey = await crypto.subtle.generateKey(
			{ name: 'AES-CBC', length: 256 },
			true,
			['encrypt', 'decrypt']
		);

		// Encrypt message with AES
		const iv = crypto.getRandomValues(new Uint8Array(16));
		const encoder = new TextEncoder();
		const encodedText = encoder.encode(plain_text);
		const encryptedMessage = await crypto.subtle.encrypt(
			{ name: 'AES-CBC', iv },
			aesKey,
			encodedText
		);

		// Export AES key
		const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);

		// Encrypt AES key with RSA
		const encryptedAesKey = await crypto.subtle.encrypt(
			{ name: 'RSA-OAEP' },
			publicCryptoKey,
			rawAesKey
		);

		return {
			cipher_text: this.arrayBufferToBase64(encryptedMessage),
			aes_key: this.arrayBufferToBase64(encryptedAesKey),
			iv: this.arrayBufferToBase64(iv)
		};
	}

	static async decryptForPlaintext({ encrypted_text, private_key }) {
		// Import private key
		const privateKeyData = this.pemDecode(private_key);
		const privateCryptoKey = await crypto.subtle.importKey(
			'pkcs8',
			privateKeyData,
			{ name: 'RSA-OAEP', hash: 'SHA-256' },
			true,
			['decrypt']
		);

		// Decrypt AES key
		const encryptedAesKey = this.base64ToArrayBuffer(encrypted_text.aes_key);
		const rawAesKey = await crypto.subtle.decrypt(
			{ name: 'RSA-OAEP' },
			privateCryptoKey,
			encryptedAesKey
		);

		// Import AES key
		const aesKey = await crypto.subtle.importKey(
			'raw',
			rawAesKey,
			{ name: 'AES-CBC' },
			false,
			['decrypt']
		);

		// Decrypt message
		const iv = this.base64ToArrayBuffer(encrypted_text.iv);
		const cipherText = this.base64ToArrayBuffer(encrypted_text.cipher_text);
		const decryptedMessage = await crypto.subtle.decrypt(
			{ name: 'AES-CBC', iv },
			aesKey,
			cipherText
		);

		const decoder = new TextDecoder();
		return decoder.decode(decryptedMessage);
	}

	static pemEncode(buffer, label) {
		const base64 = this.arrayBufferToBase64(buffer);
		const lines = base64.match(/.{1,64}/g) || [];
		return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
	}

	static pemDecode(pem) {
		const base64 = pem
			.replace(/-----BEGIN [^-]+-----/, '')
			.replace(/-----END [^-]+-----/, '')
			.replace(/\s/g, '');
		return this.base64ToArrayBuffer(base64);
	}

	static arrayBufferToBase64(buffer) {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return Buffer.from(binary, 'binary').toString('base64');
	}

	static base64ToArrayBuffer(base64) {
		const binary = Buffer.from(base64, 'base64').toString('binary');
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}
}

// API helper
async function apiCall(endpoint, options = {}) {
	const url = `${BASE_URL}${endpoint}`;
	const response = await fetch(url, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options.headers
		}
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`API call failed: ${response.status} ${text}`);
	}

	return response.json();
}

// Login as test user
async function login(username) {
	console.log(`🔐 Logging in as "${username}"...`);
	const response = await fetch(`${BASE_URL}/api/dev/test-login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username })
	});

	if (!response.ok) {
		throw new Error(`Login failed: ${response.status}`);
	}

	const cookies = response.headers.get('set-cookie');
	const sessionMatch = cookies?.match(/session=([^;]+)/);
	if (!sessionMatch) {
		throw new Error('No session cookie received');
	}

	console.log(`✅ Logged in as "${username}"`);
	return sessionMatch[1];
}

// Get or create encryption keys
async function getOrCreateKeys(sessionCookie) {
	console.log('🔑 Checking encryption keys...');
	
	// Generate new keys
	const keys = await E2EE.getKeys();
	
	// Save public key to server
	await fetch(`${BASE_URL}/api/user/public-key`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Cookie': `session=${sessionCookie}`
		},
		body: JSON.stringify({ public_key: keys.public_key })
	});

	console.log('✅ Encryption keys ready');
	return keys;
}

// Get user ID
async function getUserId(sessionCookie) {
	const response = await fetch(`${BASE_URL}/api/user/me`, {
		headers: { 'Cookie': `session=${sessionCookie}` }
	});
	
	if (!response.ok) {
		throw new Error('Failed to get user info');
	}
	
	const data = await response.json();
	return data.user.id;
}

// Get recipient's public key and ID
async function getRecipient(username, sessionCookie) {
	// First, get all users to find the recipient
	const response = await fetch(`${BASE_URL}/api/users`, {
		headers: { 'Cookie': `session=${sessionCookie}` }
	});
	
	if (!response.ok) {
		throw new Error('Failed to get users');
	}
	
	const data = await response.json();
	const recipient = data.users?.find(u => u.username === username);
	
	if (!recipient) {
		throw new Error(`User "${username}" not found`);
	}
	
	// Get their public key
	const keyResponse = await fetch(`${BASE_URL}/api/user/${recipient.id}/public-key`, {
		headers: { 'Cookie': `session=${sessionCookie}` }
	});
	
	if (!keyResponse.ok) {
		throw new Error('Failed to get recipient public key');
	}
	
	const keyData = await keyResponse.json();
	
	if (!keyData.public_key) {
		throw new Error(`Recipient "${username}" has not set up encryption yet`);
	}
	
	return {
		id: recipient.id,
		username: recipient.username,
		display_name: recipient.display_name,
		public_key: keyData.public_key
	};
}

// Send encrypted message
async function sendMessage(recipientId, message, recipientPublicKey, sessionCookie) {
	console.log(`📤 Encrypting and sending message...`);
	
	// Encrypt message
	const encrypted = await E2EE.encryptPlaintext({
		public_key: recipientPublicKey,
		plain_text: message
	});
	
	// Send to server
	await fetch(`${BASE_URL}/api/messages/send`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Cookie': `session=${sessionCookie}`
		},
		body: JSON.stringify({
			recipient_id: recipientId,
			...encrypted
		})
	});
	
	console.log(`✅ Message sent (encrypted)`);
}

// Get and decrypt messages
async function getMessages(userId, privateKey, sessionCookie) {
	console.log(`📥 Fetching messages...`);
	
	const response = await fetch(`${BASE_URL}/api/messages/${userId}`, {
		headers: { 'Cookie': `session=${sessionCookie}` }
	});
	
	if (!response.ok) {
		throw new Error('Failed to get messages');
	}
	
	const data = await response.json();
	const messages = data.messages || [];
	
	console.log(`📬 Found ${messages.length} message(s)`);
	
	// Decrypt messages
	for (const msg of messages) {
		try {
			const decrypted = await E2EE.decryptForPlaintext({
				encrypted_text: {
					cipher_text: msg.cipher_text,
					aes_key: msg.aes_key,
					iv: msg.iv
				},
				private_key: privateKey
			});
			
			const date = new Date(msg.created_at * 1000).toLocaleString();
			const from = msg.sender_username;
			console.log(`\n💬 [${date}] ${from}: "${decrypted}"`);
		} catch (error) {
			console.error(`❌ Failed to decrypt message: ${error.message}`);
		}
	}
}

// Main function
async function main() {
	const [sender, recipient, message] = process.argv.slice(2);
	
	if (!sender || !recipient || !message) {
		console.log('Usage: node scripts/test-messaging.mjs <sender> <recipient> <message>');
		console.log('Example: node scripts/test-messaging.mjs alice bob "Hello Bob!"');
		process.exit(1);
	}
	
	try {
		console.log('\n🚀 E2E Encrypted Messaging Test\n');
		
		// Step 1: Login as sender
		const senderSession = await login(sender);
		const senderKeys = await getOrCreateKeys(senderSession);
		
		// Step 2: Get recipient info
		console.log(`🔍 Looking up recipient "${recipient}"...`);
		const recipientInfo = await getRecipient(recipient, senderSession);
		console.log(`✅ Found ${recipientInfo.display_name} (@${recipientInfo.username})`);
		
		// Step 3: Send encrypted message
		await sendMessage(recipientInfo.id, message, recipientInfo.public_key, senderSession);
		
		// Step 4: Login as recipient and read messages
		console.log(`\n🔄 Switching to recipient "${recipient}"...\n`);
		const recipientSession = await login(recipient);
		const recipientKeys = await getOrCreateKeys(recipientSession);
		
		// Get sender's ID
		const senderInfo = await getRecipient(sender, recipientSession);
		
		// Step 5: Fetch and decrypt messages
		await getMessages(senderInfo.id, recipientKeys.private_key, recipientSession);
		
		console.log('\n✅ Test complete!\n');
	} catch (error) {
		console.error(`\n❌ Error: ${error.message}\n`);
		process.exit(1);
	}
}

main();

