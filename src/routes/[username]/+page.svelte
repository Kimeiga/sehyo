<script lang="ts">
	import type { PageProps } from './$types';
	import { goto, invalidateAll } from '$app/navigation';
	import { Pencil, Check, X, Camera, Trash2, UserPlus, MessageCircle } from 'lucide-svelte';
	import { gradientFor } from '$lib/header-gradient';

	let { data }: PageProps = $props();
	const u = $derived(data.profileUser);
	const isOwnProfile = $derived(!!data.user && data.user.id === u.id);

	// Avatar reveal: shown unblurred only after the viewer has commented
	// on one of this user's posts (or it's their own profile).
	const avatarRevealed = $derived(isOwnProfile || data.hasCommented);
	const avatarUrl = $derived(u.image ?? `https://i.pravatar.cc/240?u=${encodeURIComponent(u.id)}`);

	// Add-friend gate: must have commented; can't friend yourself or
	// someone you're already pending/accepted with.
	const friendGateMessage = $derived(
		!data.user
			? 'Sign in to add friends.'
			: !data.hasCommented
				? 'Comment on one of their posts to be able to add them as a friend.'
				: ''
	);
	let addingFriend = $state(false);
	let friendTooltipOpen = $state(false);
	let friendTooltipTimer: ReturnType<typeof setTimeout> | null = null;

	function showFriendTooltip() {
		friendTooltipOpen = true;
		if (friendTooltipTimer) clearTimeout(friendTooltipTimer);
		friendTooltipTimer = setTimeout(() => (friendTooltipOpen = false), 2800);
	}

	function openMessages() {
		// Hand off to /messages with enough info to populate a stub
		// conversation header before the first message is sent. The
		// messages page will splice this into its conversations list
		// if it isn't already there.
		const params = new URLSearchParams({
			to: u.id,
			name: u.name ?? '',
			handle: u.username ?? '',
			pic: u.image ?? ''
		});
		goto(`/messages?${params.toString()}`);
	}

	async function addFriend() {
		if (!data.hasCommented || !data.user || isOwnProfile || addingFriend) {
			showFriendTooltip();
			return;
		}
		addingFriend = true;
		try {
			const res = await fetch('/api/friends', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ friend_id: u.id })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				alert(body?.message ?? 'Could not send request.');
				return;
			}
			await invalidateAll();
		} catch (err) {
			console.error('Add friend failed:', err);
		} finally {
			addingFriend = false;
		}
	}

	const headerStyle = $derived(
		u.header_image_url
			? `background-image: url(${JSON.stringify(u.header_image_url)}); background-size: cover; background-position: center;`
			: `background: ${gradientFor(u.id)};`
	);

	let headerInput: HTMLInputElement | undefined = $state();
	let uploadingHeader = $state(false);

	async function pickHeaderImage() {
		headerInput?.click();
	}

	async function uploadHeader(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || uploadingHeader) return;
		uploadingHeader = true;
		try {
			const fd = new FormData();
			fd.append('image', file);
			const res = await fetch('/api/user/me/header', {
				method: 'POST',
				credentials: 'include',
				body: fd
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				alert(body?.message ?? `Upload failed (HTTP ${res.status}).`);
				return;
			}
			await invalidateAll();
		} catch (err) {
			console.error('Header upload failed:', err);
			alert('Upload failed. Try again.');
		} finally {
			uploadingHeader = false;
			if (input) input.value = '';
		}
	}

	async function clearHeader() {
		if (!u.header_image_url) return;
		if (!confirm('Remove your header image and revert to the gradient?')) return;
		try {
			const res = await fetch('/api/user/me/header', {
				method: 'DELETE',
				credentials: 'include'
			});
			if (!res.ok) {
				alert(`Could not remove (HTTP ${res.status}).`);
				return;
			}
			await invalidateAll();
		} catch (err) {
			console.error('Header delete failed:', err);
		}
	}

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

