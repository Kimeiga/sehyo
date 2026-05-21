<script lang="ts">
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';

	type Author = {
		id: string;
		name: string;
		color: string;
	};

	type CommentVersion = {
		content: string;
		editedAt: number;
	};

	type SimComment = {
		id: string;
		parentId: string | null;
		authorId: string;
		content: string;
		createdAt: number;
		updatedAt: number | null;
		fromTyping: boolean;
		versions: CommentVersion[];
	};

	type TypingEntry = {
		id: string;
		threadId: string;
		authorId: string;
		expiresAt: number;
		closing: boolean;
		removeAt: number | null;
	};

	type LogEntry = {
		id: string;
		at: number;
		label: string;
	};

	const AUTHORS: Author[] = [
		{ id: 'a0', name: 'Uma', color: 'oklch(0.52 0.21 28)' },
		{ id: 'a1', name: 'Jin', color: 'oklch(0.49 0.18 145)' },
		{ id: 'a2', name: 'Mira', color: 'oklch(0.5 0.2 252)' },
		{ id: 'a3', name: 'Noor', color: 'oklch(0.47 0.18 314)' },
		{ id: 'a4', name: 'Sol', color: 'oklch(0.45 0.16 78)' },
		{ id: 'a5', name: 'You', color: 'oklch(0.42 0.17 205)' }
	];

	const SELF_AUTHOR_ID = 'a5';
	const TYPING_AUTHORS = AUTHORS.filter((author) => author.id !== SELF_AUTHOR_ID);
	const ROOT_THREAD = 'post-main';
	const CYCLE_MS = 30_000;
	const TICK_MS = 820;
	const TYPE_MS = 1_900;
	const MAX_COMMENTS = 28;
	const MAX_DEPTH = 4;
	const reveal = { duration: 260, easing: cubicOut };
	const noReveal = { duration: 0 };
	const TYPE_CLOSE_MS = 260;

	const seeds = [
		'i keep changing my mind halfway through typing',
		'this feels like the right amount of pressure',
		'i would answer faster if the box stayed this close',
		'the line between replies is doing a lot here',
		'i like that the newest thing stays near the top',
		'edited because i forgot the actual point',
		'this is exactly where the reply should land',
		'the tiny delay makes the typing label feel alive',
		'i want this to stay readable when it gets noisy',
		'the best version is quiet but not sterile'
	];

	const edits = [
		' actually, make that more specific',
		' (edited for clarity)',
		' — i still mean this',
		' and the spacing matters',
		' but only if it stays calm'
	];

	let comments = $state<SimComment[]>([]);
	let typing = $state<TypingEntry[]>([]);
	let log = $state<LogEntry[]>([]);
	let openHistoryIds = $state<string[]>([]);
	let cycle = $state(1);
	let cycleStartedAt = $state(Date.now());
	let now = $state(Date.now());
	let running = $state(true);
	let nextId = 0;
	let generation = 0;
	let pendingTimers: ReturnType<typeof setTimeout>[] = [];

	const elapsed = $derived(Math.min(now - cycleStartedAt, CYCLE_MS));
	const cycleProgress = $derived((elapsed / CYCLE_MS) * 100);
	const topComments = $derived(comments.filter((c) => c.parentId === null).sort(newestFirst));
	const rootTypers = $derived(typersFor(ROOT_THREAD));

	onMount(() => {
		startCycle();
		const clock = setInterval(() => {
			now = Date.now();
			updateTyping(now);
		}, 250);
		const loop = setInterval(step, TICK_MS);
		return () => {
			clearInterval(clock);
			clearInterval(loop);
			clearPendingTimers();
		};
	});

	function startCycle() {
		clearPendingTimers();
		generation++;
		nextId = 0;
		cycleStartedAt = Date.now();
		comments = [];
		typing = [];
		openHistoryIds = [];
		log = [];
		pushLog('cycle started');

		for (let i = 0; i < 5; i++) {
			const parentId =
				i > 1 && Math.random() > 0.35
					? comments[Math.floor(Math.random() * comments.length)]?.id
					: null;
			insertComment(parentId ?? null, AUTHORS[i % AUTHORS.length].id);
		}
	}

	function step() {
		if (!running) return;

		const age = Date.now() - cycleStartedAt;
		if (age >= CYCLE_MS) {
			pushLog('30s reset');
			cycle += 1;
			startCycle();
			return;
		}

		const roll = Math.random();
		if (comments.length < 4 || roll < 0.34) {
			queueComment(null);
		} else if (roll < 0.6) {
			queueComment(randomReplyParent()?.id ?? null);
		} else if (roll < 0.78) {
			editRandomComment();
		} else if (roll < 0.92) {
			deleteRandomComment();
		} else {
			queueTypingOnly();
		}
	}

	function queueComment(parentId: string | null) {
		if (comments.length >= MAX_COMMENTS) {
			deleteRandomComment();
			return;
		}
		const safeParentId = normalizedParentId(parentId);
		const author = randomAuthor();
		const threadId = safeParentId ? `reply-${safeParentId}` : ROOT_THREAD;
		addTyping(threadId, author.id, TYPE_MS);
		const token = generation;
		const delay = 520 + Math.round(Math.random() * 850);
		const timer = setTimeout(() => {
			if (token !== generation) return;
			insertComment(safeParentId, author.id);
		}, delay);
		pendingTimers.push(timer);
	}

	function insertComment(parentId: string | null, authorId: string) {
		const id = `c-${cycle}-${nextId++}`;
		const safeParentId = normalizedParentId(parentId);
		const author = byAuthor(authorId);
		const content = seeds[Math.floor(Math.random() * seeds.length)];
		const threadId = safeParentId ? `reply-${safeParentId}` : ROOT_THREAD;
		const fromTyping = typing.some(
			(t) => t.threadId === threadId && t.authorId === authorId && !t.closing
		);
		typing = typing.filter((t) => !(t.threadId === threadId && t.authorId === authorId));
		comments = [
			{
				id,
				parentId: safeParentId,
				authorId,
				content,
				createdAt: Date.now(),
				updatedAt: null,
				fromTyping,
				versions: []
			},
			...comments
		];
		pushLog(`${author.name} posted${safeParentId ? ' a reply' : ''}`);
	}

	function editRandomComment() {
		const target = randomComment();
		if (!target) return;
		const suffix = edits[Math.floor(Math.random() * edits.length)];
		const previous = target.content;
		comments = comments.map((c) =>
			c.id === target.id
				? {
						...c,
						content: c.content + suffix,
						updatedAt: Date.now(),
						versions: [{ content: previous, editedAt: Date.now() }, ...c.versions].slice(0, 3)
					}
				: c
		);
		pushLog(`${byAuthor(target.authorId).name} edited`);
	}

	function deleteRandomComment() {
		const target = randomComment();
		if (!target) return;
		const remove = new Set<string>([target.id]);
		let changed = true;
		while (changed) {
			changed = false;
			for (const c of comments) {
				if (c.parentId && remove.has(c.parentId) && !remove.has(c.id)) {
					remove.add(c.id);
					changed = true;
				}
			}
		}
		comments = comments.filter((c) => !remove.has(c.id));
		openHistoryIds = openHistoryIds.filter((id) => !remove.has(id));
		typing = typing.filter((t) => !remove.has(t.threadId.replace(/^reply-/, '')));
		pushLog(`deleted ${remove.size === 1 ? 'comment' : `${remove.size} comments`}`);
	}

	function queueTypingOnly() {
		const parent = randomReplyParent();
		const threadId = parent ? `reply-${parent.id}` : ROOT_THREAD;
		addTyping(threadId, randomAuthor(TYPING_AUTHORS).id, TYPE_MS + 1_200);
	}

	function addTyping(threadId: string, authorId: string, ttl: number) {
		if (authorId === SELF_AUTHOR_ID) return;
		const id = `${threadId}:${authorId}`;
		const entry = {
			id,
			threadId,
			authorId,
			expiresAt: Date.now() + ttl,
			closing: false,
			removeAt: null
		};
		typing = [entry, ...typing.filter((t) => t.id !== id)];
	}

	function updateTyping(nowMs: number) {
		typing = typing
			.map((t) => {
				if (t.closing || t.expiresAt > nowMs) return t;
				return { ...t, closing: true, removeAt: nowMs + TYPE_CLOSE_MS };
			})
			.filter((t) => !t.closing || (t.removeAt ?? 0) > nowMs);
	}

	function clearPendingTimers() {
		for (const timer of pendingTimers) clearTimeout(timer);
		pendingTimers = [];
	}

	function randomAuthor(pool: Author[] = AUTHORS): Author {
		return pool[Math.floor(Math.random() * pool.length)] ?? AUTHORS[0];
	}

	function byAuthor(id: string): Author {
		return AUTHORS.find((a) => a.id === id) ?? AUTHORS[0];
	}

	function randomComment(): SimComment | null {
		if (comments.length === 0) return null;
		return comments[Math.floor(Math.random() * comments.length)];
	}

	function randomReplyParent(): SimComment | null {
		const candidates = comments.filter((c) => depthOf(c.id) + 1 < MAX_DEPTH);
		if (candidates.length === 0) return null;
		return candidates[Math.floor(Math.random() * candidates.length)];
	}

	function normalizedParentId(parentId: string | null): string | null {
		if (!parentId) return null;
		const parent = comments.find((c) => c.id === parentId);
		if (!parent) return null;
		return depthOf(parent.id) + 1 >= MAX_DEPTH ? null : parentId;
	}

	function depthOf(commentId: string): number {
		let depth = 0;
		let cur = comments.find((c) => c.id === commentId);
		while (cur?.parentId) {
			depth += 1;
			cur = comments.find((c) => c.id === cur?.parentId);
		}
		return depth;
	}

	function childrenOf(commentId: string): SimComment[] {
		return comments.filter((c) => c.parentId === commentId).sort(newestFirst);
	}

	function newestFirst(a: SimComment, b: SimComment) {
		return b.createdAt - a.createdAt;
	}

	function typersFor(threadId: string): TypingEntry[] {
		return typing.filter((t) => t.threadId === threadId);
	}

	function toggleHistory(id: string) {
		openHistoryIds = openHistoryIds.includes(id)
			? openHistoryIds.filter((x) => x !== id)
			: [id, ...openHistoryIds];
	}

	function relative(ms: number): string {
		const seconds = Math.max(0, Math.round((now - ms) / 1000));
		if (seconds < 2) return 'now';
		return `${seconds}s`;
	}

	function pushLog(label: string) {
		log = [{ id: crypto.randomUUID(), at: Date.now(), label }, ...log].slice(0, 8);
	}
