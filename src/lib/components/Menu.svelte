<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { closeMenu, menuOpen } from '$lib/stores/menu';
	import type { User } from '$lib/types';

	interface Props {
		user: User | null;
		unreadCount?: number;
	}

	let { user, unreadCount = 0 }: Props = $props();
	let signingIn = $state(false);
	const isSignedIn = $derived(!!user && !user.isAnonymous);

	async function navigate(path: string) {
		await goto(path);
		closeMenu();
	}

	async function signInGoogle() {
		if (signingIn) return;
		signingIn = true;
		try {
			await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
		} catch (err) {
			console.error('Google sign-in failed:', err);
			alert('Could not start sign-in. Try again.');
			signingIn = false;
		}
	}

	async function signOut() {
		await authClient.signOut();
		closeMenu();
		await goto('/');
		await invalidateAll();
	}

</script>

{#if $menuOpen}
	<div class="overlay" role="presentation">
		<button type="button" class="backdrop" aria-label="Close menu" onclick={closeMenu}></button>
		<nav class="panel" aria-label="Main menu">
			<p class="eyebrow">Sehyo</p>
			<button type="button" onclick={() => navigate('/')}>Home</button>
			<button type="button" onclick={() => navigate('/about')}>About</button>
			<div class="rule"></div>
			{#if isSignedIn}
				<button type="button" onclick={signOut}>Sign out</button>
			{:else}
				<button type="button" onclick={signInGoogle} disabled={signingIn}>
					{signingIn ? 'Opening Google…' : 'Sign in with Google'}
				</button>
			{/if}
		</nav>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: flex;
		justify-content: center;
		background: color-mix(in oklab, var(--background) 82%, transparent);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		animation: fade-in 140ms ease-out;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background: transparent;
		cursor: default;
	}

	.panel {
		position: relative;
		width: min(640px, 100%);
		padding: 86px 20px 32px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.eyebrow {
		margin: 0 0 14px;
		color: var(--muted-foreground);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	button {
		width: 100%;
		border: 1px solid transparent;
		background: transparent;
		color: var(--foreground);
		padding: 14px 0;
		text-align: left;
		font-size: clamp(28px, 8vw, 52px);
		line-height: 1;
		font-weight: 650;
		letter-spacing: 0;
		cursor: pointer;
	}

	button:hover,
	button:focus-visible {
		color: var(--brand);
		outline: none;
	}

	button:disabled {
		opacity: 0.5;
		cursor: progress;
	}

	.rule {
		height: 1px;
		background: var(--border);
		margin: 12px 0;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
