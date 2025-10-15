<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import { authClient } from '$lib/auth-client';
	import { onMount } from 'svelte';

	let loading = $state(false);
	let guestButtonRef: HTMLButtonElement;

	onMount(() => {
		console.log('onMount called, guestButtonRef:', guestButtonRef);
		// Attach the click handler after the component is mounted
		if (guestButtonRef) {
			console.log('Attaching click handler to guest button');
			guestButtonRef.addEventListener('click', async (e) => {
				console.log('Guest button clicked!');
				e.preventDefault();
				e.stopPropagation();
				loading = true;
				try {
					console.log('Calling authClient.signIn.anonymous()');
					const result = await authClient.signIn.anonymous();
					console.log('Anonymous login result:', result);
					alert('Anonymous login successful! Check console for result. Will redirect in 5 seconds.');
					setTimeout(() => {
						window.location.href = '/';
					}, 5000);
				} catch (error) {
					console.error('Anonymous login error:', error);
					alert('Failed to sign in anonymously. Error: ' + error.message);
					loading = false;
				}
			});
		} else {
			console.error('guestButtonRef is null!');
		}
	});
</script>

<div class="min-h-screen flex items-center justify-center bg-background px-4">
	<Card class="w-full max-w-md">
		<CardHeader class="text-center">
			<div class="w-16 h-16 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
				<span class="text-primary-foreground font-bold text-3xl">f</span>
			</div>
			<CardTitle class="text-2xl">Welcome to Portfolio Facebook</CardTitle>
			<CardDescription>
				Connect with friends, share moments, and stay in touch
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- Google Sign In -->
			<a href="/auth/login/google" class="block">
				<Button class="w-full" size="lg">
					<svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
						<path
							fill="currentColor"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="currentColor"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						/>
						<path
							fill="currentColor"
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						/>
						<path
							fill="currentColor"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						/>
					</svg>
					Continue with Google
				</Button>
			</a>

			<div class="relative">
				<div class="absolute inset-0 flex items-center">
					<Separator />
				</div>
				<div class="relative flex justify-center text-xs uppercase">
					<span class="bg-card px-2 text-muted-foreground">Or</span>
				</div>
			</div>

			<!-- Anonymous Sign In -->
			<button
				bind:this={guestButtonRef}
				type="button"
				class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-10 px-6 w-full"
				disabled={loading}
			>
				{loading ? 'Signing in...' : 'Continue as Guest'}
			</button>

			<p class="text-xs text-center text-muted-foreground">
				Guest accounts are temporary and will expire after 24 hours.
				<br />
				Sign in with Google to save your data permanently.
			</p>
		</CardContent>
	</Card>
</div>

