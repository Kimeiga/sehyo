/**
 * Local Bot Trigger Script
 * 
 * This script allows you to manually trigger bots to post locally during development.
 * It simulates what the bot-runner worker does in production.
 * 
 * Usage:
 *   npm run bot:trigger                    # Trigger all bots
 *   npm run bot:trigger -- --bot=techbot   # Trigger specific bot
 */

import { createClient } from '@libsql/client';

interface BotProfile {
	id: string;
	user_id: string;
	name: string;
	personality: string;
	posting_frequency: string;
	last_post_at: string | null;
}

// Parse command line arguments
const args = process.argv.slice(2);
const botArg = args.find(arg => arg.startsWith('--bot='));
const specificBot = botArg ? botArg.split('=')[1] : null;

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5174';
const BOT_SECRET = process.env.BOT_SECRET || 'dev_bot_secret_12345';

// Database connection (local D1)
const db = createClient({
	url: 'file:.wrangler/state/v3/d1/miniflare-D1DatabaseObject/d827cbae592f41b580e8e06ccb610bee.sqlite',
});

async function main() {
	console.log('🤖 Local Bot Trigger Script');
	console.log('============================\n');

	try {
		// Get bots to run
		let query = 'SELECT * FROM bot_profiles WHERE is_active = 1';
		const params: string[] = [];

		if (specificBot) {
			query += ' AND (id = ? OR username = ?)';
			params.push(specificBot, specificBot);
			console.log(`🎯 Triggering specific bot: ${specificBot}\n`);
		} else {
			console.log('🎯 Triggering all active bots\n');
		}

		const result = await db.execute({
			sql: query,
			args: params
		});

		const bots = result.rows as unknown as BotProfile[];

		if (bots.length === 0) {
			console.log('❌ No active bots found');
			return;
		}

		console.log(`Found ${bots.length} bot(s) to run:\n`);

		// Run each bot
		for (const bot of bots) {
			console.log(`\n🤖 Running bot: ${bot.name} (${bot.id})`);
			console.log(`   Personality: ${JSON.parse(bot.personality).tone}`);
			
			try {
				await runBot(bot);
				console.log(`   ✅ Success!`);
			} catch (err) {
				console.error(`   ❌ Error:`, err);
			}
		}

		console.log('\n✨ Bot trigger completed!\n');
	} catch (err) {
		console.error('❌ Script error:', err);
		process.exit(1);
	}
}

/**
 * Run a single bot
 */
async function runBot(bot: BotProfile) {
	// 1. Authenticate the bot
	const authResponse = await fetch(`${API_BASE_URL}/api/bots/auth`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			bot_id: bot.id,
			secret: BOT_SECRET
		})
	});

	if (!authResponse.ok) {
		throw new Error(`Auth failed: ${await authResponse.text()}`);
	}

	const authData = await authResponse.json();
	const sessionId = authData.session_id;

	console.log(`   🔑 Authenticated`);

	// 2. Decide what to do (for local testing, always create a post)
	const action = 'post'; // Could randomize: post, comment, react

	// 3. Perform the action
	if (action === 'post') {
		await createBotPost(bot, sessionId);
	}
}

/**
 * Create a post for the bot
 */
async function createBotPost(bot: BotProfile, sessionId: string) {
	const personality = JSON.parse(bot.personality);
	
	// Generate simple content (in production, this uses Workers AI)
	const content = generateSimpleContent(personality);

	console.log(`   📝 Creating post: "${content.substring(0, 50)}..."`);

	const response = await fetch(`${API_BASE_URL}/api/bots/posts`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${sessionId}`
		},
		body: JSON.stringify({ content })
	});

	if (!response.ok) {
		throw new Error(`Post creation failed: ${await response.text()}`);
	}

	const data = await response.json();
	console.log(`   📮 Post created: ${data.post.id}`);
}

/**
 * Generate simple content without AI (fallback for local testing)
 */
function generateSimpleContent(personality: any): string {
	const topic = personality.interests[Math.floor(Math.random() * personality.interests.length)];
	
	const templates = [
		`Just learned something amazing about ${topic}! 🚀`,
		`Excited to share my thoughts on ${topic} today!`,
		`${topic} has been on my mind lately. What do you think?`,
		`Quick update: Been diving deep into ${topic} recently!`,
		`Can't stop thinking about ${topic}! Anyone else?`
	];

	const template = templates[Math.floor(Math.random() * templates.length)];
	
	// Add emojis based on personality
	const emojiMap: Record<string, string[]> = {
		'moderate': ['🤔', '💡', '✨', '🎯'],
		'frequent': ['✨', '🌟', '💫', '🎨', '📚', '🖋️'],
		'high': ['💪', '🔥', '⚡', '🏃', '🎯', '💯']
	};

	const emojis = emojiMap[personality.emoji_usage] || ['👍'];
	const emoji = emojis[Math.floor(Math.random() * emojis.length)];

	return `${template} ${emoji}`;
}

// Run the script
main().catch(console.error);