<div class="profile-banner" style={headerStyle} aria-hidden="true">
	{#if isOwnProfile}
		<input
			bind:this={headerInput}
			type="file"
			accept="image/jpeg,image/png,image/webp,image/gif"
			onchange={uploadHeader}
			class="hidden-input"
		/>
		<div class="banner-actions">
			<button
				type="button"
				class="banner-button"
				onclick={pickHeaderImage}
				disabled={uploadingHeader}
				aria-label={uploadingHeader ? 'Uploading…' : 'Change header image'}
			>
				<Camera size="16" strokeWidth="1.8" />
				<span>{uploadingHeader ? 'Uploading…' : 'Change'}</span>
			</button>
			{#if u.header_image_url}
				<button
					type="button"
					class="banner-button"
					onclick={clearHeader}
					aria-label="Remove header image"
				>
					<Trash2 size="16" strokeWidth="1.8" />
				</button>
			{/if}
		</div>
	{/if}
</div>

<main class="page">
	<div class="avatar-row">
		<div class="profile-avatar-frame" class:locked={!avatarRevealed} aria-hidden="true">
			<img src={avatarUrl} alt="" class="profile-avatar-img" loading="lazy" draggable="false" />
		</div>
		{#if !isOwnProfile && data.user}
			<div class="friend-area">
				<button
					type="button"
					class="message-button"
					onclick={openMessages}
					aria-label="Message {u.name ?? 'user'}"
					data-testid="profile-message-button"
				>
					<MessageCircle size="16" strokeWidth="1.9" />
					<span class="message-button-label" aria-hidden="true">Message</span>
				</button>
				<button
					type="button"
					class="friend-button"
					class:disabled={!data.hasCommented || data.friendshipStatus !== 'none'}
					onclick={addFriend}
					disabled={addingFriend}
					aria-label={data.friendshipStatus === 'accepted' ? 'Friends' : 'Add friend'}
				>
					{#if data.friendshipStatus === 'accepted'}
						Friends
					{:else if data.friendshipStatus === 'pending_outgoing'}
						Requested
					{:else if data.friendshipStatus === 'pending_incoming'}
						Awaiting you
					{:else}
						<UserPlus size="14" strokeWidth="1.8" />
						<span>Add friend</span>
					{/if}
				</button>
				{#if friendTooltipOpen && friendGateMessage}
					<div class="friend-tooltip" role="status">{friendGateMessage}</div>
				{/if}
			</div>
		{/if}
	</div>

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

	{#if !isOwnProfile && !avatarRevealed}
		<p class="reveal-hint">Comment on one of their posts to see what they look like.</p>
	{/if}

	{#if data.posts.length === 0 && (data.comments?.length ?? 0) === 0}
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

			{#if (data.comments?.length ?? 0) > 0}
				<h2 class="feed-section-title">Comments</h2>
				{#each data.comments as c (c.id)}
					<article class="entry">
						<p class="entry-meta">
							<span class="entry-tag">Replied</span>
							{#if c.parent_post_author_username}
								<span class="entry-replied-to">
									to <a href="/{c.parent_post_author_username}">@{c.parent_post_author_username}</a>
								</span>
							{/if}
						</p>
						{#if c.parent_post_excerpt}
							<p class="entry-quote">"{c.parent_post_excerpt}"</p>
						{/if}
						<p class="entry-body">{c.content}</p>
					</article>
				{/each}
			{/if}
		</section>
	{/if}
</main>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 32px 12px 96px;
	}

	/* Mesh-gradient banner (or uploaded image) at the top of the
	   profile. Spans the viewport edge-to-edge so it reads as a
	   true header, not a card. */
	.profile-banner {
		position: relative;
		width: 100%;
		height: 200px;
		background-color: var(--card);
	}
	.banner-actions {
		position: absolute;
		bottom: 12px;
		right: 12px;
		display: flex;
		gap: 8px;
	}
	.banner-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		appearance: none;
		border: 0;
		padding: 8px 12px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		color: white;
		font: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}
	.banner-button:hover { background: rgba(0, 0, 0, 0.7); }
	.banner-button:disabled { opacity: 0.6; cursor: not-allowed; }
	.hidden-input {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	/* Avatar row sits between the gradient banner and the display
	   name. Avatar overlaps the bottom of the banner. The friend
	   button (when applicable) lives on the right of this row. */
	.avatar-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-top: -56px;
		margin-bottom: 16px;
		min-height: 56px;
	}
	.profile-avatar-frame {
		position: relative;
		z-index: 2;
		width: 112px;
		height: 112px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--card);
		border: 4px solid var(--background);
		flex-shrink: 0;
		user-select: none;
		-webkit-user-drag: none;
		-webkit-touch-callout: none;
	}
	.profile-avatar-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: filter 240ms ease, transform 240ms ease;
		pointer-events: none;
		user-select: none;
		-webkit-user-drag: none;
	}
	.profile-avatar-frame.locked .profile-avatar-img {
		filter: blur(14px);
		transform: scale(1.18);
	}
	.reveal-hint {
		margin: 32px 0 24px;
		padding: 14px 20px;
		text-align: center;
		font-size: 14px;
		color: var(--muted-foreground);
		font-style: italic;
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
	}

	.friend-area {
		position: relative;
		margin-top: 64px;
		flex-shrink: 0;
		display: flex;
		gap: 8px;
		align-items: center;
	}

	/* Circular message button. Same vertical extent as the
	   adjacent pill (height ~33px ≈ 8px+17px+8px), but circle.
	   Hover lightens the bg with a 200ms tween. After a short
	   hover-hold (600ms) a small gray pill labelled "Message"
	   fades in below the button. */
	.message-button {
		position: relative;
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 33px;
		height: 33px;
		border-radius: 999px;
		background: transparent;
		color: var(--foreground);
		border: 1px solid var(--border);
		cursor: pointer;
		padding: 0;
		transition: background-color 200ms ease, border-color 200ms ease;
	}
	.message-button:hover {
		background: var(--muted);
		border-color: var(--muted-foreground);
	}
	.message-button:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.message-button-label {
		position: absolute;
		top: calc(100% + 8px);
		left: 50%;
		transform: translate(-50%, -4px);
		background: var(--muted);
		color: var(--muted-foreground);
		font-size: 11px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 999px;
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition: opacity 180ms ease, transform 180ms ease;
		transition-delay: 0ms;
	}
	.message-button:hover .message-button-label,
	.message-button:focus-visible .message-button-label {
		opacity: 1;
		transform: translate(-50%, 0);
		transition-delay: 500ms;
	}
	.friend-button {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: 999px;
		background: var(--foreground);
		color: var(--background);
		border: 0;
		font: inherit;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}
	.friend-button.disabled {
		background: transparent;
		color: var(--muted-foreground);
		border: 1px solid var(--border);
	}
	.friend-button:hover { opacity: 0.92; }
	.friend-tooltip {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		max-width: 260px;
		background: var(--card);
		color: var(--foreground);
		font-size: 12px;
		line-height: 1.45;
		padding: 8px 12px;
		border-radius: 10px;
		border: 1px solid var(--border);
		box-shadow: 0 12px 24px -8px rgba(0, 0, 0, 0.35);
		z-index: 10;
		animation: pop 200ms ease-out;
	}
	@keyframes pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

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
		margin: 0 0 14px;
		font-weight: 500;
		/* `flex` (not `inline-flex`) so the handle line stays a
		   block-level box and the bio line below never wraps up
		   beside it on wider viewports. */
		display: flex;
		align-items: center;
		gap: 2px;
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
		/* Block-level flex so the bio always sits below the handle line
		   instead of collapsing inline next to it. */
		display: flex;
		align-items: flex-start;
		gap: 8px;
		flex-wrap: wrap;
	}
	.add-bio {
		display: block;
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 14px;
		padding: 4px 0;
		margin: 4px 0 12px;
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

	.feed-section-title {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.018em;
		font-size: 22px;
		color: var(--foreground);
		margin: 32px 0 4px;
	}
	.entry-replied-to {
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.entry-replied-to a {
		color: var(--foreground);
		text-decoration: none;
		font-weight: 500;
	}
	.entry-replied-to a:hover { text-decoration: underline; }
	.entry-quote {
		margin: 6px 0;
		padding-left: 10px;
		border-left: 2px solid var(--border);
		color: var(--muted-foreground);
		font-size: 14px;
		line-height: 1.45;
	}

	.empty {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
	}
</style>
