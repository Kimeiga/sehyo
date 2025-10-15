#!/usr/bin/env node

/**
 * Simple CLI tool to test E2E encrypted messaging
 * This version sets up both users first, then sends messages
 * 
 * Usage:
 *   node scripts/test-messaging-simple.mjs
 * 
 * This will:
 * 1. Setup alice and bob with encryption keys
 * 2. Send a message from alice to bob
 * 3. Send a reply from bob to alice
 * 4. Show the conversation
 */

import { webcrypto } from 'node:crypto';

// Polyfill for Node.js crypto
if (!globalThis.crypto) {
	globalThis.crypto = webcrypto;
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:5174';

// Simple E2E encryption implementation
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
		const publicKeyData = this.pemDecode(public_key);
		const publicCryptoKey = await crypto.subtle.importKey(
			'spki',
			publicKeyData,
			{ name: 'RSA-OAEP', hash: 'SHA-256' },
			true,
			['encrypt']
		);

		const aesKey = await crypto.subtle.generateKey(
			{ name: 'AES-CBC', length: 256 },
			true,
			['encrypt', 'decrypt']
		);

		const iv = crypto.getRandomValues(new Uint8Array(16));
		const encoder = new TextEncoder();
		const encodedText = encoder.encode(plain_text);
		const encryptedMessage = await crypto.subtle.encrypt(
			{ name: 'AES-CBC', iv },
			aesKey,
			encodedText
		);

		const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
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
		const privateKeyData = this.pemDecode(private_key);
		const privateCryptoKey = await crypto.subtle.importKey(
			'pkcs8',
			privateKeyData,
			{ name: 'RSA-OAEP', hash: 'SHA-256' },
			true,
			['decrypt']
		);

		const encryptedAesKey = this.base64ToArrayBuffer(encrypted_text.aes_key);
		const rawAesKey = await crypto.subtle.decrypt(
			{ name: 'RSA-OAEP' },
			privateCryptoKey,
			encryptedAesKey
		);

		const aesKey = await crypto.subtle.importKey(
			'raw',
			rawAesKey,
			{ name: 'AES-CBC' },
			false,
			['decrypt']
		);

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

async function login(username) {
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

	return sessionMatch[1];
}

async function setupUser(username) {
	console.log(`\n👤 Setting up user "${username}"...`);
	const session = await login(username);
	const keys = await E2EE.getKeys();
	
	// Save public key
	await fetch(`${BASE_URL}/api/user/public-key`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Cookie': `session=${session}`
		},
		body: JSON.stringify({ public_key: keys.public_key })
	});
	
	// Get user info
	const userResponse = await fetch(`${BASE_URL}/api/user/me`, {
		headers: { 'Cookie': `session=${session}` }
	});
	const userData = await userResponse.json();
	
	console.log(`✅ ${username} ready (ID: ${userData.user.id})`);
	
	return {
		username,
		session,
		keys,
		id: userData.user.id
	};
}

async function sendMessage(from, to, message) {
	console.log(`\n📤 ${from.username} → ${to.username}: "${message}"`);
	console.log(`   From ID: ${from.id}, To ID: ${to.id}`);

	// Encrypt
	const encrypted = await E2EE.encryptPlaintext({
		public_key: to.keys.public_key,
		plain_text: message
	});

	// Send
	const response = await fetch(`${BASE_URL}/api/messages/send`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Cookie': `session=${from.session}`
		},
		body: JSON.stringify({
			recipient_id: to.id,
			...encrypted
		})
	});

	if (!response.ok) {
		const text = await response.text();
		console.error(`❌ Failed to send: ${response.status} ${text}`);
		throw new Error('Failed to send message');
	}

	const result = await response.json();
	console.log(`✅ Message sent (ID: ${result.message_id})`);
}

async function readMessages(user, otherUserId) {
	const response = await fetch(`${BASE_URL}/api/messages/${otherUserId}`, {
		headers: { 'Cookie': `session=${user.session}` }
	});

	if (!response.ok) {
		console.error(`Failed to fetch messages: ${response.status}`);
		const text = await response.text();
		console.error(text);
		return;
	}

	const data = await response.json();
	const messages = data.messages || [];

	console.log(`\n📬 ${user.username}'s conversation with other user (${messages.length} messages):`);

	if (messages.length === 0) {
		console.log('  (no messages yet)');
		return;
	}

	for (const msg of messages) {
		try {
			const decrypted = await E2EE.decryptForPlaintext({
				encrypted_text: {
					cipher_text: msg.cipher_text,
					aes_key: msg.aes_key,
					iv: msg.iv
				},
				private_key: user.keys.private_key
			});

			const date = new Date(msg.created_at * 1000).toLocaleTimeString();
			const from = msg.sender_username;
			const arrow = from === user.username ? '→' : '←';
			console.log(`  ${arrow} [${date}] ${from}: "${decrypted}"`);
		} catch (err) {
			console.error(`  ❌ Failed to decrypt message: ${err.message}`);
		}
	}
}

async function main() {
	try {
		console.log('\n🚀 E2E Encrypted Messaging Demo\n');
		console.log('═══════════════════════════════════════════════════════════');
		
		// Setup users
		const alice = await setupUser('alice');
		const bob = await setupUser('bob');
		
		console.log('\n═══════════════════════════════════════════════════════════');
		console.log('\n💬 Sending messages...');
		
		// Send messages
		await sendMessage(alice, bob, 'Hey Bob! How are you?');
		await sendMessage(bob, alice, 'Hi Alice! I\'m doing great, thanks!');
		await sendMessage(alice, bob, 'That\'s awesome! Want to grab coffee later?');
		await sendMessage(bob, alice, 'Sure! How about 3pm at the usual place?');
		
		console.log('\n═══════════════════════════════════════════════════════════');
		console.log('\n📖 Reading conversations...');
		
		// Read messages
		await readMessages(alice, bob.id);
		await readMessages(bob, alice.id);
		
		console.log('\n═══════════════════════════════════════════════════════════');
		console.log('\n✅ Demo complete!');
		console.log('\n🔒 All messages were end-to-end encrypted!');
		console.log('   - Server cannot read the messages');
		console.log('   - Only alice and bob can decrypt them');
		console.log('   - Each message uses a unique encryption key\n');
		
	} catch (error) {
		console.error(`\n❌ Error: ${error.message}\n`);
		process.exit(1);
	}
}

main();

