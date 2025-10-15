<script lang="ts">
	import type { PageProps } from './$types';
	import Post from '$lib/components/Post.svelte';
	import FriendButton from '$lib/components/FriendButton.svelte';

	let { data }: PageProps = $props();

	function formatDate(timestamp: number | null | undefined): string {
		if (!timestamp) return 'Recently';
		return new Date(timestamp * 1000).toLocaleDateString('en-US', {
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<!-- Cover Image -->
	<div class="bg-card rounded-lg shadow overflow-hidden border border-border">
		{#if data.profileUser.cover_image_url}
			<div class="h-64 bg-cover bg-center" style="background-image: url('{data.profileUser.cover_image_url}')"></div>
		{:else}
			<div class="h-64 bg-gradient-to-r from-primary/20 to-primary/40"></div>
		{/if}

		<!-- Profile Info -->
		<div class="p-6">
			<div class="flex items-start gap-6 -mt-20 mb-4">
				<!-- Profile Picture -->
				{#if data.profileUser.profile_picture_url}
					<img
						src={data.profileUser.profile_picture_url}
						alt={data.profileUser.display_name}
						class="w-32 h-32 rounded-full border-4 border-white shadow-lg"
					/>
				{:else}
					<div
						class="w-32 h-32 rounded-full border-4 border-card shadow-lg bg-muted flex items-center justify-center"
					>
						<span class="text-4xl text-muted-foreground font-bold">
							{data.profileUser.display_name?.charAt(0).toUpperCase() || '?'}
						</span>
					</div>
				{/if}

				<div class="flex-1 mt-16">
					<h1 class="text-3xl font-bold text-foreground">{data.profileUser.display_name}</h1>
					{#if data.profileUser.username}
						<p class="text-muted-foreground">@{data.profileUser.username}</p>
					{/if}
				</div>

				<div class="mt-16">
					{#if data.isOwnProfile}
						<a
							href="/profile/edit"
							class="px-6 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg font-semibold transition inline-block"
						>
							Edit Profile
						</a>
					{:else}
						<FriendButton userId={data.profileUser.id} />
					{/if}
				</div>
			</div>

			<!-- Bio and Info -->
			{#if data.profileUser.bio}
				<p class="text-foreground mb-4">{data.profileUser.bio}</p>
			{/if}

			<div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
				{#if data.profileUser.location}
					<div class="flex items-center gap-1">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
								clip-rule="evenodd"
							/>
						</svg>
						<span>{data.profileUser.location}</span>
					</div>
				{/if}

				{#if data.profileUser.website}
					<div class="flex items-center gap-1">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
								clip-rule="evenodd"
							/>
						</svg>
						<a href={data.profileUser.website} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">
							{data.profileUser.website}
						</a>
					</div>
				{/if}

				<div class="flex items-center gap-1">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
							clip-rule="evenodd"
						/>
					</svg>
					<span>Joined {formatDate(data.profileUser.created_at)}</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Posts Section -->
	<div class="mt-6">
		<h2 class="text-2xl font-bold mb-4">Posts</h2>

		{#if data.posts.length === 0}
			<div class="bg-card rounded-lg shadow p-8 text-center border border-border">
				<p class="text-muted-foreground">
					{data.isOwnProfile ? "You haven't posted anything yet" : 'No posts yet'}
				</p>
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

