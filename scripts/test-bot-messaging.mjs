#!/usr/bin/env node

/**
 * Test Bot Messaging Script
 * 
 * This script demonstrates anonymous users chatting with bot accounts.
 * 
 * Usage:
 *   node scripts/test-bot-messaging.mjs
 * 
 * This will:
 * 1. Create an anonymous user session
 * 2. Set up encryption keys for the anonymous user
 * 3. Set up encryption keys for a bot
 * 4. Send messages between anonymous user and bot
 * 5. Display the conversation
 */

import { webcrypto } from 'node:crypto';

// Polyfill for Node.js crypto
if (!globalThis.crypto) {
	globalThis.crypto = webcrypto;
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:5174';
const BOT_SECRET = process.env.BOT_SECRET || 'dev_bot_secret_12345';

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

// Create anonymous user session
async function createAnonymousUser() {
	console.log('\n👤 Creating anonymous user...');

	// Use Better Auth's sign-in/anonymous endpoint
	const response = await fetch(`${BASE_URL}/api/auth/sign-in/anonymous`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Anonymous login failed: ${response.status} - ${text}`);
	}

	const cookies = response.headers.get('set-cookie');
	const sessionMatch = cookies?.match(/better-auth\.session_token=([^;]+)/);
	if (!sessionMatch) {
		throw new Error('No session cookie received');
	}

	const session = sessionMatch[1];

	// Get user info
	const userResponse = await fetch(`${BASE_URL}/api/user/me`, {
		headers: { 'Cookie': `better-auth.session_token=${session}` }
	});

	if (!userResponse.ok) {
		const text = await userResponse.text();
		throw new Error(`Failed to get user info: ${userResponse.status} - ${text}`);
	}

	const userData = await userResponse.json();
	console.log(`✅ Anonymous user created (ID: ${userData.user.id})`);

	return {
		username: 'anonymous',
		session,
		id: userData.user.id
	};
}

// Set up encryption keys for a user
async function setupEncryption(user) {
	console.log(`\n🔐 Setting up encryption for ${user.username}...`);
	
	const keys = await E2EE.getKeys();
	
	// Save public key
	const response = await fetch(`${BASE_URL}/api/user/public-key`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Cookie': `better-auth.session_token=${user.session}`
		},
		body: JSON.stringify({ public_key: keys.public_key })
	});
	
	if (!response.ok) {
		throw new Error(`Failed to save public key: ${response.status}`);
	}
	
	console.log(`✅ Encryption keys set up for ${user.username}`);
	
	return { ...user, keys };
}

// Authenticate as a bot
async function authenticateBot(botId) {
	console.log(`\n🤖 Authenticating bot: ${botId}...`);
	
	const response = await fetch(`${BASE_URL}/api/bots/auth`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			bot_id: botId,
			secret: BOT_SECRET
		})
	});

	if (!response.ok) {
		throw new Error(`Bot auth failed: ${await response.text()}`);
	}

	const data = await response.json();
	console.log(`✅ Bot authenticated: ${data.bot_profile.display_name}`);
	
	return {
		username: data.bot_profile.username,
		session: data.session_id,
		id: data.user_id,
		display_name: data.bot_profile.display_name
	};
}

// Send a message
async function sendMessage(from, to, message) {
	console.log(`\n📤 ${from.username} → ${to.username}: "${message}"`);

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
			'Cookie': `better-auth.session_token=${from.session}`
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

// Read and decrypt messages
async function readMessages(user, otherUserId) {
	const response = await fetch(`${BASE_URL}/api/messages/${otherUserId}`, {
		headers: { 'Cookie': `better-auth.session_token=${user.session}` }
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch messages: ${response.status}`);
	}

	const data = await response.json();
	const messages = data.messages || [];

	console.log(`\n📬 Conversation (${messages.length} messages):`);
	console.log('─'.repeat(60));

	for (const msg of messages) {
		const isOwn = msg.sender_id === user.id;
		const sender = isOwn ? 'You' : msg.sender_display_name;
		
		try {
			const decrypted = await E2EE.decryptForPlaintext({
				encrypted_text: {
					cipher_text: msg.cipher_text,
					aes_key: msg.aes_key,
					iv: msg.iv
				},
				private_key: user.keys.private_key
			});
			
			console.log(`${sender}: ${decrypted}`);
		} catch (err) {
			console.log(`${sender}: [Failed to decrypt]`);
		}
	}
	
	console.log('─'.repeat(60));
}

// Main test flow
async function main() {
	console.log('🧪 Bot Messaging Test');
	console.log('='.repeat(60));
	
	try {
		// 1. Create anonymous user
		let anonUser = await createAnonymousUser();
		anonUser = await setupEncryption(anonUser);
		
		// 2. Authenticate as bot
		let bot = await authenticateBot('bot_tech_enthusiast');
		bot = await setupEncryption(bot);
		
		// 3. Send messages
		await sendMessage(anonUser, bot, 'Hey techbot! Can you help me with JavaScript?');
		await sendMessage(bot, anonUser, 'Of course! I love helping with JavaScript. What do you need help with?');
		await sendMessage(anonUser, bot, 'How do I use async/await?');
		await sendMessage(bot, anonUser, 'Great question! Async/await makes asynchronous code look synchronous. Here\'s a quick example...');
		
		// 4. Read conversation from anonymous user's perspective
		await readMessages(anonUser, bot.id);
		
		console.log('\n✅ Test completed successfully!');
		console.log('\n💡 You can now test this in the browser:');
		console.log('   1. Sign in as guest');
		console.log('   2. Visit /messages');
		console.log('   3. Start a conversation with @techbot');
		
	} catch (err) {
		console.error('\n❌ Test failed:', err.message);
		process.exit(1);
	}
}

main();

