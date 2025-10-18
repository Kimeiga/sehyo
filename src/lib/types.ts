// User types - matches Better Auth schema
export interface User {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string | null; // Better Auth uses 'name' instead of 'display_name'
	image: string | null; // Better Auth uses 'image' instead of 'profile_picture_url'
	createdAt: Date | number; // Better Auth uses camelCase
	updatedAt: Date | number; // Better Auth uses camelCase
	bot_id: string | null; // Bot identifier (for bot users only)
	username: string | null;
	bio: string | null;
	location: string | null;
	website: string | null;
	cover_image_url: string | null;
	public_key: string | null; // For E2E encrypted messaging
	isAnonymous: boolean | null;
	sprite_id: number | null; // Sprite avatar ID (1-125)
}

// Post types
export interface Post {
	id: string;
	user_id: string;
	content: string;
	image_url: string | null;
	created_at: number;
	updated_at: number;
	user?: User; // Populated via join
	reaction_counts?: ReactionCounts;
	user_reaction?: string | null;
	comment_count?: number;
}

// Comment types
export interface Comment {
	id: string;
	post_id: string;
	user_id: string;
	parent_comment_id: string | null;
	content: string;
	created_at: number;
	updated_at: number;
	user?: User;
	reaction_counts?: ReactionCounts;
	user_reaction?: string | null;
	replies?: Comment[];
}

// Reaction types
export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry';

export interface Reaction {
	id: string;
	user_id: string;
	target_type: 'post' | 'comment';
	target_id: string;
	reaction_type: ReactionType;
	created_at: number;
}

export interface ReactionCounts {
	like: number;
	love: number;
	haha: number;
	wow: number;
	sad: number;
	angry: number;
	total: number;
}

// Friendship types
export type FriendshipStatus = 'pending' | 'accepted' | 'rejected' | 'blocked';

export interface Friendship {
	id: string;
	requester_id: string;
	addressee_id: string;
	status: FriendshipStatus;
	created_at: number;
	updated_at: number;
}

// Message types
export interface Message {
	id: string;
	sender_id: string;
	recipient_id: string;
	encrypted_content: string;
	sender_public_key: string;
	recipient_public_key: string;
	iv: string;
	created_at: number;
	read_at: number | null;
	sender?: User;
	recipient?: User;
}

export interface DecryptedMessage {
	id: string;
	sender_id: string;
	recipient_id: string;
	content: string; // Decrypted content
	created_at: number;
	read_at: number | null;
	sender?: User;
	recipient?: User;
}

// Session types
export interface Session {
	id: string;
	user_id: string;
	expires_at: number;
	created_at: number;
}

// Encryption key types
export interface UserKeys {
	user_id: string;
	public_key: string;
	created_at: number;
}

// API Response types
export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

// Pagination types
export interface PaginatedResponse<T> {
	items: T[];
	total: number;
	page: number;
	per_page: number;
	has_more: boolean;
}

