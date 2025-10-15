<script lang="ts">
	import type { PageProps } from './$types';
	import PostCreator from '$lib/components/PostCreator.svelte';
	import Post from '$lib/components/Post.svelte';

	let { data }: PageProps = $props();
</script>

<div class="container mx-auto px-4 py-8">
	{#if !data.user}
		<!-- Landing page for non-authenticated users -->
		<div class="max-w-2xl mx-auto text-center py-16">
			<h1 class="text-5xl font-bold mb-6">Welcome to Portfolio Facebook</h1>
			<p class="text-xl text-gray-600 mb-8">
				Connect with friends, share moments, and stay in touch with the people who matter most.
			</p>
			<a
				href="/auth/login"
				class="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
			>
				Sign in with Google
			</a>
		</div>
	{:else}
		<!-- Feed for authenticated users -->
		<div class="max-w-2xl mx-auto">
			<h1 class="text-3xl font-bold mb-6">Home Feed</h1>

			<!-- Post Creator -->
			<PostCreator user={data.user} />

			<!-- Posts Feed -->
			{#if data.posts.length === 0}
				<div class="bg-white rounded-lg shadow p-8 text-center">
					<p class="text-gray-600">No posts yet. Be the first to share something!</p>
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
