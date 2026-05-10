<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { menuOpen, closeMenu } from '$lib/stores/menu';
	import { promptSignIn } from '$lib/stores/sign-in-modal';
	import type { User } from '$lib/types';

	interface Props {
		user: User | null;
		unreadCount?: number;
	}
	let { user, unreadCount = 0 }: Props = $props();

	let signingIn = $state(false);

	$effect(() => {
		if (!$menuOpen) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = prev; };
	});

	onMount(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') closeMenu();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	async function navigate(path: string) {
		// Hold the menu open until the destination has actually loaded so
		// the user never sees a flash of the previous page. View
		// Transitions API is used opportunistically when supported for a
		// smoother fade between menu and the new page; otherwise we just
		// fall back to plain navigation.
		const startTransition = (document as any).startViewTransition?.bind(document);
		if (typeof startTransition === 'function') {
			const t = startTransition(async () => {
				await goto(path);
				closeMenu();
			});
			try { await t.finished; } catch { /* user cancelled; ignore */ }
		} else {
			await goto(path);
			closeMenu();
		}
	}

	async function signInGoogle() {
		if (signingIn) return;
		signingIn = true;
		try {
			// authClient.signIn.social redirects the browser to Google. The
			// callbackURL brings the user back to the home feed after auth.
			await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
		} catch (err) {
			console.error('Google sign-in failed:', err);
			alert('Could not start sign-in. Try again.');
			signingIn = false;
		}
	}

	async function signOut() {
		try {
			await authClient.signOut();
			closeMenu();
			await goto('/');
			await invalidateAll();
		} catch (err) {
			console.error('Sign-out failed:', err);
		}
	}

	function showSignInGate() {
		closeMenu();
		promptSignIn('Sign in to use messages.');
	}

	const isSignedIn = $derived(!!user && !user.isAnonymous);

	type Item = {
		label: string;
		onSelect: () => void | Promise<void>;
		show: boolean;
		disabled?: boolean;
		hasUnread?: boolean;
	};

	const items = $derived<Item[]>(
		[
			{ label: 'Home',     onSelect: () => navigate('/'),                    show: true },
			{ label: 'Search',   onSelect: () => navigate('/search'),              show: true },
			{ label: 'Messages', onSelect: () => navigate('/messages'),            show: isSignedIn, hasUnread: unreadCount > 0 },
			{ label: 'Messages', onSelect: showSignInGate,                         show: !isSignedIn, disabled: true },
			{ label: 'Friends',  onSelect: () => navigate('/friends'),             show: isSignedIn },
			{ label: 'Profile',  onSelect: () => { if (user) navigate(user.username ? `/${user.username}` : `/profile/${user.id}`); }, show: isSignedIn },
			{ label: 'About',    onSelect: () => navigate('/about'),               show: true },
			{ label: 'Sign in',  onSelect: signInGoogle,                           show: !isSignedIn },
			{ label: 'Sign out', onSelect: signOut,                                show: isSignedIn }
		].filter((it) => it.show)
	);
</script>

{#if $menuOpen}
	<div class="menu" role="dialog" aria-modal="true" aria-label="Menu">
		<nav class="nav-list">
			{#each items as item, i (item.label + (item.disabled ? ':d' : ''))}
				<button
					type="button"
					class="nav-item"
					class:disabled={item.disabled}
					style="animation-delay: {30 + i * 28}ms"
					onclick={item.onSelect}
					disabled={signingIn}
				>
					<span class="nav-item-label">{item.label}</span>
					{#if item.hasUnread}
						<span class="nav-item-dot" aria-label="unread"></span>
					{/if}
				</button>
			{/each}
		</nav>
	</div>
{/if}

<style>
	.menu {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: var(--background);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeBg 180ms ease-out;
	}
	@keyframes fadeBg {
		from { opacity: 0; }
		to   { opacity: 1; }
	}
	.nav-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 64px 24px;
		max-width: 480px;
		width: 100%;
	}
	.nav-item {
		appearance: none;
		border: 0;
		background: transparent;
		text-align: left;
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.025em;
		font-size: clamp(32px, 7vw, 48px);
		line-height: 1.05;
		color: var(--foreground);
		padding: 8px 0;
		cursor: pointer;
		opacity: 0;
		transform: translateY(-12px);
		animation: slideDown 320ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
		transition: opacity 160ms ease;
		display: inline-flex;
		align-items: center;
		gap: 12px;
	}
	.nav-item-label {
		display: inline-block;
	}
	.nav-item-dot {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--brand);
		flex-shrink: 0;
	}
	.nav-item:hover {
		opacity: 0.6;
	}
	.nav-item.disabled {
		color: var(--muted-foreground);
		opacity: 0.45;
	}
	.nav-item.disabled:hover {
		opacity: 0.55;
	}
	@keyframes slideDown {
		from { opacity: 0; transform: translateY(-14px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	@media (prefers-reduced-motion: reduce) {
		.menu, .nav-item { animation: none !important; opacity: 1 !important; transform: none !important; }
	}
</style>
