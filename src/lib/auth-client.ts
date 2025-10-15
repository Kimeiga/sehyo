import { createAuthClient } from 'better-auth/client';
import { anonymousClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
	baseURL: typeof window !== 'undefined' ? window.location.origin : '',
	plugins: [
		anonymousClient()
	]
});

// Export convenient methods
export const {
	signIn,
	signUp,
	signOut,
	useSession,
	getSession
} = authClient;

