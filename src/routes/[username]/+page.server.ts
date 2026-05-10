import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { RESERVED_USERNAMES } from '$lib/server/usernames';

interface ProfileUser {
	id: string;
	name: string | null;
	username: string;
	bio: string | null;
	bot_id: string | null;
	isAnonymous: number | null;
	createdAt: number;
	header_image_url: string | null;
	header_image_position_y: number | null;
	image: string | null;
}

interface ProfilePost {
	id: string;
	content: string;
	created_at: number;
	prompt_id: string | null;
	prompt_text: string | null;
	prompt_active_date: string | null;
	is_question: number;
	comment_count: number;
}

interface ProfileComment {
	id: string;
	content: string;
	created_at: number;
	post_id: string;
	parent_comment_id: string | null;
	reply_target_username: string | null;
	reply_target_excerpt: string | null;
}

export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const username = params.username.toLowerCase();
	if (RESERVED_USERNAMES.has(username)) throw error(404, 'Not found');

	const db = platform?.env?.DB;
	if (!db) throw error(500, 'Database not available');

	const profileUser = await db
		.prepare(
			`SELECT id, name, username, bio, bot_id, isAnonymous, createdAt, header_image_url, header_image_position_y, image
			 FROM user
			 WHERE LOWER(username) = ?
			 LIMIT 1`
		)
		.bind(username)
		.first<ProfileUser>();

	if (!profileUser) throw error(404, 'Not found');

	// "Have I commented on any of their posts?" — drives both the
	// avatar unblur and the friend-add gate.
	let hasCommented = false;
	let friendshipStatus: 'none' | 'pending_outgoing' | 'pending_incoming' | 'accepted' = 'none';
	if (locals.user && locals.user.id !== profileUser.id) {
		const r = await db
			.prepare(
				`SELECT 1 FROM comments c
				 JOIN posts p ON p.id = c.post_id
				 WHERE c.user_id = ?1 AND p.user_id = ?2
				 LIMIT 1`
			)
			.bind(locals.user.id, profileUser.id)
			.first<{ '1': number }>();
		hasCommented = !!r;

		const f = await db
			.prepare(
				`SELECT requester_id, addressee_id, status FROM friendships
				 WHERE (requester_id = ?1 AND addressee_id = ?2)
				    OR (requester_id = ?2 AND addressee_id = ?1)
				 LIMIT 1`
			)
			.bind(locals.user.id, profileUser.id)
			.first<{ requester_id: string; addressee_id: string; status: string }>();
		if (f) {
			if (f.status === 'accepted') friendshipStatus = 'accepted';
			else if (f.status === 'pending') {
				friendshipStatus = f.requester_id === locals.user.id
					? 'pending_outgoing'
					: 'pending_incoming';
			}
		}
	}

	// Their last 50 posts (any kind: prompt answers, free-form, questions),
	// joined with the daily_prompt for the prompt-answer case so the
	// profile UI can show "answered: <prompt>" headers.
	const postsRes = await db
		.prepare(
			`SELECT
				p.id,
				p.content,
				p.created_at,
				p.prompt_id,
				p.is_question,
				dp.prompt_text AS prompt_text,
				dp.active_date AS prompt_active_date,
				(SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count
			FROM posts p
			LEFT JOIN daily_prompts dp ON dp.id = p.prompt_id
			WHERE p.user_id = ?
			ORDER BY p.created_at DESC
			LIMIT 50`
		)
		.bind(profileUser.id)
		.all<ProfilePost>();

	// Their last 50 comments — joined to the *actual* reply target.
	// For a top-level comment that's the post + post author. For a
	// nested comment that's the parent comment + parent comment author.
	// Previously we always pointed at the post author, which produced
	// "Replied to @<post-author>" for nested comments where the user
	// was actually replying to a different commenter.
	const commentsRes = await db
		.prepare(
			`SELECT
				c.id,
				c.content,
				c.created_at,
				c.post_id,
				c.parent_comment_id,
				COALESCE(pcu.username, pu.username) AS reply_target_username,
				substr(COALESCE(pc.content, p.content), 1, 140) AS reply_target_excerpt
			FROM comments c
			JOIN posts p ON p.id = c.post_id
			LEFT JOIN user pu ON pu.id = p.user_id
			LEFT JOIN comments pc ON pc.id = c.parent_comment_id
			LEFT JOIN user pcu ON pcu.id = pc.user_id
			WHERE c.user_id = ?
			ORDER BY c.created_at DESC
			LIMIT 50`
		)
		.bind(profileUser.id)
		.all<ProfileComment>();

	return {
		profileUser,
		posts: postsRes.results ?? [],
		comments: commentsRes.results ?? [],
		hasCommented,
		friendshipStatus
	};
};
