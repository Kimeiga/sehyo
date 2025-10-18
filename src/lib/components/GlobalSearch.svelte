<script lang="ts">
	import { Search, X, User, FileText, MessageSquare } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { onMount } from 'svelte';

	let searchQuery = $state('');
	let searchResults = $state<any>({ users: [], posts: [], comments: [], total: 0 });
	let isSearching = $state(false);
	let showResults = $state(false);
	let searchInput = $state<HTMLInputElement>();
	let resultsContainer = $state<HTMLDivElement>();

	// Debounced search
	let searchTimeout: number;
	async function performSearch() {
		if (searchQuery.trim().length === 0) {
			searchResults = { users: [], posts: [], comments: [], total: 0 };
			showResults = false;
			return;
		}

		isSearching = true;
		showResults = true;

		try {
			const response = await fetch(
				`/api/search?q=${encodeURIComponent(searchQuery)}&limit=5`
			);
			const data = await response.json();
			searchResults = data;
		} catch (error) {
			console.error('Search error:', error);
		} finally {
			isSearching = false;
		}
	}

	$effect(() => {
		clearTimeout(searchTimeout);
		if (searchQuery.trim().length > 0) {
			searchTimeout = setTimeout(performSearch, 300) as unknown as number;
		} else {
			searchResults = { users: [], posts: [], comments: [], total: 0 };
			showResults = false;
		}
	});

	// Close results when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (
			resultsContainer &&
			!resultsContainer.contains(event.target as Node) &&
			searchInput &&
			!searchInput.contains(event.target as Node)
		) {
			showResults = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	function clearSearch() {
		searchQuery = '';
		showResults = false;
		searchInput?.focus();
	}

	function closeResults() {
		showResults = false;
	}

	// Keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			showResults = false;
			searchInput?.blur();
		}
	}

	function truncate(text: string, length: number) {
		return text.length > length ? text.substring(0, length) + '...' : text;
	}
</script>

