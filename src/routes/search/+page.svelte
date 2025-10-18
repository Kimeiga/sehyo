<script lang="ts">
	import { page } from '$app/stores';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Search } from 'lucide-svelte';

	let searchQuery = $derived($page.url.searchParams.get('q') || '');
	let activeFilter = $state<'all' | 'users' | 'posts' | 'comments'>('all');
	let searchResults = $state<any>({ users: [], posts: [], comments: [], total: 0 });
	let isSearching = $state(false);

	async function performSearch() {
		if (searchQuery.trim().length === 0) {
			searchResults = { users: [], posts: [], comments: [], total: 0 };
			return;
		}

		isSearching = true;

		try {
			const response = await fetch(
				`/api/search?q=${encodeURIComponent(searchQuery)}&type=${activeFilter}&limit=50`
			);
			const data = await response.json();
			searchResults = data;
		} catch (error) {
			console.error('Search error:', error);
		} finally {
			isSearching = false;
		}
	}

	// Perform search when query or filter changes
	$effect(() => {
		if (searchQuery) {
			performSearch();
		}
	});

	// Filtered results based on active filter
	let filteredUsers = $derived(activeFilter === 'all' || activeFilter === 'users' ? searchResults.users : []);
	let filteredPosts = $derived(activeFilter === 'all' || activeFilter === 'posts' ? searchResults.posts : []);
	let filteredComments = $derived(activeFilter === 'all' || activeFilter === 'comments' ? searchResults.comments : []);

	function formatDate(timestamp: number) {
		const date = new Date(timestamp * 1000);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 7) {
			return date.toLocaleDateString();
		} else if (days > 0) {
			return `${days}d ago`;
		} else if (hours > 0) {
			return `${hours}h ago`;
		} else if (minutes > 0) {
			return `${minutes}m ago`;
		} else {
			return 'Just now';
		}
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-8">
		<h1 class="text-3xl font-bold mb-2">Search Results</h1>
		{#if searchQuery}
			<p class="text-muted-foreground">
				Showing results for "<span class="font-semibold">{searchQuery}</span>"
			</p>
		{/if}
	</div>

	{#if !searchQuery}
		<div class="text-center py-12">
			<Search class="size-16 mx-auto text-muted-foreground mb-4" />
			<h2 class="text-xl font-semibold mb-2">Start searching</h2>
			<p class="text-muted-foreground">Enter a search term to find users, posts, and comments</p>
		</div>
	{:else if isSearching}
		<div class="text-center py-12">
			<div
				class="animate-spin inline-block size-8 border-4 border-current border-t-transparent rounded-full text-primary"
			></div>
			<p class="mt-4 text-muted-foreground">Searching...</p>
		</div>
	{:else if searchResults.total === 0}
		<div class="text-center py-12">
			<Search class="size-16 mx-auto text-muted-foreground mb-4" />
			<h2 class="text-xl font-semibold mb-2">No results found</h2>
			<p class="text-muted-foreground">Try different keywords or check your spelling</p>
		</div>
	{:else}
		<!-- Filter Buttons -->
		<div class="flex gap-2 mb-6 flex-wrap">
			<Button
				variant={activeFilter === 'all' ? 'default' : 'outline'}
				onclick={() => (activeFilter = 'all')}
			>
				All ({searchResults.total})
			</Button>
			<Button
				variant={activeFilter === 'users' ? 'default' : 'outline'}
				onclick={() => (activeFilter = 'users')}
			>
				People ({searchResults.users.length})
			</Button>
			<Button
				variant={activeFilter === 'posts' ? 'default' : 'outline'}
				onclick={() => (activeFilter = 'posts')}
			>
				Posts ({searchResults.posts.length})
			</Button>
			<Button
				variant={activeFilter === 'comments' ? 'default' : 'outline'}
				onclick={() => (activeFilter = 'comments')}
			>
				Comments ({searchResults.comments.length})
			</Button>
		</div>

		<!-- Results -->
		<div class="space-y-6">
			<!-- Users -->
			{#if filteredUsers.length > 0}
					<div>
						<h3 class="text-lg font-semibold mb-3">People</h3>
						<div class="space-y-2">
							{#each filteredUsers as user}
								<Card>
									<CardContent class="p-4">
										<a href="/profile/{user.id}" class="flex items-center gap-3 hover:underline">
											{#if user.display_name === 'Anonymous' && user.sprite_id}
												<div class="size-12 flex items-center justify-center flex-shrink-0">
													<img
														src="/sprites/{user.sprite_id}.png"
														alt="Sprite"
														class="h-full w-auto"
														style="image-rendering: pixelated;"
													/>
												</div>
											{:else}
												<Avatar class="size-12">
													<AvatarImage src={user.profile_picture_url} alt={user.display_name} />
													<AvatarFallback>
														{user.display_name?.charAt(0).toUpperCase() || '?'}
													</AvatarFallback>
												</Avatar>
											{/if}
											<div class="flex-1">
												<p class="font-semibold">{user.display_name}</p>
												{#if user.username}
													<p class="text-sm text-muted-foreground">@{user.username}</p>
												{/if}
												{#if user.bio}
													<p class="text-sm text-muted-foreground mt-1">{user.bio}</p>
												{/if}
											</div>
										</a>
									</CardContent>
								</Card>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Posts -->
				{#if filteredPosts.length > 0}
					<div>
						<h3 class="text-lg font-semibold mb-3">Posts</h3>
						<div class="space-y-2">
							{#each filteredPosts as post}
								<Card>
									<CardContent class="p-4">
										<a href="/post/{post.id}" class="block hover:underline">
											<div class="flex items-center gap-2 mb-2">
												{#if post.user.display_name === 'Anonymous' && post.user.sprite_id}
													<div class="size-8 flex items-center justify-center flex-shrink-0">
														<img
															src="/sprites/{post.user.sprite_id}.png"
															alt="Sprite"
															class="h-full w-auto"
															style="image-rendering: pixelated;"
														/>
													</div>
												{:else}
													<Avatar class="size-8">
														<AvatarImage
															src={post.user.profile_picture_url}
															alt={post.user.display_name}
														/>
														<AvatarFallback class="text-xs">
															{post.user.display_name?.charAt(0).toUpperCase() || '?'}
														</AvatarFallback>
													</Avatar>
												{/if}
												<div>
													<p class="font-semibold text-sm">{post.user.display_name}</p>
													<p class="text-xs text-muted-foreground">
														{formatDate(post.created_at)}
													</p>
												</div>
											</div>
											<p class="text-sm whitespace-pre-wrap">{post.content}</p>
											{#if post.image_url}
												<img
													src={post.image_url}
													alt="Post"
													class="mt-2 rounded-lg max-h-64 object-cover"
												/>
											{/if}
										</a>
									</CardContent>
								</Card>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Comments -->
				{#if filteredComments.length > 0}
					<div>
						<h3 class="text-lg font-semibold mb-3">Comments</h3>
						<div class="space-y-2">
							{#each filteredComments as comment}
								<Card>
									<CardContent class="p-4">
										<a
											href="/post/{comment.post_id}#comment-{comment.id}"
											class="block hover:underline"
										>
											<div class="flex items-center gap-2 mb-2">
												{#if comment.user.display_name === 'Anonymous' && comment.user.sprite_id}
													<div class="size-8 flex items-center justify-center flex-shrink-0">
														<img
															src="/sprites/{comment.user.sprite_id}.png"
															alt="Sprite"
															class="h-full w-auto"
															style="image-rendering: pixelated;"
														/>
													</div>
												{:else}
													<Avatar class="size-8">
														<AvatarImage
															src={comment.user.profile_picture_url}
															alt={comment.user.display_name}
														/>
														<AvatarFallback class="text-xs">
															{comment.user.display_name?.charAt(0).toUpperCase() || '?'}
														</AvatarFallback>
													</Avatar>
												{/if}
												<div>
													<p class="font-semibold text-sm">{comment.user.display_name}</p>
													<p class="text-xs text-muted-foreground">
														{formatDate(comment.created_at)}
													</p>
												</div>
											</div>
											<p class="text-sm whitespace-pre-wrap">{comment.content}</p>
											<p class="text-xs text-muted-foreground mt-2">
												on: {comment.post_preview}
											</p>
										</a>
									</CardContent>
								</Card>
							{/each}
						</div>
					</div>
				{/if}
		</div>
	{/if}
</div>

