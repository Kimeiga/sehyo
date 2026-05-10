<script lang="ts">
	import type { PageProps } from './$types';
	import { authClient } from '$lib/auth-client';
	import { invalidateAll } from '$app/navigation';

	let { data }: PageProps = $props();

	let menuOpen = $state(false);
	let composerValue = $state('');
	let posting = $state(false);
	let revealedAuthors = $state<Record<string, boolean>>({});
	let pendingReactions = $state<Record<string, boolean>>({});

	const REACTIONS = [
		{ key: 'like',  emoji: '👍', label: 'Like' },
		{ key: 'love',  emoji: '❤️', label: 'Love' },
		{ key: 'haha',  emoji: '😂', label: 'Haha' },
		{ key: 'wow',   emoji: '😮', label: 'Wow' },
		{ key: 'sad',   emoji: '😢', label: 'Sad' },
		{ key: 'angry', emoji: '😡', label: 'Angry' }
	] as const;

	function openMenu() {
		menuOpen = true;
	}

	function closeMenu() {
		menuOpen = false;
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
			const ok = await ensureSession();
			if (!ok) {
				alert('Could not start a session. Try again.');
				return;
			}

			const res = await fetch('/api/prompt/answer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ content })
			});

			if (!res.ok) {
				const msg = await res.text().catch(() => '');
				throw new Error(msg || `HTTP ${res.status}`);
			}

			composerValue = '';
			await invalidateAll();
		} catch (err) {
			console.error('Answer post failed:', err);
			alert('Could not post. Try again.');
		} finally {
			posting = false;
		}
	}

	async function react(postId: string, type: string) {
		const key = `${postId}:${type}`;
		if (pendingReactions[key]) return;
		pendingReactions = { ...pendingReactions, [key]: true };
		try {
			const ok = await ensureSession();
			if (!ok) return;
			const res = await fetch('/api/reactions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ target_type: 'post', target_id: postId, reaction_type: type })
			});
			if (res.ok) {
				revealedAuthors = { ...revealedAuthors, [postId]: true };
				await invalidateAll();
			}
		} catch (err) {
			console.error('Reaction failed:', err);
		} finally {
			const next = { ...pendingReactions };
			delete next[key];
			pendingReactions = next;
		}
	}

	function authorLabel(answer: (typeof data.answers)[number]) {
		// Bot authors are always revealed (their identity is the point).
		if (answer.bot_id) return answer.display_name ?? 'Bot';
		// Anonymous human posts stay masked until the viewer engages with them.
		if (revealedAuthors[answer.id]) return answer.display_name ?? 'Anonymous';
		return 'Anonymous';
	}
</script>

<svelte:head>
	<title>製 SEHYO</title>
</svelte:head>

<!-- Logo screen — the only thing visible until the user taps. -->
<div class="logo-screen">
	<button
		type="button"
		class="logo-button"
		onclick={openMenu}
		aria-label="Open Sehyo"
	>
		<span class="kanji">製</span>
	</button>
</div>

