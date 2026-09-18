<script lang="ts">
	import { page } from '$app/state';
	import { menuOpen, toggleMenu } from '$lib/stores/menu';
	import SehyoLogo from '$lib/components/SehyoLogo.svelte';
	import type { User } from '$lib/types';

	interface Props {
		user: User | null;
		unreadCount?: number;
	}
	let { user, unreadCount = 0 }: Props = $props();
	const unread = $derived(user && !user.isAnonymous ? unreadCount : 0);
</script>

<header class="navbar">
	<a class="brand" href="/" aria-label="Sehyo home">
		<SehyoLogo size={28} />
		<span>Sehyo</span>
	</a>
	<nav aria-label="Primary" class="primary">
		<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>Community</a>
		<a href="/about" aria-current={page.url.pathname === '/about' ? 'page' : undefined}>About</a>
	</nav>
	<button
		type="button"
		class="menu-toggle"
		onclick={() => toggleMenu()}
		aria-label={`${$menuOpen ? 'Close' : 'Open'} menu${unread > 0 ? `, ${unread} unread messages` : ''}`}
		aria-expanded={$menuOpen}
		aria-haspopup="dialog"
		aria-controls="sehyo-menu"
	>
		<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
			<path d="M4 7h16M4 12h16M4 17h16" />
		</svg>
		{#if unread > 0}<span class="unread-dot" aria-hidden="true"></span>{/if}
	</button>
</header>

<style>
	.navbar { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; gap: 12px; width: 100%; max-width: 640px; margin: 0 auto; padding: 8px 16px; border-bottom: 1px solid var(--border); background: color-mix(in oklab, var(--background) 96%, transparent); backdrop-filter: blur(8px); }
	.brand { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; flex-shrink: 0; color: var(--foreground); text-decoration: none; font-size: 17px; font-weight: 650; }
	.primary { display: flex; margin-left: auto; gap: 4px; }
	.primary a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 8px; color: var(--muted-foreground); text-decoration: none; font-size: 13px; }
	.primary a[aria-current='page'] { color: var(--foreground); text-decoration: underline; text-underline-offset: 6px; }
	.primary a:hover { color: var(--foreground); }
	.menu-toggle { position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 44px; height: 44px; border: 1px solid var(--border); background: transparent; color: var(--foreground); cursor: pointer; }
	.menu-toggle:hover { border-color: var(--foreground); }
	a:focus-visible, button:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
	.unread-dot { position: absolute; top: 5px; right: 5px; width: 7px; height: 7px; border-radius: 50%; background: var(--brand); }
	@media (max-width: 360px) { .navbar { gap: 4px; padding-inline: 10px; } .brand { gap: 5px; font-size: 15px; } .primary a { padding-inline: 6px; } }
</style>
