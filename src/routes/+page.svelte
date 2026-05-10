<script lang="ts">
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { MessageCircle, Pencil, X, Check } from 'lucide-svelte';

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

	// Free-form composer (unlocked once today's prompt is answered).
	let freeValue = $state('');
	let postingFree = $state(false);

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
	<title>製 SEHYO</title>
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
			<article class="my-answer" class:editing>
				{#if editing}
					<button
						type="button"
						class="delete-x"
						aria-label="Delete answer"
						onclick={deleteAnswer}
						disabled={deleting}
					>
						<X size="16" strokeWidth="2.4" />
					</button>
					<textarea
						bind:value={editValue}
						rows="3"
						maxlength="2000"
						disabled={savingEdit || deleting}
						class="edit-textarea"
					></textarea>
					<div class="edit-bar">
						<button type="button" class="ghost-button" onclick={cancelEdit} disabled={savingEdit || deleting}>Cancel</button>
						<button
							type="button"
							class="post-button small"
							onclick={saveEdit}
							disabled={savingEdit || deleting || editValue.trim().length === 0}
						>
							<Check size="16" strokeWidth="2.2" />
							{savingEdit ? 'Saving…' : 'Save'}
						</button>
					</div>
				{:else}
					<header class="author-row">
						<span class="author you">Your answer</span>
					</header>
					<p class="answer-body">{data.myAnswer.content}</p>
					<footer class="answer-foot">
						<button
							type="button"
							class="comment-button"
							onclick={startEdit}
							aria-label="Edit answer"
						>
							<Pencil size="16" strokeWidth="1.8" />
						</button>
					</footer>
				{/if}
			</article>
		{/if}

		<section class="answers">
			{#each data.answers as a (a.id)}
				{@render postCard(a)}
			{/each}
		</section>

		{#if data.myAnswer}
			<!-- Free-form composer + today's free-form posts. Unlocked by
			     having answered today's prompt. -->
			<section class="free-section">
				<form class="composer" onsubmit={submitFreePost}>
					<textarea
						bind:value={freeValue}
						placeholder="Post anything…"
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

				{#if data.todayFreePosts.length > 0}
					<div class="answers">
						{#each data.todayFreePosts as p (p.id)}
							{@render postCard(p)}
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

	/* Today's prompt — thin and dramatic, wider than the body column on
	   desktop so the question has room to breathe. */
	.prompt-today {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.025em;
		font-size: clamp(40px, 8vw, 72px);
		line-height: 1.05;
		color: var(--foreground);
		margin: 0 auto 32px;
		max-width: 920px;
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
	.composer-bar, .edit-bar {
		display: flex;
		justify-content: flex-end;
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

	.my-answer {
		position: relative;
		padding: 20px 0 24px;
		border-bottom: 1px solid var(--border);
		margin-bottom: 20px;
	}
	.my-answer.editing {
		padding: 24px 0 20px;
	}
	.delete-x {
		position: absolute;
		top: 0;
		right: 0;
		width: 28px;
		height: 28px;
		border-radius: 14px;
		background: var(--destructive);
		color: var(--destructive-foreground);
		border: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform 120ms ease, opacity 120ms ease;
	}
	.delete-x:hover { transform: scale(1.06); }
	.delete-x:active { transform: scale(0.94); }
	.delete-x:disabled { opacity: 0.5; cursor: not-allowed; }

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

	.free-section {
		margin-top: 56px;
		padding-top: 32px;
		border-top: 1px solid var(--border);
	}

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
