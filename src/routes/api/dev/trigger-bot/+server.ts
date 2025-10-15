import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Development-only endpoint to trigger bots locally
 * 
 * POST /api/dev/trigger-bot
 * Body: { bot_id?: string } (optional - triggers all bots if not provided)
 * 
 * This simulates what the bot-runner worker does in production.
 * Only available in development mode.
 */
export const POST: RequestHandler = async ({ request, platform, locals }) => {
	// Only allow in development
	if (import.meta.env.PROD) {
		return error(404, 'Not found');
	}

	if (!platform?.env?.DB) {
		return error(500, 'Database not available');
	}

	try {
		const body = await request.json().catch(() => ({}));
		const { bot_id } = body;

		// Get bots to run
		let query = 'SELECT * FROM bot_profiles WHERE is_active = 1';
		const params: string[] = [];

		if (bot_id) {
			query += ' AND id = ?';
			params.push(bot_id);
		}

		const result = await platform.env.DB.prepare(query)
			.bind(...params)
			.all();

		const bots = result.results || [];

		if (bots.length === 0) {
			return json({ error: 'No active bots found' }, { status: 404 });
		}

		// Run each bot
		const results = [];
		for (const bot of bots) {
			try {
				const result = await runBot(bot, platform.env);
				results.push({
					bot_id: bot.id,
					bot_name: bot.name,
					success: true,
					...result
				});
			} catch (err: any) {
				results.push({
					bot_id: bot.id,
					bot_name: bot.name,
					success: false,
					error: err.message
				});
			}
		}

		return json({
			success: true,
			triggered: results.length,
			results
		});
	} catch (err: any) {
		console.error('Bot trigger error:', err);
		return error(500, err.message || 'Failed to trigger bots');
	}
};

/**
 * Run a single bot
 */
async function runBot(bot: any, env: any) {
	// 1. Authenticate the bot
	const BOT_SECRET = env.BOT_SECRET || 'dev_bot_secret_12345';
	
	const authResponse = await fetch(`http://localhost:5174/api/bots/auth`, {
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

	// 2. Decide what to do (for dev, always create a post)
	const action = 'post';

	// 3. Create a post
	const personality = JSON.parse(bot.personality);
	const content = generateSimpleContent(personality);

	const postResponse = await fetch(`http://localhost:5174/api/bots/posts`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${sessionId}`
		},
		body: JSON.stringify({ content })
	});

	if (!postResponse.ok) {
		throw new Error(`Post creation failed: ${await postResponse.text()}`);
	}

	const postData = await postResponse.json();

	return {
		action,
		post_id: postData.post.id,
		content: content.substring(0, 100)
	};
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
		`Can't stop thinking about ${topic}! Anyone else?`,
		`Here's what I love about ${topic}...`,
		`${topic} is absolutely fascinating! Let me tell you why.`,
		`Today's focus: ${topic}. Who's with me?`,
		`Breaking down ${topic} in a way that makes sense.`,
		`${topic} continues to amaze me every single day!`
	];

	const template = templates[Math.floor(Math.random() * templates.length)];
	
	// Add emojis based on personality
	const emojiMap: Record<string, string[]> = {
		'moderate': ['🤔', '💡', '✨', '🎯', '📊', '🔍'],
		'frequent': ['✨', '🌟', '💫', '🎨', '📚', '🖋️', '💭', '🌈'],
		'high': ['💪', '🔥', '⚡', '🏃', '🎯', '💯', '🚀', '⭐']
	};

	const emojis = emojiMap[personality.emoji_usage] || ['👍'];
	const emoji = emojis[Math.floor(Math.random() * emojis.length)];

	return `${template} ${emoji}`;
}

