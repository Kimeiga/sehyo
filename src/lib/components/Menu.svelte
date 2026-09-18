<script lang="ts">
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { closeMenu, menuOpen } from '$lib/stores/menu';
	import type { User } from '$lib/types';

	interface Props { user: User | null; unreadCount?: number; }
	let { user, unreadCount = 0 }: Props = $props();
	let dialog = $state<HTMLDialogElement>();
	let pending = $state<'in' | 'out' | null>(null);
	let error = $state('');
	const isSignedIn = $derived(!!user && !user.isAnonymous);

	// Native modal behavior supplies background inertness, Escape handling and
	// focus restoration. Explicit Tab wrapping keeps focus inside the menu.
	$effect(() => {
		if (!dialog) return;
		if ($menuOpen && !dialog.open) dialog.showModal();
		else if (!$menuOpen && dialog.open) dialog.close();
	});
	$effect(() => {
		if (!$menuOpen) return;
		const previous = document.documentElement.style.overflow;
		document.documentElement.style.overflow = 'hidden';
		return () => { document.documentElement.style.overflow = previous; };
	});
	afterNavigate(closeMenu);

	function containTab(event: KeyboardEvent) {
		if (event.key !== 'Tab' || !dialog) return;
		const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
			.filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
		const first = controls[0];
		const last = controls[controls.length - 1];
		if (!first || !last) return;
		if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	async function signInGoogle() {
		if (pending) return;
		pending = 'in'; error = '';
		try {
			const result = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
			if (result.error) throw new Error('Could not start sign-in. Try again.');
		} catch {
			error = 'Could not start sign-in. Try again.';
		} finally { pending = null; }
	}

	async function signOut() {
		if (pending) return;
		pending = 'out'; error = '';
		try {
			const result = await authClient.signOut();
			if (result.error) throw new Error('Could not sign out. Try again.');
			closeMenu();
			await goto('/');
			await invalidateAll();
		} catch {
			error = 'Could not sign out. Try again.';
		} finally { pending = null; }
	}
</script>

<dialog
	id="sehyo-menu"
	bind:this={dialog}
	aria-labelledby="menu-title"
	onkeydown={containTab}
	oncancel={(event) => { event.preventDefault(); closeMenu(); }}
	onclose={() => { if (!dialog?.open) closeMenu(); }}
>
	<div class="heading">
		<h2 id="menu-title">Sehyo</h2>
		<button type="button" class="close" aria-label="Close menu" onclick={closeMenu}>Close <span aria-hidden="true">×</span></button>
	</div>
	<nav aria-label="Main menu">
		<a href="/" onclick={closeMenu} aria-current={page.url.pathname === '/' ? 'page' : undefined}>Community <span>Posts and conversations</span></a>
		<a href="/about" onclick={closeMenu} aria-current={page.url.pathname === '/about' ? 'page' : undefined}>About <span>How Sehyo works</span></a>
		{#if isSignedIn}
			<a href="/messages" onclick={closeMenu} aria-current={page.url.pathname.startsWith('/messages') ? 'page' : undefined}>Messages <span>{unreadCount > 0 ? `${unreadCount} unread` : 'Your conversations'}</span></a>
		{/if}
	</nav>
	<div class="account">
		{#if isSignedIn}
			<button type="button" onclick={signOut} disabled={pending !== null}>{pending === 'out' ? 'Signing out…' : 'Sign out'}</button>
		{:else}
			<p>Browse without an account.</p>
			<button type="button" onclick={signInGoogle} disabled={pending !== null}>{pending === 'in' ? 'Opening Google…' : 'Sign in with Google'}</button>
		{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
</dialog>

<style>
	dialog { width: min(560px, calc(100% - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 24px; overflow: auto; border: 1px solid var(--border); background: var(--background); color: var(--foreground); }
	dialog::backdrop { background: rgb(0 0 0 / 75%); backdrop-filter: blur(6px); }
	.heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 16px; }
	h2 { margin: 0; font-size: 18px; font-weight: 650; }
	button { min-height: 44px; padding: 10px 14px; border: 1px solid var(--border); background: transparent; color: var(--foreground); font: inherit; cursor: pointer; }
	.close { display: inline-flex; align-items: center; gap: 12px; font-size: 14px; }
	.close span { font-size: 24px; line-height: 1; }
	nav { display: grid; }
	nav a { display: grid; gap: 6px; padding: 20px 0; border-top: 1px solid var(--border); color: var(--foreground); text-decoration: none; font-size: clamp(24px, 6vw, 32px); line-height: 1.2; }
	nav a span { color: var(--muted-foreground); font-size: 14px; }
	nav a[aria-current='page'] { text-decoration: underline; text-underline-offset: 6px; }
	nav a:hover { color: var(--brand); }
	button:hover { border-color: var(--foreground); }
	a:focus-visible, button:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
	button:disabled { opacity: .6; cursor: progress; }
	.account { display: grid; gap: 12px; padding-top: 20px; border-top: 1px solid var(--border); }
	.account p { margin: 0; font-size: 14px; color: var(--muted-foreground); }
	.account .error { color: var(--foreground); }
	@media (max-width: 360px) { dialog { padding: 18px; } }
</style>
