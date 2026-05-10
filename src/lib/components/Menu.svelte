<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { menuOpen, closeMenu } from '$lib/stores/menu';
	import type { User } from '$lib/types';

	interface Answer {
		id: string;
		user_id: string;
		content: string;
		created_at: number;
		display_name: string | null;
		username: string | null;
		profile_picture_url: string | null;
		sprite_id: number | null;
		bot_id: string | null;
		reaction_count: number;
		comment_count: number;
	}

	interface Props {
		user: User | null;
		prompt: { id: string; text: string; active_date: string } | null;
		answers: Answer[];
	}

	let { user, prompt, answers }: Props = $props();

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

	// Lock body scroll while open.
	$effect(() => {
		if (!$menuOpen) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => { document.body.style.overflow = prev; };
	});

	// Esc closes.
	onMount(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') closeMenu();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	async function ensureSession() {
		if (user) return true;
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

	async function react(postId: string, type: string) {
		const key = `${postId}:${type}`;
		if (pendingReactions[key]) return;
		pendingReactions = { ...pendingReactions, [key]: true };
		try {
			if (!(await ensureSession())) return;
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

	async function navigate(path: string) {
		closeMenu();
		await goto(path);
	}

	async function signOut() {
		try {
			await authClient.signOut();
			closeMenu();
			await goto('/');
			await invalidateAll();
		} catch (err) {
			console.error('Sign-out failed:', err);
		}
	}

	function authorLabel(a: Answer) {
		if (a.bot_id) return a.display_name ?? 'Bot';
		if (revealedAuthors[a.id]) return a.display_name ?? 'Anonymous';
		return 'Anonymous';
	}

	const isSignedIn = $derived(!!user && !user.isAnonymous);
</script>

{#if $menuOpen}
	<div class="menu" role="dialog" aria-modal="true" aria-label="Sehyo">
		<header class="header">
			<button type="button" class="brand" onclick={closeMenu} aria-label="Close menu">
				<img src="/sehyo-logo.svg" alt="" class="brand-mark" width="32" height="32" />
				<span class="brand-text">SEHYO</span>
			</button>
			<nav class="nav">
				<button type="button" class="nav-link" onclick={() => navigate('/search')}>Search</button>
				{#if isSignedIn && user}
					<button type="button" class="nav-link" onclick={() => navigate(`/profile/${user.id}`)}>Profile</button>
					<button type="button" class="nav-link" onclick={() => navigate('/messages')}>Messages</button>
					<button type="button" class="nav-link" onclick={() => navigate('/friends')}>Friends</button>
					<button type="button" class="nav-link nav-link-muted" onclick={signOut}>Sign out</button>
				{:else}
					<button type="button" class="nav-link nav-link-cta" onclick={() => navigate('/auth/login')}>Sign in</button>
				{/if}
			</nav>
		</header>

		<main class="body">
			{#if !prompt}
				<p class="empty">No prompt today yet. Check back shortly.</p>
			{:else}
				<section class="prompt-block">
					<p class="eyebrow">Today's question</p>
					<h1 class="prompt-text">{prompt.text}</h1>
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
					{#if answers.length === 0}
						<p class="empty">No answers yet. Be first.</p>
					{:else}
						<p class="eyebrow">{answers.length} answer{answers.length === 1 ? '' : 's'}</p>
						{#each answers as a (a.id)}
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
											>{r.emoji}</button>
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
	.menu {
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
	.header {
		position: sticky;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 16px;
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
		color: var(--foreground);
	}
	.brand-mark {
		width: 32px;
		height: 32px;
		border-radius: 7px;
	}
	.brand-text {
		font-family: var(--font-sans);
		font-weight: 800;
		letter-spacing: -0.1em;
		font-size: 22px;
	}
	.nav {
		display: flex;
		gap: 4px;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.nav-link {
		appearance: none;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		color: var(--foreground);
		padding: 6px 10px;
		border-radius: 8px;
		cursor: pointer;
	}
	.nav-link:hover { background: var(--muted); }
	.nav-link-muted { color: var(--muted-foreground); }
	.nav-link-cta {
		background: var(--primary);
		color: var(--primary-foreground);
		padding: 6px 14px;
	}
	.nav-link-cta:hover { background: var(--primary); opacity: 0.9; }

	.body {
		max-width: 640px;
		margin: 0 auto;
		padding: 28px 20px 64px;
	}
	.eyebrow {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin: 0 0 8px;
	}
	.prompt-block { margin-bottom: 24px; }
	.prompt-text {
		font-family: var(--font-sans);
		font-weight: 800;
		letter-spacing: -0.02em;
		font-size: clamp(28px, 5vw, 40px);
		line-height: 1.15;
		margin: 0;
		color: var(--foreground);
	}
	.composer { margin-bottom: 32px; }
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
	.char-count { font-size: 12px; color: var(--muted-foreground); }
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
	.post-button:disabled { opacity: 0.45; cursor: not-allowed; }

	.answers .eyebrow { margin-bottom: 16px; }
	.answer {
		padding: 16px 0;
		border-top: 1px solid var(--border);
	}
	.answer-head { margin-bottom: 6px; }
	.author {
		font-size: 13px;
		font-weight: 600;
		color: var(--muted-foreground);
	}
	.author.bot { color: var(--primary); }
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
	.reactions { display: flex; gap: 4px; }
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
	.react:hover { background: var(--muted); }
	.react:active { transform: scale(0.92); }
	.react:disabled { opacity: 0.4; cursor: wait; }
	.answer-stats { font-size: 12px; color: var(--muted-foreground); }
	.empty {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
	}
</style>
