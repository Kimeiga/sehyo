<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps} from './$types';
	import Navbar from '$lib/components/Navbar.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';

	let { data, children }: LayoutProps = $props();

	// The minimalist home (/) handles its own navigation via the in-menu UI,
	// so the global Navbar is suppressed there.
	const showNavbar = $derived(page.url.pathname !== '/');

	// Register service worker for PWA
	onMount(async () => {
		if (pwaInfo) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({
				immediate: true,
				onRegistered(registration) {
					console.log('PWA: Service Worker registered', registration);
				},
				onRegisterError(error) {
					console.error('PWA: Service Worker registration failed', error);
				}
			});
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	{#if showNavbar}
		<Navbar user={data.user} />
	{/if}
	{@render children?.()}

	<!-- Login Modal -->
	<LoginModal open={data.showLoginModal} />
</div>
