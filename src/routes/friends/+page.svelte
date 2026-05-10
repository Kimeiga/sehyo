<script lang="ts">
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { promptSignIn } from '$lib/stores/sign-in-modal';

	let { data }: PageProps = $props();

	type Tab = 'friends' | 'requests' | 'find';
	let activeTab = $state<Tab>('friends');

	const unlockedSet = $derived(new Set(data.unlockedAvatars ?? []));
	function isAvatarRevealed(userId: string): boolean {
		if (data.user?.id === userId) return true;
		return unlockedSet.has(userId);
	}
	function avatarFor(image: string | null | undefined, seed: string): string {
		return image ?? `https://i.pravatar.cc/200?u=${encodeURIComponent(seed)}`;
	}

	let searchQuery = $state('');
	let searchResults = $state<
		Array<{
			id: string;
			display_name: string | null;
			username: string | null;
			bio: string | null;
		}>
	>([]);
	let isSearching = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (searchTimer) clearTimeout(searchTimer);
		const q = searchQuery.trim();
		if (!q) {
			searchResults = [];
			isSearching = false;
			return;
		}
		searchTimer = setTimeout(() => runSearch(q), 220);
	});

	async function runSearch(q: string) {
		isSearching = true;
		try {
			const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
			if (res.ok) {
				const body = await res.json();
				searchResults = body.users ?? [];
			} else {
				searchResults = [];
			}
		} catch (err) {
			console.error('search failed', err);
		} finally {
			isSearching = false;
		}
	}

	async function sendRequest(userId: string) {
		try {
			const res = await fetch('/api/friends', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ friend_id: userId })
			});
			if (res.ok) {
				searchResults = searchResults.filter((u) => u.id !== userId);
			} else {
				const body = await res.json().catch(() => ({}));
				alert(body?.message ?? 'Could not send request.');
			}
		} catch (err) {
			console.error(err);
			alert('Could not send request.');
		}
	}

	async function patchRequest(id: string, action: 'accept' | 'reject') {
		try {
			const res = await fetch(`/api/friends/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ action })
			});
			if (res.ok) await invalidateAll();
		} catch (err) {
			console.error(err);
		}
	}

	async function removeFriend(id: string) {
		if (!confirm('Remove this friend?')) return;
		try {
			const res = await fetch(`/api/friends/${id}`, {
				method: 'DELETE',
				credentials: 'include'
			});
			if (res.ok) await invalidateAll();
		} catch (err) {
			console.error(err);
		}
	}

	const friends = $derived(data.friends ?? []);
	const requests = $derived(data.requests ?? []);
</script>

{#snippet avatarMd(userId: string, image: string | null | undefined)}
	{@const revealed = isAvatarRevealed(userId)}
	<span class="avatar-frame" class:locked={!revealed} aria-hidden="true">
		<img src={avatarFor(image, userId)} alt="" class="avatar-img" loading="lazy" draggable="false" />
	</span>
{/snippet}

<svelte:head>
	<title>Friends · Sehyo</title>
</svelte:head>

<main class="page">
	<h1 class="page-title">Friends</h1>

	{#if !data.user}
		<p class="empty">
			<button type="button" class="link-button" onclick={() => promptSignIn('Sign in to manage friends.')}>Sign in</button>
			to see and manage friends.
		</p>
	{:else}
		<div class="tabs" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === 'friends'}
				class="tab"
				class:active={activeTab === 'friends'}
				onclick={() => (activeTab = 'friends')}
			>Friends · {friends.length}</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === 'requests'}
				class="tab"
				class:active={activeTab === 'requests'}
				onclick={() => (activeTab = 'requests')}
			>Requests{requests.length > 0 ? ` · ${requests.length}` : ''}</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === 'find'}
				class="tab"
				class:active={activeTab === 'find'}
				onclick={() => (activeTab = 'find')}
			>Find</button>
		</div>

		{#if activeTab === 'friends'}
			{#if friends.length === 0}
				<p class="empty">No friends yet. Try the Find tab.</p>
			{:else}
				<ul class="list">
					{#each friends as f (f.id)}
						<li class="row">
							<a class="row-main" href={f.username ? `/${f.username}` : `/profile/${f.friend_id}`}>
								{@render avatarMd(f.friend_id, f.profile_picture_url)}
								<div class="row-text">
									<p class="row-title">{f.display_name ?? 'Anonymous'}</p>
									{#if f.username}<p class="row-sub">@{f.username}</p>{/if}
									{#if f.bio}<p class="row-bio">{f.bio}</p>{/if}
								</div>
							</a>
							<button type="button" class="ghost-button" onclick={() => removeFriend(f.id)}>Remove</button>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if activeTab === 'requests'}
			{#if requests.length === 0}
				<p class="empty">No pending requests.</p>
			{:else}
				<ul class="list">
					{#each requests as r (r.id)}
						<li class="row">
							<a class="row-main" href={r.username ? `/${r.username}` : `/profile/${r.requester_id}`}>
								{@render avatarMd(r.requester_id, r.profile_picture_url)}
								<div class="row-text">
									<p class="row-title">{r.display_name ?? 'Anonymous'}</p>
									{#if r.username}<p class="row-sub">@{r.username}</p>{/if}
									{#if r.bio}<p class="row-bio">{r.bio}</p>{/if}
								</div>
							</a>
							<div class="row-actions">
								<button type="button" class="primary-button" onclick={() => patchRequest(r.id, 'accept')}>Accept</button>
								<button type="button" class="ghost-button" onclick={() => patchRequest(r.id, 'reject')}>Reject</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if activeTab === 'find'}
			<input
				type="search"
				bind:value={searchQuery}
				placeholder="Search by name or username…"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				class="search-input"
			/>
			{#if searchQuery.trim()}
				{#if isSearching && searchResults.length === 0}
					<p class="empty">Searching…</p>
				{:else if searchResults.length === 0}
					<p class="empty">No results.</p>
				{:else}
					<ul class="list">
						{#each searchResults as u (u.id)}
							<li class="row">
								<a class="row-main" href={u.username ? `/${u.username}` : `/profile/${u.id}`}>
									{@render avatarMd(u.id, (u as { profile_picture_url?: string | null }).profile_picture_url)}
									<div class="row-text">
										<p class="row-title">{u.display_name ?? 'Anonymous'}</p>
										{#if u.username}<p class="row-sub">@{u.username}</p>{/if}
										{#if u.bio}<p class="row-bio">{u.bio}</p>{/if}
									</div>
								</a>
								<button type="button" class="primary-button" onclick={() => sendRequest(u.id)}>Add</button>
							</li>
						{/each}
					</ul>
				{/if}
			{:else}
				<!-- Default: show every non-anonymous user, ordered by
				     latest activity (most-recent post or comment), so
				     the Find tab is browsable without typing. -->
				{#if (data.allUsers ?? []).length === 0}
					<p class="empty">No one to find yet.</p>
				{:else}
					<ul class="list">
						{#each data.allUsers as u (u.id)}
							<li class="row">
								<a class="row-main" href={u.username ? `/${u.username}` : `/profile/${u.id}`}>
									<p class="row-title">{u.display_name ?? 'Anonymous'}</p>
									{#if u.username}<p class="row-sub">@{u.username}</p>{/if}
									{#if u.bio}<p class="row-bio">{u.bio}</p>{/if}
								</a>
								<button type="button" class="primary-button" onclick={() => sendRequest(u.id)}>Add</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		{/if}
	{/if}
</main>

<style>
	.page {
		min-height: 100dvh;
		max-width: 640px;
		margin: 0 auto;
		padding: 80px 20px 64px;
	}
	.page-title {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.025em;
		font-size: clamp(40px, 7vw, 64px);
		line-height: 1.05;
		color: var(--foreground);
		margin: 0 0 24px;
	}

	.tabs {
		display: flex;
		gap: 24px;
		margin: 0 0 24px;
		border-bottom: 1px solid var(--border);
	}
	.tab {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-weight: 500;
		font-size: 15px;
		padding: 8px 0;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tab:hover { color: var(--foreground); }
	.tab.active {
		color: var(--foreground);
		border-bottom-color: var(--foreground);
	}

	.search-input {
		width: 100%;
		font-family: var(--font-sans);
		font-size: 17px;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--card-foreground);
		margin-bottom: 16px;
	}
	.search-input:focus {
		outline: 2px solid var(--ring);
		outline-offset: -1px;
	}

	.list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.row {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		justify-content: space-between;
		padding: 18px 0;
		border-top: 1px solid var(--border);
	}
	.row-main {
		flex: 1;
		min-width: 0;
		text-decoration: none;
		color: var(--foreground);
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.row-main:hover { opacity: 0.85; }
	.row-text { flex: 1; min-width: 0; }
	.row-title { font-weight: 600; font-size: 16px; margin: 0; }
	.row-sub { font-size: 13px; color: var(--muted-foreground); margin: 2px 0 0; }
	.row-bio { font-size: 14px; color: var(--muted-foreground); margin: 6px 0 0; }
	.row-actions { display: flex; gap: 6px; flex-shrink: 0; }

	.avatar-frame {
		display: inline-block;
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--muted);
	}
	.avatar-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: filter 220ms ease, transform 220ms ease;
		pointer-events: none;
		user-select: none;
		-webkit-user-drag: none;
	}
	.avatar-frame {
		-webkit-touch-callout: none;
		user-select: none;
	}
	.avatar-frame.locked .avatar-img {
		filter: blur(8px);
		transform: scale(1.18);
	}

	.empty {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
		font-size: 15px;
	}
	.link-button {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		padding: 0;
	}

	.primary-button {
		appearance: none;
		border: 0;
		padding: 8px 16px;
		border-radius: 999px;
		background: var(--foreground);
		color: var(--background);
		font: inherit;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
	}
	.primary-button:hover { opacity: 0.9; }

	.ghost-button {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-weight: 500;
		font-size: 13px;
		padding: 8px 12px;
		border-radius: 999px;
		cursor: pointer;
	}
	.ghost-button:hover { color: var(--foreground); background: var(--muted); }
</style>