<div class="relative w-full max-w-md">
	<!-- Search Input -->
	<div class="relative">
		<Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
		<Input
			bind:this={searchInput}
			bind:value={searchQuery}
			type="search"
			placeholder="Search users, posts, comments..."
			class="w-full pl-10 pr-10 rounded-full bg-muted"
			onfocus={() => {
				if (searchQuery.trim().length > 0) showResults = true;
			}}
			onkeydown={handleKeydown}
		/>
		{#if searchQuery.length > 0}
			<button
				onclick={clearSearch}
				class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
			>
				<X class="size-4" />
			</button>
		{/if}
	</div>

	<!-- Search Results Dropdown -->
	{#if showResults}
		<div
			bind:this={resultsContainer}
			class="absolute top-full mt-2 w-full bg-card border border-border rounded-lg shadow-lg max-h-[500px] overflow-y-auto z-50"
		>
			{#if isSearching}
				<div class="p-4 text-center text-muted-foreground">
					<div class="animate-spin inline-block size-5 border-2 border-current border-t-transparent rounded-full"></div>
					<p class="mt-2">Searching...</p>
				</div>
			{:else if searchResults.total === 0}
				<div class="p-4 text-center text-muted-foreground">
					<p>No results found for "{searchQuery}"</p>
				</div>
			{:else}
				<!-- Users Section -->
				{#if searchResults.users.length > 0}
					<div class="border-b border-border">
						<div class="px-4 py-2 bg-muted/50 flex items-center gap-2">
							<User class="size-4" />
							<span class="text-sm font-semibold">People</span>
						</div>
						{#each searchResults.users as user}
							<a
								href="/profile/{user.id}"
								onclick={closeResults}
								class="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
							>
								{#if user.display_name === 'Anonymous' && user.sprite_id}
									<div class="size-10 flex items-center justify-center flex-shrink-0">
										<img
											src="/sprites/{user.sprite_id}.png"
											alt="Sprite"
											class="h-full w-auto"
											style="image-rendering: pixelated;"
										/>
									</div>
								{:else}
									<Avatar class="size-10">
										<AvatarImage src={user.profile_picture_url} alt={user.display_name} />
										<AvatarFallback>
											{user.display_name?.charAt(0).toUpperCase() || '?'}
										</AvatarFallback>
									</Avatar>
								{/if}
								<div class="flex-1 min-w-0">
									<p class="font-semibold truncate">{user.display_name}</p>
									{#if user.username}
										<p class="text-sm text-muted-foreground">@{user.username}</p>
									{/if}
									{#if user.bio}
										<p class="text-xs text-muted-foreground truncate">{user.bio}</p>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				{/if}

				<!-- Posts Section -->
				{#if searchResults.posts.length > 0}
					<div class="border-b border-border">
						<div class="px-4 py-2 bg-muted/50 flex items-center gap-2">
							<FileText class="size-4" />
							<span class="text-sm font-semibold">Posts</span>
						</div>
						{#each searchResults.posts as post}
							<a
								href="/post/{post.id}"
								onclick={closeResults}
								class="block px-4 py-3 hover:bg-muted/50 transition-colors"
							>
								<div class="flex items-start gap-2 mb-1">
									{#if post.user.display_name === 'Anonymous' && post.user.sprite_id}
										<div class="size-6 flex items-center justify-center flex-shrink-0">
											<img
												src="/sprites/{post.user.sprite_id}.png"
												alt="Sprite"
												class="h-full w-auto"
												style="image-rendering: pixelated;"
											/>
										</div>
									{:else}
										<Avatar class="size-6">
											<AvatarImage src={post.user.profile_picture_url} alt={post.user.display_name} />
											<AvatarFallback class="text-xs">
												{post.user.display_name?.charAt(0).toUpperCase() || '?'}
											</AvatarFallback>
										</Avatar>
									{/if}
									<span class="text-sm font-medium">{post.user.display_name}</span>
								</div>
								<p class="text-sm text-muted-foreground line-clamp-2">
									{truncate(post.content, 100)}
								</p>
							</a>
						{/each}
					</div>
				{/if}

				<!-- Comments Section -->
				{#if searchResults.comments.length > 0}
					<div>
						<div class="px-4 py-2 bg-muted/50 flex items-center gap-2">
							<MessageSquare class="size-4" />
							<span class="text-sm font-semibold">Comments</span>
						</div>
						{#each searchResults.comments as comment}
							<a
								href="/post/{comment.post_id}#comment-{comment.id}"
								onclick={closeResults}
								class="block px-4 py-3 hover:bg-muted/50 transition-colors"
							>
								<div class="flex items-start gap-2 mb-1">
									{#if comment.user.display_name === 'Anonymous' && comment.user.sprite_id}
										<div class="size-6 flex items-center justify-center flex-shrink-0">
											<img
												src="/sprites/{comment.user.sprite_id}.png"
												alt="Sprite"
												class="h-full w-auto"
												style="image-rendering: pixelated;"
											/>
										</div>
									{:else}
										<Avatar class="size-6">
											<AvatarImage src={comment.user.profile_picture_url} alt={comment.user.display_name} />
											<AvatarFallback class="text-xs">
												{comment.user.display_name?.charAt(0).toUpperCase() || '?'}
											</AvatarFallback>
										</Avatar>
									{/if}
									<span class="text-sm font-medium">{comment.user.display_name}</span>
								</div>
								<p class="text-sm text-muted-foreground line-clamp-2">
									{truncate(comment.content, 100)}
								</p>
								<p class="text-xs text-muted-foreground mt-1">
									on: {truncate(comment.post_preview, 50)}
								</p>
							</a>
						{/each}
					</div>
				{/if}

				<!-- View All Results Link -->
				{#if searchResults.total > 0}
					<a
						href="/search?q={encodeURIComponent(searchQuery)}"
						onclick={closeResults}
						class="block px-4 py-3 text-center text-sm text-primary hover:bg-muted/50 font-semibold border-t border-border"
					>
						View all {searchResults.total} results
					</a>
				{/if}
			{/if}
		</div>
	{/if}
</div>

