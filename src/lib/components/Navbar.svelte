<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { promptSignIn } from '$lib/stores/sign-in-modal';
	import { menuOpen, toggleMenu } from '$lib/stores/menu';
	import type { User } from '$lib/types';

	interface Props {
		user: User | null;
		unreadCount?: number;
	}
	let { user, unreadCount = 0 }: Props = $props();

	let signingIn = $state(false);

	const isSignedIn = $derived(!!user && !user.isAnonymous);
	const profileHref = $derived(
		user ? (user.username ? `/${user.username}` : `/profile/${user.id}`) : '/'
	);

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
		try {
			await authClient.signOut();
			await goto('/');
			await invalidateAll();
		} catch (err) {
			console.error('Sign-out failed:', err);
		}
	}

	function showMessagesSignInGate(e: MouseEvent) {
		e.preventDefault();
		promptSignIn('Sign in to use messages.');
	}

	type NavLink = {
		label: string;
		href: string;
		show: boolean;
		guarded?: (e: MouseEvent) => void;
		hasUnread?: boolean;
	};

	const links = $derived<NavLink[]>(
		[
			{ label: 'Home', href: '/', show: true },
			{ label: 'Search', href: '/search', show: true },
			{
				label: 'Messages',
				href: '/messages',
				show: isSignedIn,
				hasUnread: unreadCount > 0
			},
			{ label: 'Messages', href: '/messages', show: !isSignedIn, guarded: showMessagesSignInGate },
			{ label: 'Friends', href: '/friends', show: isSignedIn },
			{ label: 'Profile', href: profileHref, show: isSignedIn },
			{ label: 'About', href: '/about', show: true }
		].filter((l) => l.show)
	);

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<header class="navbar">
	<a class="brand" href="/" aria-label="Sehyo home">
		<img src="/sehyo-logo.svg" alt="" width="32" height="32" />
		<span class="brand-text">SEHYO</span>
	</a>

	<nav class="nav-links" aria-label="Primary">
		{#each links as link (link.label + (link.guarded ? ':guarded' : ''))}
			{#if link.guarded}
				<a
					class="nav-link disabled"
					href={link.href}
					onclick={link.guarded}
					aria-disabled="true"
				>{link.label}</a>
			{:else}
				<a
					class="nav-link"
					class:active={isActive(link.href)}
					href={link.href}
				>
					{link.label}
					{#if link.hasUnread}
						<span
							class="unread-dot"
							aria-label={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}
						></span>
					{/if}
				</a>
			{/if}
		{/each}
	</nav>

	<div class="auth">
		{#if !isSignedIn}
			<button type="button" class="auth-button primary" onclick={signInGoogle} disabled={signingIn}>
				{signingIn ? 'Signing in…' : 'Sign in'}
			</button>
		{/if}
	</div>

	<!-- Mobile hamburger: hidden ≥641px. Toggles the full-screen Menu
	     overlay. Shows the same unread-dot indicator so mobile users
	     don't lose the notification cue. -->
	<button
		type="button"
		class="mobile-toggle"
		onclick={toggleMenu}
		aria-label={$menuOpen ? 'Close menu' : 'Open menu'}
		aria-expanded={$menuOpen}
	>
		{#if $menuOpen}
			<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
				<line x1="6" y1="6" x2="18" y2="18" />
				<line x1="18" y1="6" x2="6" y2="18" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
				<line x1="4" y1="7" x2="20" y2="7" />
				<line x1="4" y1="12" x2="20" y2="12" />
				<line x1="4" y1="17" x2="20" y2="17" />
			</svg>
			{#if unreadCount > 0}
				<span class="unread-dot mobile-toggle-dot" aria-label={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}></span>
			{/if}
		{/if}
	</button>
</header>

<style>
	.navbar {
		position: sticky;
		top: 0;
		z-index: 80;
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 12px 24px;
		background: color-mix(in oklab, var(--background) 92%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--border);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--foreground);
		text-decoration: none;
		flex-shrink: 0;
	}
	.brand img {
		display: block;
		width: 32px;
		height: 32px;
		border-radius: 7px;
	}
	.brand-text {
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: 18px;
		letter-spacing: 0.04em;
	}

	.nav-links {
		display: flex;
		gap: 4px;
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.nav-links::-webkit-scrollbar {
		display: none;
	}

	.nav-link {
		position: relative;
		color: var(--muted-foreground);
		text-decoration: none;
		font-size: 14px;
		font-weight: 400;
		padding: 8px 12px;
		border-radius: 8px;
		white-space: nowrap;
		transition: color 120ms ease, background 120ms ease;
	}

	/* Unread-DM indicator. The dot sits at the top-right corner of the
	   nav link, with a background-colored ring so it stays visible
	   against any link background (hover, active). */
	.unread-dot {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 9px;
		height: 9px;
		border-radius: 999px;
		background: var(--brand);
		box-shadow: 0 0 0 2px var(--background);
		pointer-events: none;
	}
	.nav-link:hover {
		color: var(--foreground);
		background: var(--muted);
	}
	.nav-link.active {
		color: var(--foreground);
	}
	.nav-link.disabled {
		color: var(--muted-foreground);
		opacity: 0.5;
		cursor: pointer;
	}

	.auth {
		flex-shrink: 0;
	}
	.auth-button {
		appearance: none;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-weight: 600;
		font-size: 14px;
		padding: 8px 16px;
		border-radius: 999px;
		cursor: pointer;
		transition: background 120ms ease, border-color 120ms ease;
	}
	.auth-button:hover {
		background: var(--muted);
	}
	.auth-button.primary {
		background: var(--foreground);
		color: var(--background);
		border-color: var(--foreground);
	}
	.auth-button.primary:hover {
		opacity: 0.88;
	}
	.auth-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Mobile hamburger button. Hidden on desktop; on mobile it replaces
	   the inline nav links + auth button. Positioned at the far right
	   via the flex layout (after `.auth`, which is itself hidden on
	   mobile so this slot collapses to the right edge). */
	.mobile-toggle {
		display: none;
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--foreground);
		padding: 8px;
		border-radius: 8px;
		cursor: pointer;
		position: relative;
		align-items: center;
		justify-content: center;
		transition: background 120ms ease;
	}
	.mobile-toggle:hover {
		background: var(--muted);
	}
	.mobile-toggle-dot {
		/* The hamburger lives in flex flow, not relative to a nav link
		   that's bigger than the dot. Pin to the top-right corner of
		   the button itself. */
		top: 2px;
		right: 2px;
	}

	@media (max-width: 640px) {
		.navbar {
			gap: 12px;
			padding: 10px 12px;
		}
		.brand-text {
			display: none;
		}
		/* Hide the inline link list and the auth pill on mobile — they
		   live inside the full-screen Menu overlay instead. */
		.nav-links,
		.auth {
			display: none;
		}
		.mobile-toggle {
			display: inline-flex;
			margin-left: auto;
		}
	}
</style>
