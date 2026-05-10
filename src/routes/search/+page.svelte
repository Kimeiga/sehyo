<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	interface SearchUser {
		id: string;
		display_name: string | null;
		username: string | null;
		profile_picture_url: string | null;
		bio: string | null;
		sprite_id: number | null;
	}
	interface SearchPost {
		id: string;
		content: string;
		image_url: string | null;
		created_at: number;
		user: { id: string; display_name: string | null; username: string | null; bot_id?: string | null };
	}
	interface SearchComment {
		id: string;
		content: string;
		post_id: string;
		created_at: number;
		post_preview: string;
		user: { id: string; display_name: string | null; username: string | null };
	}

	let inputEl: HTMLInputElement | undefined = $state();
	let query = $state(page.url.searchParams.get('q') ?? '');
	let results = $state<{ users: SearchUser[]; posts: SearchPost[]; comments: SearchComment[]; total: number }>({
		users: [], posts: [], comments: [], total: 0
	});
	let loading = $state(false);
	let inflight: AbortController | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		// Auto-focus the input on mount
		inputEl?.focus();
	});

	$effect(() => {
		const q = query.trim();
		if (debounceTimer) clearTimeout(debounceTimer);
		if (!q) {
			results = { users: [], posts: [], comments: [], total: 0 };
			loading = false;
			return;
		}
		debounceTimer = setTimeout(() => runSearch(q), 220);
	});

	async function runSearch(q: string) {
		if (inflight) inflight.abort();
		inflight = new AbortController();
		loading = true;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`, {
				signal: inflight.signal
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			results = await res.json();
		} catch (err: any) {
			if (err?.name !== 'AbortError') console.error('Search error:', err);
		} finally {
			if (!inflight?.signal.aborted) loading = false;
		}
	}

	function relativeTime(ts: number) {
		const diff = Math.floor(Date.now() / 1000 - ts);
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
		return new Date(ts * 1000).toLocaleDateString();
	}
</script>

<svelte:head>
	<title>Search · Sehyo</title>
</svelte:head>

<div class="page">
	<div class="search-shell">
		<input
			bind:this={inputEl}
			bind:value={query}
			type="search"
			placeholder="Search people, answers, comments…"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			class="search-input"
		/>
	</div>

	<div class="results">
		{#if !query.trim()}
			<p class="hint">Type to search across people, answers, and comments.</p>
		{:else if loading && results.total === 0}
			<p class="hint">Searching…</p>
		{:else if results.total === 0}
			<p class="hint">No results.</p>
		{:else}
			{#if results.users.length > 0}
				<section>
					<h2 class="eyebrow">People · {results.users.length}</h2>
					{#each results.users as u (u.id)}
						<a class="row" href={u.username ? `/${u.username}` : `/profile/${u.id}`}>
							<div class="row-main">
								<p class="row-title">{u.display_name ?? 'Anonymous'}</p>
								{#if u.username}<p class="row-sub">@{u.username}</p>{/if}
								{#if u.bio}<p class="row-bio">{u.bio}</p>{/if}
							</div>
						</a>
					{/each}
				</section>
			{/if}

			{#if results.posts.length > 0}
				<section>
					<h2 class="eyebrow">Answers · {results.posts.length}</h2>
					{#each results.posts as p (p.id)}
						<a class="row" href="/post/{p.id}">
							<p class="row-meta">
								{p.user.bot_id ? p.user.display_name : 'Anonymous'} · {relativeTime(p.created_at)}
							</p>
							<p class="row-body">{p.content}</p>
						</a>
					{/each}
				</section>
			{/if}

			{#if results.comments.length > 0}
				<section>
					<h2 class="eyebrow">Comments · {results.comments.length}</h2>
					{#each results.comments as c (c.id)}
						<a class="row" href="/post/{c.post_id}#comment-{c.id}">
							<p class="row-meta">{c.user.display_name ?? 'Anonymous'} · {relativeTime(c.created_at)}</p>
							<p class="row-body">{c.content}</p>
							<p class="row-context">on: {c.post_preview}</p>
						</a>
					{/each}
				</section>
			{/if}
		{/if}
	</div>
</div>

<style>
	.page {
		min-height: 100dvh;
		max-width: 640px;
		margin: 0 auto;
		padding: 80px 20px 64px;
	}
	.search-shell { margin-bottom: 24px; }
	.search-input {
		width: 100%;
		font-family: var(--font-sans);
		font-size: 17px;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--card-foreground);
	}
	.search-input:focus {
		outline: 2px solid var(--ring);
		outline-offset: -1px;
	}
	.hint {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
	}
	.eyebrow {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin: 24px 0 8px;
	}
	.row {
		display: block;
		padding: 14px 0;
		border-top: 1px solid var(--border);
		text-decoration: none;
		color: var(--foreground);
	}
	.row:hover { background: color-mix(in oklab, var(--muted) 60%, transparent); }
	.row-title { font-weight: 600; margin: 0; }
	.row-sub { color: var(--muted-foreground); font-size: 13px; margin: 2px 0 0; }
	.row-bio { color: var(--muted-foreground); font-size: 14px; margin: 4px 0 0; }
	.row-meta { color: var(--muted-foreground); font-size: 12px; margin: 0 0 4px; }
	.row-body { font-size: 16px; line-height: 1.5; margin: 0; white-space: pre-wrap; }
	.row-context { color: var(--muted-foreground); font-size: 13px; margin: 6px 0 0; font-style: italic; }
</style>