</script>

<svelte:head>
	<title>Prototype — comment stress</title>
</svelte:head>

{#snippet authorName(authorId: string)}
	{@const author = byAuthor(authorId)}
	<span class="name" style:color={author.color}>{author.name}</span>
{/snippet}

{#snippet typingNode(entry: TypingEntry, depth: number)}
	{@const author = byAuthor(entry.authorId)}
	<li
		class="node typing-node"
		class:closing={entry.closing}
		style:--depth={depth}
		in:slide={reveal}
	>
		<div class="typing-node-shell">
			<div class="comment">
				<div class="comment-main">
					<p class="meta typing-meta" aria-live="polite">
						<span class="name" style:color={author.color}>{author.name}</span>
						<span class="typing-body">is typing</span>
					</p>
				</div>
			</div>
		</div>
	</li>
{/snippet}

{#snippet commentContent(comment: SimComment, isOwn: boolean)}
	<p class="body">
		{comment.content}
		{#if comment.updatedAt}
			<button class="edited" type="button" onclick={() => toggleHistory(comment.id)}
				>(edited)</button
			>
		{/if}
	</p>
	{#if openHistoryIds.includes(comment.id) && comment.versions.length}
		<ol class="history" transition:slide={reveal}>
			{#each comment.versions as version, i (`${comment.id}-${i}`)}
				<li>
					<span>{version.content}</span>
					<time>{relative(version.editedAt)}</time>
				</li>
			{/each}
		</ol>
	{/if}
	<div class="actions">
		<button type="button" class="tw-reply-button">Reply</button>
		{#if isOwn}
			<button type="button" class="own-action">Edit</button>
			<button type="button" class="own-action">Delete</button>
		{/if}
	</div>
{/snippet}

{#snippet commentNode(comment: SimComment, depth: number)}
	{@const children = childrenOf(comment.id)}
	{@const threadId = `reply-${comment.id}`}
	{@const typers = typersFor(threadId)}
	{@const isOwn = comment.authorId === SELF_AUTHOR_ID}
	<li class="node" style:--depth={depth} transition:slide={comment.fromTyping ? noReveal : reveal}>
		<div class="comment">
			<div class="comment-main">
				<p class="meta">
					{@render authorName(comment.authorId)}
					<span>{relative(comment.createdAt)}</span>
				</p>
				{#if comment.fromTyping}
					<div class="posted-content">
						<div class="posted-content-inner">
							{@render commentContent(comment, isOwn)}
						</div>
					</div>
				{:else}
					{@render commentContent(comment, isOwn)}
				{/if}
			</div>
		</div>

		{#if typers.length || children.length}
			<ol class="children">
				{#each typers as typer (`${threadId}-${typer.id}`)}
					{@render typingNode(typer, depth + 1)}
				{/each}
				{#each children as child (child.id)}
					{@render commentNode(child, depth + 1)}
				{/each}
			</ol>
		{/if}
	</li>
{/snippet}

<main class="page">
	<header class="top">
		<a href="/prototype">prototype</a>
		<h1>Comment stress loop</h1>
		<p>Client-only playground. It posts, replies, edits, types, deletes, then resets every 30s.</p>
	</header>

	<section class="board" aria-label="Comment stress simulation">
		<div class="status">
			<div>
				<span>cycle {cycle}</span>
				<span>{comments.length} comments</span>
				<span>{typing.length} typing</span>
			</div>
			<div class="buttons">
				<button type="button" onclick={() => (running = !running)}>
					{running ? 'Pause' : 'Resume'}
				</button>
				<button
					type="button"
					onclick={() => {
						cycle += 1;
						startCycle();
					}}>Restart</button
				>
			</div>
		</div>
		<div class="meter" aria-hidden="true"><span style:width={`${cycleProgress}%`}></span></div>

		<article class="post">
			<p class="kicker">Question of the day</p>
			<h2>What kind of interface makes you more willing to say something?</h2>
			<p class="answer">
				One that puts the reply exactly where my attention already is, and then gets out of the way.
			</p>
		</article>

		<div class="composer" aria-hidden="true">
			<textarea tabindex="-1" readonly value="Your answer..."></textarea>
			<button type="button" tabindex="-1">Post</button>
		</div>

		<ol class="thread">
			{#each rootTypers as typer (`${ROOT_THREAD}-${typer.id}`)}
				{@render typingNode(typer, 0)}
			{/each}
			{#each topComments as comment (comment.id)}
				{@render commentNode(comment, 0)}
			{/each}
		</ol>
	</section>

	<aside class="log" aria-label="Simulation event log">
		<h2>Events</h2>
		{#each log as item (item.id)}
			<p transition:slide={reveal}><time>{relative(item.at)}</time> {item.label}</p>
		{/each}
	</aside>
</main>

<style>
	:global(body),
	textarea,
	button {
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		font-feature-settings:
			'calt' 1,
			'liga' 1,
			'dlig' 1,
			'zero' 1,
			'ss01' 1,
			'ss02' 1;
		font-variant-ligatures: common-ligatures discretionary-ligatures contextual;
		font-variant-numeric: slashed-zero oldstyle-nums;
	}

	.page {
		min-height: 100dvh;
		max-width: 760px;
		margin: 0 auto;
		padding: 72px 16px 96px;
		font-size: 16px;
		line-height: 1.35;
	}

	.top {
		margin: 0 0 18px;
	}

	.top a,
	.top p,
	.kicker,
	.status,
	.actions,
	.log {
		font-size: 16px;
	}

	.top a {
		color: var(--foreground);
		text-decoration: none;
		border-bottom: 1px solid var(--foreground);
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		font-size: 44px;
		line-height: 0.95;
		font-weight: 200;
		letter-spacing: 0;
		margin: 8px 0;
	}

	.top p {
		max-width: 560px;
		color: var(--muted-foreground);
	}

	.board,
	.log {
		border: 1px solid var(--border);
		background: transparent;
	}

	.board {
		--branch-gutter: 20px;
		--reply-stem-x: 0.35em;
		--line-strong: color-mix(in oklab, var(--foreground), var(--background) 58%);
		--line-cover: var(--background);
		padding: 12px;
	}

	.status {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: center;
		padding-bottom: 10px;
	}

	.status div:first-child {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		color: var(--muted-foreground);
	}

	.buttons {
		display: flex;
		gap: 0;
	}

	button {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--foreground);
		border-radius: 0;
		font-size: 16px;
		line-height: 1;
		padding: 9px 12px;
		cursor: pointer;
	}

	.buttons button + button {
		margin-left: -1px;
	}

	button:hover {
		background: var(--foreground);
		color: var(--background);
	}

	.meter {
		height: 9px;
		border: 1px solid var(--border);
		margin-bottom: 18px;
		background: transparent;
	}

	.meter span {
		display: block;
		height: 100%;
		background: var(--foreground);
		transition: width 240ms linear;
	}

	.post {
		padding: 0 0 14px;
		border-bottom: 1px solid var(--border);
	}

	.kicker {
		text-transform: uppercase;
		letter-spacing: 0;
		color: var(--muted-foreground);
		margin-bottom: 5px;
	}

	.post h2 {
		font-size: 28px;
		line-height: 1.05;
		font-weight: 260;
		letter-spacing: 0;
		max-width: 660px;
	}

	.answer {
		margin-top: 10px;
		max-width: 620px;
	}

	.composer {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		margin: 14px 0 6px;
	}

	.composer textarea {
		min-height: 76px;
		border: 1px solid var(--border);
		border-right: 0;
		border-radius: 0;
		padding: 10px;
		font-size: 16px;
		line-height: 1.35;
		resize: none;
		color: var(--muted-foreground);
		background: transparent;
	}

	.composer button {
		min-width: 86px;
	}

	.thread,
	.children,
	.history {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.thread {
		display: grid;
		gap: 10px;
		padding-top: 10px;
	}

	.node {
		position: relative;
	}

	.typing-node {
		overflow: visible;
	}

	.typing-node.closing {
		pointer-events: none;
	}

	.typing-node.closing .typing-node-shell {
		animation: typing-node-close 260ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}

	.typing-node-shell {
		display: grid;
		grid-template-rows: 1fr;
		min-height: 0;
		overflow: hidden;
		animation: posted-content-reveal 260ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.typing-node-shell > .comment {
		min-height: 0;
		overflow: hidden;
	}

	.comment {
		position: relative;
		display: grid;
		grid-template-columns: 1fr;
	}

	.comment-main {
		position: relative;
		min-width: 0;
	}

	.meta {
		display: flex;
		gap: 8px;
		align-items: baseline;
		color: var(--muted-foreground);
	}

	.typing-meta {
		gap: 4px;
		margin-bottom: 0;
	}

	.name {
		font-weight: 700;
	}

	.body {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.typing-body {
		color: var(--muted-foreground);
	}

	.posted-content {
		display: grid;
		grid-template-rows: 1fr;
		overflow: hidden;
		animation: posted-content-reveal 320ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.posted-content-inner {
		min-height: 0;
		overflow: hidden;
	}

	.edited {
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		display: inline;
		padding: 0;
		margin-left: 5px;
		vertical-align: baseline;
	}

	.edited:hover {
		background: transparent;
		color: var(--foreground);
		text-decoration: underline;
	}

	.actions {
		display: flex;
		gap: 10px;
		color: var(--muted-foreground);
		margin-top: 3px;
	}

	.tw-reply-button,
	.own-action {
		appearance: none;
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 16px;
		font-weight: 500;
		line-height: 1.2;
		padding: 0;
		cursor: pointer;
	}

	.tw-reply-button::before {
		content: '+';
		display: inline-block;
		width: calc(var(--reply-stem-x) * 2);
		margin-right: 5px;
		color: var(--foreground);
		text-align: center;
	}

	.tw-reply-button:hover,
	.own-action:hover {
		background: transparent;
		color: var(--foreground);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.children {
		position: relative;
		margin: 7px 0 0 var(--reply-stem-x);
		padding: 8px 0 0 var(--branch-gutter);
		border-left: 1px solid var(--line-strong);
		display: grid;
		gap: 12px;
	}

	.children > .node::before {
		content: '';
		position: absolute;
		left: calc(-1 * var(--branch-gutter));
		top: 0.72em;
		width: var(--branch-gutter);
		border-top: 1px solid var(--line-strong);
		pointer-events: none;
	}

	.children > .node:last-child::after {
		content: '';
		position: absolute;
		left: calc(-1 * var(--branch-gutter) - 1px);
		top: calc(0.72em + 1px);
		bottom: 0;
		width: 3px;
		background: var(--line-cover);
		pointer-events: none;
	}

	.history {
		border-left: 1px solid var(--foreground);
		margin: 7px 0 5px;
		padding-left: 10px;
		color: var(--muted-foreground);
		display: grid;
		gap: 4px;
		overflow: hidden;
	}

	.history li {
		display: grid;
		gap: 1px;
	}

	.history time {
		color: var(--muted-foreground);
		font-size: 16px;
	}

	.log {
		margin-top: 14px;
		padding: 10px 12px;
	}

	.log h2 {
		font-size: 16px;
		font-weight: 700;
		margin-bottom: 6px;
	}

	.log p {
		color: var(--muted-foreground);
		overflow: hidden;
	}

	.log time {
		color: var(--foreground);
		margin-right: 6px;
	}

	@media (max-width: 560px) {
		.page {
			padding-inline: 10px;
		}

		h1 {
			font-size: 36px;
		}

		.status {
			align-items: flex-start;
			flex-direction: column;
		}

		.composer {
			grid-template-columns: 1fr;
		}

		.composer textarea {
			border-right: 1px solid var(--border);
			border-bottom: 0;
		}
	}

	@keyframes posted-content-reveal {
		from {
			grid-template-rows: 0fr;
			opacity: 0;
			transform: translateY(-2px);
		}

		to {
			grid-template-rows: 1fr;
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes typing-node-close {
		from {
			grid-template-rows: 1fr;
			opacity: 1;
			transform: translateY(0);
		}

		to {
			grid-template-rows: 0fr;
			opacity: 0;
			transform: translateY(-2px);
		}
	}
</style>
