<script lang="ts">
	import { onMount } from 'svelte';
	import { signInModal, closeSignInModal } from '$lib/stores/sign-in-modal';
	import { authClient } from '$lib/auth-client';
	import { X } from 'lucide-svelte';

	let busy = $state(false);

	$effect(() => {
		if (!$signInModal.open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = prev; };
	});

	onMount(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') closeSignInModal();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	async function signIn() {
		if (busy) return;
		busy = true;
		try {
			await authClient.signIn.social({
				provider: 'google',
				callbackURL: typeof window !== 'undefined' ? window.location.pathname : '/'
			});
		} catch (err) {
			console.error('Google sign-in failed:', err);
			alert('Could not start sign-in. Try again.');
			busy = false;
		}
	}
</script>

{#if $signInModal.open}
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Sign in"
		tabindex="-1"
		onclick={closeSignInModal}
		onkeydown={(e) => e.key === 'Escape' && closeSignInModal()}
	>
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
			<button
				type="button"
				class="close"
				aria-label="Close"
				onclick={closeSignInModal}
			>
				<X size="18" strokeWidth="2" />
			</button>

			<p class="prompt">{$signInModal.message}</p>

			<button type="button" class="google-button" onclick={signIn} disabled={busy}>
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
					<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
					<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
					<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
				</svg>
				{busy ? 'Signing in…' : 'Continue with Google'}
			</button>

			<p class="fine">Your existing posts and comments will be linked to your new account.</p>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 110;
		background: color-mix(in oklab, var(--background) 85%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		animation: fade 160ms ease-out;
	}
	@keyframes fade {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	.modal {
		position: relative;
		width: 100%;
		max-width: 420px;
		background: var(--card);
		color: var(--card-foreground);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 32px 28px 24px;
		box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.5);
		animation: pop 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	@keyframes pop {
		from { opacity: 0; transform: translateY(8px) scale(0.98); }
		to { opacity: 1; transform: none; }
	}
	.close {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 32px;
		height: 32px;
		border-radius: 16px;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.close:hover {
		background: var(--muted);
		color: var(--foreground);
	}
	.prompt {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.02em;
		font-size: 26px;
		line-height: 1.2;
		color: var(--foreground);
		margin: 0 0 24px;
	}
	.google-button {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		padding: 12px 18px;
		border-radius: 999px;
		background: var(--foreground);
		color: var(--background);
		font-weight: 600;
		font-size: 15px;
		font-family: var(--font-sans);
		cursor: pointer;
		border: 0;
	}
	.google-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.google-button svg {
		background: white;
		border-radius: 999px;
	}
	.fine {
		margin: 14px 0 0;
		font-size: 12px;
		color: var(--muted-foreground);
		line-height: 1.45;
	}
</style>
