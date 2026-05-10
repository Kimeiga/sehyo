<script lang="ts">
	import '../app.css';
	import type { LayoutProps } from './$types';
	import Menu from '$lib/components/Menu.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import { menuOpen, toggleMenu } from '$lib/stores/menu';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';

	let { data, children }: LayoutProps = $props();

	const SITE = 'https://sehyo.com';
	const DEFAULT_DESC = 'A daily question. Share your thoughts.';

	const ogUrl = $derived(`${SITE}${page.url.pathname}`);
	const ogTitle = $derived('Sehyo — share your thoughts');
	const ogDescription = $derived(
		data.prompt ? `Today's question: ${data.prompt.text}` : DEFAULT_DESC
	);
	const ogImage = $derived(`${SITE}/og-default.png`);

	onMount(async () => {
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({
				immediate: true,
				onRegistered(reg) { console.log('PWA: SW registered', reg); },
				onRegisterError(err) { console.error('PWA: SW failed', err); }
			});
		}
	});
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="/sehyo-logo.svg" />
	<link rel="alternate icon" type="image/png" href="/favicon.png" />
	<link rel="apple-touch-icon" href="/pwa-192x192.png" />
	<link rel="canonical" href={ogUrl} />

	<!-- Open Graph -->
	<meta property="og:site_name" content="Sehyo" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={ogUrl} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:type" content="image/png" />

	<!-- Twitter card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={ogTitle} />
	<meta name="twitter:description" content={ogDescription} />
	<meta name="twitter:image" content={ogImage} />

	<!-- Per-page description. Not OG, just standard. -->
	<meta name="description" content={ogDescription} />
</svelte:head>

<div class="app" class:names-blurred={data.namesBlurred}>
	<button
		type="button"
		class="logo-button"
		class:open={$menuOpen}
		onclick={toggleMenu}
		aria-label={$menuOpen ? 'Close menu' : 'Open menu'}
		aria-expanded={$menuOpen}
	>
		{#if $menuOpen}
			<svg class="x-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
				<line x1="6" y1="6" x2="18" y2="18" />
				<line x1="18" y1="6" x2="6" y2="18" />
			</svg>
		{:else}
			<img src="/sehyo-logo.svg" alt="" width="40" height="40" />
		{/if}
	</button>

	{@render children?.()}

	<Menu user={data.user} />
	<LoginModal open={data.showLoginModal} />
</div>

<style>
	.app {
		min-height: 100dvh;
		background: var(--background);
		color: var(--foreground);
	}

	/* Author names are masked until the viewer commits to engaging.
	   Applied at the layout level so every page picks it up. */
	.app.names-blurred :global(.author-mask) {
		filter: blur(5px);
		user-select: none;
		pointer-events: none;
	}

	.logo-button {
		position: fixed;
		top: 16px;
		left: 16px;
		z-index: 100;
		appearance: none;
		border: 0;
		padding: 0;
		width: 44px;
		height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		cursor: pointer;
		border-radius: 10px;
		color: var(--foreground);
		transition: transform 160ms ease;
	}
	.logo-button img {
		display: block;
		width: 40px;
		height: 40px;
		border-radius: 9px;
	}
	.logo-button:hover { transform: scale(1.06); }
	.logo-button:active { transform: scale(0.94); }
	.logo-button.open { color: var(--foreground); }
	.logo-button:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
	}
</style>
