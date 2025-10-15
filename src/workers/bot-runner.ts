/**
 * Bot Runner Worker
 * 
 * This Cloudflare Worker runs on a schedule (via Cron Triggers) to:
 * 1. Fetch active bot profiles
 * 2. Generate content using Workers AI
 * 3. Post content via bot API endpoints
 * 4. Interact with other posts (comments, reactions)
 * 
 * Scheduled via wrangler.toml cron triggers
 */

interface Env {
	DB: D1Database;
	AI: any;
	BOT_SECRET: string;
	API_BASE_URL: string;
}

interface BotProfile {
	id: string;
	user_id: string;
	name: string;
	personality: string;
	posting_frequency: string;
	last_post_at: string | null;
}

export default {
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log('Bot runner triggered at:', new Date(event.scheduledTime).toISOString());

		try {
			// Get active bots that should post
			const bots = await getBotsToRun(env.DB, event.cron);
			
			console.log(`Found ${bots.length} bots to run`);

			// Run each bot
			for (const bot of bots) {
				try {
					await runBot(bot, env);
				} catch (err) {
					console.error(`Error running bot ${bot.id}:`, err);
				}
			}

			console.log('Bot runner completed successfully');
		} catch (err) {
			console.error('Bot runner error:', err);
		}
	},

	// HTTP endpoint for manual triggering (useful for testing)
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Manual trigger endpoint
		if (url.pathname === '/trigger' && request.method === 'POST') {
			try {
				const { bot_id } = await request.json();

				if (!bot_id) {
					return new Response('bot_id is required', { status: 400 });
				}

				// Get specific bot
				const bot = await env.DB.prepare(
					`SELECT * FROM bot_profiles WHERE id = ? AND is_active = 1`
				).bind(bot_id).first() as BotProfile;

				if (!bot) {
					return new Response('Bot not found or inactive', { status: 404 });
				}

				// Run the bot
				await runBot(bot, env);

				return new Response(JSON.stringify({ success: true, bot_id }), {
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (err) {
				console.error('Manual trigger error:', err);
				return new Response('Internal server error', { status: 500 });
			}
		}

		return new Response('Bot Runner Worker - Use POST /trigger to manually run a bot', {
			status: 200
		});
	}
};

/**
 * Get bots that should run based on schedule
 */
async function getBotsToRun(db: D1Database, cronPattern: string): Promise<BotProfile[]> {
	// For now, get all active bots
	// In production, you'd filter based on posting_frequency and last_post_at
	const result = await db.prepare(
		`SELECT * FROM bot_profiles 
		 WHERE is_active = 1
		 AND (
		   last_post_at IS NULL 
		   OR datetime(last_post_at) < datetime('now', '-1 hour')
		 )
		 LIMIT 5`
	).all();

	return result.results as BotProfile[];
}

/**
 * Run a single bot
 */
async function runBot(bot: BotProfile, env: Env): Promise<void> {
	console.log(`Running bot: ${bot.name} (${bot.id})`);

	// 1. Authenticate bot
	const session = await authenticateBot(bot.id, env);
	if (!session) {
		console.error(`Failed to authenticate bot ${bot.id}`);
		return;
	}

	// 2. Decide what action to take (post, comment, or react)
	const action = decideAction();

	switch (action) {
		case 'post':
			await createBotPost(bot, session, env);
			break;
		case 'comment':
			await createBotComment(bot, session, env);
			break;
		case 'react':
			// TODO: Implement reactions
			console.log('Reactions not yet implemented');
			break;
	}
}

/**
 * Authenticate a bot and get session
 */
async function authenticateBot(botId: string, env: Env): Promise<string | null> {
	try {
		const response = await fetch(`${env.API_BASE_URL}/api/bots/auth`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				bot_id: botId,
				secret: env.BOT_SECRET
			})
		});

		if (!response.ok) {
			console.error('Auth failed:', await response.text());
			return null;
		}

		const data = await response.json();
		return data.session_id;
	} catch (err) {
		console.error('Auth error:', err);
		return null;
	}
}

/**
 * Create a post for the bot
 */
