<script lang="ts">
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { promptSignIn } from '$lib/stores/sign-in-modal';
	import { MessageCircle, Pencil, MoreHorizontal, Check, CornerUpLeft } from 'lucide-svelte';

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

	function buildCommentTree(flat: CommentRow[]): { comment: CommentRow; children: CommentRow[] }[] {
		// Group by parent. Render top-level (parent null) with their full
		// descendant trees flattened up to MAX_NEST_DEPTH visual layers.
		const byParent = new Map<string | null, CommentRow[]>();
		for (const c of flat) {
			const key = c.parent_comment_id;
			const arr = byParent.get(key) ?? [];
			arr.push(c);
			byParent.set(key, arr);
		}
		// We render via a recursive snippet, so just return top-level array.
		const top = byParent.get(null) ?? [];
		// Sort by created_at ascending within each level (the API already does
		// this, but defensive).
		top.sort((a, b) => a.created_at - b.created_at);
		return top.map((c) => ({ comment: c, children: byParent.get(c.id) ?? [] }));
	}

	// Children of a given comment id, sorted ascending by created_at.
	function childrenOf(commentsForPost: CommentRow[], commentId: string): CommentRow[] {
		return commentsForPost
			.filter((c) => c.parent_comment_id === commentId)
			.sort((a, b) => a.created_at - b.created_at);
	}

	// Today's-prompt composer state.
	let composerValue = $state('');
	let posting = $state(false);

	// Edit-mode for the viewer's own answer to today's prompt.
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
		// Defer so the toggle click itself doesn't immediately close it.
		const t = setTimeout(() => document.addEventListener('click', onClickOutside), 0);
		return () => {
			clearTimeout(t);
			document.removeEventListener('click', onClickOutside);
		};
	});

	// World composer with two modes (Post / Ask). One textarea, one
	// submit button; the active tab decides which endpoint we hit.
	let worldTab = $state<'post' | 'ask'>('post');
	let worldValue = $state('');
	let postingWorld = $state(false);

	// Browser-notification permission state. The actual web-push
	// subscription wiring is a Phase 2 follow-up; for now we just hold
	// the permission so the UI can reflect it.
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
		// iOS Safari hides the Notification API unless the page is
		// installed to the home screen as a PWA (iOS 16.4+).
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
				// TODO(phase2): subscribe to web-push and persist on server
				// so the cron worker can send "new prompt" / "new comment"
				// pushes to this device.
				new Notification('Sehyo notifications enabled', {
					body: 'You’ll be told when a new question is posited.',
					icon: '/pwa-192x192.png'
				});
			}
		} catch (err) {
			console.error('Permission request failed:', err);
		}
	}

	// Inline comment composer state.
	let openCommentFor = $state<string | null>(null);
	let commentValue = $state('');
	let submittingComment = $state(false);
	let commentsByPost = $state<Record<string, CommentRow[]>>({});

	// When non-null, indicates a reply composer is open under this comment id.
	let replyingTo = $state<string | null>(null);
	let replyValue = $state('');
	let submittingReply = $state(false);

	const isAnon = $derived(!!data.user && !!data.user.isAnonymous);
	const isFullySignedIn = $derived(!!data.user && !data.user.isAnonymous);

	const unlockedSet = $derived(new Set(data.unlockedAvatars ?? []));
	function isAvatarRevealed(userId: string | undefined | null): boolean {
		if (!userId) return false;
		if (data.user?.id === userId) return true; // your own face is always visible
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

	async function loadComments(postId: string) {
		try {
			const res = await fetch(`/api/posts/${postId}/comments`, { credentials: 'include' });
			if (!res.ok) return;
			const body = await res.json();
			commentsByPost = { ...commentsByPost, [postId]: body.comments ?? [] };
		} catch (err) {
			console.error('Load comments failed:', err);
		}
	}

	async function toggleCommentBox(postId: string) {
		if (openCommentFor === postId) {
			openCommentFor = null;
			commentValue = '';
			return;
		}
		openCommentFor = postId;
		commentValue = '';
		loadComments(postId);
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
			await loadComments(postId);
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
			await loadComments(postId);
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
			<article class="answer my-answer">
				{#if editing}
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
					<header class="author-row author-row-with-avatar">
						{#if data.user}
							{@render avatar(data.user.id, (data.user as { image?: string | null }).image, 'md')}
						{/if}
						<span class="author-inline">
							{#if data.user?.username}
								<a class="author author-link" href="/{data.user.username}">{data.user?.name ?? 'You'}</a>
								<a class="handle" href="/{data.user.username}">@{data.user.username}</a>
							{:else}
								<span class="author">{data.user?.name ?? 'You'}</span>
							{/if}
							{#if isAnon}
								<button
									type="button"
									class="edit-name"
									aria-label="Change your name"
									onclick={changeMyName}
								>
									<Pencil size="13" strokeWidth="1.8" />
								</button>
							{/if}
						</span>
					</header>
					<p class="answer-body">{data.myAnswer.content}</p>
					<footer class="answer-foot">
						<button
							type="button"
							class="comment-button"
							onclick={() => toggleCommentBox(data.myAnswer!.id)}
							aria-label="Comment"
						>
							<MessageCircle size="18" strokeWidth="1.7" />
							{#if data.myAnswer.comment_count > 0}<span class="count">{data.myAnswer.comment_count}</span>{/if}
						</button>
						<button
							type="button"
							class="comment-button"
							onclick={startEdit}
							aria-label="Edit answer"
						>
							<Pencil size="16" strokeWidth="1.8" />
						</button>
					</footer>

					{#if data.myAnswer.comment_count > 0 && !isFullySignedIn}
						<!-- Guest preview: render the thread but blur EVERY
						     comment until the user signs in with Google. -->
						<div class="guest-locked">
							{@render commentThread(data.myAnswer.id)}
							<div class="guest-locked-cta">
								<span class="guest-locked-text">
									<button type="button" class="guest-locked-link" onclick={() => promptSignIn('Sign in to read the comments on your response.')}>Sign in</button>
									to read the comments on your response.
								</span>
							</div>
						</div>
					{:else if openCommentFor === data.myAnswer.id || (data.myAnswer.comment_count > 0 && isFullySignedIn)}
						{@render commentThread(data.myAnswer.id)}
					{/if}
				{/if}
			</article>
		{/if}

		<section class="answers">
			{#each data.answers as a (a.id)}
				{@render postCard(a)}
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

			<!-- Transition into the global posting space. Full-width line +
			     a quiet word announces this isn't the daily prompt. -->
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
								{@render worldPostCard(p)}
							{/if}
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		<!-- Sign-in toast: when the viewer's own answer has bot replies
		     they can't read because they're not Google-signed-in. -->
		{#if !isFullySignedIn && data.myAnswer && data.myAnswer.comment_count > 0}
			<div class="signin-toast" role="status">
				<span>{data.myAnswer.comment_count} {data.myAnswer.comment_count === 1 ? 'person' : 'people'} responded to your answer.</span>
				<button type="button" class="toast-link" onclick={() => promptSignIn('Sign in to read what they said.')}>Sign in</button>
				<span>to read what they said.</span>
			</div>
		{/if}

		<!-- Past days, scroll-back style. -->
		{#if data.pastDays.length > 0}
			<div class="past">
				{#each data.pastDays as day (day.prompt.id)}
					<section class="past-day">
						<p class="past-date">{formatDate(day.prompt.active_date)}</p>
						<h2 class="prompt prompt-past">{day.prompt.text}</h2>
						{#if day.answers.length > 0}
							<div class="answers">
								{#each day.answers as a (a.id)}
									{@render postCard(a)}
								{/each}
							</div>
						{:else}
							<p class="empty small">No answers.</p>
						{/if}
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</main>

{#snippet avatar(userId: string, image: string | null | undefined, size: 'sm' | 'md' = 'md')}
	{@const revealed = isAvatarRevealed(userId)}
	<span class="avatar-frame avatar-{size}" class:locked={!revealed} aria-hidden="true">
		<img src={avatarFor(image, userId)} alt="" class="avatar-img" loading="lazy" />
	</span>
{/snippet}

{#snippet authorName(displayName: string | null, isOwn: boolean)}
	<span class="author-inline">
		<span class="author author-mask">{displayName ?? 'Anonymous'}</span>
		{#if isOwn && isAnon}
			<button
				type="button"
				class="edit-name"
				aria-label="Change your name"
				onclick={changeMyName}
			>
				<Pencil size="12" strokeWidth="1.8" />
			</button>
		{/if}
	</span>
{/snippet}

{#snippet commentNode(c: CommentRow, postId: string, depth: number)}
	{@const all = commentsByPost[postId] ?? []}
	{@const kids = childrenOf(all, c.id)}
	{@const hasKids = kids.length > 0}
	{@const ownComment = !!data.user && c.user_id === data.user.id}
	<li class="comment-card" class:has-children={hasKids}>
		<header class="comment-header">
			{@render avatar(c.user_id, c.user?.profile_picture_url, 'sm')}
			{#if c.user?.username}
				<a class="comment-author author-mask author-link" href="/{c.user.username}">{c.user.display_name ?? 'Anonymous'}</a>
				<a class="handle handle-small" href="/{c.user.username}">@{c.user.username}</a>
			{:else}
				<span class="comment-author author-mask">{c.user?.display_name ?? 'Anonymous'}</span>
			{/if}
			{#if ownComment && isAnon}
				<button
					type="button"
					class="edit-name comment-edit-name"
					aria-label="Change your name"
					onclick={changeMyName}
				>
					<Pencil size="11" strokeWidth="1.8" />
				</button>
			{/if}
		</header>
		<p class="comment-body">{c.content}</p>
		<footer class="comment-card-foot">
			<button
				type="button"
				class="comment-button"
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
			<ul class="reply-list" class:capped={depth + 1 >= MAX_NEST_DEPTH}>
				{#each kids as child (child.id)}
					{#if depth + 1 < MAX_NEST_DEPTH}
						{@render commentNode(child, postId, depth + 1)}
					{:else}
						{@render commentNode(child, postId, depth)}
					{/if}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

{#snippet commentThread(postId: string)}
	{@const all = commentsByPost[postId] ?? []}
	{@const tops = all.filter((c) => c.parent_comment_id === null).sort((a, b) => a.created_at - b.created_at)}
	<div class="comment-thread">
		{#if tops.length > 0}
			<ul class="comment-tree">
				{#each tops as c (c.id)}
					{@render commentNode(c, postId, 0)}
				{/each}
			</ul>
		{/if}
		<form class="comment-composer" onsubmit={(e) => submitComment(postId, e)}>
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
	</div>
{/snippet}

{#snippet worldPostCard(p: { id: string; user_id: string; content: string; display_name: string | null; username?: string | null; bot_id: string | null; image?: string | null; comment_count: number })}
	<article class="world-post">
		<div class="world-post-head">
			{@render avatar(p.user_id, p.image, 'md')}
			<p class="world-post-from">
				{#if p.username}
					<a class="world-post-name author-mask author-link" href="/{p.username}">{p.display_name ?? 'Anonymous'}</a>
					<a class="handle handle-inline" href="/{p.username}">@{p.username}</a>
				{:else}
					<span class="world-post-name author-mask">{p.display_name ?? 'Anonymous'}</span>
				{/if}
			</p>
		</div>
		<p class="world-post-text">{p.content}</p>
		<footer class="answer-foot">
			<button
				type="button"
				class="comment-button"
				onclick={() => toggleCommentBox(p.id)}
				aria-label="Comment"
			>
				<MessageCircle size="18" strokeWidth="1.7" />
				{#if p.comment_count > 0}<span class="count">{p.comment_count}</span>{/if}
			</button>
		</footer>

		{#if openCommentFor === p.id}
			{@render commentThread(p.id)}
		{/if}
	</article>
{/snippet}

{#snippet userQuestionCard(q: { id: string; user_id: string; content: string; display_name: string | null; username?: string | null; bot_id: string | null; image?: string | null; comment_count: number })}
	<article class="user-question">
		<div class="world-post-head">
			{@render avatar(q.user_id, q.image, 'md')}
			<p class="user-question-from">
				From
				{#if q.username}
					<a class="user-question-name author-mask author-link" href="/{q.username}">{q.display_name ?? 'Anonymous'}</a>
					<a class="handle handle-inline" href="/{q.username}">@{q.username}</a>
				{:else}
					<span class="user-question-name author-mask">{q.display_name ?? 'Anonymous'}</span>
				{/if}
			</p>
		</div>
		<h3 class="user-question-text">{q.content}</h3>
		<footer class="answer-foot">
			<button
				type="button"
				class="comment-button"
				onclick={() => toggleCommentBox(q.id)}
				aria-label="Reply"
			>
				<MessageCircle size="18" strokeWidth="1.7" />
				{#if q.comment_count > 0}<span class="count">{q.comment_count}</span>{/if}
			</button>
		</footer>

		{#if openCommentFor === q.id}
			{@render commentThread(q.id)}
		{/if}
	</article>
{/snippet}

{#snippet postCard(a: { id: string; user_id: string; content: string; display_name: string | null; username?: string | null; bot_id: string | null; image?: string | null; comment_count: number })}
	<article class="answer">
		<header class="author-row author-row-with-avatar">
			{@render avatar(a.user_id, a.image, 'md')}
			<span class="author-inline">
				{#if a.username}
					<a class="author author-mask author-link" href="/{a.username}">{a.display_name ?? 'Anonymous'}</a>
					<a class="handle" href="/{a.username}">@{a.username}</a>
				{:else}
					<span class="author author-mask">{a.display_name ?? 'Anonymous'}</span>
				{/if}
			</span>
		</header>
		<p class="answer-body">{a.content}</p>
		<footer class="answer-foot">
			<button
				type="button"
				class="comment-button"
				onclick={() => toggleCommentBox(a.id)}
				aria-label="Comment"
			>
				<MessageCircle size="18" strokeWidth="1.7" />
				{#if a.comment_count > 0}<span class="count">{a.comment_count}</span>{/if}
			</button>
		</footer>

		{#if openCommentFor === a.id}
			{@render commentThread(a.id)}
		{/if}
	</article>
{/snippet}

<style>
	.page {
		max-width: none;
		margin: 0 auto;
		padding: 120px 24px 96px;
	}

	/* Inner blocks keep the comfortable 640px reading column. The prompt
	   headlines below break out wider on desktop. */
	.composer,
	.my-answer,
	.answers,
	.free-section,
	.past-date {
		max-width: 640px;
		margin-left: auto;
		margin-right: auto;
	}

	/* Today's prompt — thin and centered, wider than the body column on
	   desktop so the question has room to breathe. */
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
		.prompt-today {
			padding-bottom: 40px;
		}
	}

	/* Past prompts — same thin treatment, scaled down. */
	.prompt-past {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.022em;
		font-size: clamp(28px, 5vw, 44px);
		line-height: 1.1;
		color: var(--foreground);
		margin: 0 auto 24px;
		max-width: 720px;
	}

	.composer { margin-bottom: 56px; }
	.composer textarea, .edit-textarea, .comment-composer textarea {
		width: 100%;
		font-family: var(--font-sans);
		font-size: 17px;
		line-height: 1.5;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--card-foreground);
		resize: vertical;
		min-height: 96px;
	}
	.composer textarea:focus, .edit-textarea:focus, .comment-composer textarea:focus {
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
		margin-top: 12px;
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
	.ghost-button {
		appearance: none;
		border: 0;
		padding: 8px 14px;
		border-radius: 999px;
		background: transparent;
		color: var(--muted-foreground);
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
	}
	.ghost-button:hover { color: var(--foreground); }
	.ghost-button:disabled { opacity: 0.4; cursor: not-allowed; }

	/* The viewer's own answer reuses .answer styling so it sits in the
	   feed identically (single border-top, same padding). The single
	   horizontal line above is provided by the next sibling's
	   border-top — no duplicate underline. */
	.my-answer {
		position: relative;
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
	.answer {
		padding: 20px 0;
		border-top: 1px solid var(--border);
	}
	.author-row {
		font-size: 13px;
		color: var(--muted-foreground);
		margin-bottom: 6px;
	}
	.author { font-weight: 600; }
	.author.you { color: var(--foreground); }
	.answer-body {
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.5;
		color: var(--foreground);
		margin: 0;
		white-space: pre-wrap;
	}
	.answer-foot {
		margin-top: 12px;
		display: flex;
		justify-content: flex-end;
	}
	.comment-button {
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
	.comment-button:hover { color: var(--foreground); background: var(--muted); }
	.count { font-weight: 600; line-height: 1; }

	.comment-thread {
		margin-top: 14px;
		padding-top: 14px;
		border-top: 1px dashed var(--border);
	}
	/* ─────────────────────────────────────────────────────────────────
	   Threaded comments. Each comment is a small post: header on top,
	   body below, comment-button at the bottom-right.
	   When a comment has replies, a vertical line drops down its left
	   side, and each direct reply gets a horizontal hook connecting
	   it to that line — the Reddit / HN threading idiom.
	   ───────────────────────────────────────────────────────────────── */

	.comment-tree {
		list-style: none;
		padding: 0;
		margin: 0 0 16px;
	}

	.reply-list {
		list-style: none;
		padding: 0;
		/* Indent for the threading line + hook to live in. The same
		   indent applies whether or not a vertical line is drawn, so
		   replies always sit at the same x-offset. */
		margin: 6px 0 0 28px;
	}
	.reply-list.capped { margin-left: 28px; } /* same indent at depth cap */

	.comment-card {
		position: relative;
		padding: 12px 0 8px 0;
	}

	/* Vertical thread line: only drawn when this comment has children
	   underneath. Lives at left:11px, descending from below the
	   header through the entire reply-list block. */
	.comment-card.has-children::before {
		content: '';
		position: absolute;
		left: 11px;
		top: 30px;
		bottom: 6px;
		width: 1px;
		background: var(--border);
	}

	/* Each reply (child of a reply-list) draws a small horizontal
	   hook from the parent's vertical line into the reply's content
	   area. */
	.reply-list > .comment-card::after {
		content: '';
		position: absolute;
		left: -17px;
		top: 22px;
		width: 14px;
		height: 1px;
		background: var(--border);
		border-bottom-left-radius: 6px;
	}

	.comment-header {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 4px;
	}
	.comment-author {
		font-size: 14px;
		font-weight: 600;
		color: var(--foreground);
	}
	.comment-body {
		font-family: var(--font-sans);
		font-size: 14px;
		line-height: 1.5;
		color: var(--foreground);
		margin: 0;
		white-space: pre-wrap;
	}
	.comment-card-foot {
		margin-top: 6px;
		display: flex;
		justify-content: flex-end;
	}
	.comment-composer {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}
	.comment-composer textarea,
	.reply-composer textarea {
		flex: 1;
		/* 16px specifically — anything smaller and iOS Safari zooms the
		   page on focus. */
		font-size: 16px;
		min-height: 60px;
	}

	.reply-composer {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		margin-top: 8px;
	}

	.comment-row {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 6px;
	}

	.comment-foot {
		margin-top: 4px;
	}

	.reply-button {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 6px;
		border-radius: 6px;
		cursor: pointer;
	}
	.reply-button:hover {
		color: var(--foreground);
		background: var(--muted);
	}

	/* Nested replies. Padding-left + a left border line to indicate
	   nesting. After MAX_NEST_DEPTH layers we render flat in the same
	   indent (.capped suppresses additional indent). */
	.comment-list.nested {
		list-style: none;
		padding: 0;
		margin: 8px 0 0 14px;
		border-left: 1px solid var(--border);
		padding-left: 12px;
	}
	.comment-list.nested.capped {
		border-left: 0;
		padding-left: 0;
		margin-left: 0;
	}

	/* Pencil affordance next to the user's own (anonymous) name. */
	/* ── Avatars ─────────────────────────────────────────────────────
	   Lives wherever a name is rendered. Small (24px) in comments,
	   medium (40px) in posts. The .locked variant clips an over-
	   sized blurred image so the blur fade doesn't show at the
	   circle's edge. */
	.avatar-frame {
		display: inline-block;
		flex-shrink: 0;
		border-radius: 999px;
		overflow: hidden;
		background: var(--muted);
		position: relative;
	}
	.avatar-md { width: 36px; height: 36px; }
	.avatar-sm { width: 24px; height: 24px; }
	.avatar-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: filter 220ms ease, transform 220ms ease;
	}
	.avatar-frame.locked .avatar-img {
		filter: blur(8px);
		transform: scale(1.18);
	}

	.author-row-with-avatar {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.author-inline {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.handle {
		font-size: 12px;
		color: var(--muted-foreground);
		text-decoration: none;
		font-weight: 500;
	}
	.handle:hover {
		text-decoration: underline;
	}
	.handle-small { font-size: 11px; }
	.handle-inline { margin-left: 4px; text-transform: none; letter-spacing: 0; }

	/* Display-name link: foreground color, underline only on hover. */
	.author-link {
		color: var(--foreground);
		text-decoration: none;
	}
	.author-link:hover {
		text-decoration: underline;
	}
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
	.comment-edit-name {
		padding: 1px;
	}

	/* Soft gray nudge that surfaces below the answers feed once the
	   viewer has answered today. The "Enable notifications" verb stays
	   white so it reads as the actionable bit. */
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

	/* Full-width section divider between the daily prompt zone and the
	   global "World" zone. Negative side margins break out of the
	   page's 24px padding so the line spans edge-to-edge of the
	   viewport. */
	.world-divider {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 64px -24px 0;
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
	.free-section {
		margin-top: 0;
	}

	/* Two-tab segmented control above the World composer. */
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

	/* Free-form World posts get the same thin-large headline treatment
	   as user-asked questions, just without the "FROM" eyebrow.
	   The author tag sits as a small line above the body.
	   Width is inherited from the .free-section parent (max-width
	   640px); we don't constrain it again here, otherwise the flex
	   parent (.world-feed) lets short posts shrink to content. */
	.world-post {
		width: 100%;
		padding: 28px 0;
		border-top: 1px solid var(--border);
	}
	.world-post-head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 10px;
	}
	.world-post-from {
		font-size: 13px;
		color: var(--muted-foreground);
		margin: 0;
		font-weight: 500;
	}
	.world-post-name {
		color: var(--foreground);
		font-weight: 600;
	}
	.world-post-text {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.018em;
		font-size: clamp(22px, 3.6vw, 32px);
		line-height: 1.2;
		color: var(--foreground);
		margin: 0;
		white-space: pre-wrap;
	}

	/* User-asked questions in the World feed render with the same thin
	   headline treatment as the daily prompt, but with a "From X" tag
	   above so they read as user content, not system content. */
	.user-question {
		max-width: 640px;
		margin: 0 auto;
		padding: 28px 0;
		border-top: 1px solid var(--border);
	}
	.user-question-from {
		font-size: 12px;
		font-weight: 500;
		color: var(--muted-foreground);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 12px;
	}
	.user-question-name {
		color: var(--foreground);
		text-transform: none;
		letter-spacing: 0;
		font-weight: 600;
	}
	.user-question-text {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.022em;
		font-size: clamp(28px, 5vw, 44px);
		line-height: 1.1;
		color: var(--foreground);
		margin: 0;
	}

	.world-feed { display: flex; flex-direction: column; }

	.past {
		margin-top: 96px;
	}
	.past-day {
		max-width: 720px;
		margin: 0 auto;
		padding-top: 56px;
		padding-bottom: 16px;
		border-top: 1px solid var(--border);
	}
	.past-date {
		font-size: 12px;
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

	/* Guest-locked comment thread on the viewer's own answer: blur
	   names, avatars, comment text. The italic gray "sign in" line
	   sits underneath, with the verb itself in white so it reads as
	   the action. */
	.guest-locked > :global(.comment-thread) {
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

	/* Bottom-of-screen toast: stays visible while the viewer hasn't
	   signed in but their own answer has replies. Acts as the
	   conversion-prompt that pushes them through Google sign-in. */
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
</style>
