import { Database } from './db';
import type { User } from '$lib/types';

export interface GoogleUserInfo {
	sub: string; // Google user ID
	email: string;
	name: string;
	picture?: string;
}

export class AuthService {
	constructor(private db: Database) {}

	async createOrUpdateUserFromGoogle(googleUser: GoogleUserInfo): Promise<User> {
		// Check if user exists
		let user = await this.db.getUserByGoogleId(googleUser.sub);

		if (user) {
			// Update existing user
			return await this.db.updateUser(user.id, {
				email: googleUser.email,
				display_name: googleUser.name,
				profile_picture_url: googleUser.picture || user.profile_picture_url
			});
		} else {
			// Create new user
			const userId = crypto.randomUUID();
			return await this.db.createUser({
				id: userId,
				google_id: googleUser.sub,
				email: googleUser.email,
				display_name: googleUser.name,
				profile_picture_url: googleUser.picture
			});
		}
	}

	async createSession(user_id: string): Promise<string> {
		const sessionId = crypto.randomUUID();
		const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

		await this.db.createSession({
			id: sessionId,
			user_id,
			expires_at: expiresAt
		});

		return sessionId;
	}

	async validateSession(sessionId: string): Promise<User | null> {
		const session = await this.db.getSession(sessionId);
		if (!session) return null;

		return await this.db.getUserById(session.user_id);
	}

	async deleteSession(sessionId: string): Promise<void> {
		await this.db.deleteSession(sessionId);
	}
}

// Helper function to get Google OAuth URL
export function getGoogleOAuthURL(
	clientId: string,
	redirectUri: string,
	state: string
): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		state,
		access_type: 'offline',
		prompt: 'consent'
	});

	return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Helper function to exchange code for tokens
export async function exchangeCodeForTokens(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<{ access_token: string; id_token: string }> {
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});

	if (!response.ok) {
		throw new Error('Failed to exchange code for tokens');
	}

	return await response.json();
}

// Helper function to get user info from Google
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
	const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: {
			Authorization: `Bearer ${accessToken}`
		}
	});

	if (!response.ok) {
		throw new Error('Failed to get user info from Google');
	}

	return await response.json();
}

// Helper to decode JWT (simple version, for id_token)
export function decodeJWT(token: string): any {
	const parts = token.split('.');
	if (parts.length !== 3) {
		throw new Error('Invalid JWT');
	}

	const payload = parts[1];
	const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
	return JSON.parse(decoded);
}

