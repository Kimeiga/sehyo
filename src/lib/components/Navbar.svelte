<script lang="ts">
	import { menuOpen, toggleMenu } from '$lib/stores/menu';
	import SehyoLogo from '$lib/components/SehyoLogo.svelte';
	import type { User } from '$lib/types';

	interface Props {
		user: User | null;
		unreadCount?: number;
	}
	let { user, unreadCount = 0 }: Props = $props();
</script>

<header class="navbar">
	<a class="brand" href="/" aria-label="Sehyo home">
		<SehyoLogo size={32} />
	</a>

	<!-- The hamburger toggle is the only nav affordance on every
	     viewport. Clicking it opens the fullscreen Menu overlay
	     (defined once in +layout.svelte) which renders the link
	     list with the WebGL ripple effect. -->
	<button
		type="button"
		class="mobile-toggle"
		onclick={(e) => {
			/* Pass the button's screen-space center AND its half-
			   extent so the Menu's reveal animation can use the
			   center as the circle epicenter and start the reveal
			   circle at exactly the button's size (no jarring
			   first-frame jump from 0 → ~hundreds of pixels). */
			const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
			toggleMenu({
				x: rect.left + rect.width / 2,
				y: rect.top + rect.height / 2,
				r: Math.max(rect.width, rect.height) / 2
			});
		}}
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
		/* z-index 100 puts the navbar above the fullscreen Menu
		   overlay (z-index 90), so the brand + hamburger stay
		   visible while the menu is open and the X close button
		   stays clickable. */
		z-index: 100;
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
	/* Unread-DM indicator. Used by the hamburger button's
	   .mobile-toggle-dot to surface notifications without the user
	   having to open the menu. */
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

	/* Hamburger toggle button. Always visible (mobile + desktop) —
	   the inline link list and auth button are gone, the hamburger
	   is the universal entry to the fullscreen menu overlay. */
	.mobile-toggle {
		display: inline-flex;
		margin-left: auto;
		appearance: none;
		/* Transparent border by default so the box reserves the
		   1px on each side at all times — switching to a visible
		   white border on hover doesn't shift the icon by 1px. */
		border: 1px solid transparent;
		background: transparent;
		color: var(--foreground);
		padding: 8px;
		/* Square corners as requested. */
		border-radius: 0;
		cursor: pointer;
		position: relative;
		align-items: center;
		justify-content: center;
		transition: border-color 120ms ease;
	}
	.mobile-toggle:hover {
		border-color: #fff;
	}
	.mobile-toggle-dot {
		top: 2px;
		right: 2px;
	}

	@media (max-width: 640px) {
		.navbar {
			gap: 12px;
			padding: 10px 12px;
		}
	}
</style>