{#if menuOpen}
	<!-- Full-screen takeover. -->
	<div class="menu-takeover" role="dialog" aria-modal="true" aria-label="Sehyo">
		<header class="menu-header">
			<button
				type="button"
				class="brand"
				onclick={closeMenu}
				aria-label="Close"
			>
				<span class="brand-mark">製</span>
				<span class="brand-text">SEHYO</span>
			</button>
			{#if data.user && !data.user.isAnonymous}
				<a class="profile-link" href="/profile/{data.user.id}">
					{data.user.name ?? 'Profile'}
				</a>
			{:else if data.user}
				<a class="signin-link" href="?modal=login">Sign in</a>
			{:else}
				<a class="signin-link" href="?modal=login">Sign in</a>
			{/if}
		</header>

		<main class="menu-body">
			{#if !data.prompt}
				<p class="empty">No prompt today yet. Check back shortly.</p>
			{:else}
				<section class="prompt-block">
					<p class="prompt-eyebrow">Today's question</p>
					<h1 class="prompt-text">{data.prompt.text}</h1>
				</section>

				<form class="composer" onsubmit={submitAnswer}>
					<textarea
						bind:value={composerValue}
						placeholder="Your answer…"
						rows="3"
						maxlength="2000"
						disabled={posting}
					></textarea>
					<div class="composer-bar">
						<span class="char-count">{composerValue.length}/2000</span>
						<button
							type="submit"
							class="post-button"
							disabled={posting || composerValue.trim().length === 0}
						>
							{posting ? 'Posting…' : 'Post'}
						</button>
					</div>
				</form>

				<section class="answers">
					{#if data.answers.length === 0}
						<p class="empty">No answers yet. Be first.</p>
					{:else}
						<p class="answer-count">{data.answers.length} answer{data.answers.length === 1 ? '' : 's'}</p>
						{#each data.answers as a (a.id)}
							<article class="answer">
								<header class="answer-head">
									<span class="author" class:bot={!!a.bot_id}>{authorLabel(a)}</span>
								</header>
								<p class="answer-body">{a.content}</p>
								<footer class="answer-foot">
									<div class="reactions">
										{#each REACTIONS as r}
											<button
												type="button"
												class="react"
												aria-label={r.label}
												onclick={() => react(a.id, r.key)}
												disabled={pendingReactions[`${a.id}:${r.key}`]}
											>
												<span class="react-emoji">{r.emoji}</span>
											</button>
										{/each}
									</div>
									{#if a.reaction_count > 0 || a.comment_count > 0}
										<span class="answer-stats">
											{#if a.reaction_count > 0}{a.reaction_count} reaction{a.reaction_count === 1 ? '' : 's'}{/if}
											{#if a.reaction_count > 0 && a.comment_count > 0} · {/if}
											{#if a.comment_count > 0}{a.comment_count} comment{a.comment_count === 1 ? '' : 's'}{/if}
										</span>
									{/if}
								</footer>
							</article>
						{/each}
					{/if}
				</section>
			{/if}
		</main>
	</div>
{/if}

<style>
	.logo-screen {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--background);
	}
	.logo-button {
		appearance: none;
		border: 0;
		padding: 0;
		background: transparent;
		cursor: pointer;
		transition: transform 200ms ease;
	}
	.logo-button:hover { transform: scale(1.04); }
	.logo-button:active { transform: scale(0.98); }
	.kanji {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--primary);
		color: var(--primary-foreground);
		font-family: var(--font-jp);
		font-weight: 700;
		font-size: clamp(120px, 28vw, 240px);
		line-height: 1;
		padding: 0.18em 0.22em;
		border-radius: 18px;
		box-shadow: 0 12px 60px -16px color-mix(in oklab, var(--primary) 70%, transparent);
	}

	.menu-takeover {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: var(--background);
		overflow-y: auto;
		animation: takeover 220ms ease-out;
	}
	@keyframes takeover {
		from { opacity: 0; transform: scale(0.985); }
		to   { opacity: 1; transform: scale(1); }
	}

	.menu-header {
		position: sticky;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		background: color-mix(in oklab, var(--background) 88%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border);
		z-index: 1;
	}
	.brand {
		appearance: none;
		border: 0;
		padding: 0;
		background: transparent;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font: inherit;
		color: var(--foreground);
	}
	.brand-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--primary);
		color: var(--primary-foreground);
		font-family: var(--font-jp);
		font-weight: 700;
		font-size: 22px;
		line-height: 1;
		padding: 0.18em 0.22em;
		border-radius: 6px;
	}
	.brand-text {
		font-family: var(--font-sans);
		font-weight: 800;
		letter-spacing: -0.1em;
		font-size: 22px;
	}
	.profile-link, .signin-link {
		font-size: 14px;
		font-weight: 500;
		color: var(--foreground);
		text-decoration: none;
		padding: 6px 12px;
		border-radius: 8px;
		border: 1px solid var(--border);
	}
	.profile-link:hover, .signin-link:hover {
		background: var(--muted);
	}

	.menu-body {
		max-width: 640px;
		margin: 0 auto;
		padding: 28px 20px 64px;
	}

	.prompt-block {
		margin-bottom: 24px;
	}
	.prompt-eyebrow {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin: 0 0 8px;
	}
	.prompt-text {
		font-family: var(--font-sans);
		font-weight: 800;
		letter-spacing: -0.02em;
		font-size: clamp(28px, 5vw, 40px);
		line-height: 1.15;
		margin: 0;
		color: var(--foreground);
	}

	.composer {
		margin-bottom: 32px;
	}
	.composer textarea {
		width: 100%;
		font-family: var(--font-sans);
		font-size: 17px;
		line-height: 1.45;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--card-foreground);
		resize: vertical;
		min-height: 88px;
	}
	.composer textarea:focus {
		outline: 2px solid var(--ring);
		outline-offset: -1px;
	}
	.composer-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 10px;
	}
	.char-count {
		font-size: 12px;
		color: var(--muted-foreground);
	}
	.post-button {
		appearance: none;
		border: 0;
		padding: 10px 22px;
		border-radius: 999px;
		background: var(--primary);
		color: var(--primary-foreground);
		font-weight: 700;
		font-size: 15px;
		cursor: pointer;
	}
	.post-button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.answers .answer-count {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin: 0 0 16px;
	}
	.answer {
		padding: 16px 0;
		border-top: 1px solid var(--border);
	}
	.answer-head {
		margin-bottom: 6px;
	}
	.author {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted-foreground);
	}
	.author.bot {
		color: var(--primary);
	}
	.answer-body {
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.5;
		color: var(--foreground);
		margin: 0 0 12px;
		white-space: pre-wrap;
	}
	.answer-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	.reactions {
		display: flex;
		gap: 4px;
	}
	.react {
		appearance: none;
		border: 0;
		background: transparent;
		padding: 6px 8px;
		border-radius: 999px;
		cursor: pointer;
		font-size: 18px;
		line-height: 1;
		transition: background 120ms ease, transform 120ms ease;
	}
	.react:hover {
		background: var(--muted);
	}
	.react:active {
		transform: scale(0.92);
	}
	.react:disabled {
		opacity: 0.4;
		cursor: wait;
	}
	.answer-stats {
		font-size: 12px;
		color: var(--muted-foreground);
	}

	.empty {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
	}
</style>
