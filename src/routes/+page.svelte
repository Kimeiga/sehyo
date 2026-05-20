<script lang="ts">
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { tick, type Snippet } from 'svelte';
	import { authClient } from '$lib/auth-client';
	import { promptSignIn } from '$lib/stores/sign-in-modal';
	import { Pencil, MoreHorizontal, Check, ArrowUp } from 'lucide-svelte';
	import { writable } from 'svelte/store';
	import {
		connectForumTyping,
		type ForumTypingHandle,
		type TypingUser
	} from '$lib/stores/forum-typing';

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

	/* Send-button label is picked server-side in +page.server.ts and
	   delivered via `data.sendLabel`. Doing it there guarantees the
	   SSR HTML already carries the chosen variant — no flicker from
	   "Send" → random on hydration. */
	const sendLabel = $derived(data.sendLabel ?? 'Send');
	const sendLabelMono = $derived(!!data.sendLabelMono);

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
		function onClickOutside() {
			kebabOpen = false;
		}
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

	/* Unified reply state — covers both top-level "add a comment" on a
	   post AND nested replies to a comment. Exactly ONE composer is
	   ever open at a time: switching targets clears the previous
	   composer's text, so the user can't get into a state where a
	   forgotten composer is dangling open somewhere above. */
	type ReplyTarget = { postId: string; parentCommentId: string | null };
	let activeReplyTarget = $state<ReplyTarget | null>(null);

	// Bot replies pushed live over the WS after the user answers
	// (server choreography). Keyed by postId, appended to the
	// server-loaded comments below so they appear without a reload.
	let liveComments = $state<Record<string, CommentRow[]>>({});

	const commentsByPost = $derived.by<Record<string, CommentRow[]>>(() => {
		const base: Record<string, CommentRow[]> = {
			...((data as { todayCommentsByPost?: Record<string, CommentRow[]> }).todayCommentsByPost ??
				{}),
			...((data as { commentsByPost?: Record<string, CommentRow[]> }).commentsByPost ?? {})
		};
		for (const [postId, extra] of Object.entries(liveComments)) {
			const existing = base[postId] ?? [];
			const seen = new Set(existing.map((c) => c.id));
			const merged = existing.concat(extra.filter((c) => !seen.has(c.id)));
			base[postId] = merged;
		}
		return base;
	});

	let replyContent = $state('');
	let submittingReply = $state(false);

	function isActiveReply(postId: string, parentCommentId: string | null): boolean {
		return (
			!!activeReplyTarget &&
			activeReplyTarget.postId === postId &&
			activeReplyTarget.parentCommentId === parentCommentId
		);
	}

	function closeReply() {
		activeReplyTarget = null;
		replyContent = '';
	}

	async function openReply(target: ReplyTarget) {
		activeReplyTarget = target;
		replyContent = '';
		// Focus the textarea on next tick so typing can start
		// immediately. No scrollIntoView — the composer just appears
		// where the user clicked.
		await tick();
		if (typeof document === 'undefined') return;
		const selector = target.parentCommentId
			? `form.reply-composer[data-reply-target="reply-${target.parentCommentId}"]`
			: `form.reply-composer[data-reply-target="post-${target.postId}"]`;
		const ta = document.querySelector<HTMLTextAreaElement>(`${selector} textarea`);
		ta?.focus({ preventScroll: true });
	}

	function toggleReplyTarget(target: ReplyTarget) {
		if (isActiveReply(target.postId, target.parentCommentId)) {
			closeReply();
		} else {
			openReply(target);
		}
	}

	const isAnon = $derived(!!data.user && !!data.user.isAnonymous);
	const isFullySignedIn = $derived(!!data.user && !data.user.isAnonymous);

	/* Forum typing indicator.

	   Production gate: user is fully signed in AND has answered today's
	   prompt (so they can actually see the World composer).

	   Dev gate: Vite dev only (import.meta.env.DEV). Skips both checks
	   and gives each browser tab its own pseudo-identity so a single
	   developer can test the typing flow across tabs without a second
	   real sign-in. The Worker mirrors this — when it sees a localhost
	   host it skips cookie validation and trusts the URL params.

	   The empty `writable` is a placeholder so the template can use
	   $worldTypingUsers unconditionally. */
	const TYPING_TAG = '[typing/page]';
	const tdbg = (...args: unknown[]) => console.debug(TYPING_TAG, ...args);

	const isDevTyping = import.meta.env.DEV;

	const devTabIdentity = (() => {
		if (!isDevTyping || typeof window === 'undefined') return null;
		let id = sessionStorage.getItem('dev-typing-tab-id');
		const wasExisting = !!id;
		if (!id) {
			id = 'dev-' + Math.random().toString(36).slice(2, 10);
			sessionStorage.setItem('dev-typing-tab-id', id);
		}
		tdbg('devTabIdentity resolved', { id, wasExisting });
		return { userId: id, displayName: `Tab ${id.slice(-4)}` };
	})();

	let worldTypingHandle: ForumTypingHandle | null = null;
	const worldTypingUsers = writable<TypingUser[]>([]);

	$effect(() => {
		// Connect for ANY logged-in viewer (incl. anonymous /
		// not-yet-answered). Signed-out viewers have no session cookie
		// for the typing Worker, so skip them (the WS would just
		// 401-reconnect-loop).
		const gatePassed = isDevTyping || !!data.user;
		tdbg('$effect fire', {
			isDev: isDevTyping,
			isFullySignedIn,
			hasMyAnswer: !!data.myAnswer,
			namesBlurred: data.namesBlurred,
			userId: data.user?.id ?? null,
			devTab: devTabIdentity,
			gatePassed
		});
		if (!gatePassed) {
			tdbg('$effect gate BLOCKED — bailing');
			return;
		}
		tdbg('$effect gate PASSED — calling connectForumTyping');
		const handle = connectForumTyping('forum', devTabIdentity);
		worldTypingHandle = handle;
		const unsub = handle.typingUsers.subscribe((v) => {
			tdbg('typingUsers subscriber fired', { len: v.length, users: v });
			worldTypingUsers.set(v);
		});
		const unsubLive = handle.liveComment.subscribe((lc) => {
			if (!lc) return;
			const c = lc.comment as CommentRow;
			if (!c || typeof c.id !== 'string') return;
			tdbg('liveComment received', { postId: lc.postId, commentId: c.id });
			const cur = liveComments[lc.postId] ?? [];
			if (cur.some((x) => x.id === c.id)) return;
			liveComments = { ...liveComments, [lc.postId]: [...cur, c] };
		});
		return () => {
			tdbg('$effect cleanup — unsubscribing + disconnecting');
			unsub();
			unsubLive();
			handle.disconnect();
			worldTypingHandle = null;
			worldTypingUsers.set([]);
		};
	});

	/* Sender-side highlight: which threadId most-recently fired a real
	   send. The composer matching that id gets the green halo. Cleared
	   after 5s (matches receiver TTL). Single string is fine because
	   the user can only physically type in one composer at a time. */
	let sendingActiveThreadId = $state<string | null>(null);
	let sendingTimer: ReturnType<typeof setTimeout> | null = null;
	const SENDING_VISIBLE_MS = 5000;

	function notifyForThread(threadId: string) {
		tdbg('notifyForThread fired', { threadId });
		const sent = worldTypingHandle?.notifyTyping(threadId) ?? false;
		tdbg('notifyForThread result', { threadId, sent });
		if (sent) {
			sendingActiveThreadId = threadId;
			if (sendingTimer) clearTimeout(sendingTimer);
			sendingTimer = setTimeout(() => {
				tdbg('sendingActive cleared (timer expired)', { threadId });
				sendingActiveThreadId = null;
				sendingTimer = null;
			}, SENDING_VISIBLE_MS);
		}
	}

	function onWorldInput() {
		notifyForThread('world');
	}
	function onCommentInput(postId: string) {
		notifyForThread('post-' + postId);
	}
	function onReplyInput(commentId: string) {
		notifyForThread('reply-' + commentId);
	}

	const typingSelfId = $derived(devTabIdentity?.userId ?? data.user?.id);

	function typingForThread(all: TypingUser[], threadId: string, selfId: string | undefined) {
		return all.filter((u) => u.threadId === threadId && u.userId !== selfId);
	}

	// Typing-indicator label is rendered via the {#snippet typingLabel}
	// in markup so names can be normalized the same way as feed authors.

	function firstName(name: string | null | undefined): string {
		const trimmed = name?.trim();
		if (!trimmed) return 'Anonymous';
		return trimmed.split(/\s+/)[0] ?? trimmed;
	}

	function hashString(value: string): number {
		let hash = 2166136261;
		for (let i = 0; i < value.length; i += 1) {
			hash ^= value.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return hash >>> 0;
	}

	function personColor(
		userId: string | null | undefined,
		displayName?: string | null,
		username?: string | null
	): string {
		const seed = userId?.trim() || username?.trim() || displayName?.trim() || 'anonymous';
		const hash = hashString(seed);
		const hueBands: Array<[number, number]> = [
			[8, 28],
			[38, 66],
			[142, 172],
			[190, 220],
			[238, 270],
			[292, 330]
		];
		const [start, end] = hueBands[hash % hueBands.length];
		const hue = start + ((hash >>> 8) % (end - start + 1));
		const chroma = 0.135 + ((hash >>> 16) % 28) / 1000;
		return `oklch(82% ${chroma.toFixed(3)} ${hue}deg)`;
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

	async function submitAnswer() {
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

	function onComposerSubmit(e: SubmitEvent) {
		e.preventDefault();
		submitAnswer();
	}

	function onComposerKeydown(e: KeyboardEvent) {
		// Plain Enter submits; Shift+Enter (or Cmd/Ctrl+Enter on a
		// platform that prefers that combo) keeps inserting a newline.
		if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			submitAnswer();
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

	async function submitActiveReply(e: SubmitEvent) {
		e.preventDefault();
		if (!activeReplyTarget || submittingReply) return;
		const content = replyContent.trim();
		if (!content) return;
		const target = activeReplyTarget;
		submittingReply = true;
		try {
			if (!(await ensureSession())) return;
			const body: { content: string; parent_comment_id?: string } = { content };
			if (target.parentCommentId) body.parent_comment_id = target.parentCommentId;
			const res = await fetch(`/api/posts/${target.postId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			closeReply();
			await invalidateAll();
		} catch (err) {
			console.error('Reply failed:', err);
			alert('Could not post reply. Try again.');
		} finally {
			submittingReply = false;
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
		<section class="today">
			<p class="section-label">Question</p>
			<h1 class="prompt-today">{data.prompt.text}</h1>
			{#if !data.myAnswer}
				<form class="composer" onsubmit={onComposerSubmit}>
					<textarea
						bind:value={composerValue}
						placeholder="Your answer…"
						rows="3"
						maxlength="2000"
						disabled={posting}
						onkeydown={onComposerKeydown}
					></textarea>
					<div class="send-row">
						<button
							type="submit"
							class="send-button"
							aria-label={posting ? 'Posting…' : 'Send (Enter)'}
							title="Send (Enter)"
							disabled={posting || composerValue.trim().length === 0}
						>
							<span class="send-label" class:mono={sendLabelMono}>{sendLabel}</span>
							<ArrowUp size="16" strokeWidth="2.4" />
						</button>
					</div>
				</form>
			{/if}
		</section>

		<section class="answers">
			{#if data.myAnswer}
				{@render postArticle(
					{
						id: data.myAnswer.id,
						user_id: data.myAnswer.user_id,
						content: data.myAnswer.content,
						display_name: data.user?.name ?? 'You',
						username: data.user?.username ?? null,
						bot_id: null,
						comment_count: data.myAnswer.comment_count
					},
					{ isMine: true }
				)}
			{/if}
			{#each data.answers as a (a.id)}
				{@render postArticle(a, { isMine: false })}
			{/each}
		</section>

		{#if !data.myAnswer}
			<p class="locked-cta">Answer today's question to explore the world of sehyo.</p>
		{/if}

		{#if data.myAnswer || isDevTyping}
			<p class="nudge">
				{#if isDevTyping && !data.myAnswer}
					<span style="color:#f78166;font-family:monospace;"
						>[dev mode — typing as {devTabIdentity?.displayName}]</span
					>
				{:else}
					A new question will be posited tomorrow.
				{/if}
				{#if notificationPermission === 'granted'}
					<span class="nudge-state">Notifications on.</span>
				{:else if notificationPermission === 'ios-pwa-required'}
					<span class="nudge-state"
						>To enable notifications: tap Share → Add to Home Screen, then open Sehyo from the icon.</span
					>
				{:else if notificationPermission === 'denied' || notificationPermission === 'unsupported'}
					<span class="nudge-state">Notifications unavailable.</span>
				{:else}
					<button type="button" class="nudge-cta" onclick={enableNotifications}
						>Enable notifications</button
					>
					to be notified when it's posited.
				{/if}
			</p>

			<hr class="world-divider" />
			<h2 class="world-label">World</h2>

			{@const worldTypers = typingForThread($worldTypingUsers, 'world', typingSelfId)}
			<p class="world-typing" aria-live="polite" class:visible={worldTypers.length > 0}>
				{@render typingLabel(worldTypers)}
			</p>

			<section class="free-section">
				<div class="world-tabs" role="tablist" aria-label="World composer">
					<button
						type="button"
						role="tab"
						aria-selected={worldTab === 'post'}
						class="world-tab"
						class:active={worldTab === 'post'}
						onclick={() => (worldTab = 'post')}>Post</button
					>
					<button
						type="button"
						role="tab"
						aria-selected={worldTab === 'ask'}
						class="world-tab"
						class:active={worldTab === 'ask'}
						onclick={() => (worldTab = 'ask')}>Ask</button
					>
				</div>

				<form class="composer" onsubmit={submitWorld}>
					<textarea
						bind:value={worldValue}
						oninput={onWorldInput}
						class:typing-sending={sendingActiveThreadId === 'world'}
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
							>{postingWorld
								? worldTab === 'ask'
									? 'Asking…'
									: 'Posting…'
								: worldTab === 'ask'
									? 'Ask'
									: 'Post'}</button
						>
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
				<span
					>{data.myAnswer.comment_count}
					{data.myAnswer.comment_count === 1 ? 'person' : 'people'} responded to your answer.</span
				>
				<button
					type="button"
					class="toast-link"
					onclick={() => promptSignIn('Sign in to read what they said.')}>Sign in</button
				>
				<span>to read what they said.</span>
			</div>
		{/if}

		{#if data.myAnswer && data.timeline?.length}
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

<!-- Text-only thread row. Every node renders author, body, actions,
     and an optional branch containing replies/composer. -->
{#snippet typingLabel(users: TypingUser[])}
	{#if users.length === 1}
		<span class="typing-name" style:color={personColor(users[0].userId, users[0].displayName)}
			>{firstName(users[0].displayName)}</span
		> is typing…
	{:else if users.length === 2}
		<span class="typing-name" style:color={personColor(users[0].userId, users[0].displayName)}
			>{firstName(users[0].displayName)}</span
		>
		and
		<span class="typing-name" style:color={personColor(users[1].userId, users[1].displayName)}
			>{firstName(users[1].displayName)}</span
		> are typing…
	{:else if users.length >= 3}
		<span class="typing-name" style:color={personColor(users[0].userId, users[0].displayName)}
			>{firstName(users[0].displayName)}</span
		>,
		<span class="typing-name" style:color={personColor(users[1].userId, users[1].displayName)}
			>{firstName(users[1].displayName)}</span
		>, and
		{users.length - 2} other{users.length - 2 === 1 ? '' : 's'} are typing…
	{/if}
{/snippet}

{#snippet authorMeta(
	userId: string | null | undefined,
	displayName: string | null | undefined,
	username: string | null | undefined,
	isOwn: boolean
)}
	<header class="tw-meta">
		{#if username}
			<a class="tw-name" style:color={personColor(userId, displayName, username)} href="/{username}"
				>{firstName(displayName)}</a
			>
		{:else}
			<span class="tw-name" style:color={personColor(userId, displayName, username)}
				>{firstName(displayName)}</span
			>
		{/if}
		{#if isOwn && isAnon}
			<button type="button" class="edit-name" aria-label="Change your name" onclick={changeMyName}>
				<Pencil size="13" strokeWidth="1.8" />
			</button>
		{/if}
	</header>
{/snippet}

<!-- Shared shell for any thread node: top-level post, question, or
     nested comment. The only thread geometry is the optional .tw-branch
     below the body. -->
{#snippet treeShell(args: {
	userId: string;
	username?: string | null;
	displayName?: string | null;
	isOwn: boolean;
	body: Snippet;
	composer?: Snippet | null;
	hasKids: boolean;
	children?: Snippet | null;
	onPlus: () => void;
	plusActive?: boolean;
	showPlus?: boolean;
})}
	{@const replyVisible = args.showPlus !== false}
	<div class="tw-row">
		<div class="tw-main">
			{@render authorMeta(args.userId, args.displayName, args.username, args.isOwn)}
			{@render args.body()}
			{#if replyVisible}
				<div class="tw-actions">
					<button
						class="tw-reply-button"
						class:active={args.plusActive}
						type="button"
						onclick={args.onPlus}>{args.plusActive ? 'Cancel' : 'Reply'}</button
					>
				</div>
			{/if}
		</div>
	</div>

	{#if args.children || args.composer}
		<div class="tw-branch">
			{#if args.composer}{@render args.composer()}{/if}
			{#if args.children}{@render args.children()}{/if}
		</div>
	{/if}
{/snippet}

<!-- Active reply composer, shaped like a text thread node with a
     textarea in place of the body. `data-reply-target` is how openReply() finds this form to
     scroll-into-view + auto-focus the textarea. -->
{#snippet replyComposer(postId: string, parentCommentId: string | null)}
	{@const threadKey = parentCommentId ? 'reply-' + parentCommentId : 'post-' + postId}
	{@const meDisplayName = (data.user as { name?: string | null } | null)?.name ?? 'You'}
	{@const meUserId = data.user?.id ?? 'anonymous-viewer'}
	<div class="tw-item is-composer">
		<div class="tw-row">
			<div class="tw-main">
				<header class="tw-meta">
					<span
						class="tw-name"
						style:color={personColor(meUserId, meDisplayName, data.user?.username)}
						>{firstName(meDisplayName)}</span
					>
				</header>
				<form class="reply-composer" data-reply-target={threadKey} onsubmit={submitActiveReply}>
					<textarea
						bind:value={replyContent}
						oninput={() => notifyForThread(threadKey)}
						class:typing-sending={sendingActiveThreadId === threadKey}
						placeholder={parentCommentId ? 'Reply…' : 'Add a comment…'}
						rows="2"
						maxlength="1000"
						disabled={submittingReply}
					></textarea>
					<button
						type="submit"
						class="post-button small"
						disabled={submittingReply || replyContent.trim().length === 0}
						>{submittingReply ? '…' : parentCommentId ? 'Reply' : 'Post'}</button
					>
				</form>
			</div>
		</div>
	</div>
{/snippet}

{#snippet commentNode(c: CommentRow, postId: string, depth: number)}
	{@const all = commentsByPost[postId] ?? []}
	{@const kids = childrenOf(all, c.id)}
	{@const hasKids = kids.length > 0}
	{@const ownComment = !!data.user && c.user_id === data.user.id}
	{@const isActive = isActiveReply(postId, c.id)}
	{#snippet commentBody()}
		<p class="tw-body">{c.content}</p>
	{/snippet}
	{#snippet commentComposerSlot()}
		{@render replyComposer(postId, c.id)}
	{/snippet}
	{#snippet commentChildren()}
		<ul class="tw-children" class:capped={depth + 1 >= MAX_NEST_DEPTH}>
			{#each kids as child (child.id)}
				{#if depth + 1 < MAX_NEST_DEPTH}
					{@render commentNode(child, postId, depth + 1)}
				{:else}
					{@render commentNode(child, postId, depth)}
				{/if}
			{/each}
		</ul>
	{/snippet}
	<li class="tw-item is-reply">
		{@render treeShell({
			userId: c.user_id,
			username: c.user?.username,
			displayName: c.user?.display_name,
			isOwn: ownComment,
			body: commentBody,
			composer: isActive ? commentComposerSlot : null,
			hasKids,
			children: hasKids ? commentChildren : null,
			onPlus: () => toggleReplyTarget({ postId, parentCommentId: c.id }),
			plusActive: isActive
		})}
	</li>
{/snippet}

{#snippet postArticle(
	a: {
		id: string;
		user_id: string;
		content: string;
		display_name: string | null;
		username?: string | null;
		bot_id: string | null;
		comment_count: number;
	},
	opts: { isMine?: boolean }
)}
	{@const isMine = !!opts?.isMine}
	{@const all = commentsByPost[a.id] ?? []}
	{@const tops = topLevelOf(all)}
	{@const hasTops = tops.length > 0}
	{@const guestLocked = isMine && hasTops && !isFullySignedIn}
	{@const inEditMode = isMine && editing}
	{@const isActive = isActiveReply(a.id, null)}
	{#snippet postComposerSlot()}
		{@render replyComposer(a.id, null)}
	{/snippet}
	{#snippet postBody()}
		{#if inEditMode}
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
			<p class="tw-body">
				{a.content}{#if isMine}
					<button
						type="button"
						class="reply-label edit-label"
						onclick={startEdit}
						aria-label="Edit answer">EDIT</button
					>{/if}
			</p>
		{/if}
	{/snippet}
	{#snippet postChildren()}
		<ul class="tw-children" class:guest-locked={guestLocked}>
			{#each tops as c (c.id)}
				{@render commentNode(c, a.id, 0)}
			{/each}
		</ul>
	{/snippet}
	<article class="tw-post">
		<div class="tw-item is-post">
			{@render treeShell({
				userId: a.user_id,
				username: a.username,
				displayName: a.display_name,
				isOwn: isMine,
				body: postBody,
				composer: isActive && !guestLocked ? postComposerSlot : null,
				hasKids: hasTops,
				children: hasTops ? postChildren : null,
				onPlus: () => toggleReplyTarget({ postId: a.id, parentCommentId: null }),
				plusActive: isActive,
				showPlus: !guestLocked
			})}
		</div>

		{#if hasTops && guestLocked}
			<div class="guest-locked-cta">
				<span class="guest-locked-text">
					<button
						type="button"
						class="guest-locked-link"
						onclick={() => promptSignIn('Sign in to read the comments on your response.')}
						>Sign in</button
					>
					to read the comments on your response.
				</span>
			</div>
		{/if}
	</article>
{/snippet}

{#snippet userQuestionCard(q: {
	id: string;
	user_id: string;
	content: string;
	display_name: string | null;
	username?: string | null;
	bot_id: string | null;
	comment_count: number;
})}
	{@const all = commentsByPost[q.id] ?? []}
	{@const tops = topLevelOf(all)}
	{@const hasTops = tops.length > 0}
	{@const isActive = isActiveReply(q.id, null)}
	{#snippet questionBody()}
		<h3 class="user-question-text">{q.content}</h3>
	{/snippet}
	{#snippet questionChildren()}
		<ul class="tw-children">
			{#each tops as c (c.id)}
				{@render commentNode(c, q.id, 0)}
			{/each}
		</ul>
	{/snippet}
	{#snippet questionComposerSlot()}
		{@render replyComposer(q.id, null)}
	{/snippet}
	<article class="tw-post user-question">
		<div class="tw-item is-post">
			{@render treeShell({
				userId: q.user_id,
				username: q.username,
				displayName: q.display_name,
				isOwn: false,
				body: questionBody,
				composer: isActive ? questionComposerSlot : null,
				hasKids: hasTops,
				children: hasTops ? questionChildren : null,
				onPlus: () => toggleReplyTarget({ postId: q.id, parentCommentId: null }),
				plusActive: isActive
			})}
		</div>
	</article>
{/snippet}

<style>
	:global(::selection) {
		background: #ffffff;
		color: #000000;
	}
	:global(::-moz-selection) {
		background: #ffffff;
		color: #000000;
	}

	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 24px 16px 64px;
		overflow-x: clip;
		font-size: 16px;
		line-height: 1.4;
	}
	.page :where(h1, h2, h3, p, a, button, textarea, span) {
		font-size: 16px;
		letter-spacing: 0;
	}

	.today {
		padding-bottom: 18px;
		margin-bottom: 18px;
	}
	.section-label,
	.past-date {
		margin: 0 0 6px;
		color: var(--muted-foreground);
		font-weight: 600;
	}
	.prompt-today,
	.prompt-past,
	.world-label,
	.user-question-text {
		font-family: var(--font-sans);
		font-weight: 500;
		line-height: 1.35;
		margin: 0;
		text-align: left;
		color: var(--foreground);
	}

	.composer {
		width: 100%;
		margin: 12px 0 0;
	}
	.composer textarea,
	.edit-textarea,
	.reply-composer textarea {
		display: block;
		width: 100%;
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.4;
		min-height: 92px;
		padding: 10px 12px;
		border-radius: 0;
		border: 1px solid var(--border);
		background: var(--background);
		color: var(--foreground);
		box-shadow: none;
		resize: vertical;
	}
	.reply-composer textarea {
		min-height: 76px;
	}
	.composer textarea:focus,
	.edit-textarea:focus,
	.reply-composer textarea:focus {
		outline: 1px solid var(--foreground);
		outline-offset: 0;
	}
	textarea.typing-sending {
		border-color: #7ee787;
		box-shadow: 0 0 0 1px #7ee787;
	}

	.send-row,
	.composer-bar,
	.edit-bar {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.send-row {
		margin-top: 0;
	}
	.composer-bar,
	.edit-bar {
		margin-top: 8px;
	}
	.send-row,
	.composer-bar {
		justify-content: flex-end;
	}
	.edit-bar {
		justify-content: flex-start;
	}
	.send-button,
	.post-button {
		appearance: none;
		border: 1px solid var(--foreground);
		border-radius: 0;
		background: var(--foreground);
		color: var(--background);
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: 600;
		line-height: 1;
		min-height: 40px;
		padding: 9px 12px;
		cursor: pointer;
		box-shadow: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.send-button {
		width: 100%;
		position: relative;
		border-top: 0;
	}
	.send-button > :global(svg) {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
	}
	.send-button:hover,
	.post-button:hover {
		background: var(--background);
		color: var(--foreground);
	}
	.send-button:disabled,
	.post-button:disabled {
		opacity: 0.42;
		cursor: not-allowed;
	}
	.send-label,
	.send-label.mono {
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1;
	}
	.post-button.small {
		min-height: 36px;
		padding: 8px 10px;
	}

	.answers,
	.world-feed {
		display: flex;
		flex-direction: column;
		gap: 22px;
		width: 100%;
	}
	.tw-post {
		--branch-gutter: 20px;
		--line-strong: color-mix(in oklab, var(--foreground), var(--background) 58%);
		--line-cover: var(--background);
		width: 100%;
		padding-top: 18px;
	}
	.answers > .tw-post:first-child,
	.world-feed > .tw-post:first-child {
		padding-top: 0;
	}
	.tw-item {
		display: block;
		width: 100%;
	}
	.tw-item.is-reply,
	.tw-item.is-composer {
		position: relative;
		list-style: none;
	}
	.tw-item.is-reply::before,
	.tw-item.is-composer::before {
		content: '';
		position: absolute;
		left: calc(-1 * var(--branch-gutter));
		top: 0.72em;
		width: var(--branch-gutter);
		border-top: 1px solid var(--line-strong);
		pointer-events: none;
	}
	.tw-branch > .tw-children:last-child > .tw-item:last-child::after,
	.tw-branch > .tw-item.is-composer:last-child::after {
		content: '';
		position: absolute;
		left: calc(-1 * var(--branch-gutter) - 1px);
		top: calc(0.72em + 1px);
		bottom: 0;
		width: 3px;
		background: var(--line-cover);
		pointer-events: none;
	}
	.tw-row,
	.tw-main {
		display: block;
		min-width: 0;
		width: 100%;
	}
	.tw-meta {
		display: flex;
		align-items: baseline;
		gap: 7px;
		flex-wrap: wrap;
		margin: 0 0 3px;
	}
	.tw-name {
		color: var(--muted-foreground);
		font-size: 16px;
		font-weight: 500;
		line-height: 1.35;
		text-decoration: none;
	}
	.tw-name:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.tw-body {
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: 400;
		line-height: 1.4;
		color: var(--foreground);
		margin: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}
	.tw-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 5px;
	}
	.tw-reply-button,
	.reply-label,
	.edit-name,
	.nudge-cta,
	.guest-locked-link,
	.toast-link {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 16px;
		font-weight: 500;
		line-height: 1.2;
		letter-spacing: 0;
		text-transform: none;
		padding: 0;
		cursor: pointer;
	}
	.tw-reply-button::before {
		content: '+';
		display: inline-block;
		margin-right: 5px;
		color: var(--foreground);
	}
	.tw-reply-button.active::before {
		content: '-';
	}
	.tw-reply-button:hover,
	.reply-label:hover,
	.nudge-cta:hover,
	.guest-locked-link:hover,
	.toast-link:hover {
		color: var(--foreground);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.edit-label {
		margin-left: 6px;
		vertical-align: baseline;
	}
	.edit-name {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.tw-branch {
		margin: 7px 0 0 8px;
		padding: 8px 0 0 var(--branch-gutter);
		border-left: 1px solid var(--line-strong);
	}
	.tw-children {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.tw-children + .tw-item.is-composer {
		margin-top: 12px;
	}
	.tw-item.is-composer + .tw-children {
		margin-top: 12px;
	}
	.reply-composer {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0;
		align-items: stretch;
		margin-top: 0;
	}
	.reply-composer .post-button {
		min-height: 76px;
		border-left: 0;
		padding-left: 14px;
		padding-right: 14px;
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
		padding: 4px;
		cursor: pointer;
	}
	.kebab:hover {
		color: var(--foreground);
	}
	.popover {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 20;
		min-width: 140px;
		padding: 4px;
		background: var(--background);
		border: 1px solid var(--border);
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
		font-size: 16px;
		text-align: left;
		padding: 8px 10px;
		cursor: pointer;
	}
	.popover-item:hover {
		background: var(--muted);
	}
	.popover-item.destructive {
		color: var(--destructive);
	}
	.popover-item:disabled,
	.kebab:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.nudge,
	.locked-cta {
		width: 100%;
		margin: 18px 0 0;
		padding: 0;
		text-align: left;
		color: var(--muted-foreground);
		font-size: 16px;
		line-height: 1.4;
	}
	.nudge-state {
		color: var(--foreground);
		font-weight: 500;
	}
	.world-divider {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 24px 0 0;
	}
	.world-label {
		margin: 14px 0 10px;
	}
	.world-typing {
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.4;
		color: var(--muted-foreground);
		text-align: left;
		margin: 0 0 8px;
		min-height: 1.4em;
		opacity: 0;
		transition: opacity 180ms ease;
	}
	.world-typing.visible {
		opacity: 1;
	}
	.world-tabs {
		display: flex;
		gap: 16px;
		margin: 0 0 10px;
		border-bottom: 1px solid var(--border);
	}
	.world-tab {
		appearance: none;
		border: 0;
		border-bottom: 1px solid transparent;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 16px;
		padding: 6px 0;
		margin-bottom: -1px;
		cursor: pointer;
	}
	.world-tab:hover,
	.world-tab.active {
		color: var(--foreground);
	}
	.world-tab.active {
		border-bottom-color: var(--foreground);
	}

	.past {
		margin-top: 24px;
	}
	.past-day {
		width: 100%;
		padding-top: 18px;
		border-top: 1px solid var(--border);
	}
	.empty {
		padding: 40px 0;
		text-align: left;
		color: var(--muted-foreground);
	}
	.empty.small {
		padding: 16px 0;
	}
	.tw-children.guest-locked {
		filter: blur(5px);
		user-select: none;
		pointer-events: none;
	}
	.guest-locked-cta {
		padding: 12px 0 0;
		text-align: left;
	}
	.guest-locked-text {
		font-size: 16px;
		line-height: 1.4;
		color: var(--muted-foreground);
	}
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
		padding: 10px 14px;
		background: var(--background);
		color: var(--foreground);
		border: 1px solid var(--border);
		border-radius: 0;
		font-size: 16px;
		line-height: 1.4;
	}

	@media (max-width: 560px) {
		.page {
			padding: 18px 12px 56px;
		}
		.reply-composer {
			grid-template-columns: 1fr;
		}
		.reply-composer .post-button {
			width: 100%;
			border-top: 0;
			border-left: 1px solid var(--foreground);
		}
	}
</style>
