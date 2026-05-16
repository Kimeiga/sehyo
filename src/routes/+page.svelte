<script lang="ts">
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { tick, type Snippet } from 'svelte';
	import { authClient } from '$lib/auth-client';
	import { promptSignIn } from '$lib/stores/sign-in-modal';
	import { Pencil, MoreHorizontal, Check, ArrowUp, Plus } from 'lucide-svelte';
	import PromptRipple from '$lib/components/PromptRipple.svelte';
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
		// not-yet-answered). Names in the indicator are blurred via
		// .author-mask until the viewer answers today's prompt (same
		// engagement gate as the feed) — so a pre-answer viewer sees
		// "●●● is typing…", a tease to answer, without the identity
		// leaking. Signed-out viewers have no session cookie for the
		// typing Worker, so skip them (the WS would just
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
	// in markup (not a string) so each name can sit in its own
	// .author-mask span — blurred until the viewer answers today's
	// prompt, same as feed author names.

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
		<section class="hero">
			<PromptRipple text={data.prompt.text}>
				{#if !data.myAnswer}
					<form class="composer" onsubmit={onComposerSubmit}>
						<div class="composer-stack">
							<div class="composer-wrap">
								<textarea
									bind:value={composerValue}
									placeholder="Your answer…"
									rows="3"
									maxlength="2000"
									disabled={posting}
									onkeydown={onComposerKeydown}
								></textarea>
							</div>
							<div class="send-row">
								<button
									type="submit"
									class="send-button"
									aria-label={posting ? 'Posting…' : 'Send (Enter)'}
									title="Send (Enter)"
									disabled={posting || composerValue.trim().length === 0}
								>
									<span class="send-label" class:mono={sendLabelMono}>{sendLabel}</span>
									<ArrowUp size="18" strokeWidth="2.4" />
								</button>
							</div>
						</div>
					</form>
				{/if}
			</PromptRipple>
		</section>

		<section class="answers">
			{#if data.myAnswer}
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
					<span style="color:#f78166;font-family:monospace;">[dev mode — typing as {devTabIdentity?.displayName}]</span>
				{:else}
					A new question will be posited tomorrow.
				{/if}
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
{#snippet typingLabel(users: TypingUser[])}
	{#if users.length === 1}
		<span class="author-mask">{users[0].displayName}</span> is typing…
	{:else if users.length === 2}
		<span class="author-mask">{users[0].displayName}</span> and
		<span class="author-mask">{users[1].displayName}</span> are typing…
	{:else if users.length >= 3}
		<span class="author-mask">{users[0].displayName}</span>,
		<span class="author-mask">{users[1].displayName}</span>, and
		{users.length - 2} other{users.length - 2 === 1 ? '' : 's'} are typing…
	{/if}
{/snippet}

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
			<a class="tw-name" class:author-mask={!isOwn} href="/{username}">{displayName ?? 'Anonymous'}</a>
			<a class="tw-handle" class:author-mask={!isOwn} href="/{username}">@{username}</a>
		{:else}
			<span class="tw-name" class:author-mask={!isOwn}>{displayName ?? 'Anonymous'}</span>
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

<!-- Shared shell for any thread node — top-level post, user question,
     or nested comment. Renders the .tw-row (avatar + main column with
     body + optional inline composer), the children list, and the
     trailing "+" reply affordance.

     The variant-specific chrome (wrapping <li>/<article>, threading
     SVG segments for nested replies, post-level edit mode, top-level
     comment composer) lives at the call sites. Anything visual that
     appears in BOTH a top-level post and a nested reply belongs in
     here, so styling/behavior tweaks apply uniformly. -->
{#snippet treeShell(args: {
	userId: string;
	username?: string | null;
	displayName?: string | null;
	image?: string | null;
	isOwn: boolean;
	/* When set, this avatar replaces the normal user's avatar (used
	   by post edit mode to show the current viewer's pic). */
	avatarOverride?: { id: string; image?: string | null } | null;
	body: Snippet;
	composer?: Snippet | null;
	hasKids: boolean;
	children?: Snippet | null;
	onPlus: () => void;
	plusActive?: boolean;
	showPlus?: boolean;
})}
	{@const plusVisible = args.showPlus !== false && !args.plusActive}
	{@const trunkExtendsForComposer = !!args.composer}
	<div class="tw-row">
		<div class="tw-left">
			{#if args.avatarOverride}
				{@render avatar(args.avatarOverride.id, args.avatarOverride.image)}
			{:else if args.username}
				<a class="tw-avatar-link" href="/{args.username}" aria-label={args.displayName ?? 'Profile'}>
					{@render avatar(args.userId, args.image)}
				</a>
			{:else}
				{@render avatar(args.userId, args.image)}
			{/if}
			{#if args.hasKids || trunkExtendsForComposer}
				<!-- Trunk descends from avatar — needed when there are
				     children below OR when an open composer below acts
				     like a fresh child to attach to. -->
				<div class="tw-line"></div>
			{:else if plusVisible}
				<!-- Leaf with no open composer: the trunk has no
				     children to descend through, so the "+" hangs
				     straight off the avatar. -->
				<span class="tw-add-stem" aria-hidden="true"></span>
				<button
					class="tw-add-plus"
					type="button"
					onclick={args.onPlus}
					aria-label="Reply"
					title="Reply"
				>
					<Plus size="12" strokeWidth="2.4" />
				</button>
			{/if}
		</div>
		<div class="tw-main">
			{@render authorMeta(args.displayName, args.username, args.isOwn)}
			{@render args.body()}
		</div>
	</div>

	{#if args.children}{@render args.children()}{/if}

	{#if args.composer}{@render args.composer()}{/if}

	{#if args.hasKids && plusVisible}
		<!-- Has-kids node, composer closed: render the trailing "+"
		     to terminate the trunk past the last L-junction. -->
		<div class="tw-add">
			<span class="tw-add-stem" aria-hidden="true"></span>
			<button
				class="tw-add-plus"
				type="button"
				onclick={args.onPlus}
				aria-label="Reply"
				title="Reply"
			>
				<Plus size="12" strokeWidth="2.4" />
			</button>
		</div>
	{/if}
{/snippet}

<!-- Active reply composer, shaped like a tree node (avatar + name +
     body) but with a textarea in place of the body. Renders at the
     end of the target's subtree, mirroring the geometry of a real
     reply so the threading line appears to extend down into it.

     `data-reply-target` is how openReply() finds this form to
     scroll-into-view + auto-focus the textarea. -->
{#snippet replyComposer(postId: string, parentCommentId: string | null)}
	{@const threadKey = parentCommentId ? 'reply-' + parentCommentId : 'post-' + postId}
	{@const typers = typingForThread($worldTypingUsers, threadKey, typingSelfId)}
	{@const meUserId = data.user?.id ?? 'guest'}
	{@const meImage = (data.user as { image?: string | null } | null)?.image ?? null}
	{@const meDisplayName = (data.user as { name?: string | null } | null)?.name ?? 'You'}
	{@const meUsername = (data.user as { username?: string | null } | null)?.username ?? null}
	<div class="tw-item is-composer">
		<!-- No .tw-trunk-out: the composer is the bottom of the
		     subtree, so there's nothing below for a leaving-vertical
		     segment to connect to. Just the L-hook curving from the
		     parent's trunk into the composer's avatar. -->
		<svg class="tw-hook" viewBox="0 0 22 32" aria-hidden="true" focusable="false">
			<!-- The path is 50 user-units long (vertical 30 + horizontal 20),
			     so stroke-dasharray:50 + dashoffset → 0 draws the L on mount
			     in the CSS animation below. -->
			<path d="M 1 0 V 30 H 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter" />
		</svg>
		<div class="tw-row">
			<div class="tw-left">
				{@render avatar(meUserId, meImage)}
			</div>
			<div class="tw-main">
				<header class="tw-meta">
					<span class="tw-name">{meDisplayName}</span>
					{#if meUsername}<span class="tw-handle">@{meUsername}</span>{/if}
				</header>
				<p class="thread-typing" aria-live="polite" class:visible={typers.length > 0}>
					{@render typingLabel(typers)}
				</p>
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
					>{submittingReply ? '…' : (parentCommentId ? 'Reply' : 'Post')}</button>
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
		<!-- Leaving-trunk segment bridging this reply's T-junction down
		     to the next sibling's top. CSS hides this for last-child
		     since there's no next sibling to connect to. -->
		<span class="tw-trunk-out" aria-hidden="true"></span>
		<!-- L-hook (vertical + horizontal) as one SVG path so the
		     corner is a single stroke join — no sub-pixel gaps from
		     two separate rectangles meeting. -->
		<svg
			class="tw-hook"
			viewBox="0 0 22 32"
			aria-hidden="true"
			focusable="false"
		>
			<path
				d="M 1 0 V 30 H 21"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="butt"
				stroke-linejoin="miter"
			/>
		</svg>
		{@render treeShell({
			userId: c.user_id,
			username: c.user?.username,
			displayName: c.user?.display_name,
			image: c.user?.profile_picture_url,
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
	a: { id: string; user_id: string; content: string; display_name: string | null; username?: string | null; bot_id: string | null; image?: string | null; comment_count: number },
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
			<p class="tw-body">{a.content}{#if isMine} <button
				type="button"
				class="reply-label edit-label"
				onclick={startEdit}
				aria-label="Edit answer"
			>EDIT</button>{/if}</p>
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
				image: a.image,
				isOwn: isMine,
				avatarOverride: inEditMode && data.user
					? { id: data.user.id, image: (data.user as { image?: string | null }).image }
					: null,
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
					<button type="button" class="guest-locked-link" onclick={() => promptSignIn('Sign in to read the comments on your response.')}>Sign in</button>
					to read the comments on your response.
				</span>
			</div>
		{/if}
	</article>
{/snippet}

{#snippet userQuestionCard(q: { id: string; user_id: string; content: string; display_name: string | null; username?: string | null; bot_id: string | null; image?: string | null; comment_count: number })}
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
				image: q.image,
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
	.page {
		max-width: none;
		margin: 0 auto;
		padding: 0 12px 96px;
		/* The composer's glow halo (.composer-wrap::before/::after,
		   inset: -22px plus a 28px blur) extends past the composer
		   box. Without clipping, that pushes the page wider than the
		   viewport on mobile and you get horizontal scroll. Using
		   `clip` (not `hidden`) so we don't create a new scroll
		   container — keeps the navbar's sticky behavior intact. */
		overflow-x: clip;
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

	/* Override the browser default light-blue text-selection highlight
	   site-wide. White background + black text reads cleanly against
	   both the dark page chrome and the white send button. `:global`
	   so it escapes Svelte's per-component scoping. */
	:global(::selection) {
		background: #ffffff;
		color: #000000;
	}
	:global(::-moz-selection) {
		background: #ffffff;
		color: #000000;
	}

	/* Landing hero — 80% of viewport height. PromptRipple's host
	   fills it (min-height: inherit picks up 80vh) and handles its
	   own internal flex centering, so .hero just provides the box
	   the canvas should span. Scroll-driven fade + sticky pinning
	   temporarily disabled; the hero scrolls with the rest of the
	   page like a normal section. The original styles are preserved
	   below in comments so they can be re-enabled later. */
	.hero {
		min-height: 80vh;
	}
	/* The composer doesn't get its own bottom margin inside the
	   hero — PromptRipple's flex layout handles spacing. */
	.hero :global(.composer) {
		margin-bottom: 0;
	}

	/* --- Sticky + scroll-fade — temporarily disabled. ---
	   To re-enable: restore the rules below + the `.hero ~ *` rule.

	.hero {
		position: sticky;
		top: 0;
		z-index: 0;
	}
	.hero-inner {
		animation: hero-fade linear both;
		animation-timeline: scroll(root);
		animation-range: 0 80vh;
	}
	@keyframes hero-fade {
		from { opacity: 1; filter: blur(0); transform: scale(1); }
		to   { opacity: 0.35; filter: blur(6px); transform: scale(0.88); }
	}
	@media (prefers-reduced-motion: reduce) {
		.hero-inner { animation: none; }
	}
	.hero:has(textarea:focus) .hero-inner { animation: none; }
	.hero ~ * { position: relative; z-index: 1; }
	*/

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
	/* composer-stack wraps textarea + send-row so the glow can
	   halo around the combined input area, not just the textarea.
	   `isolation: isolate` traps the ::before glow inside this
	   stacking context so its z-index:-1 sits behind both children
	   but above the page background. */
	.composer-stack {
		position: relative;
		isolation: isolate;
	}
	/* Bias-lighting glow. Two stacked layers of soft colored blobs
	   sit behind the textarea + button — each layer is a set of
	   radial gradients that slowly translate + scale on its own
	   loop, so the colors gently morph around the edges of the
	   stack. Heavy blur fuses them into a continuous halo. */
	.composer-stack::before,
	.composer-stack::after {
		content: '';
		position: absolute;
		inset: -22px;
		z-index: -1;
		border-radius: 28px;
		filter: blur(28px);
		opacity: 0.55;
		transition: opacity 200ms ease;
		pointer-events: none;
		will-change: transform;
	}
	/* Blue-dominant palette: deep royal + sky + cyan as the main
	   colors, with indigo and mint as cool accents so the glow
	   doesn't go monochrome and dead. */
	.composer-stack::before {
		background:
			radial-gradient(55% 65% at 18% 28%, #2563eb 0%, transparent 65%),
			radial-gradient(50% 60% at 82% 72%, #38bdf8 0%, transparent 65%),
			radial-gradient(60% 55% at 50% 50%, #6366f1 0%, transparent 70%);
		animation: composer-glow-a 14s ease-in-out infinite;
	}
	.composer-stack::after {
		background:
			radial-gradient(55% 65% at 75% 22%, #60a5fa 0%, transparent 65%),
			radial-gradient(55% 60% at 25% 78%, #06b6d4 0%, transparent 65%),
			radial-gradient(50% 55% at 92% 55%, #5eead4 0%, transparent 70%);
		animation: composer-glow-b 18s ease-in-out infinite;
	}
	@keyframes composer-glow-a {
		0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
		50%      { transform: translate3d(-2%, 3%, 0) scale(1.06); }
	}
	@keyframes composer-glow-b {
		0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
		50%      { transform: translate3d(3%, -2%, 0) scale(0.94); }
	}
	@media (prefers-reduced-motion: reduce) {
		.composer-stack::before,
		.composer-stack::after { animation: none; }
	}
	/* While the textarea is focused, fade the rainbow halo out so
	   the user isn't typing into a glowing distracting box. The
	   200ms transition above lets it ease away rather than snap. */
	.composer-stack:has(textarea:focus)::before,
	.composer-stack:has(textarea:focus)::after {
		opacity: 0;
	}
	/* Skeuomorphic glass border. The `padding-box` layer is the
	   solid card fill; the `border-box` layers paint a thin ring
	   around it. Four corner radial highlights (top brighter than
	   bottom — light from above) are the specular shines; a
	   top-bright/bottom-dim linear gradient under them gives the
	   panel its inset-glass feel. The inset box-shadow finishes
	   the bevel: subtle highlight on the inner top edge, deeper
	   shadow on the inner bottom edge. */
	.composer-wrap textarea {
		/* `display: block` removes the baseline-descender gap a
		   default inline-block textarea adds below itself, which
		   was leaving a few px between textarea and send button. */
		display: block;
		border: 1.5px solid transparent;
		background:
			linear-gradient(var(--card), var(--card)) padding-box,
			radial-gradient(circle at 0% 0%, rgba(255, 255, 255, 0.7), transparent 28%) border-box,
			radial-gradient(circle at 100% 0%, rgba(255, 255, 255, 0.7), transparent 28%) border-box,
			radial-gradient(circle at 100% 100%, rgba(255, 255, 255, 0.4), transparent 24%) border-box,
			radial-gradient(circle at 0% 100%, rgba(255, 255, 255, 0.4), transparent 24%) border-box,
			linear-gradient(180deg,
				rgba(255, 255, 255, 0.28) 0%,
				rgba(255, 255, 255, 0.04) 55%,
				rgba(0, 0, 0, 0.18) 100%
			) border-box;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.06),
			inset 0 -1px 0 rgba(0, 0, 0, 0.25);
	}
	/* Send button row sits flush under the textarea (no gap) and
	   the button stretches to the textarea's full width. */
	.send-row {
		display: block;
		margin-top: 0;
	}
	/* Square-cornered, full-width send. White on black, label
	   centered, up-arrow pinned to the right edge so the label
	   stays optically centered regardless of label length. */
	.send-button {
		appearance: none;
		border: 0;
		border-radius: 0;
		width: 100%;
		padding: 12px 18px;
		background: #ffffff;
		color: #000000;
		font-family: var(--font-sans);
		font-weight: 600;
		font-size: 15px;
		letter-spacing: 0.01em;
		cursor: pointer;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 120ms ease, opacity 120ms ease;
	}
	.send-button > :global(svg) {
		position: absolute;
		right: 16px;
		top: 50%;
		transform: translateY(-50%);
	}
	.send-button:hover { background: #f1f5f9; }
	.send-button:active { background: #e2e8f0; }
	.send-button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.send-label { line-height: 1; }
	/* Mono variant — applied when the picked SEND_VARIANTS entry is
	   tagged `mono: true` (e.g. the fake SQL command). Makes the label
	   read as code rather than chatty button copy. */
	.send-label.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 13px;
		letter-spacing: 0;
	}
	.composer textarea, .edit-textarea, .reply-composer textarea {
		width: 100%;
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.55;
		padding: 12px 14px;
		/* Perfect rectangle — no rounding. */
		border-radius: 0;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--card-foreground);
		resize: vertical;
		min-height: 88px;
	}
	.composer textarea { min-height: 96px; font-size: 17px; padding: 14px 16px; }
	/* Reply composer sits inline within the comment tree, so it
	   should read like a comment body, not a heavy form. Same font
	   size + line-height as .tw-body, with tight padding and no
	   forced min-height so it doesn't dominate the row. */
	.reply-composer textarea {
		font-size: 14px;
		line-height: 1.5;
		padding: 6px 10px;
		min-height: 32px;
	}
	.composer textarea:focus, .edit-textarea:focus, .reply-composer textarea:focus {
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
	   tw-post – article wrapper. No divider stroke between posts
	   now; spacing is provided by the parent's flex `gap` (see
	   `.answers` / `.world-feed` rules below).
	   ────────────────────────────────────────────────────────────── */
	.tw-post {
		padding: 16px 0 8px;
		/* Threading-line palette hoisted here so the per-segment
		   pseudo-elements + tw-trunk-out spans below all draw from
		   the same colors.
		     - `strong` is the muted-shade at full alpha (no alpha
		       reduction) — the line's normal body.
		     - `soft` is `strong` × 0.5 absolute alpha — the gradient
		       endpoint at the TOP of each vertical segment, where it
		       approaches a profile pic or a T-junction. */
		/* Dimmer line color with a subtle blue cast:
		     1. Base muted-mix (muted-foreground × 0.35 + border × 0.65)
		     2. Tinted toward --brand (#00A5D8) at 18% in oklab
		     3. Reduced to 60% alpha for the dimming
		   --line-soft then steps that result down to 0.3 of strong
		   for the gradient endpoint, giving an effective ~0.18 alpha
		   at the top of each vertical segment. */
		--line-strong: color-mix(
			in srgb,
			color-mix(
				in oklab,
				color-mix(in oklab, var(--muted-foreground), var(--border) 65%),
				var(--brand) 9%
			) 60%,
			transparent
		);
		--line-soft: color-mix(in srgb, var(--line-strong) 30%, transparent);
	}

	/* tw-item – vertical stack of [.tw-row, .tw-children]. The flex
	   row layout (avatar + content) is on .tw-row so .tw-children
	   sits as a SIBLING of .tw-row, NOT nested inside .tw-main.
	   This way parent.tw-line in tw-row's tw-left only stretches to
	   match body height — it doesn't leak through the children area
	   the way it used to. Each child draws its own threading
	   segments via ::before / ::after / .tw-trunk-out. */
	.tw-item {
		display: block;
		width: 100%;
	}
	.tw-row {
		display: flex;
		gap: 8px;
		align-items: stretch;
		width: 100%;
	}
	.tw-item.is-reply,
	.tw-item.is-composer {
		list-style: none;
		position: relative;
		padding-top: 18px;
	}
	/* The active reply composer is rendered as a sibling of
	   .tw-children, not inside it, so we manually apply the same
	   32px indent that .tw-children's padding-left would otherwise
	   provide. With this indent in place the .tw-hook + .tw-trunk-out
	   children (positioned at left:-21px in their own coord space)
	   land on the parent's trunk centerline just like a real reply. */
	.tw-item.is-composer {
		margin-left: 32px;
	}


	.tw-left {
		flex-shrink: 0;
		width: 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.tw-avatar-link {
		display: block;
		width: 24px;
		height: 24px;
		border-radius: 999px;
		overflow: hidden;
		flex-shrink: 0;
		-webkit-user-drag: none;
	}
	.tw-avatar {
		display: block;
		width: 24px;
		height: 24px;
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
	/* Drop-line below the avatar in tw-row. Stretches via flex:1 to
	   fill the rest of tw-left's height = tw-row's height = body's
	   height. Does NOT reach into .tw-children, which is a sibling
	   of tw-row (the threading inside the children is handled by
	   per-child segments below). Flat ends — no border-radius. */
	.tw-line {
		flex: 1;
		width: 2px;
		min-height: 6px;
		margin: 0;
		background: linear-gradient(
			to bottom,
			var(--line-soft) 0,
			var(--line-strong) 22px,
			var(--line-strong) 100%
		);
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
	/* Display name and @handle share the same visual treatment now —
	   muted color, identical size/weight — so the name doesn't shout
	   over the rest of the line. */
	.tw-name,
	.tw-handle {
		font-size: 13px;
		font-weight: 500;
		color: var(--muted-foreground);
		text-decoration: none;
	}
	.tw-name:hover,
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


	/* Thin tracked monospace REPLY affordance, appended inline at the
	   end of the comment body text — flows like a piece of trailing
	   word, not a separate button-shaped chip. */
	.reply-label {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
		font-size: 9px;
		font-weight: 400;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		padding: 0 4px;
		margin-left: 6px;
		cursor: pointer;
		vertical-align: baseline;
		transition: color 120ms ease, background 120ms ease;
	}
	.reply-label:hover {
		color: var(--foreground);
		background: var(--muted);
	}


	/* tw-children – the list of replies under a comment/post. Now a
	   sibling of .tw-row (not nested inside .tw-main), so its top
	   sits flush against the bottom of the parent's body. Zero top
	   margin so the parent's drop-line and the first child's
	   entering-vertical segment connect with no visible gap.
	   Left padding indents replies by `avatar (24) + gap (8) = 32px`
	   so the reply's tw-left starts where the parent's tw-main does
	   one level above. */
	.tw-children {
		list-style: none;
		margin: 0;
		padding: 0 0 0 32px;
	}

	/* ── Per-child threading segments ──────────────────────────────
	   Each `.tw-item.is-reply` draws its own threading marks as
	   three independent segments rather than relying on a single
	   continuous parent line + cover:

	     1. Entering vertical (::before)   — item-top → avatar-center
	     2. Horizontal hook   (::after)    — trunk → avatar at center
	     3. Leaving vertical  (.tw-trunk-out) — avatar-center → item-bottom

	   The last sibling has no next reply below it, so its leaving
	   vertical is hidden (no need for the legacy cover ::after).

	   Geometry (24px avatar / 24px tw-left, 8px gap, 18px padding-top):
	     – parent line center sits at parent.x:12 (col 24, line centered)
	     – child column starts at parent.x:32 (= 24 + 8)
	     – avatar fills the column → child avatar left = column left
	     – in child coords (child.x:0 = parent.x:32) the trunk
	       centerline is at child.x:-20
	     – avatar vertical center: 18 (padding) + 12 (half-avatar) = 30 */

	.tw-hook {
		/* The L-hook is now a single SVG path: vertical from (1,0)
		   down to (1,30), then horizontal to (21,30). One stroke =
		   one corner join, so the corner renders cleanly with no
		   sub-pixel gap between two separate rectangles.
		     – SVG positioned so x:0 is at child.x:-21, meaning the
		       path's vertical centerline lands at child.x:-20 (the
		       trunk column) and the horizontal end at child.x:0
		       (the avatar's left edge).
		     – `color` carries --line-strong down to the path's
		       `currentColor` stroke. */
		position: absolute;
		left: -21px;
		top: 0;
		width: 22px;
		height: 32px;
		color: var(--line-strong);
		pointer-events: none;
		overflow: visible;
	}

	.tw-trunk-out {
		/* Leaving vertical: from this reply's T-junction down to the
		   bottom of the LI, where the NEXT sibling's entering
		   vertical continues from. Its TOP sits right next to the
		   L-hook's corner, so it gets a soft-to-strong gradient over
		   the first 12px — the line emerges from the corner gently
		   rather than slamming into it. Hidden via CSS for last
		   sibling (no next reply below). */
		position: absolute;
		left: -21px;
		/* Start at y=30 (the L-corner's join) instead of y=32 so the
		   leaving vertical butts directly into the SVG path's
		   miter — no 2-3px gap between the corner and the line
		   continuing down. Same colour means the brief overlap with
		   the horizontal stroke is invisible. */
		top: 30px;
		bottom: 0;
		width: 2px;
		background: linear-gradient(
			to bottom,
			var(--line-soft) 0,
			var(--line-strong) 22px,
			var(--line-strong) 100%
		);
		pointer-events: none;
	}
	/* The last child's trunk-out used to be hidden here. We now keep
	   it visible so the threading line extends past the L-corner all
	   the way to the trailing "+" affordance below the children. The
	   stem on .tw-add picks up where the trunk-out leaves off. */

	/* "Add reply" affordance: a small plus that terminates the trunk
	   column for a comment/post subtree.
	     – For a leaf (no children) the plus + a tiny stub render
	       directly INSIDE .tw-left, immediately below the avatar.
	       That keeps it visually tethered to the profile pic instead
	       of dangling at the bottom of a long body.
	     – For a parent with children the plus renders BELOW the
	       children in its own flex column matching .tw-left's 24px,
	       so the plus center lands on the same x as the trunk line.

	   Both variants share the same .tw-add-stem + .tw-add-plus
	   primitives — only the placement in the template differs. */
	.tw-add {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 24px;
		padding: 0;
		margin: 0;
	}
	.tw-add-stem {
		width: 2px;
		height: 4px;
		background: var(--line-strong);
	}
	.tw-add-plus {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border-radius: 999px;
		border: 1.5px solid var(--line-strong);
		background: var(--background);
		color: var(--muted-foreground);
		cursor: pointer;
		transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
	}
	.tw-add-plus:hover {
		color: var(--foreground);
		background: var(--muted);
		border-color: var(--muted-foreground);
	}
	.tw-add-plus:focus-visible {
		outline: 2px solid var(--ring, var(--brand, currentColor));
		outline-offset: 2px;
	}

	.tw-children.capped {
		/* At the depth cap we render flat at this level; no further
		   visual indent change. */
	}

	/* Reply composer form — sits inside .tw-main of the active
	   .tw-item.is-composer (which provides the avatar column +
	   threading line decoration), so it just needs the inline flex
	   layout for the textarea + submit button. */
	.reply-composer {
		display: flex;
		gap: 8px;
		align-items: flex-end;
		margin: 4px 0 0;
	}
	.reply-composer textarea {
		flex: 1;
		min-height: 54px;
	}

	.edit-textarea {
		width: 100%;
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.55;
		padding: 12px 14px;
		border-radius: 0;
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

	.answers { display: flex; flex-direction: column; gap: 100px; }
	@media (max-width: 640px) {
		.answers { gap: 50px; }
		.world-feed { gap: 50px; }
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

	/* Typing indicator under the World heading. Reserve vertical space
	   with min-height so the layout doesn't jump when entries appear or
	   disappear; fade opacity for the show/hide transition. */
	.world-typing {
		font-family: var(--font-sans);
		font-size: 13px;
		color: var(--muted-foreground);
		text-align: center;
		margin: -8px 0 16px;
		min-height: 1.2em;
		opacity: 0;
		transition: opacity 180ms ease;
	}
	.world-typing.visible { opacity: 1; }

	/* Per-thread typing indicator: smaller, left-aligned, sits inside
	   the composer's .tw-main column (no extra left margin needed). */
	.thread-typing {
		font-family: var(--font-sans);
		font-size: 12px;
		color: var(--muted-foreground);
		margin: 4px 0 0;
		min-height: 1.2em;
		opacity: 0;
		transition: opacity 180ms ease;
	}
	.thread-typing.visible { opacity: 1; }

	/* Sender-side debug: green halo on any composer textarea for ~5s
	   after each successful typing send. While this is on, other tabs
	   should show the matching typing indicator for the same thread. */
	textarea.typing-sending {
		border-color: #7ee787 !important;
		box-shadow: 0 0 0 2px rgba(126,231,135,0.35);
		transition: border-color 120ms ease, box-shadow 120ms ease;
	}

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

	.world-feed { display: flex; flex-direction: column; gap: 100px; }

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

	/* No mobile avatar-size override needed — the desktop default
	   (16px) is already small enough for narrow viewports. The hook
	   + cover offsets above are universal. */
</style>