async function createBotPost(bot: BotProfile, sessionId: string, env: Env): Promise<void> {
	try {
		const personality = JSON.parse(bot.personality);

		// Generate content using AI
		const content = await generatePostContent(personality, env.AI);

		// Create post via API
		const response = await fetch(`${env.API_BASE_URL}/api/bots/posts`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${sessionId}`
			},
			body: JSON.stringify({ content })
		});

		if (!response.ok) {
			console.error('Post creation failed:', await response.text());
			return;
		}

		const data = await response.json();
		console.log(`Bot ${bot.name} created post:`, data.post.id);
	} catch (err) {
		console.error('Create post error:', err);
	}
}

/**
 * Create a comment for the bot
 */
async function createBotComment(bot: BotProfile, sessionId: string, env: Env): Promise<void> {
	try {
		// Get recent posts to comment on
		const posts = await env.DB.prepare(
			`SELECT p.id, p.content, p.user_id
			 FROM posts p
			 WHERE p.user_id != ?
			 AND p.created_at > datetime('now', '-24 hours')
			 ORDER BY RANDOM()
			 LIMIT 1`
		).bind(bot.user_id).all();

		if (!posts.results || posts.results.length === 0) {
			console.log('No posts to comment on');
			return;
		}

		const post = posts.results[0];
		const personality = JSON.parse(bot.personality);

		// Generate comment using AI
		const content = await generateCommentContent(personality, post.content as string, env.AI);

		// Create comment via API
		const response = await fetch(`${env.API_BASE_URL}/api/bots/comments`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${sessionId}`
			},
			body: JSON.stringify({
				post_id: post.id,
				content
			})
		});

		if (!response.ok) {
			console.error('Comment creation failed:', await response.text());
			return;
		}

		const data = await response.json();
		console.log(`Bot ${bot.name} created comment:`, data.comment.id);
	} catch (err) {
		console.error('Create comment error:', err);
	}
}

/**
 * Decide what action the bot should take
 */
function decideAction(): 'post' | 'comment' | 'react' {
	const random = Math.random();
	
	if (random < 0.6) {
		return 'post'; // 60% chance to post
	} else if (random < 0.9) {
		return 'comment'; // 30% chance to comment
	} else {
		return 'react'; // 10% chance to react
	}
}

/**
 * Generate post content using AI
 */
async function generatePostContent(personality: any, ai: any): Promise<string> {
	const topic = personality.interests[Math.floor(Math.random() * personality.interests.length)];
	
	const prompt = `Write a short, engaging social media post about ${topic}. 
Tone: ${personality.tone}
Traits: ${personality.traits.join(', ')}
Keep it under 280 characters and ${personality.emoji_usage} emojis.`;

	try {
		const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{ role: 'system', content: 'You are a helpful social media content generator.' },
				{ role: 'user', content: prompt }
			],
			max_tokens: 128,
			temperature: 0.8
		});

		return cleanText(response.response || getFallbackPost(topic));
	} catch (err) {
		console.error('AI generation error:', err);
		return getFallbackPost(topic);
	}
}

/**
 * Generate comment content using AI
 */
async function generateCommentContent(personality: any, postContent: string, ai: any): Promise<string> {
	const prompt = `Write a thoughtful comment responding to this post: "${postContent}"
Tone: ${personality.tone}
Keep it under 200 characters and ${personality.emoji_usage} emojis.`;

	try {
		const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{ role: 'system', content: 'You are a helpful social media commenter.' },
				{ role: 'user', content: prompt }
			],
			max_tokens: 64,
			temperature: 0.7
		});

		return cleanText(response.response || 'Great post! Thanks for sharing! 👍');
	} catch (err) {
		console.error('AI comment generation error:', err);
		return 'Great post! Thanks for sharing! 👍';
	}
}

/**
 * Clean generated text
 */
function cleanText(text: string): string {
	return text.replace(/^["']|["']$/g, '').trim();
}

/**
 * Fallback post when AI fails
 */
function getFallbackPost(topic: string): string {
	const templates = [
		`Just thinking about ${topic}... fascinating stuff! 🤔`,
		`${topic} is really interesting! What do you think?`,
		`Learning so much about ${topic} lately! ✨`
	];
	return templates[Math.floor(Math.random() * templates.length)];
}

