<script lang="ts">
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { authClient } from '$lib/auth-client';
	import { promptSignIn } from '$lib/stores/sign-in-modal';
	import { MessageCircle, Pencil, MoreHorizontal, Check } from 'lucide-svelte';

	let { data }: PageProps = $props();

	interface CommentRow {
		id: string;
		content: string;
		created_at: number;
		user_id: string;
		parent_comment_id: string | null;
		user: {
			id: string;
			display_name: string | null;
			username: string | null;
			profile_picture_url?: string | null;
		};
	}

	const MAX_NEST_DEPTH = 3;

	function childrenOf(commentsForPost: CommentRow[], commentId: string): CommentRow[] {
		return commentsForPost
			.filter((c) => c.parent_comment_id === commentId)
			.sort((a, b) => a.created_at - b.created_at);
	}

	function topLevelOf(commentsForPost: CommentRow[]): CommentRow[] {
		return commentsForPost
			.filter((c) => c.parent_comment_id === null)
			.sort((a, b) => a.created_at - b.created_at);
	}

	let composerValue = $state('');
	let posting = $state(false);

	let editing = $state(false);
	let editValue = $state('');
	let savingEdit = $state(false);
	let deleting = $state(false);
	let kebabOpen = $state(false);

	function toggleKebab(e: MouseEvent) {
		e.stopPropagation();
		kebabOpen = !kebabOpen;
	}

	$effect(() => {
		if (!kebabOpen) return;
		function onClickOutside() { kebabOpen = false; }
		const t = setTimeout(() => document.addEventListener('click', onClickOutside), 0);
		return () => {
			clearTimeout(t);
			document.removeEventListener('click', onClickOutside);
		};
	});

	let worldTab = $state<'post' | 'ask'>('post');
	let worldValue = $state('');
	let postingWorld = $state(false);

	type NotifyState = NotificationPermission | 'unsupported' | 'ios-pwa-required' | null;
	let notificationPermission = $state<NotifyState>(null);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const ua = window.navigator.userAgent;
		const isIos = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
		const isStandalone =
			(window.navigator as { standalone?: boolean }).standalone === true ||
			window.matchMedia('(display-mode: standalone)').matches;

		if ('Notification' in window) {
			notificationPermission = Notification.permission;
			return;
		}
		if (isIos && !isStandalone) {
			notificationPermission = 'ios-pwa-required';
			return;
		}
		notificationPermission = 'unsupported';
	});

	async function enableNotifications() {
		if (typeof window === 'undefined') return;
		if (!('Notification' in window)) {
			alert('Your browser does not support notifications.');
			return;
		}
		try {
			const result = await Notification.requestPermission();
			notificationPermission = result;
			if (result === 'granted') {
				new Notification('Sehyo notifications enabled', {
					body: 'You’ll be told when a new question is posited.',
					icon: '/pwa-192x192.png'
				});
			}
		} catch (err) {
			console.error('Permission request failed:', err);
		}
	}

	let commentingOnPost = $state<string | null>(null);
	let commentValue = $state('');
	let submittingComment = $state(false);

	const commentsByPost = $derived<Record<string, CommentRow[]>>({
		...((data as { todayCommentsByPost?: Record<string, CommentRow[]> }).todayCommentsByPost ?? {}),
		...((data as { commentsByPost?: Record<string, CommentRow[]> }).commentsByPost ?? {})
	});

	let replyingTo = $state<string | null>(null);
	let replyValue = $state('');
	let submittingReply = $state(false);

	const isAnon = $derived(!!data.user && !!data.user.isAnonymous);
	const isFullySignedIn = $derived(!!data.user && !data.user.isAnonymous);

	const unlockedSet = $derived(new Set(data.unlockedAvatars ?? []));
	function isAvatarRevealed(userId: string | undefined | null): boolean {
		if (!userId) return false;
		if (data.user?.id === userId) return true;
		return unlockedSet.has(userId);
	}
	function avatarFor(image: string | null | undefined, seed: string): string {
		return image ?? `https://i.pravatar.cc/200?u=${encodeURIComponent(seed)}`;
	}

	function changeMyName() {
		promptSignIn('Sign in to change your name.');
	}

	async function ensureSession() {
		if (data.user) return true;
		try {
			await authClient.signIn.anonymous();
			await invalidateAll();
			return true;
		} catch (err) {
			console.error('Anon sign-in failed:', err);
			return false;
		}
	}

	async function submitAnswer(e: SubmitEvent) {
		e.preventDefault();
		const content = composerValue.trim();
		if (!content || posting) return;
		posting = true;
		try {
			if (!(await ensureSession())) {
				alert('Could not start a session. Try again.');
				return;
			}
			const res = await fetch('/api/prompt/answer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ content })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			composerValue = '';
			await invalidateAll();
		} catch (err) {
			console.error('Answer post failed:', err);
			alert('Could not post. Try again.');
		} finally {
			posting = false;
		}
	}

	function startEdit() {
		if (!data.myAnswer) return;
		editValue = data.myAnswer.content;
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		editValue = '';
		kebabOpen = false;
	}

	async function saveEdit() {
		if (!data.myAnswer) return;
		const content = editValue.trim();
		if (!content || savingEdit) return;
		savingEdit = true;
		try {
			const res = await fetch(`/api/posts/${data.myAnswer.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ content })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			editing = false;
			editValue = '';
			await invalidateAll();
		} catch (err) {
			console.error('Edit failed:', err);
			alert('Could not save. Try again.');
		} finally {
			savingEdit = false;
		}
	}

	async function deleteAnswer() {
		if (!data.myAnswer || deleting) return;
		deleting = true;
		try {
			const res = await fetch(`/api/posts/${data.myAnswer.id}`, {
				method: 'DELETE',
				credentials: 'include'
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			editing = false;
			editValue = '';
			composerValue = '';
			await invalidateAll();
		} catch (err) {
			console.error('Delete failed:', err);
			alert('Could not delete. Try again.');
		} finally {
			deleting = false;
		}
	}

	async function submitWorld(e: SubmitEvent) {
		e.preventDefault();
		const content = worldValue.trim();
		if (!content || postingWorld) return;
		const endpoint = worldTab === 'ask' ? '/api/posts/question' : '/api/posts/free';
		postingWorld = true;
		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ content })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			worldValue = '';
			await invalidateAll();
		} catch (err) {
			console.error('World post failed:', err);
			alert('Could not post. Try again.');
		} finally {
			postingWorld = false;
		}
	}

	async function focusComposer(postId: string) {
		commentingOnPost = postId;
		commentValue = '';
		// Wait for the composer to render, then scroll it into view +
		// focus the textarea so a long thread doesn't bury the
		// "Add a comment" field.
		await tick();
		if (typeof document === 'undefined') return;
		const form = document.querySelector<HTMLFormElement>(
			`form.comment-composer[data-for-post="${postId}"]`
		);
		if (form) {
			form.scrollIntoView({ behavior: 'smooth', block: 'center' });
			const ta = form.querySelector('textarea');
			ta?.focus({ preventScroll: true });
		}
	}

	async function submitComment(postId: string, e: SubmitEvent) {
		e.preventDefault();
		const content = commentValue.trim();
		if (!content || submittingComment) return;
		submittingComment = true;
		try {
			if (!(await ensureSession())) return;
			const res = await fetch(`/api/posts/${postId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ content })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			commentValue = '';
			commentingOnPost = null;
			await invalidateAll();
		} catch (err) {
			console.error('Comment failed:', err);
			alert('Could not post comment. Try again.');
		} finally {
			submittingComment = false;
		}
	}

	async function submitReply(postId: string, parentCommentId: string, e: SubmitEvent) {
		e.preventDefault();
		const content = replyValue.trim();
		if (!content || submittingReply) return;
		submittingReply = true;
		try {
			if (!(await ensureSession())) return;
			const res = await fetch(`/api/posts/${postId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ content, parent_comment_id: parentCommentId })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			replyValue = '';
			replyingTo = null;
			await invalidateAll();
		} catch (err) {
			console.error('Reply failed:', err);
			alert('Could not post reply. Try again.');
		} finally {
			submittingReply = false;
		}
	}

	function toggleReply(commentId: string) {
		if (replyingTo === commentId) {
			replyingTo = null;
			replyValue = '';
		} else {
			replyingTo = commentId;
			replyValue = '';
		}
	}

	function formatDate(iso: string) {
		const d = new Date(iso + 'T00:00:00Z');
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Sehyo — share your thoughts</title>
</svelte:head>

<main class="page">
	{#if !data.prompt}
		<p class="empty">No prompt today yet. Check back shortly.</p>
	{:else}
		<h1 class="prompt prompt-today">{data.prompt.text}</h1>

		{#if !data.myAnswer}
			<p class="prompt-hint">Answer to unlock the rest of the world.</p>
			<form class="composer" onsubmit={submitAnswer}>
				<textarea
					bind:value={composerValue}
					placeholder="Your answer…"
					rows="3"
					maxlength="2000"
					disabled={posting}
				></textarea>
				<div class="composer-bar">
					<button
						type="submit"
						class="post-button"
						disabled={posting || composerValue.trim().length === 0}
					>{posting ? 'Posting…' : 'Post'}</button>
				</div>
			</form>
		{:else}
			{@render postArticle({
				id: data.myAnswer.id,
				user_id: data.myAnswer.user_id,
				content: data.myAnswer.content,
				display_name: data.user?.name ?? 'You',
				username: data.user?.username ?? null,
				bot_id: null,
				image: (data.user as { image?: string | null } | null)?.image ?? null,
				comment_count: data.myAnswer.comment_count
			}, { isMine: true })}
		{/if}

		<section class="answers">
			{#each data.answers as a (a.id)}
				{@render postArticle(a, { isMine: false })}
			{/each}
		</section>

		{#if !data.myAnswer}
			<p class="locked-cta">Answer today's question to explore the world of sehyo.</p>
		{/if}

		{#if data.myAnswer}
			<p class="nudge">
				A new question will be posited tomorrow.
				{#if notificationPermission === 'granted'}
					<span class="nudge-state">Notifications on.</span>
				{:else if notificationPermission === 'ios-pwa-required'}
					<span class="nudge-state">To enable notifications: tap Share → Add to Home Screen, then open Sehyo from the icon.</span>
				{:else if notificationPermission === 'denied' || notificationPermission === 'unsupported'}
					<span class="nudge-state">Notifications unavailable.</span>
				{:else}
					<button type="button" class="nudge-cta" onclick={enableNotifications}>Enable notifications</button>
					to be notified when it's posited.
				{/if}
			</p>

			<hr class="world-divider" />
			<h2 class="world-label">World</h2>

			<section class="free-section">
				<div class="world-tabs" role="tablist" aria-label="World composer">
					<button
						type="button"
						role="tab"
						aria-selected={worldTab === 'post'}
						class="world-tab"
						class:active={worldTab === 'post'}
						onclick={() => (worldTab = 'post')}
					>Post</button>
					<button
						type="button"
						role="tab"
						aria-selected={worldTab === 'ask'}
						class="world-tab"
						class:active={worldTab === 'ask'}
						onclick={() => (worldTab = 'ask')}
					>Ask</button>
				</div>

				<form class="composer" onsubmit={submitWorld}>
					<textarea
						bind:value={worldValue}
						placeholder={worldTab === 'ask' ? 'Ask a question…' : "What's on your mind?"}
						rows={worldTab === 'ask' ? 2 : 3}
						maxlength={worldTab === 'ask' ? 280 : 2000}
						disabled={postingWorld}
					></textarea>
					<div class="composer-bar">
						<button
							type="submit"
							class="post-button"
							disabled={postingWorld || worldValue.trim().length === 0}
						>{
							postingWorld
								? worldTab === 'ask' ? 'Asking…' : 'Posting…'
								: worldTab === 'ask' ? 'Ask' : 'Post'
						}</button>
					</div>
				</form>

				{#if data.todayFreePosts.length > 0}
					<div class="world-feed">
						{#each data.todayFreePosts as p (p.id)}
							{#if p.is_question}
								{@render userQuestionCard(p)}
							{:else}
								{@render postArticle(p, { isMine: false })}
							{/if}
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if !isFullySignedIn && data.myAnswer && data.myAnswer.comment_count > 0}
			<div class="signin-toast" role="status">
				<span>{data.myAnswer.comment_count} {data.myAnswer.comment_count === 1 ? 'person' : 'people'} responded to your answer.</span>
				<button type="button" class="toast-link" onclick={() => promptSignIn('Sign in to read what they said.')}>Sign in</button>
				<span>to read what they said.</span>
			</div>
		{/if}

		{#if data.timeline?.length}
			<div class="past">
				{#each data.timeline as item (item.kind === 'prompt' ? `q-${item.data.id}` : `p-${item.data.id}`)}
					{#if item.kind === 'prompt'}
						<section class="past-day">
							<p class="past-date">{formatDate(item.data.active_date)}</p>
							<h2 class="prompt prompt-past">{item.data.text}</h2>
							{#if item.data.answers.length > 0}
								<div class="answers">
									{#each item.data.answers as a (a.id)}
										{@render postArticle(a, { isMine: false })}
									{/each}
								</div>
							{:else}
								<p class="empty small">No answers.</p>
							{/if}
						</section>
					{:else if item.data.is_question}
						{@render userQuestionCard(item.data)}
					{:else}
						{@render postArticle(item.data, { isMine: false })}
					{/if}
				{/each}
			</div>
		{/if}
	{/if}
</main>

<!-- ─────────────────────────────────────────────────────────────────
	 Twitter-style row. The container is `tw-item`, a flex row of:
	   • tw-left  – fixed-width avatar column. When the row has
	                replies underneath, a flex:1 line drops below the
	                avatar and stretches with the parent's content
	                so children visually nest under the same line.
	   • tw-main  – name + handle + body + actions, then optional
	                tw-children list. Children indent NATURALLY by
	                living inside tw-main; the parent's avatar
	                column keeps the line in the gutter.
	 ───────────────────────────────────────────────────────────────── -->
{#snippet avatar(userId: string, image: string | null | undefined)}
	{@const revealed = isAvatarRevealed(userId)}
	<span class="tw-avatar" class:locked={!revealed} aria-hidden="true">
		<img
			src={avatarFor(image, userId)}
			alt=""
			class="tw-avatar-img"
			loading="lazy"
			draggable="false"
		/>
		{#if !revealed}
			<span class="tw-avatar-tooltip">Reply to them to reveal what they look like</span>
		{/if}
	</span>
{/snippet}

{#snippet authorMeta(displayName: string | null | undefined, username: string | null | undefined, isOwn: boolean)}
	<header class="tw-meta">
		{#if username}
			<a class="tw-name" href="/{username}">{displayName ?? 'Anonymous'}</a>
			<a class="tw-handle" href="/{username}">@{username}</a>
		{:else}
			<span class="tw-name">{displayName ?? 'Anonymous'}</span>
		{/if}
		{#if isOwn && isAnon}
			<button
				type="button"
				class="edit-name"
				aria-label="Change your name"
				onclick={changeMyName}
			>
				<Pencil size="13" strokeWidth="1.8" />
			</button>
		{/if}
	</header>
{/snippet}

{#snippet commentNode(c: CommentRow, postId: string, depth: number)}
	{@const all = commentsByPost[postId] ?? []}
	{@const kids = childrenOf(all, c.id)}
	{@const hasKids = kids.length > 0}
	{@const ownComment = !!data.user && c.user_id === data.user.id}
	<li class="tw-item is-reply">
		<div class="tw-left">
			{#if c.user?.username}
				<a class="tw-avatar-link" href="/{c.user.username}" aria-label={c.user.display_name ?? 'Profile'}>
					{@render avatar(c.user_id, c.user?.profile_picture_url)}
				</a>
			{:else}
				{@render avatar(c.user_id, c.user?.profile_picture_url)}
			{/if}
			{#if hasKids}<div class="tw-line"></div>{/if}
		</div>
		<div class="tw-main">
			{@render authorMeta(c.user?.display_name, c.user?.username, ownComment)}
			<p class="tw-body">{c.content}</p>
			<footer class="tw-foot">
				<button
					type="button"
					class="tw-action"
					onclick={() => toggleReply(c.id)}
					aria-label={replyingTo === c.id ? 'Cancel reply' : 'Reply'}
				>
					<MessageCircle size="16" strokeWidth="1.7" />
					{#if hasKids}<span class="count">{kids.length}</span>{/if}
				</button>
			</footer>

			{#if replyingTo === c.id}
				<form class="reply-composer" onsubmit={(e) => submitReply(postId, c.id, e)}>
					<textarea
						bind:value={replyValue}
						placeholder="Reply…"
						rows="2"
						maxlength="1000"
						disabled={submittingReply}
					></textarea>
					<button
						type="submit"
						class="post-button small"
						disabled={submittingReply || replyValue.trim().length === 0}
					>{submittingReply ? '…' : 'Reply'}</button>
				</form>
			{/if}

			{#if hasKids}
				<ul class="tw-children" class:capped={depth + 1 >= MAX_NEST_DEPTH}>
					{#each kids as child (child.id)}
						{#if depth + 1 < MAX_NEST_DEPTH}
							{@render commentNode(child, postId, depth + 1)}
						{:else}
							{@render commentNode(child, postId, depth)}
						{/if}
					{/each}
				</ul>
			{/if}
		</div>
	</li>
{/snippet}

{#snippet postArticle(
	a: { id: string; user_id: string; content: string; display_name: string | null; username?: string | null; bot_id: string | null; image?: string | null; comment_count: number },
	opts: { isMine?: boolean }
)}
	{@const isMine = !!opts?.isMine}
	{@const all = commentsByPost[a.id] ?? []}
	{@const tops = topLevelOf(all)}
	{@const hasTops = tops.length > 0}
	{@const guestLocked = isMine && hasTops && !isFullySignedIn}
	<article class="tw-post">
		<div class="tw-item is-post">
			<div class="tw-left">
				{#if isMine && editing}
					{#if data.user}
						{@render avatar(data.user.id, (data.user as { image?: string | null }).image)}
					{/if}
				{:else if a.username}
					<a class="tw-avatar-link" href="/{a.username}" aria-label={a.display_name ?? 'Profile'}>
						{@render avatar(a.user_id, a.image)}
					</a>
				{:else}
					{@render avatar(a.user_id, a.image)}
				{/if}
				{#if hasTops}<div class="tw-line"></div>{/if}
			</div>
			<div class="tw-main">
				{@render authorMeta(a.display_name, a.username, isMine)}
				{#if isMine && editing}
					<textarea
						bind:value={editValue}
						rows="3"
						maxlength="2000"
						disabled={savingEdit || deleting}
						class="edit-textarea"
					></textarea>
					<div class="edit-bar">
						<button
							type="button"
							class="post-button small"
							onclick={saveEdit}
							disabled={savingEdit || deleting || editValue.trim().length === 0}
						>
							<Check size="16" strokeWidth="2.2" />
							{savingEdit ? 'Saving…' : 'Save'}
						</button>
						<div class="popover-container">
							<button
								type="button"
								class="kebab"
								aria-label="More actions"
								aria-expanded={kebabOpen}
								onclick={toggleKebab}
								disabled={savingEdit || deleting}
							>
								<MoreHorizontal size="18" strokeWidth="2" />
							</button>
							{#if kebabOpen}
								<div class="popover" role="menu">
									<button type="button" class="popover-item" onclick={cancelEdit} role="menuitem">
										Cancel
									</button>
									<button
										type="button"
										class="popover-item destructive"
										onclick={deleteAnswer}
										role="menuitem"
										disabled={deleting}
									>
										{deleting ? 'Deleting…' : 'Delete'}
									</button>
								</div>
							{/if}
						</div>
					</div>
				{:else}
					<p class="tw-body">{a.content}</p>
					<footer class="tw-foot">
						<button
							type="button"
							class="tw-action"
							onclick={() => focusComposer(a.id)}
							aria-label="Comment"
						>
							<MessageCircle size="18" strokeWidth="1.7" />
							{#if a.comment_count > 0}<span class="count">{a.comment_count}</span>{/if}
						</button>
						{#if isMine}
							<button
								type="button"
								class="tw-action"
								onclick={startEdit}
								aria-label="Edit answer"
							>
								<Pencil size="16" strokeWidth="1.8" />
							</button>
						{/if}
					</footer>
				{/if}

				{#if hasTops}
					<ul class="tw-children" class:guest-locked={guestLocked}>
						{#each tops as c (c.id)}
							{@render commentNode(c, a.id, 0)}
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		{#if hasTops && guestLocked}
			<div class="guest-locked-cta">
				<span class="guest-locked-text">
					<button type="button" class="guest-locked-link" onclick={() => promptSignIn('Sign in to read the comments on your response.')}>Sign in</button>
					to read the comments on your response.
				</span>
			</div>
		{/if}

		{#if commentingOnPost === a.id && !guestLocked}
			<form class="comment-composer" data-for-post={a.id} onsubmit={(e) => submitComment(a.id, e)}>
				<textarea
					bind:value={commentValue}
					placeholder="Add a comment…"
					rows="2"
					maxlength="1000"
					disabled={submittingComment}
				></textarea>
				<button
					type="submit"
					class="post-button small"
					disabled={submittingComment || commentValue.trim().length === 0}
				>{submittingComment ? '…' : 'Post'}</button>
			</form>
		{/if}
	</article>
{/snippet}

{#snippet userQuestionCard(q: { id: string; user_id: string; content: string; display_name: string | null; username?: string | null; bot_id: string | null; image?: string | null; comment_count: number })}
	{@const all = commentsByPost[q.id] ?? []}
	{@const tops = topLevelOf(all)}
	{@const hasTops = tops.length > 0}
	<article class="tw-post user-question">
		<div class="tw-item is-post">
			<div class="tw-left">
				{#if q.username}
					<a class="tw-avatar-link" href="/{q.username}" aria-label={q.display_name ?? 'Profile'}>
						{@render avatar(q.user_id, q.image)}
					</a>
				{:else}
					{@render avatar(q.user_id, q.image)}
				{/if}
				{#if hasTops}<div class="tw-line"></div>{/if}
			</div>
			<div class="tw-main">
				{@render authorMeta(q.display_name, q.username, false)}
				<h3 class="user-question-text">{q.content}</h3>
				<footer class="tw-foot">
					<button
						type="button"
						class="tw-action"
						onclick={() => focusComposer(q.id)}
						aria-label="Reply"
					>
						<MessageCircle size="18" strokeWidth="1.7" />
						{#if q.comment_count > 0}<span class="count">{q.comment_count}</span>{/if}
					</button>
				</footer>

				{#if hasTops}
					<ul class="tw-children">
						{#each tops as c (c.id)}
							{@render commentNode(c, q.id, 0)}
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		{#if commentingOnPost === q.id}
			<form class="comment-composer" onsubmit={(e) => submitComment(q.id, e)}>
				<textarea
					bind:value={commentValue}
					placeholder="Add a comment…"
					rows="2"
					maxlength="1000"
					disabled={submittingComment}
				></textarea>
				<button
					type="submit"
					class="post-button small"
					disabled={submittingComment || commentValue.trim().length === 0}
				>{submittingComment ? '…' : 'Post'}</button>
			</form>
		{/if}
	</article>
{/snippet}

<style>
	.page {
		max-width: none;
		margin: 0 auto;
		padding: 120px 12px 96px;
	}

	.composer,
	.answers,
	.free-section,
	.past-date,
	.tw-post {
		max-width: 640px;
		width: 100%;
		margin-left: auto;
		margin-right: auto;
	}

	.prompt-today {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.025em;
		font-size: clamp(40px, 8vw, 72px);
		line-height: 1.05;
		text-align: center;
		color: var(--foreground);
		margin: 0 auto 32px;
		max-width: 1000px;
	}
	@media (min-width: 768px) {
		.prompt-today { padding-bottom: 40px; }
	}

	.prompt-hint {
		text-align: center;
		color: var(--muted-foreground);
		font-size: 14px;
		font-style: italic;
		max-width: 640px;
		margin: -16px auto 28px;
		line-height: 1.5;
	}

	.prompt-past {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.018em;
		font-size: clamp(20px, 3.4vw, 30px);
		line-height: 1.18;
		color: var(--foreground);
		margin: 0 auto 12px;
		max-width: 640px;
	}

	.composer { margin-bottom: 56px; }
	.composer textarea, .edit-textarea, .comment-composer textarea, .reply-composer textarea {
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
		min-height: 88px;
	}
	.composer textarea { min-height: 96px; font-size: 17px; padding: 14px 16px; }
	.composer textarea:focus, .edit-textarea:focus, .comment-composer textarea:focus, .reply-composer textarea:focus {
		outline: 2px solid var(--ring);
		outline-offset: -1px;
	}
	.composer-bar {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 12px;
	}
	.edit-bar {
		display: flex;
		justify-content: flex-start;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}
	.post-button {
		appearance: none;
		border: 0;
		padding: 10px 22px;
		border-radius: 999px;
		background: var(--foreground);
		color: var(--background);
		font-weight: 700;
		font-size: 15px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.post-button.small { padding: 8px 14px; font-size: 14px; }
	.post-button:disabled { opacity: 0.4; cursor: not-allowed; }

	/* ──────────────────────────────────────────────────────────────
	   tw-post – article wrapper. Adds the divider stroke between
	   consecutive posts and clears float-style stacking.
	   ────────────────────────────────────────────────────────────── */
	.tw-post {
		padding: 16px 0 8px;
		border-top: 1px solid var(--border);
	}
	.answers > .tw-post:first-child { border-top: 0; }
	.world-feed > .tw-post:first-child { border-top: 0; }

	/* tw-item – the flex container for ONE row of avatar + content.
	   Used for both top-level posts and nested comments. The
	   tw-left stretches vertically (align-items:stretch) so the
	   line-down element can fill the whole height including any
	   nested children inside tw-main. */
	.tw-item {
		display: flex;
		gap: 8px;
		align-items: stretch;
		width: 100%;
	}
	.tw-item.is-reply {
		list-style: none;
		padding-top: 12px;
	}

	.tw-left {
		flex-shrink: 0;
		width: 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.tw-avatar-link {
		display: block;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		overflow: hidden;
		flex-shrink: 0;
		-webkit-user-drag: none;
	}
	.tw-avatar {
		display: block;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--muted);
		position: relative;
		flex-shrink: 0;
		user-select: none;
		-webkit-user-drag: none;
		-webkit-touch-callout: none;
	}
	.tw-avatar-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: filter 220ms ease, transform 220ms ease;
		pointer-events: none;
		user-select: none;
		-webkit-user-drag: none;
	}
	.tw-avatar.locked .tw-avatar-img {
		filter: blur(8px);
		transform: scale(1.18);
	}
	/* Hover label on locked avatars: a small gray pill explaining
	   how to reveal the face. Fades in after a short hover-hold so
	   it doesn't flash on quick passes. Pointer-events:none so the
	   label itself doesn't block clicks on whatever wraps the
	   avatar (the @-handle link, etc.). */
	.tw-avatar-tooltip {
		position: absolute;
		left: 50%;
		top: calc(100% + 6px);
		transform: translate(-50%, -2px);
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
		z-index: 10;
	}
	.tw-avatar:hover .tw-avatar-tooltip {
		opacity: 1;
		transform: translate(-50%, 0);
		transition-delay: 350ms;
	}
	/* Drop line below the avatar. flex:1 so the line stretches with
	   the content column, even when the content column grows from
	   nested replies inside tw-main. The line is drawn full-length
	   to bottom of tw-item; the LAST child's ::after below hides
	   the tail that would otherwise dangle past the last L-curve. */
	.tw-line {
		flex: 1;
		width: 2px;
		min-height: 6px;
		margin: 6px 0 0;
		background: var(--border);
		border-radius: 999px;
	}

	.tw-main {
		flex: 1;
		min-width: 0;
	}
	.tw-meta {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
		margin: 0 0 2px;
	}
	.tw-name {
		font-weight: 600;
		font-size: 15px;
		color: var(--foreground);
		text-decoration: none;
	}
	.tw-name:hover { text-decoration: underline; }
	.tw-handle {
		font-size: 13px;
		color: var(--muted-foreground);
		text-decoration: none;
		font-weight: 500;
	}
	.tw-handle:hover { text-decoration: underline; }

	.tw-body {
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.55;
		color: var(--foreground);
		margin: 2px 0 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.tw-foot {
		margin-top: 8px;
		display: flex;
		gap: 4px;
	}
	.tw-action {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 6px 8px;
		border-radius: 999px;
		cursor: pointer;
		font-size: 13px;
		transition: color 120ms ease, background 120ms ease;
	}
	.tw-action:hover { color: var(--foreground); background: var(--muted); }
	.count { font-weight: 600; line-height: 1; }

	/* tw-children – list of replies. Inside tw-main, no extra
	   indent. Each reply is itself a .tw-item with its own avatar
	   column at child.x:0. Parent's avatar+line live in PARENT's
	   tw-left, which is to the left of children's tw-main, so the
	   parent's line passes through the gutter as the children
	   stack. The L-connector below hooks each child to that line. */
	.tw-children {
		list-style: none;
		padding: 0;
		margin: 8px 0 0;
	}

	/* L-connector. Drawn ABSOLUTELY against this child's tw-item.
	   Vertical stub on the left + horizontal at the bottom + curve
	   in the bottom-left corner. Bottom edge sits at the avatar's
	   vertical center (avatar 44px + 12px padding-top = center at
	   y:34). The vertical stub merges with parent's drop-line at
	   x:-34 (since parent.line at parent.x:22 = child.x:-34). */
	.tw-item.is-reply {
		position: relative;
	}
	/* Horizontal-only hook into the parent's drop-line. The
	   parent's line already provides the vertical at x:-28
	   (= parent.tw-left center, since avatar is 40px and the
	   gap is 8px → child.x:0 = parent.x:48, parent's line at
	   parent.x:20 = child.x:-28). The hook is just a 28px
	   horizontal stub at avatar vertical-center (12px padding +
	   20px half-avatar = 32px) so the line bends in cleanly
	   without doubling up at the corner. */
	.tw-item.is-reply::before {
		content: '';
		position: absolute;
		left: -28px;
		top: 32px;
		width: 28px;
		height: 2px;
		background: var(--border);
		border-radius: 999px;
		pointer-events: none;
	}
	/* Stop the parent's drop-line at this child's hook. Cover
	   starts at y:34 (= hook bottom: 32 + 2px hook thickness),
	   NOT at y:32, so it doesn't erase the leftmost pixel of
	   the hook itself. The 4px width fully overlaps the 2px
	   parent line, and the cover is bounded by the li so it
	   doesn't bleed into subsequent posts. */
	.tw-children > .tw-item.is-reply:last-child::after {
		content: '';
		display: block;
		position: absolute;
		left: -30px;
		top: 34px;
		bottom: 0;
		width: 4px;
		background: var(--background);
		pointer-events: none;
	}

	.tw-children.capped {
		/* At the depth cap we render flat at this level; no further
		   visual indent change. */
	}

	.reply-composer,
	.comment-composer {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		margin: 12px 0 0;
	}
	.reply-composer { margin-top: 8px; }
	/* The post-level "Add a comment" composer sits at the article
	   level (outside .tw-item), so left-indent it by avatar+gap
	   (40 + 8 = 48px) to align with where comments will appear
	   inside .tw-children. */
	.comment-composer {
		margin-left: 48px;
	}
	.reply-composer textarea, .comment-composer textarea {
		flex: 1;
		min-height: 54px;
	}

	.edit-textarea {
		width: 100%;
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.55;
		padding: 12px 14px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--card-foreground);
		resize: vertical;
		min-height: 88px;
		margin-top: 4px;
	}

	.popover-container {
		position: relative;
		display: inline-flex;
	}
	.kebab {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 8px;
		border-radius: 999px;
		cursor: pointer;
		transition: color 120ms ease, background 120ms ease;
	}
	.kebab:hover { color: var(--foreground); background: var(--muted); }
	.kebab:disabled { opacity: 0.4; cursor: not-allowed; }
	.popover {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 20;
		min-width: 140px;
		padding: 4px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.popover-item {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		text-align: left;
		padding: 8px 12px;
		border-radius: 6px;
		cursor: pointer;
	}
	.popover-item:hover { background: var(--muted); }
	.popover-item.destructive { color: var(--destructive); }
	.popover-item:disabled { opacity: 0.5; cursor: not-allowed; }

	.answers { display: flex; flex-direction: column; }

	.edit-name {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px;
		border-radius: 4px;
		cursor: pointer;
	}
	.edit-name:hover {
		color: var(--foreground);
		background: var(--muted);
	}

	.nudge {
		max-width: 640px;
		margin: 32px auto 0;
		padding: 0 0 8px;
		text-align: center;
		color: var(--muted-foreground);
		font-size: 14px;
		line-height: 1.6;
	}
	.nudge-cta {
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
	.nudge-cta:hover { opacity: 0.7; }
	.nudge-state {
		color: var(--foreground);
		font-weight: 500;
	}

	.world-divider {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 64px -12px 0;
	}
	.world-label {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.02em;
		font-size: clamp(28px, 5vw, 44px);
		line-height: 1.1;
		text-align: center;
		color: var(--foreground);
		margin: 32px auto 24px;
		max-width: 640px;
	}
	.free-section { margin-top: 0; }

	.world-tabs {
		display: flex;
		gap: 24px;
		margin: 0 0 16px;
		border-bottom: 1px solid var(--border);
	}
	.world-tab {
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
		transition: color 120ms ease, border-color 120ms ease;
	}
	.world-tab:hover { color: var(--foreground); }
	.world-tab.active {
		color: var(--foreground);
		border-bottom-color: var(--foreground);
	}

	.user-question-text {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.02em;
		font-size: clamp(22px, 3.4vw, 30px);
		line-height: 1.18;
		color: var(--foreground);
		margin: 4px 0 0;
	}

	.world-feed { display: flex; flex-direction: column; }

	/* Below the World section: a chronological timeline of past
	   daily questions interleaved with past user posts/questions.
	   Tighter padding than today's prompt + answers above so the
	   World section reads as the foreground and the timeline as
	   archive. */
	.past { margin-top: 56px; }
	.past-day {
		max-width: 640px;
		margin: 0 auto;
		padding-top: 24px;
		padding-bottom: 8px;
		border-top: 1px solid var(--border);
	}
	.past-date {
		font-size: 11px;
		font-weight: 600;
		color: var(--muted-foreground);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin: 0 0 8px;
	}

	.empty {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
	}
	.empty.small { padding: 16px 0; font-size: 14px; }

	.locked-cta {
		max-width: 640px;
		margin: 56px auto 0;
		padding: 0 0 24px;
		text-align: center;
		color: var(--muted-foreground);
		font-size: 15px;
		line-height: 1.5;
		font-style: italic;
	}

	.tw-children.guest-locked {
		filter: blur(5px);
		user-select: none;
		pointer-events: none;
	}
	.guest-locked-cta {
		text-align: center;
		padding: 16px 0 4px;
	}
	.guest-locked-text {
		font-size: 14px;
		font-style: italic;
		color: var(--muted-foreground);
		line-height: 1.5;
	}
	.guest-locked-link {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-style: normal;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		padding: 0;
	}
	.guest-locked-link:hover { opacity: 0.85; }

	.signin-toast {
		position: fixed;
		left: 50%;
		bottom: 20px;
		transform: translateX(-50%);
		z-index: 60;
		max-width: calc(100vw - 32px);
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 12px 18px;
		background: color-mix(in oklab, var(--card) 95%, var(--foreground));
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 14px;
		line-height: 1.4;
		box-shadow: 0 12px 32px -10px rgba(0, 0, 0, 0.4);
	}
	.toast-link {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		padding: 0;
	}
	.toast-link:hover { opacity: 0.85; }

	/* ── Mobile threading: tighter avatar column + halved hook ────
	   On narrow viewports we shrink the avatar gutter (avatar 40
	   → 32, gap 8 → 4) and recompute the hook + cover so replies
	   take less horizontal real estate, leaving more screen for
	   the actual text. The avatar's own size is kept ≥ 32 so it
	   still reads as a face, not a dot. */
	@media (max-width: 600px) {
		.tw-item { gap: 4px; }
		.tw-left { width: 32px; }
		.tw-avatar,
		.tw-avatar-link {
			width: 32px;
			height: 32px;
		}
		/* Hook: parent's line at parent.x:16 (= 32/2). Children
		   start at parent.x:36 (32 + 4 gap). Distance from line
		   to child's avatar left = 36 − 16 − 1 = 19 ≈ 20px. So
		   hook left:-20, width:20. Avatar center y = 12 padding +
		   16 half-avatar = 28. */
		.tw-item.is-reply::before {
			left: -20px;
			width: 20px;
			top: 28px;
		}
		.tw-children > .tw-item.is-reply:last-child::after {
			left: -22px;
			top: 28px;
		}
		.comment-composer { margin-left: 36px; }
	}
</style>
