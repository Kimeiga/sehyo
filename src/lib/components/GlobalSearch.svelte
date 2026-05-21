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
	let searchInput = $state<HTMLInputElement | null>(null);
	let resultsContainer = $state<HTMLDivElement | null>(null);

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
			const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=5`);
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
		<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
		<Input
			bind:ref={searchInput}
			bind:value={searchQuery}
			type="search"
			placeholder="Search users, posts, comments..."
			class="w-full rounded-full bg-muted pr-10 pl-10"
			onfocus={() => {
				if (searchQuery.trim().length > 0) showResults = true;
			}}
			onkeydown={handleKeydown}
		/>
		{#if searchQuery.length > 0}
			<button
				onclick={clearSearch}
				class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
			>
				<X class="size-4" />
			</button>
		{/if}
	</div>

	<!-- Search Results Dropdown -->
	{#if showResults}
		<div
			bind:this={resultsContainer}
			class="absolute top-full z-50 mt-2 max-h-[500px] w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg"
		>
			{#if isSearching}
				<div class="p-4 text-center text-muted-foreground">
					<div
						class="inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
					></div>
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
						<div class="flex items-center gap-2 bg-muted/50 px-4 py-2">
							<User class="size-4" />
							<span class="text-sm font-semibold">People</span>
						</div>
						{#each searchResults.users as user}
							<a
								href="/profile/{user.id}"
								onclick={closeResults}
								class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
							>
								{#if user.display_name === 'Anonymous' && user.sprite_id}
									<div class="flex size-10 flex-shrink-0 items-center justify-center">
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
								<div class="min-w-0 flex-1">
									<p class="truncate font-semibold">{user.display_name}</p>
									{#if user.username}
										<p class="text-sm text-muted-foreground">@{user.username}</p>
									{/if}
									{#if user.bio}
										<p class="truncate text-xs text-muted-foreground">{user.bio}</p>
									{/if}
								</div>
							</a>
						{/each}
					</div>
				{/if}

				<!-- Posts Section -->
				{#if searchResults.posts.length > 0}
					<div class="border-b border-border">
						<div class="flex items-center gap-2 bg-muted/50 px-4 py-2">
							<FileText class="size-4" />
							<span class="text-sm font-semibold">Posts</span>
						</div>
						{#each searchResults.posts as post}
							<a
								href="/post/{post.id}"
								onclick={closeResults}
								class="block px-4 py-3 transition-colors hover:bg-muted/50"
							>
								<div class="mb-1 flex items-start gap-2">
									{#if post.user.display_name === 'Anonymous' && post.user.sprite_id}
										<div class="flex size-6 flex-shrink-0 items-center justify-center">
											<img
												src="/sprites/{post.user.sprite_id}.png"
												alt="Sprite"
												class="h-full w-auto"
												style="image-rendering: pixelated;"
											/>
										</div>
									{:else}
										<Avatar class="size-6">
											<AvatarImage
												src={post.user.profile_picture_url}
												alt={post.user.display_name}
											/>
											<AvatarFallback class="text-xs">
												{post.user.display_name?.charAt(0).toUpperCase() || '?'}
											</AvatarFallback>
										</Avatar>
									{/if}
									<span class="text-sm font-medium">{post.user.display_name}</span>
								</div>
								<p class="line-clamp-2 text-sm text-muted-foreground">
									{truncate(post.content, 100)}
								</p>
							</a>
						{/each}
					</div>
				{/if}

				<!-- Comments Section -->
				{#if searchResults.comments.length > 0}
					<div>
						<div class="flex items-center gap-2 bg-muted/50 px-4 py-2">
							<MessageSquare class="size-4" />
							<span class="text-sm font-semibold">Comments</span>
						</div>
						{#each searchResults.comments as comment}
							<a
								href="/post/{comment.post_id}#comment-{comment.id}"
								onclick={closeResults}
								class="block px-4 py-3 transition-colors hover:bg-muted/50"
							>
								<div class="mb-1 flex items-start gap-2">
									{#if comment.user.display_name === 'Anonymous' && comment.user.sprite_id}
										<div class="flex size-6 flex-shrink-0 items-center justify-center">
											<img
												src="/sprites/{comment.user.sprite_id}.png"
												alt="Sprite"
												class="h-full w-auto"
												style="image-rendering: pixelated;"
											/>
										</div>
									{:else}
										<Avatar class="size-6">
											<AvatarImage
												src={comment.user.profile_picture_url}
												alt={comment.user.display_name}
											/>
											<AvatarFallback class="text-xs">
												{comment.user.display_name?.charAt(0).toUpperCase() || '?'}
											</AvatarFallback>
										</Avatar>
									{/if}
									<span class="text-sm font-medium">{comment.user.display_name}</span>
								</div>
								<p class="line-clamp-2 text-sm text-muted-foreground">
									{truncate(comment.content, 100)}
								</p>
								<p class="mt-1 text-xs text-muted-foreground">
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
						class="block border-t border-border px-4 py-3 text-center text-sm font-semibold text-primary hover:bg-muted/50"
					>
						View all {searchResults.total} results
					</a>
				{/if}
			{/if}
		</div>
	{/if}
</div>
