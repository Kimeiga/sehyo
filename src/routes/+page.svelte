<script lang="ts">
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { MessageCircle, Pencil, MoreHorizontal, Check } from 'lucide-svelte';

	let { data }: PageProps = $props();

	interface CommentRow {
		id: string;
		content: string;
		created_at: number;
		user_id: string;
		user: {
			id: string;
			display_name: string | null;
			username: string | null;
		};
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

	// Free-form composer (unlocked once today's prompt is answered).
	let freeValue = $state('');
	let postingFree = $state(false);

	// "Ask a question" composer in the World section.
	let questionValue = $state('');
	let postingQuestion = $state(false);

	// Browser-notification permission state. The actual web-push
	// subscription wiring is a Phase 2 follow-up; for now we just hold
	// the permission so the UI can reflect it.
	let notificationPermission = $state<NotificationPermission | 'unsupported' | null>(null);
	$effect(() => {
		if (typeof window === 'undefined') return;
		if (!('Notification' in window)) {
			notificationPermission = 'unsupported';
			return;
		}
		notificationPermission = Notification.permission;
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

	async function submitFreePost(e: SubmitEvent) {
		e.preventDefault();
		const content = freeValue.trim();
		if (!content || postingFree) return;
		postingFree = true;
		try {
			const res = await fetch('/api/posts/free', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ content })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			freeValue = '';
			await invalidateAll();
		} catch (err) {
			console.error('Free-form post failed:', err);
			alert('Could not post. Try again.');
		} finally {
			postingFree = false;
		}
	}

	async function submitQuestion(e: SubmitEvent) {
		e.preventDefault();
		const content = questionValue.trim();
		if (!content || postingQuestion) return;
		postingQuestion = true;
		try {
			const res = await fetch('/api/posts/question', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ content })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			questionValue = '';
			await invalidateAll();
		} catch (err) {
			console.error('Question post failed:', err);
			alert('Could not post question. Try again.');
		} finally {
			postingQuestion = false;
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
					<header class="author-row">
						<span class="author">{data.user?.name ?? 'You'}</span>
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

					{#if openCommentFor === data.myAnswer.id}
						<div class="comment-thread">
							{#if commentsByPost[data.myAnswer.id]?.length}
								<ul class="comment-list">
									{#each commentsByPost[data.myAnswer.id] as c (c.id)}
										<li class="comment">
											<span class="comment-author">{c.user?.display_name ?? 'Anonymous'}</span>
											<span class="comment-body">{c.content}</span>
										</li>
									{/each}
								</ul>
							{/if}
							<form class="comment-composer" onsubmit={(e) => submitComment(data.myAnswer!.id, e)}>
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
					{/if}
				{/if}
			</article>
		{/if}

		<section class="answers">
			{#each data.answers as a (a.id)}
				{@render postCard(a)}
			{/each}
		</section>

		{#if data.myAnswer}
			<p class="nudge">
				A new question will be posited tomorrow.
				{#if notificationPermission === 'granted'}
					<span class="nudge-state">Notifications on.</span>
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
				<form class="composer" onsubmit={submitFreePost}>
					<textarea
						bind:value={freeValue}
						placeholder="What's on your mind?"
						rows="3"
						maxlength="2000"
						disabled={postingFree}
					></textarea>
					<div class="composer-bar">
						<button
							type="submit"
							class="post-button"
							disabled={postingFree || freeValue.trim().length === 0}
						>{postingFree ? 'Posting…' : 'Post'}</button>
					</div>
				</form>

				<form class="composer" onsubmit={submitQuestion}>
					<textarea
						bind:value={questionValue}
						placeholder="Ask a question…"
						rows="2"
						maxlength="280"
						disabled={postingQuestion}
					></textarea>
					<div class="composer-bar">
						<button
							type="submit"
							class="post-button"
							disabled={postingQuestion || questionValue.trim().length === 0}
						>{postingQuestion ? 'Asking…' : 'Ask'}</button>
					</div>
				</form>

				{#if data.todayFreePosts.length > 0}
					<div class="world-feed">
						{#each data.todayFreePosts as p (p.id)}
							{#if p.is_question}
								{@render userQuestionCard(p)}
							{:else}
								{@render postCard(p)}
							{/if}
						{/each}
					</div>
				{/if}
			</section>
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

{#snippet userQuestionCard(q: { id: string; content: string; display_name: string | null; bot_id: string | null; comment_count: number })}
	<article class="user-question">
		<p class="user-question-from">From <span class="user-question-name author-mask">{q.display_name ?? 'Anonymous'}</span></p>
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
			<div class="comment-thread">
				{#if commentsByPost[q.id]?.length}
					<ul class="comment-list">
						{#each commentsByPost[q.id] as c (c.id)}
							<li class="comment">
								<span class="comment-author author-mask">{c.user?.display_name ?? 'Anonymous'}</span>
								<span class="comment-body">{c.content}</span>
							</li>
						{/each}
					</ul>
				{/if}
				<form class="comment-composer" onsubmit={(e) => submitComment(q.id, e)}>
					<textarea
						bind:value={commentValue}
						placeholder="Reply…"
						rows="2"
						maxlength="1000"
						disabled={submittingComment}
					></textarea>
					<button
						type="submit"
						class="post-button small"
						disabled={submittingComment || commentValue.trim().length === 0}
					>{submittingComment ? '…' : 'Reply'}</button>
				</form>
			</div>
		{/if}
	</article>
{/snippet}

{#snippet postCard(a: { id: string; content: string; display_name: string | null; bot_id: string | null; comment_count: number })}
	<article class="answer">
		<header class="author-row">
			<span class="author author-mask">{a.display_name ?? 'Anonymous'}</span>
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
			<div class="comment-thread">
				{#if commentsByPost[a.id]?.length}
					<ul class="comment-list">
						{#each commentsByPost[a.id] as c (c.id)}
							<li class="comment">
								<span class="comment-author author-mask">{c.user?.display_name ?? 'Anonymous'}</span>
								<span class="comment-body">{c.content}</span>
							</li>
						{/each}
					</ul>
				{/if}
				<form class="comment-composer" onsubmit={(e) => submitComment(a.id, e)}>
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
	.comment-list {
		list-style: none;
		padding: 0;
		margin: 0 0 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.comment {
		font-size: 14px;
		line-height: 1.5;
		color: var(--foreground);
	}
	.comment-author {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted-foreground);
		margin-right: 8px;
	}
	.comment-body { white-space: pre-wrap; }
	.comment-composer {
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}
	.comment-composer textarea {
		flex: 1;
		font-size: 15px;
		min-height: 60px;
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
</style>
