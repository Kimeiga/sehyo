<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import Navbar from '$lib/components/Navbar.svelte';
	import { onMount } from 'svelte';

	let { data, children }: LayoutProps = $props();

	onMount(() => {
		// Initialize Google One-Tap
		if (!data.user && typeof window !== 'undefined') {
			// @ts-ignore - Google One-Tap types
			if (window.google?.accounts?.id) {
				// @ts-ignore
				window.google.accounts.id.initialize({
					client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
					callback: handleGoogleOneTap,
					auto_select: true,
					cancel_on_tap_outside: false
				});

				// Display the One-Tap prompt
				// @ts-ignore
				window.google.accounts.id.prompt();
			}
		}
	});

	async function handleGoogleOneTap(response: any) {
		try {
			// Send the credential to Better Auth
			const res = await fetch('/api/auth/callback/google', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					credential: response.credential
				})
			});

			if (res.ok) {
				// Reload the page to update the session
				window.location.reload();
			}
		} catch (error) {
			console.error('One-Tap sign-in failed:', error);
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- Google One-Tap Script -->
	{#if !data.user}
		<script src="https://accounts.google.com/gsi/client" async defer></script>
	{/if}
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<Navbar user={data.user} />
	{@render children?.()}
</div>
