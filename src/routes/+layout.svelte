<script lang="ts">
	import '../app.css';
	import type { LayoutProps } from './$types';
	import Menu from '$lib/components/Menu.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import { menuOpen, openMenu } from '$lib/stores/menu';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';

	let { data, children }: LayoutProps = $props();

	// On the home route, the page itself renders a giant centered logo.
	// Everywhere else, a small floating logo button lives in the corner so the
	// menu is always reachable.
	const showFloatingLogo = $derived(page.url.pathname !== '/');

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
</svelte:head>

<div class="app">
	{#if showFloatingLogo && !$menuOpen}
		<button
			type="button"
			class="floating-logo"
			onclick={openMenu}
			aria-label="Open menu"
		>
			<img src="/sehyo-logo.svg" alt="" width="44" height="44" />
		</button>
	{/if}

	{@render children?.()}

	<Menu user={data.user} prompt={data.prompt ?? null} answers={data.answers ?? []} />

	<LoginModal open={data.showLoginModal} />
</div>

<style>
	.app {
		min-height: 100dvh;
		background: var(--background);
		color: var(--foreground);
	}

	.floating-logo {
		position: fixed;
		top: 14px;
		left: 14px;
		z-index: 50;
		appearance: none;
		border: 0;
		padding: 0;
		background: transparent;
		cursor: pointer;
		border-radius: 10px;
		transition: transform 160ms ease, box-shadow 160ms ease;
	}
	.floating-logo img {
		display: block;
		border-radius: 10px;
		box-shadow: 0 6px 20px -8px color-mix(in oklab, var(--primary) 60%, transparent);
	}
	.floating-logo:hover { transform: scale(1.06); }
	.floating-logo:active { transform: scale(0.96); }
</style>
