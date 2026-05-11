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
		'Sehyo (製評, "to make commentary") is the most human social media on earth™. A calm, thoughtful place to share what you really think.';

	const ogUrl = $derived(`${SITE}${page.url.pathname}`);
	const ogTitle = $derived('Sehyo — the most human social media on earth™');
	// OG description (Twitter / Facebook share previews) leans into the
	// daily prompt when one exists — that's the most enticing thing to
	// show in a share card.
	const ogDescription = $derived(
		data.prompt
			? `Today on Sehyo: ${data.prompt.text} A calm, thoughtful place to share what you really think.`
			: DEFAULT_DESC
	);
	// Standard <meta description> — surfaced in search results, summary
	// snippets, and "View page source" tooling. Always lead with the
	// tagline so the home page reads as Sehyo first, today's question
	// second.
	const metaDescription = $derived(
		data.prompt
			? `Sehyo — the most human social media on earth™. Today's question: ${data.prompt.text}`
			: DEFAULT_DESC
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

	<!-- Per-page description. Not OG, just standard. Lead with the
	     "the most human social media on earth™" tagline — the home
	     page used to lose it because the OG copy was overriding it
	     here too. -->
	<meta name="description" content={metaDescription} />
</svelte:head>

<div class="app" class:names-blurred={data.namesBlurred}>
	<Navbar user={data.user} unreadCount={data.unreadMessageCount ?? 0} />

	{@render children?.()}

	<!-- Fullscreen Menu instance — only activates on mobile viewports
	     (<641px). The compact instance lives inside Navbar. -->
	<Menu user={data.user} unreadCount={data.unreadMessageCount ?? 0} mode="fullscreen" />
	<LoginModal open={data.showLoginModal} />
	<SignInModal />
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
</style>
