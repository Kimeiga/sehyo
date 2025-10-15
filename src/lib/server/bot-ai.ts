/**
 * Bot AI Content Generator
 * 
 * This module uses Cloudflare Workers AI to generate content for bots.
 * It creates posts and comments based on bot personalities.
 */

interface BotPersonality {
	traits: string[];
	interests: string[];
	tone: string;
	emoji_usage: 'none' | 'low' | 'moderate' | 'frequent' | 'high';
}

interface GeneratePostOptions {
	personality: BotPersonality;
	context?: string;
	maxLength?: number;
}

interface GenerateCommentOptions {
	personality: BotPersonality;
	postContent: string;
	maxLength?: number;
}

/**
 * Generate a post using Cloudflare Workers AI
 */
export async function generateBotPost(
	ai: any,
	options: GeneratePostOptions
): Promise<string> {
	const { personality, context, maxLength = 500 } = options;

	// Build prompt based on personality
	const prompt = buildPostPrompt(personality, context);

	try {
		// Use Cloudflare Workers AI to generate content
		const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{
					role: 'system',
					content: `You are a social media bot with the following personality:
- Traits: ${personality.traits.join(', ')}
- Interests: ${personality.interests.join(', ')}
- Tone: ${personality.tone}
- Emoji usage: ${personality.emoji_usage}

Generate engaging, authentic social media posts that reflect this personality.
Keep posts concise (under ${maxLength} characters) and natural.
${getEmojiGuidance(personality.emoji_usage)}`
				},
				{
					role: 'user',
					content: prompt
				}
			],
			max_tokens: 256,
			temperature: 0.8
		});

		// Extract generated text
		let generatedText = response.response || '';
		
		// Clean up the text
		generatedText = cleanGeneratedText(generatedText, maxLength);

		return generatedText;
	} catch (err) {
		console.error('AI generation error:', err);
		// Fallback to template-based generation
		return generateFallbackPost(personality, context);
	}
}

/**
 * Generate a comment using Cloudflare Workers AI
 */
export async function generateBotComment(
	ai: any,
	options: GenerateCommentOptions
): Promise<string> {
	const { personality, postContent, maxLength = 200 } = options;

	try {
		const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{
					role: 'system',
					content: `You are a social media bot with the following personality:
- Traits: ${personality.traits.join(', ')}
- Interests: ${personality.interests.join(', ')}
- Tone: ${personality.tone}
- Emoji usage: ${personality.emoji_usage}

Generate thoughtful, engaging comments that add value to the conversation.
Keep comments concise (under ${maxLength} characters) and natural.
${getEmojiGuidance(personality.emoji_usage)}`
				},
				{
					role: 'user',
					content: `Write a comment responding to this post: "${postContent}"`
				}
			],
			max_tokens: 128,
			temperature: 0.7
		});

		let generatedText = response.response || '';
		generatedText = cleanGeneratedText(generatedText, maxLength);

		return generatedText;
	} catch (err) {
		console.error('AI comment generation error:', err);
		return generateFallbackComment(personality, postContent);
	}
}

/**
 * Build a prompt for post generation
 */
function buildPostPrompt(personality: BotPersonality, context?: string): string {
	const topics = personality.interests;
	const randomTopic = topics[Math.floor(Math.random() * topics.length)];

	if (context) {
		return `Write a social media post about ${context}`;
	}

	const prompts = [
		`Share an interesting thought about ${randomTopic}`,
		`Post about something you learned recently related to ${randomTopic}`,
		`Share a tip or insight about ${randomTopic}`,
		`Express your enthusiasm for ${randomTopic}`,
		`Ask an engaging question about ${randomTopic}`
	];

	return prompts[Math.floor(Math.random() * prompts.length)];
}

/**
 * Get emoji usage guidance based on preference
 */
function getEmojiGuidance(usage: string): string {
	switch (usage) {
		case 'none':
			return 'Do not use any emojis.';
		case 'low':
			return 'Use emojis sparingly (0-1 per post).';
		case 'moderate':
			return 'Use emojis moderately (1-2 per post).';
		case 'frequent':
			return 'Use emojis frequently (2-3 per post).';
		case 'high':
			return 'Use emojis liberally (3-5 per post).';
		default:
			return 'Use emojis moderately.';
	}
}

/**
 * Clean and validate generated text
 */
function cleanGeneratedText(text: string, maxLength: number): string {
	// Remove any markdown formatting
	text = text.replace(/\*\*/g, '').replace(/\*/g, '');
	
	// Remove quotes if the AI wrapped the response
	text = text.replace(/^["']|["']$/g, '');
	
	// Trim whitespace
	text = text.trim();
	
	// Truncate if too long
	if (text.length > maxLength) {
		text = text.substring(0, maxLength - 3) + '...';
	}
	
	return text;
}

/**
 * Fallback post generation (template-based)
 */
function generateFallbackPost(personality: BotPersonality, context?: string): string {
	const topic = context || personality.interests[Math.floor(Math.random() * personality.interests.length)];
	
	const templates = [
		`Just thinking about ${topic}... fascinating stuff! 🤔`,
		`${topic} is really interesting today! What do you all think?`,
		`Learning so much about ${topic} lately. Anyone else exploring this?`,
		`Quick thought on ${topic}: it's more important than we realize!`,
		`${topic} continues to amaze me every day! ✨`
	];

	return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Fallback comment generation (template-based)
 */
function generateFallbackComment(personality: BotPersonality, postContent: string): string {
	const templates = [
		`Great point! I totally agree with this perspective. 👍`,
		`This is really interesting! Thanks for sharing!`,
		`Love this! Really makes you think. 🤔`,
		`Couldn't agree more! Well said!`,
		`This is exactly what I was thinking about! Great minds! ✨`
	];

	return templates[Math.floor(Math.random() * templates.length)];
}

