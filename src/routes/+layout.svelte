<script lang="ts">
	import '../app.css';
	import type { LayoutProps } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';
	import Menu from '$lib/components/Menu.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import SignInModal from '$lib/components/SignInModal.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';

	let { data, children }: LayoutProps = $props();

	const SITE = 'https://sehyo.com';
	const DEFAULT_DESC =
		'Sehyo is a masked global timeline for low-stakes posts, plans, asks, offers, and honest conversation without a real-name performance layer.';

	const ogUrl = $derived(`${SITE}${page.url.pathname}`);
	const ogTitle = $derived('Sehyo — post without making it your public identity');
	const ogDescription = $derived(DEFAULT_DESC);
	const metaDescription = $derived(DEFAULT_DESC);
	const showLoginModal = $derived(
		(data as LayoutProps['data'] & { showLoginModal?: boolean }).showLoginModal ?? false
	);
	// Dynamic prompt-of-the-day image. Generated edge-side via workers-og.
	// Lives under /api/og so SvelteKit-Cloudflare doesn't apply its
	// static-asset cache-control override (which would mark the response
	// `immutable, max-age=14400` and prevent re-fetch by browsers and
	// social-card scrapers).
	const ogImage = $derived(`${SITE}/api/og`);

	onMount(async () => {
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({
				immediate: true,
				onRegistered(reg) {
					console.log('PWA: SW registered', reg);
				},
				onRegisterError(err) {
					console.error('PWA: SW failed', err);
				}
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

	<meta name="description" content={metaDescription} />
</svelte:head>

<div class="app" class:names-blurred={data.namesBlurred}>
	<Navbar user={data.user} unreadCount={data.unreadMessageCount ?? 0} />

	{@render children?.()}

	<!-- Fullscreen Menu overlay — opened by the hamburger in Navbar.
	     Same component, every viewport. -->
	<Menu user={data.user} unreadCount={data.unreadMessageCount ?? 0} />
	<LoginModal open={showLoginModal} />
	<SignInModal />
</div>

<style>
	.app {
		min-height: 100dvh;
		background: var(--background);
		color: var(--foreground);
	}
	.app.names-blurred :global(.author-mask) {
		filter: none;
		user-select: auto;
		pointer-events: auto;
	}
</style>
