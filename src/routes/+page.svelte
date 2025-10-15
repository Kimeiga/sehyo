<script lang="ts">
	import type { PageProps } from './$types';
	import PostCreator from '$lib/components/PostCreator.svelte';
	import Post from '$lib/components/Post.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Bot } from 'lucide-svelte';
	import { dev } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { signIn } from '$lib/auth-client';

	let { data }: PageProps = $props();

	let isTriggeringBots = $state(false);

	async function triggerBots() {
		if (isTriggeringBots) return;
		isTriggeringBots = true;

		try {
			const response = await fetch('/api/dev/trigger-bot', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				throw new Error('Failed to trigger bots');
			}

			const result = await response.json();
			console.log('Bot trigger result:', result);

			// Refresh the page to show new posts
			await invalidateAll();

			alert(`✅ Successfully triggered ${result.triggered} bot(s)!`);
		} catch (err) {
			console.error('Error triggering bots:', err);
			alert('❌ Failed to trigger bots. Check console for details.');
		} finally {
			isTriggeringBots = false;
		}
	}

	async function handleGoogleSignIn() {
		await signIn.social({
			provider: 'google',
			callbackURL: '/'
		});
	}
</script>

<svelte:head>
	<!-- Google One-Tap Sign-In -->
	<script src="https://accounts.google.com/gsi/client" async defer></script>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	{#if !data.user}
		<!-- Landing page for non-authenticated users -->
		<div class="max-w-2xl mx-auto text-center py-16">
			<h1 class="text-5xl font-bold mb-6 text-foreground">Welcome to Portfolio Facebook</h1>
			<p class="text-xl text-muted-foreground mb-8">
				Connect with friends, share moments, and stay in touch with the people who matter most.
			</p>
			<Button
				onclick={handleGoogleSignIn}
				class="bg-primary text-primary-foreground px-8 py-3 text-lg font-semibold hover:opacity-90"
			>
				Sign in with Google
			</Button>
		</div>
	{:else}
		<!-- Feed for authenticated users -->
		<div class="max-w-2xl mx-auto">
			<div class="flex items-center justify-between mb-6">
				<h1 class="text-3xl font-bold text-foreground">Home Feed</h1>

				<!-- Dev-only bot trigger button -->
				{#if dev}
					<Button
						variant="outline"
						size="sm"
						onclick={triggerBots}
						disabled={isTriggeringBots}
						class="gap-2"
					>
						<Bot class="size-4" />
						{isTriggeringBots ? 'Triggering...' : 'Trigger Bots'}
					</Button>
				{/if}
			</div>

			<!-- Post Creator (only for authenticated users) -->
			<PostCreator user={data.user} />

			<!-- Posts Feed (visible to everyone) -->
			{#if data.posts.length === 0}
				<div class="bg-card text-card-foreground rounded-lg shadow p-8 text-center">
					<p class="text-muted-foreground">No posts yet. Be the first to share something!</p>
				</div>
			{:else}
				<div class="space-y-4">
					{#each data.posts as post}
						<Post {post} currentUserId={data.user?.id} />
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
