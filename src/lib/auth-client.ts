import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({
	baseURL: typeof window !== 'undefined' ? window.location.origin : ''
});

// Export convenient methods
export const {
	signIn,
	signUp,
	signOut,
	useSession,
	getSession
} = authClient;

