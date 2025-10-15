<script lang="ts">
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import FriendButton from '$lib/components/FriendButton.svelte';

	let { data }: PageProps = $props();

	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let isSearching = $state(false);
	let activeTab = $state<'friends' | 'requests'>('friends');

	async function searchUsers() {
		if (searchQuery.trim().length === 0) {
			searchResults = [];
			return;
		}

		isSearching = true;
		try {
			const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
			const result = await response.json();
			searchResults = result.users || [];
		} catch (error) {
			console.error('Error searching users:', error);
		} finally {
			isSearching = false;
		}
	}

	async function sendFriendRequest(userId: string) {
		try {
			const response = await fetch('/api/friends', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ friend_id: userId })
			});

			if (response.ok) {
				// Remove from search results
				searchResults = searchResults.filter((u) => u.id !== userId);
			} else {
				const error = await response.json();
				alert(error.message || 'Failed to send friend request');
			}
		} catch (error) {
			console.error('Error sending friend request:', error);
			alert('Failed to send friend request');
		}
	}

	async function acceptRequest(friendshipId: string) {
		try {
			const response = await fetch(`/api/friends/${friendshipId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'accept' })
			});

			if (response.ok) {
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error accepting request:', error);
		}
	}

	async function rejectRequest(friendshipId: string) {
		try {
			const response = await fetch(`/api/friends/${friendshipId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reject' })
			});

			if (response.ok) {
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error rejecting request:', error);
		}
	}

	async function removeFriend(friendshipId: string) {
		if (!confirm('Are you sure you want to remove this friend?')) {
			return;
		}

		try {
			const response = await fetch(`/api/friends/${friendshipId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error removing friend:', error);
		}
	}

	// Debounce search
	let searchTimeout: number;
	$effect(() => {
		clearTimeout(searchTimeout);
		if (searchQuery.trim().length > 0) {
			searchTimeout = setTimeout(searchUsers, 300) as unknown as number;
		} else {
			searchResults = [];
		}
	});
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<h1 class="text-3xl font-bold mb-6">Friends</h1>

	{#if !data.user}
		<!-- Sign in prompt for non-authenticated users -->
		<div class="bg-card rounded-lg shadow p-12 text-center border border-border">
			<h2 class="text-2xl font-semibold mb-4">Sign in to manage friends</h2>
			<p class="text-muted-foreground mb-6">
				Connect with friends and manage your friend requests by signing in.
			</p>
			<a
				href="/auth/login"
				class="inline-block bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition"
			>
				Sign In
			</a>
		</div>
	{:else}
		<!-- Search Section -->
		<div class="bg-card rounded-lg shadow p-6 mb-6 border border-border">
			<h2 class="text-xl font-semibold mb-4 text-foreground">Find Friends</h2>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search by name or username..."
				class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>

		{#if isSearching}
			<p class="text-muted-foreground mt-4">Searching...</p>
		{:else if searchResults.length > 0}
			<div class="mt-4 space-y-3">
				{#each searchResults as user}
					<div class="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg">
						<a href="/profile/{user.id}" class="flex items-center gap-3 flex-1">
							{#if user.profile_picture_url}
								<img
									src={user.profile_picture_url}
									alt={user.display_name}
									class="w-12 h-12 rounded-full"
								/>
							{:else}
								<div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
									<span class="text-muted-foreground font-semibold">
										{user.display_name?.charAt(0).toUpperCase() || '?'}
									</span>
								</div>
							{/if}
							<div>
								<p class="font-semibold text-foreground">{user.display_name}</p>
								{#if user.username}
									<p class="text-sm text-muted-foreground">@{user.username}</p>
								{/if}
								{#if user.bio}
									<p class="text-sm text-muted-foreground line-clamp-1">{user.bio}</p>
								{/if}
							</div>
						</a>
						<button
							onclick={() => sendFriendRequest(user.id)}
							class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-semibold"
						>
							Add Friend
						</button>
					</div>
				{/each}
			</div>
		{:else if searchQuery.trim().length > 0}
			<p class="text-muted-foreground mt-4">No users found</p>
		{/if}
	</div>

	<!-- Tabs -->
	<div class="flex gap-4 mb-6 border-b border-border">
		<button
			onclick={() => (activeTab = 'friends')}
			class="px-4 py-2 font-semibold {activeTab === 'friends'
				? 'text-primary border-b-2 border-primary'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			Friends ({data.friends.length})
		</button>
		<button
			onclick={() => (activeTab = 'requests')}
			class="px-4 py-2 font-semibold {activeTab === 'requests'
				? 'text-primary border-b-2 border-primary'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			Requests ({data.requests.length})
		</button>
	</div>

	<!-- Friends List -->
	{#if activeTab === 'friends'}
		<div class="bg-card rounded-lg shadow border border-border">
			{#if data.friends.length === 0}
				<div class="p-8 text-center text-muted-foreground">
					<p class="text-lg mb-2">No friends yet</p>
					<p class="text-sm">Search for people to add as friends!</p>
				</div>
			{:else}
				<div class="divide-y divide-border">
					{#each data.friends as friend}
						<div class="p-4 flex items-center justify-between hover:bg-muted/50">
							<a href="/profile/{friend.friend_id}" class="flex items-center gap-3 flex-1">
								{#if friend.profile_picture_url}
									<img
										src={friend.profile_picture_url}
										alt={friend.display_name}
										class="w-12 h-12 rounded-full"
									/>
								{:else}
									<div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
										<span class="text-muted-foreground font-semibold">
											{friend.display_name?.charAt(0).toUpperCase() || '?'}
										</span>
									</div>
								{/if}
								<div>
									<p class="font-semibold text-foreground">{friend.display_name}</p>
									{#if friend.username}
										<p class="text-sm text-muted-foreground">@{friend.username}</p>
									{/if}
									{#if friend.bio}
										<p class="text-sm text-muted-foreground line-clamp-1">{friend.bio}</p>
									{/if}
								</div>
							</a>
							<button
								onclick={() => removeFriend(friend.id)}
								class="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-sm font-semibold"
							>
								Unfriend
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Friend Requests -->
	{#if activeTab === 'requests'}
		<div class="bg-card rounded-lg shadow border border-border">
			{#if data.requests.length === 0}
				<div class="p-8 text-center text-muted-foreground">
					<p class="text-lg mb-2">No pending requests</p>
					<p class="text-sm">You'll see friend requests here</p>
				</div>
			{:else}
				<div class="divide-y divide-border">
					{#each data.requests as request}
						<div class="p-4 flex items-center justify-between hover:bg-muted/50">
							<a href="/profile/{request.requester_id}" class="flex items-center gap-3 flex-1">
								{#if request.profile_picture_url}
									<img
										src={request.profile_picture_url}
										alt={request.display_name}
										class="w-12 h-12 rounded-full"
									/>
								{:else}
									<div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
										<span class="text-muted-foreground font-semibold">
											{request.display_name?.charAt(0).toUpperCase() || '?'}
										</span>
									</div>
								{/if}
								<div>
									<p class="font-semibold text-foreground">{request.display_name}</p>
									{#if request.username}
										<p class="text-sm text-muted-foreground">@{request.username}</p>
									{/if}
									{#if request.bio}
										<p class="text-sm text-muted-foreground line-clamp-1">{request.bio}</p>
									{/if}
								</div>
							</a>
							<div class="flex gap-2">
								<button
									onclick={() => acceptRequest(request.id)}
									class="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 text-sm font-semibold"
								>
									Accept
								</button>
								<button
									onclick={() => rejectRequest(request.id)}
									class="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-sm font-semibold"
								>
									Reject
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- All Users Section -->
	<div class="bg-card rounded-lg shadow border border-border mt-6">
		<div class="p-6 border-b border-border">
			<h2 class="text-xl font-semibold text-foreground">All Users</h2>
			<p class="text-sm text-muted-foreground mt-1">
				Discover and connect with people on the platform (including AI bots!)
			</p>
		</div>
		{#if data.allUsers.length === 0}
			<div class="p-8 text-center text-muted-foreground">
				<p class="text-lg mb-2">No users found</p>
				<p class="text-sm">Check back later!</p>
			</div>
		{:else}
			<div class="divide-y divide-border">
				{#each data.allUsers as user}
					<div class="p-4 flex items-center justify-between hover:bg-muted/50">
						<a href="/profile/{user.id}" class="flex items-center gap-3 flex-1">
							{#if user.profile_picture_url}
								<img
									src={user.profile_picture_url}
									alt={user.display_name}
									class="w-12 h-12 rounded-full"
								/>
							{:else}
								<div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
									<span class="text-muted-foreground font-semibold">
										{user.display_name?.charAt(0).toUpperCase() || '?'}
									</span>
								</div>
							{/if}
							<div>
								<p class="font-semibold text-foreground">{user.display_name}</p>
								{#if user.username}
									<p class="text-sm text-muted-foreground">@{user.username}</p>
								{/if}
								{#if user.bio}
									<p class="text-sm text-muted-foreground line-clamp-2">{user.bio}</p>
								{/if}
							</div>
						</a>
						<div class="ml-4">
							<!-- Friend button component will handle the state -->
							<FriendButton userId={user.id} />
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
	{/if}
</div>
