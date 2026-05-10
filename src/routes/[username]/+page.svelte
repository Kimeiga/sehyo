<script lang="ts">
	import type { PageProps } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import { Pencil, Check, X } from 'lucide-svelte';

	let { data }: PageProps = $props();
	const u = $derived(data.profileUser);
	const isOwnProfile = $derived(!!data.user && data.user.id === u.id);

	let editing = $state(false);
	let draft = $state('');
	let saving = $state(false);
	let editError = $state('');

	// Bio editor (separate state so it can be in or out of edit mode
	// independently of the username field).
	let editingBio = $state(false);
	let bioDraft = $state('');
	let savingBio = $state(false);
	let bioError = $state('');

	function startBioEdit() {
		bioDraft = u.bio ?? '';
		bioError = '';
		editingBio = true;
	}
	function cancelBioEdit() {
		editingBio = false;
		bioDraft = '';
		bioError = '';
	}

	async function saveBio() {
		if (savingBio) return;
		const next = bioDraft.trim();
		if (next === (u.bio ?? '')) {
			editingBio = false;
			return;
		}
		savingBio = true;
		bioError = '';
		try {
			const res = await fetch('/api/user/me', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ bio: next })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				bioError = body?.message ?? `Could not save (HTTP ${res.status}).`;
				return;
			}
			editingBio = false;
			await invalidateAll();
		} catch (err) {
			console.error('Bio save failed:', err);
			bioError = 'Could not save. Try again.';
		} finally {
			savingBio = false;
		}
	}

	function formatJoined(unixSeconds: number) {
		const d = new Date(unixSeconds * 1000);
		return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	}

	function startEdit() {
		draft = u.username;
		editError = '';
		editing = true;
	}
	function cancelEdit() {
		editing = false;
		draft = '';
		editError = '';
	}

	async function saveUsername() {
		const next = draft.trim().toLowerCase();
		if (!next || saving) return;
		if (next === u.username) {
			editing = false;
			return;
		}
		saving = true;
		editError = '';
		try {
			const res = await fetch('/api/user/me', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ username: next })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				editError = body?.message ?? `Could not save (HTTP ${res.status}).`;
				return;
			}
			editing = false;
			await invalidateAll();
			await goto(`/${next}`);
		} catch (err) {
			console.error('Username save failed:', err);
			editError = 'Could not save. Try again.';
		} finally {
			saving = false;
		}
	}

	// Live-feedback validation: same rules as the server-side validator
	// (lowercase alphanumeric + underscore, 2-20). We don't enforce
	// reserved-words on the client; the server does.
	const draftLooksOk = $derived(/^[a-z0-9_]{2,20}$/.test(draft.trim().toLowerCase()));

	function formatDate(iso: string | null) {
		if (!iso) return '';
		const d = new Date(iso + 'T00:00:00Z');
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>{u.name ?? `@${u.username}`} · Sehyo</title>
</svelte:head>

<main class="page">
	<header class="profile-header">
		<h1 class="display-name">{u.name ?? '—'}</h1>
		{#if isOwnProfile && editing}
			<form class="handle-editor" onsubmit={(e) => { e.preventDefault(); saveUsername(); }}>
				<span class="handle-prefix">@</span>
				<input
					type="text"
					bind:value={draft}
					placeholder="username"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					maxlength="20"
					disabled={saving}
				/>
				<button
					type="submit"
					class="icon-btn primary"
					aria-label="Save username"
					disabled={saving || !draftLooksOk}
				>
					<Check size="16" strokeWidth="2.2" />
				</button>
				<button
					type="button"
					class="icon-btn"
					aria-label="Cancel"
					onclick={cancelEdit}
					disabled={saving}
				>
					<X size="16" strokeWidth="2.2" />
				</button>
			</form>
			{#if editError}
				<p class="handle-error">{editError}</p>
			{:else if !draftLooksOk && draft.length > 0}
				<p class="handle-hint">2–20 characters, lowercase letters / numbers / underscores.</p>
			{:else}
				<p class="handle-hint">URL becomes sehyo.com/{draft || u.username}</p>
			{/if}
		{:else}
			<p class="handle">
				@{u.username}
				{#if isOwnProfile}
					<button
						type="button"
						class="edit-handle"
						aria-label="Change username"
						onclick={startEdit}
					>
						<Pencil size="13" strokeWidth="1.8" />
					</button>
				{/if}
			</p>
		{/if}
		{#if isOwnProfile && editingBio}
			<form class="bio-editor" onsubmit={(e) => { e.preventDefault(); saveBio(); }}>
				<textarea
					bind:value={bioDraft}
					rows="3"
					maxlength="280"
					placeholder="Write a short bio…"
					disabled={savingBio}
				></textarea>
				<div class="bio-bar">
					<span class="bio-count">{bioDraft.length}/280</span>
					<button type="button" class="ghost-button" onclick={cancelBioEdit} disabled={savingBio}>Cancel</button>
					<button type="submit" class="primary-button" disabled={savingBio}>
						{savingBio ? 'Saving…' : 'Save'}
					</button>
				</div>
				{#if bioError}<p class="handle-error">{bioError}</p>{/if}
			</form>
		{:else if u.bio}
			<p class="bio">
				{u.bio}
				{#if isOwnProfile}
					<button type="button" class="edit-handle" aria-label="Edit bio" onclick={startBioEdit}>
						<Pencil size="13" strokeWidth="1.8" />
					</button>
				{/if}
			</p>
		{:else if isOwnProfile}
			<button type="button" class="add-bio" onclick={startBioEdit}>+ Add a bio</button>
		{/if}

		<p class="joined">Joined {formatJoined(u.createdAt)}</p>
	</header>

	{#if data.posts.length === 0}
		<p class="empty">Nothing yet.</p>
	{:else}
		<section class="feed">
			{#each data.posts as p (p.id)}
				<article class="entry">
					{#if p.prompt_id && p.prompt_text}
						<p class="entry-meta">
							<span class="entry-tag">Answered</span>
							<span class="entry-date">{formatDate(p.prompt_active_date)}</span>
						</p>
						<h3 class="entry-prompt">{p.prompt_text}</h3>
						<p class="entry-body">{p.content}</p>
					{:else if p.is_question}
						<p class="entry-meta">
							<span class="entry-tag">Asked</span>
						</p>
						<h3 class="entry-question">{p.content}</h3>
					{:else}
						<p class="entry-meta">
							<span class="entry-tag">Posted</span>
						</p>
						<p class="entry-body">{p.content}</p>
					{/if}
					{#if p.comment_count > 0}
						<p class="entry-foot">{p.comment_count} comment{p.comment_count === 1 ? '' : 's'}</p>
					{/if}
				</article>
			{/each}
		</section>
	{/if}
</main>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 120px 24px 96px;
	}

	.profile-header {
		margin-bottom: 56px;
	}
	.display-name {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.025em;
		font-size: clamp(40px, 7vw, 64px);
		line-height: 1.05;
		color: var(--foreground);
		margin: 0 0 4px;
	}
	.handle {
		font-size: 15px;
		color: var(--muted-foreground);
		margin: 0 0 16px;
		font-weight: 500;
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.edit-handle {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 6px;
		cursor: pointer;
	}
	.edit-handle:hover {
		color: var(--foreground);
		background: var(--muted);
	}

	.handle-editor {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 8px;
		padding: 6px 8px 6px 4px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--card);
	}
	.handle-prefix {
		color: var(--muted-foreground);
		font-size: 16px;
		font-weight: 500;
		padding-left: 6px;
	}
	.handle-editor input {
		appearance: none;
		border: 0;
		outline: 0;
		background: transparent;
		font-family: var(--font-sans);
		font-size: 16px;
		color: var(--foreground);
		padding: 4px 0;
		min-width: 160px;
	}
	.handle-error {
		font-size: 13px;
		color: var(--destructive);
		margin: 0 0 16px;
	}
	.handle-hint {
		font-size: 13px;
		color: var(--muted-foreground);
		margin: 0 0 16px;
	}

	.icon-btn {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 14px;
		cursor: pointer;
	}
	.icon-btn:hover { background: var(--muted); color: var(--foreground); }
	.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.icon-btn.primary {
		background: var(--foreground);
		color: var(--background);
	}
	.icon-btn.primary:hover { opacity: 0.9; }
	.bio {
		font-size: 16px;
		color: var(--foreground);
		line-height: 1.5;
		margin: 0 0 12px;
		max-width: 540px;
		display: inline-flex;
		align-items: flex-start;
		gap: 8px;
		flex-wrap: wrap;
	}
	.add-bio {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 14px;
		padding: 4px 0;
		margin: 0 0 12px;
		cursor: pointer;
		text-align: left;
	}
	.add-bio:hover { color: var(--foreground); }

	.bio-editor {
		max-width: 540px;
		margin: 0 0 16px;
	}
	.bio-editor textarea {
		width: 100%;
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.5;
		padding: 12px 14px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--card-foreground);
		resize: vertical;
		min-height: 80px;
	}
	.bio-editor textarea:focus { outline: 2px solid var(--ring); outline-offset: -1px; }
	.bio-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}
	.bio-count { font-size: 12px; color: var(--muted-foreground); margin-right: auto; }
	.ghost-button {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-weight: 500;
		font-size: 14px;
		padding: 8px 14px;
		border-radius: 999px;
		cursor: pointer;
	}
	.ghost-button:hover { color: var(--foreground); }
	.primary-button {
		appearance: none;
		border: 0;
		background: var(--foreground);
		color: var(--background);
		font: inherit;
		font-weight: 600;
		font-size: 14px;
		padding: 8px 18px;
		border-radius: 999px;
		cursor: pointer;
	}
	.primary-button:disabled { opacity: 0.4; cursor: not-allowed; }

	.joined {
		font-size: 13px;
		color: var(--muted-foreground);
		margin: 0;
	}

	.feed {
		display: flex;
		flex-direction: column;
	}
	.entry {
		padding: 24px 0;
		border-top: 1px solid var(--border);
	}
	.entry-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 8px;
	}
	.entry-tag {
		font-size: 11px;
		font-weight: 600;
		color: var(--muted-foreground);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.entry-date {
		font-size: 11px;
		color: var(--muted-foreground);
	}
	.entry-prompt,
	.entry-question {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.018em;
		font-size: clamp(22px, 3.5vw, 30px);
		line-height: 1.15;
		color: var(--foreground);
		margin: 0 0 12px;
	}
	.entry-body {
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.55;
		color: var(--foreground);
		margin: 0;
		white-space: pre-wrap;
	}
	.entry-foot {
		font-size: 12px;
		color: var(--muted-foreground);
		margin: 10px 0 0;
	}

	.empty {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
	}
</style>
