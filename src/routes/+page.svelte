<script lang="ts">
	import type { PageProps } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import {
		CalendarDays,
		CheckCircle2,
		Eye,
		Globe2,
		HandHeart,
		HelpCircle,
		LockKeyhole,
		MessageCircle,
		Plus,
		Send,
		Users
	} from 'lucide-svelte';

	let { data }: PageProps = $props();

	type Kind = 'post' | 'ask' | 'offer' | 'plan';
	type PostIdentity = 'masked' | 'persona' | 'anonymous' | 'named';
	type CommentIdentity = 'thread' | 'persona' | 'anonymous' | 'named';

	type Persona = {
		id: string;
		label: string;
		accent: string;
		kind: 'stable' | 'ephemeral';
	};

	type Circle = {
		id: string;
		name: string;
		description: string | null;
		role: 'owner' | 'member';
		member_count: number;
	};

	type Author = {
		label: string;
		accent: string;
		sublabel: string | null;
		mine: boolean;
		revealed: boolean;
		mode: string;
	};

	type SocialComment = {
		id: string;
		post_id: string;
		body: string;
		created_at: number;
		updated_at: number;
		can_reveal: boolean;
		author: Author;
	};

	type SocialPost = {
		id: string;
		kind: Kind;
		title: string | null;
		body: string;
		place: string | null;
		happens_at: number | null;
		threshold: number | null;
		status: string;
		created_at: number;
		updated_at: number;
		circle: { id: string; name: string } | null;
		comment_count: number;
		commitment_count: number;
		my_commitment_status: string | null;
		can_commit: boolean;
		can_reveal: boolean;
		author: Author;
		comments: SocialComment[];
	};

	const posts = $derived((data.feed ?? []) as SocialPost[]);
	const personas = $derived((data.personas ?? []) as Persona[]);
	const circles = $derived((data.circles ?? []) as Circle[]);
	const isRealAccount = $derived(!!data.user && !data.user.isAnonymous);

	let kind = $state<Kind>('post');
	let body = $state('');
	let title = $state('');
	let place = $state('');
	let happensLocal = $state('');
	let threshold = $state(3);
	let identityMode = $state<PostIdentity>('masked');
	let personaLabel = $state('');
	let circleId = $state('');
	let posting = $state(false);

	let circleName = $state('');
	let circleDescription = $state('');
	let circleUsernames = $state('');
	let creatingCircle = $state(false);

	let commentDrafts = $state<Record<string, string>>({});
	let commentModes = $state<Record<string, CommentIdentity>>({});
	let commentPersonaLabels = $state<Record<string, string>>({});
	let commenting = $state<Record<string, boolean>>({});
	let committing = $state<Record<string, boolean>>({});
	let revealInputs = $state<Record<string, string>>({});
	let revealing = $state<Record<string, boolean>>({});

	const kindConfig: Record<
		Kind,
		{ label: string; action: string; icon: typeof MessageCircle; placeholder: string }
	> = {
		post: {
			label: 'Post',
			action: 'Post',
			icon: MessageCircle,
			placeholder: "what's funny, interesting, cursed, or worth saying?"
		},
		ask: {
			label: 'Ask',
			action: 'Ask',
			icon: HelpCircle,
			placeholder: 'what do you need advice or perspective on?'
		},
		offer: {
			label: 'Offer',
			action: 'Offer',
			icon: HandHeart,
			placeholder: 'what can you help with?'
		},
		plan: {
			label: 'Plan',
			action: 'Start plan',
			icon: CalendarDays,
			placeholder: "what happens if enough people commit?"
		}
	};

	async function ensureSession() {
		if (data.user) return true;
		try {
			await authClient.signIn.anonymous();
			return true;
		} catch (err) {
			console.error('Anonymous session failed:', err);
			alert('Could not start an anonymous session.');
			return false;
		}
	}

	async function signInGoogle() {
		await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
	}

	async function submitPost(e: SubmitEvent) {
		e.preventDefault();
		const cleanBody = body.trim();
		if (!cleanBody || posting) return;
		if (!(await ensureSession())) return;

		posting = true;
		try {
			const res = await fetch('/api/social/posts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					kind,
					title: title.trim(),
					body: cleanBody,
					place: place.trim(),
					happens_at: happensLocal ? Math.floor(Date.parse(happensLocal) / 1000) : null,
					threshold,
					identity_mode: identityMode,
					persona_label: personaLabel.trim(),
					circle_id: circleId || null
				})
			});
			if (!res.ok) throw new Error(await responseMessage(res));
			body = '';
			title = '';
			place = '';
			happensLocal = '';
			threshold = 3;
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Could not post.');
		} finally {
			posting = false;
		}
	}

	async function createCircle(e: SubmitEvent) {
		e.preventDefault();
		if (!circleName.trim() || creatingCircle) return;
		if (!(await ensureSession())) return;
		creatingCircle = true;
		try {
			const usernames = circleUsernames
				.split(',')
				.map((u) => u.trim())
				.filter(Boolean);
			const res = await fetch('/api/social/circles', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					name: circleName,
					description: circleDescription,
					usernames
				})
			});
			if (!res.ok) throw new Error(await responseMessage(res));
			circleName = '';
			circleDescription = '';
			circleUsernames = '';
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Could not create circle.');
		} finally {
			creatingCircle = false;
		}
	}

	async function submitComment(e: SubmitEvent, postId: string) {
		e.preventDefault();
		const draft = (commentDrafts[postId] ?? '').trim();
		if (!draft || commenting[postId]) return;
		if (!(await ensureSession())) return;
		commenting = { ...commenting, [postId]: true };
		try {
			const res = await fetch(`/api/social/posts/${postId}/comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					body: draft,
					identity_mode: commentModes[postId] ?? 'thread',
					persona_label: commentPersonaLabels[postId] ?? ''
				})
			});
			if (!res.ok) throw new Error(await responseMessage(res));
			commentDrafts = { ...commentDrafts, [postId]: '' };
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Could not comment.');
		} finally {
			commenting = { ...commenting, [postId]: false };
		}
	}

	async function toggleCommit(postId: string) {
		if (committing[postId]) return;
		if (!(await ensureSession())) return;
		committing = { ...committing, [postId]: true };
		try {
			const res = await fetch(`/api/social/posts/${postId}/commit`, {
				method: 'POST',
				credentials: 'include'
			});
			if (!res.ok) throw new Error(await responseMessage(res));
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Could not update commitment.');
		} finally {
			committing = { ...committing, [postId]: false };
		}
	}

	async function reveal(targetType: 'post' | 'comment' | 'persona', targetId: string) {
		const key = `${targetType}:${targetId}`;
		const username = (revealInputs[key] ?? '').trim();
		if (!username || revealing[key]) return;
		if (!(await ensureSession())) return;
		revealing = { ...revealing, [key]: true };
		try {
			const res = await fetch('/api/social/reveals', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					target_type: targetType,
					target_id: targetId,
					viewer_username: username
				})
			});
			if (!res.ok) throw new Error(await responseMessage(res));
			revealInputs = { ...revealInputs, [key]: '' };
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Could not reveal.');
		} finally {
			revealing = { ...revealing, [key]: false };
		}
	}

	function setCommentDraft(postId: string, value: string) {
		commentDrafts = { ...commentDrafts, [postId]: value };
	}

	function setCommentMode(postId: string, value: CommentIdentity) {
		commentModes = { ...commentModes, [postId]: value };
	}

	function setCommentPersona(postId: string, value: string) {
		commentPersonaLabels = { ...commentPersonaLabels, [postId]: value };
	}

	function setRevealInput(key: string, value: string) {
		revealInputs = { ...revealInputs, [key]: value };
	}

	function formatTime(seconds: number) {
		const diff = Math.floor(Date.now() / 1000 - seconds);
		if (diff < 60) return 'now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
		if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
		return new Date(seconds * 1000).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		});
	}

	function formatPlanTime(seconds: number | null) {
		if (!seconds) return null;
		return new Date(seconds * 1000).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function responseMessage(res: Response) {
		const body = await res.json().catch(() => null);
		return body?.message ?? body?.error ?? `HTTP ${res.status}`;
	}
</script>

<svelte:head>
	<title>Sehyo · masked timeline</title>
</svelte:head>

<main class="page">
	<section class="topline">
		<div>
			<p class="eyebrow">Masked timeline</p>
			<h1>Post without making it your public identity.</h1>
		</div>
		{#if data.user}
			<div class="account-pill" class:guest={data.user.isAnonymous}>
				<LockKeyhole size="14" />
				<span>{data.user.isAnonymous ? 'anonymous session' : data.user.username ? `@${data.user.username}` : 'signed in'}</span>
			</div>
		{:else}
			<button class="account-pill guest" type="button" onclick={ensureSession}>
				<LockKeyhole size="14" />
				<span>post anonymously</span>
			</button>
		{/if}
	</section>

	<section class="composer-shell" aria-label="Create post">
		<div class="kind-tabs" role="tablist" aria-label="Post type">
			{#each Object.entries(kindConfig) as [k, cfg]}
				{@const Icon = cfg.icon}
				<button
					type="button"
					class="kind-tab"
					class:active={kind === k}
					onclick={() => (kind = k as Kind)}
				>
					<Icon size="15" />
					<span>{cfg.label}</span>
				</button>
			{/each}
		</div>

		<form class="composer" onsubmit={submitPost}>
			{#if kind === 'plan'}
				<div class="field-grid">
					<input name="title" bind:value={title} maxlength="90" placeholder="Plan title" />
					<input name="place" bind:value={place} maxlength="120" placeholder="Place" />
					<input name="happens_at" bind:value={happensLocal} type="datetime-local" />
					<label class="threshold">
						<span>If</span>
						<input name="threshold" bind:value={threshold} type="number" min="2" max="100" />
						<span>people join</span>
					</label>
				</div>
			{/if}
			<textarea
				bind:value={body}
				name="body"
				rows="4"
				maxlength="2400"
				placeholder={kindConfig[kind].placeholder}
				disabled={posting}
			></textarea>
			<div class="composer-controls">
				<select name="identity_mode" bind:value={identityMode} aria-label="Identity mode">
					<option value="masked">Fresh mask</option>
					<option value="persona">Stable persona</option>
					<option value="anonymous">Anonymous</option>
					<option value="named">Named</option>
				</select>
				{#if identityMode === 'persona'}
					<input
						bind:value={personaLabel}
						class="persona-input"
						list="personas"
						name="persona_label"
						maxlength="28"
						placeholder="persona name"
					/>
					<datalist id="personas">
						{#each personas as persona}
							<option value={persona.label}></option>
						{/each}
					</datalist>
				{/if}
				<select name="circle_id" bind:value={circleId} aria-label="Audience">
					<option value="">Global</option>
					{#each circles as circle}
						<option value={circle.id}>{circle.name}</option>
					{/each}
				</select>
				<button class="send-button" type="submit" disabled={posting || body.trim().length === 0}>
					<span>{posting ? 'Posting…' : kindConfig[kind].action}</span>
					<Send size="15" />
				</button>
			</div>
		</form>
	</section>

	<section class="utility-row">
		<form class="circle-box" onsubmit={createCircle}>
			<div class="utility-head">
				<Users size="16" />
				<strong>Circle</strong>
			</div>
			<div class="circle-fields">
				<input name="circle_name" bind:value={circleName} maxlength="60" placeholder="name" />
				<input name="circle_usernames" bind:value={circleUsernames} placeholder="@usernames, comma-separated" />
			</div>
			<input name="circle_description" bind:value={circleDescription} maxlength="240" placeholder="description" />
			<button type="submit" disabled={creatingCircle || !circleName.trim()}>
				<Plus size="14" />
				<span>{creatingCircle ? 'Creating…' : 'Create circle'}</span>
			</button>
		</form>

		<div class="circle-box identity-box">
			<div class="utility-head">
				<Eye size="16" />
				<strong>Reveal</strong>
			</div>
			<p>
				Identity stays masked unless you reveal a specific post, comment, or persona to a
				specific username.
			</p>
			{#if personas.length > 0}
				<div class="persona-list">
					{#each personas as persona}
						{@const personaRevealKey = `persona:${persona.id}`}
						<form
							class="persona-reveal"
							onsubmit={(e) => {
								e.preventDefault();
								reveal('persona', persona.id);
							}}
						>
							<span class="persona-chip" style={`--persona-color:${persona.accent}`}>
								{persona.label}
							</span>
							<input
								value={revealInputs[personaRevealKey] ?? ''}
								name="persona_reveal_username"
								oninput={(e) => setRevealInput(personaRevealKey, e.currentTarget.value)}
								placeholder="@username"
							/>
							<button type="submit" disabled={revealing[personaRevealKey]}>Reveal</button>
						</form>
					{/each}
				</div>
			{/if}
			{#if data.user?.isAnonymous}
				<button type="button" onclick={signInGoogle}>Attach this session to Google</button>
			{:else if !data.user}
				<button type="button" onclick={signInGoogle}>Sign in with Google</button>
			{/if}
		</div>
	</section>

	<section class="feed" aria-label="Timeline">
		{#if posts.length === 0}
			<div class="empty-feed">
				<Globe2 size="28" />
				<p>No masked posts yet.</p>
			</div>
		{:else}
			{#each posts as post (post.id)}
				<article class="post" class:plan-met={post.kind === 'plan' && post.status === 'met'}>
					<header class="post-head">
						<div class="author-dot" style={`--author-color:${post.author.accent}`}></div>
						<div class="author-block">
							<div class="author-row">
								<strong style:color={post.author.accent}>{post.author.label}</strong>
								<span>{formatTime(post.created_at)}</span>
								{#if post.circle}<span class="scope">circle · {post.circle.name}</span>{/if}
							</div>
							{#if post.author.sublabel}
								<p>{post.author.sublabel}</p>
							{/if}
						</div>
						<span class="kind-badge {post.kind}">{kindConfig[post.kind].label}</span>
					</header>

					{#if post.title}<h2>{post.title}</h2>{/if}
					<p class="post-body">{post.body}</p>

					{#if post.kind === 'plan'}
						<div class="plan-strip">
							<div>
								<strong>{post.commitment_count}/{post.threshold}</strong>
								<span>{post.status === 'met' ? 'threshold met' : 'committed'}</span>
							</div>
							{#if formatPlanTime(post.happens_at)}
								<div>
									<strong>{formatPlanTime(post.happens_at)}</strong>
									<span>{post.place ?? 'time set'}</span>
								</div>
							{:else if post.place}
								<div>
									<strong>{post.place}</strong>
									<span>place</span>
								</div>
							{/if}
							{#if post.can_commit}
								<button
									type="button"
									class:active={post.my_commitment_status === 'committed'}
									disabled={committing[post.id]}
									onclick={() => toggleCommit(post.id)}
								>
									<CheckCircle2 size="15" />
									<span>{post.my_commitment_status === 'committed' ? 'Committed' : 'Commit'}</span>
								</button>
							{/if}
						</div>
					{/if}

					{#if post.can_reveal}
						{@const revealKey = `post:${post.id}`}
						<form class="reveal-row" onsubmit={(e) => { e.preventDefault(); reveal('post', post.id); }}>
							<input
								value={revealInputs[revealKey] ?? ''}
								name="reveal_username"
								oninput={(e) => setRevealInput(revealKey, e.currentTarget.value)}
								placeholder="@username to reveal this post"
							/>
							<button type="submit" disabled={revealing[revealKey]}>Reveal</button>
						</form>
					{/if}

					<div class="comments">
						{#each post.comments as comment (comment.id)}
							<div class="comment">
								<div class="comment-meta">
									<strong style:color={comment.author.accent}>{comment.author.label}</strong>
									<span>{formatTime(comment.created_at)}</span>
									{#if comment.author.sublabel}<span>{comment.author.sublabel}</span>{/if}
								</div>
								<p>{comment.body}</p>
								{#if comment.can_reveal}
									{@const commentRevealKey = `comment:${comment.id}`}
									<form
										class="reveal-row compact"
										onsubmit={(e) => {
											e.preventDefault();
											reveal('comment', comment.id);
										}}
									>
										<input
											value={revealInputs[commentRevealKey] ?? ''}
											name="comment_reveal_username"
											oninput={(e) => setRevealInput(commentRevealKey, e.currentTarget.value)}
											placeholder="@username"
										/>
										<button type="submit" disabled={revealing[commentRevealKey]}>Reveal</button>
									</form>
								{/if}
							</div>
						{/each}
					</div>

					<form class="comment-form" onsubmit={(e) => submitComment(e, post.id)}>
						<input
							value={commentDrafts[post.id] ?? ''}
							name="comment_body"
							oninput={(e) => setCommentDraft(post.id, e.currentTarget.value)}
							placeholder="reply…"
							maxlength="1400"
						/>
						<select
							value={commentModes[post.id] ?? 'thread'}
							name="comment_identity_mode"
							onchange={(e) => setCommentMode(post.id, e.currentTarget.value as CommentIdentity)}
							aria-label="Comment identity"
						>
							<option value="thread">Thread mask</option>
							<option value="persona">Persona</option>
							<option value="anonymous">Anonymous</option>
							<option value="named">Named</option>
						</select>
						{#if (commentModes[post.id] ?? 'thread') === 'persona'}
							<input
								class="comment-persona"
								value={commentPersonaLabels[post.id] ?? ''}
								name="comment_persona_label"
								oninput={(e) => setCommentPersona(post.id, e.currentTarget.value)}
								placeholder="persona"
								list="personas"
								maxlength="28"
							/>
						{/if}
						<button type="submit" disabled={commenting[post.id] || !(commentDrafts[post.id] ?? '').trim()}>
							<MessageCircle size="15" />
						</button>
					</form>
				</article>
			{/each}
		{/if}
	</section>
</main>

<style>
	.page {
		width: min(100%, 760px);
		margin: 0 auto;
		padding: 32px 16px 72px;
	}

	.topline {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 18px;
		margin: 14px 0 18px;
	}

	.eyebrow {
		margin: 0 0 8px;
		color: var(--brand);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		font-weight: 800;
		font-size: 11px;
	}

	h1 {
		margin: 0;
		font-size: clamp(28px, 7vw, 54px);
		line-height: 0.96;
		letter-spacing: 0;
		max-width: 11ch;
	}

	.account-pill {
		border: 1px solid var(--border);
		background: var(--secondary);
		color: var(--foreground);
		border-radius: 999px;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 9px 12px;
		font-size: 12px;
		white-space: nowrap;
		cursor: default;
	}

	button.account-pill {
		cursor: pointer;
	}

	.account-pill.guest {
		color: var(--muted-foreground);
	}

	.composer-shell,
	.post,
	.circle-box {
		border: 1px solid var(--border);
		background: color-mix(in oklab, var(--secondary) 72%, var(--background));
		border-radius: 8px;
	}

	.composer-shell {
		overflow: hidden;
		margin-bottom: 14px;
	}

	.kind-tabs {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border-bottom: 1px solid var(--border);
	}

	.kind-tab {
		border: 0;
		border-right: 1px solid var(--border);
		background: transparent;
		color: var(--muted-foreground);
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		cursor: pointer;
		font-weight: 700;
	}

	.kind-tab:last-child {
		border-right: 0;
	}

	.kind-tab.active {
		color: var(--foreground);
		background: color-mix(in oklab, var(--brand) 12%, transparent);
	}

	.composer {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	textarea,
	input,
	select {
		border: 1px solid var(--border);
		background: var(--background);
		color: var(--foreground);
		border-radius: 6px;
		font: inherit;
		min-width: 0;
	}

	textarea {
		width: 100%;
		resize: vertical;
		min-height: 112px;
		padding: 13px;
		line-height: 1.45;
	}

	input,
	select {
		height: 38px;
		padding: 0 10px;
	}

	.field-grid {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 8px;
	}

	.threshold {
		display: grid;
		grid-template-columns: auto 64px 1fr;
		align-items: center;
		gap: 8px;
		color: var(--muted-foreground);
		font-size: 13px;
	}

	.composer-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.persona-input {
		width: 150px;
	}

	.send-button,
	.circle-box button,
	.plan-strip button,
	.comment-form button,
	.reveal-row button {
		border: 1px solid transparent;
		background: var(--brand);
		color: #031016;
		border-radius: 6px;
		height: 38px;
		padding: 0 12px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		font-weight: 800;
		cursor: pointer;
		margin-left: auto;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.utility-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin: 0 0 18px;
	}

	.circle-box {
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.utility-head {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--foreground);
	}

	.circle-fields {
		display: grid;
		grid-template-columns: 0.8fr 1.2fr;
		gap: 8px;
	}

	.identity-box p {
		margin: 0;
		color: var(--muted-foreground);
		font-size: 13px;
		line-height: 1.45;
	}

	.persona-list {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.persona-reveal {
		display: grid;
		grid-template-columns: minmax(82px, auto) minmax(0, 1fr) auto;
		gap: 7px;
		align-items: center;
	}

	.persona-chip {
		min-width: 0;
		border: 1px solid color-mix(in oklab, var(--persona-color) 55%, var(--border));
		background: color-mix(in oklab, var(--persona-color) 14%, transparent);
		color: var(--foreground);
		border-radius: 999px;
		padding: 6px 9px;
		font-size: 12px;
		font-weight: 800;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.persona-reveal input {
		height: 34px;
	}

	.persona-reveal button {
		height: 34px;
		background: transparent;
		color: var(--brand);
		border-color: var(--border);
		margin-left: 0;
	}

	.feed {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.post {
		padding: 14px;
	}

	.post.plan-met {
		border-color: color-mix(in oklab, #22c55e 50%, var(--border));
	}

	.post-head {
		display: grid;
		grid-template-columns: 10px minmax(0, 1fr) auto;
		gap: 10px;
		align-items: start;
	}

	.author-dot {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: var(--author-color);
		margin-top: 6px;
	}

	.author-block {
		min-width: 0;
	}

	.author-row {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
		align-items: center;
		font-size: 14px;
	}

	.author-row span,
	.author-block p,
	.comment-meta span {
		color: var(--muted-foreground);
	}

	.author-block p {
		margin: 2px 0 0;
		font-size: 12px;
	}

	.scope {
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px 7px;
	}

	.kind-badge {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 900;
		border-radius: 999px;
		padding: 5px 8px;
		background: var(--muted);
		color: var(--muted-foreground);
	}

	.kind-badge.ask {
		color: #7dd3fc;
	}

	.kind-badge.offer {
		color: #86efac;
	}

	.kind-badge.plan {
		color: #facc15;
	}

	h2 {
		font-size: 20px;
		margin: 14px 0 4px;
		letter-spacing: 0;
	}

	.post-body {
		white-space: pre-wrap;
		line-height: 1.55;
		margin: 12px 0;
		font-size: 16px;
	}

	.plan-strip {
		display: flex;
		align-items: stretch;
		gap: 8px;
		flex-wrap: wrap;
		border: 1px solid var(--border);
		background: var(--background);
		border-radius: 6px;
		padding: 8px;
		margin: 12px 0;
	}

	.plan-strip > div {
		min-width: 120px;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.plan-strip strong {
		font-size: 14px;
	}

	.plan-strip span {
		color: var(--muted-foreground);
		font-size: 12px;
	}

	.plan-strip button {
		background: var(--secondary);
		color: var(--foreground);
		border-color: var(--border);
		margin-left: auto;
	}

	.plan-strip button.active {
		background: #22c55e;
		color: #031207;
	}

	.reveal-row {
		display: flex;
		gap: 8px;
		margin: 10px 0;
	}

	.reveal-row input {
		flex: 1;
		height: 34px;
	}

	.reveal-row button {
		height: 34px;
		background: transparent;
		color: var(--brand);
		border-color: var(--border);
		margin-left: 0;
	}

	.reveal-row.compact {
		margin: 6px 0 0;
	}

	.comments {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 12px;
	}

	.comment {
		border-left: 2px solid var(--border);
		padding-left: 10px;
	}

	.comment-meta {
		display: flex;
		gap: 7px;
		align-items: center;
		flex-wrap: wrap;
		font-size: 12px;
	}

	.comment p {
		margin: 3px 0 0;
		white-space: pre-wrap;
		line-height: 1.45;
	}

	.comment-form {
		display: flex;
		gap: 8px;
		margin-top: 14px;
		align-items: center;
	}

	.comment-form input:first-child {
		flex: 1;
	}

	.comment-persona {
		width: 110px;
	}

	.comment-form button {
		width: 38px;
		padding: 0;
		margin-left: 0;
	}

	.empty-feed {
		border: 1px dashed var(--border);
		border-radius: 8px;
		min-height: 180px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		color: var(--muted-foreground);
	}

	@media (max-width: 720px) {
		.topline {
			flex-direction: column;
		}

		h1 {
			max-width: 13ch;
		}

		.utility-row,
		.field-grid,
		.circle-fields,
		.persona-reveal {
			grid-template-columns: 1fr;
		}

		.kind-tab span {
			display: none;
		}

		.composer-controls,
		.comment-form {
			align-items: stretch;
		}

		.comment-form {
			flex-wrap: wrap;
		}

		.comment-form input:first-child {
			flex-basis: 100%;
		}

		.send-button {
			width: 100%;
		}
	}
</style>
