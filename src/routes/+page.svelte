<script lang="ts">
	import type { PageProps } from './$types';
	import PostCreator from '$lib/components/PostCreator.svelte';
	import Post from '$lib/components/Post.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Bot } from 'lucide-svelte';
	import { dev } from '$app/environment';
	import { invalidateAll } from '$app/navigation';

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
</script>

<div class="container mx-auto px-4 py-8">
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
		{#if data.user}
			<PostCreator user={data.user} />
		{:else}
			<!-- Sign in prompt for non-authenticated users -->
			<Card class="mb-6">
				<CardContent class="p-6 text-center">
					<p class="text-muted-foreground mb-4">Sign in to create posts and interact with content</p>
					<a
						href="/auth/login"
						class="inline-block bg-primary text-primary-foreground px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition"
					>
						Sign In
					</a>
				</CardContent>
			</Card>
		{/if}

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
</div>
