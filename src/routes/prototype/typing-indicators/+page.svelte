<script lang="ts">
	import PromptRipple from '$lib/components/PromptRipple.svelte';
	import { cubicOut } from 'svelte/easing';

	type Msg = { from: 'them' | 'me'; text: string };

	const PEER = { name: 'Iris', avatar: 'I' };

	/* Circle-clip reveal/conceal transition. t goes 0→1 on enter and
	   1→0 on exit, so the same function drives both directions
	   automatically. The clip-path grows from a 0px-radius circle at
	   the row's center out to ~90px (more than enough to cover the
	   typing row's bounding box), and the opacity fades in alongside
	   it so the chromatic-aberration ripple already inside the
	   clipped region doesn't pop. */
	function circleReveal(_node: HTMLElement, { duration = 450 } = {}) {
		return {
			duration,
			easing: cubicOut,
			/* Epicenter at ~55px from the row's left — the approximate
			   horizontal center of the "[TYPING...]" glyphs (incl.
			   brackets and dots) at 12px monospace with 0.25em
			   tracking. The circle expands outward from the middle
			   of the label on enter and shrinks back to the same
			   point on exit. */
			css: (t: number) =>
				`clip-path: circle(${(t * 90).toFixed(1)}px at 55px 50%); opacity: ${t.toFixed(3)};`
		};
	}

	let messages = $state<Msg[]>([
		{ from: 'them', text: 'hey, you up?' },
		{ from: 'me', text: 'yeah, what\'s going on' },
		{ from: 'them', text: 'i\'ve been thinking about that thing you said earlier' },
		{ from: 'them', text: 'about the masonry canvas and how it scrolls in 2D' },
		{ from: 'me', text: 'oh yeah?' },
		{ from: 'them', text: "i think i finally get it. it's like a literal infinite wall of post-its" }
	]);

	let typing = $state(true);
	let composerValue = $state('');
	/* Counter bumped each time `typing` toggles, so PromptRipple
	   fires a single big "ripple-in" / "ripple-out" burst on every
	   show/hide. Initial 0 means no burst on first render. */
	let burstSignal = $state(0);

	function toggleTyping() {
		burstSignal++;
		typing = !typing;
	}

	function send() {
		const t = composerValue.trim();
		if (!t) return;
		messages = [...messages, { from: 'me', text: t }];
		composerValue = '';
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}
</script>

<svelte:head>
	<title>Sehyo · Typing-indicator prototype</title>
</svelte:head>

<div class="page">
	<div class="frame">
		<header class="chat-header">
			<a class="back" href="/prototype">←</a>
			<span class="peer-avatar" aria-hidden="true">{PEER.avatar}</span>
			<div class="peer-meta">
				<div class="peer-name">{PEER.name}</div>
				<div class="peer-status">online</div>
			</div>
		</header>

		<div class="messages" aria-live="polite">
			{#each messages as m, i (i)}
				<div class="msg">
					<span class="msg-avatar" class:mine={m.from === 'me'} aria-hidden="true">
						{m.from === 'me' ? 'Y' : PEER.avatar}
					</span>
					<div class="msg-body">
						<div class="msg-name">{m.from === 'me' ? 'You' : PEER.name}</div>
						<div class="msg-text">{m.text}</div>
					</div>
				</div>
			{/each}

			{#if typing}
				<div class="msg" aria-label="{PEER.name} is typing">
					<span class="msg-avatar" aria-hidden="true">{PEER.avatar}</span>
					<div class="msg-body">
						<div class="msg-name">{PEER.name}</div>
						<!-- Only the typing-row gets the circle-clip transition;
						     avatar + name appear/disappear instantly with the
						     outer {#if}. Svelte waits for in-flight child
						     transitions before unmounting the parent, so the
						     reveal/conceal animation has time to play either
						     direction. -->
						<div class="typing-row" transition:circleReveal>
							<PromptRipple
								text="[TYPING...]"
								interactive={false}
								headingStyle="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 500; letter-spacing: 0.25em; line-height: 1; max-width: none; text-align: left;"
								autoRipple={{
									intervalMs: 800,
									radius: 0.04,
									strength: 1.5,
									damping: 0.945,
									/* "[TYPING...]" at 12px monospace + 0.25em
									   tracking spans ~150px in a 180px row →
									   u ≈ 0–0.83. Constrain splats inside
									   that horizontal band. */
									uRange: [0.04, 0.82],
									vRange: [0.4, 0.6]
								}}
								{burstSignal}
								burstUv={[0.3, 0.5]}
							/>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<form
			class="composer"
			onsubmit={(e) => {
				e.preventDefault();
				send();
			}}
		>
			<input
				type="text"
				bind:value={composerValue}
				onkeydown={onKey}
				placeholder="Message {PEER.name}…"
				autocomplete="off"
			/>
			<button type="submit" disabled={composerValue.trim().length === 0}>Send</button>
		</form>
	</div>

	<aside class="controls">
		<label>
			<input type="checkbox" checked={typing} onchange={toggleTyping} />
			Show {PEER.name}'s typing indicator
		</label>
	</aside>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #0a0a0a;
		color: #e4e4e7;
		font-family:
			ui-sans-serif,
			system-ui,
			sans-serif;
	}

	.page {
		min-height: 100dvh;
		padding: 32px 16px 64px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	/* Frame matches the rest of the site: hard rectangles, thin
	   border, no rounded corners. */
	.frame {
		width: 100%;
		max-width: 420px;
		height: 640px;
		display: flex;
		flex-direction: column;
		background: #0a0a0a;
		border: 1px solid #27272a;
	}

	/* ── Header ───────────────────────────────────────────────── */
	.chat-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid #27272a;
	}
	.back {
		color: #71717a;
		text-decoration: none;
		font-size: 18px;
		padding: 0 4px;
	}
	.back:hover {
		color: #e4e4e7;
	}
	.peer-avatar {
		/* Avatars stay circular — that's standard everywhere on the
		   site too. Everything ELSE is sharp. */
		width: 32px;
		height: 32px;
		border-radius: 999px;
		background: linear-gradient(135deg, #4f46e5, #ec4899);
		color: #fff;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 14px;
		flex-shrink: 0;
	}
	.peer-meta {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.peer-name {
		font-size: 14px;
		font-weight: 600;
		color: #e4e4e7;
	}
	.peer-status {
		font-size: 11px;
		color: #4ade80;
	}

	/* ── Messages ─────────────────────────────────────────────── */
	/* Sehyo-style: avatar + name + body, stacked top-down per
	   message. No bubble backgrounds, no left/right alignment
	   tricks — both sides read like a threaded conversation. */
	.messages {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 20px 16px;
	}
	.msg {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.msg-avatar {
		width: 24px;
		height: 24px;
		border-radius: 999px;
		background: linear-gradient(135deg, #4f46e5, #ec4899);
		color: #fff;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		flex-shrink: 0;
		margin-top: 2px;
	}
	.msg-avatar.mine {
		background: linear-gradient(135deg, #0ea5e9, #22d3ee);
	}
	.msg-body {
		min-width: 0;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.msg-name {
		font-size: 12px;
		font-weight: 500;
		color: #71717a;
		letter-spacing: 0;
	}
	.msg-text {
		font-size: 14px;
		line-height: 1.45;
		color: #e4e4e7;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	/* ── Typing indicator ─────────────────────────────────────── */
	/* Sized so the PromptRipple canvas has room to render the
	   "typing" text + a little surround for ripples to spread
	   into. Sits in the same column position as `.msg-text` so
	   the body alignment is identical to a regular message. */
	/* Sized for "[TYPING...]" rendered in 12px monospace with 0.25em
	   tracking — roughly 150px of text. Height bumped to ~36px so
	   there's ~12px of canvas above and below the 12px text — gives
	   ripples vertical room to expand and fade above/below the
	   glyphs instead of being clipped right at the baseline. */
	.typing-row {
		position: relative;
		width: 180px;
		height: 36px;
	}
	/* PromptRipple's .ripple-content has padding: 0 12px for the
	   hero. Strip it here so the all-caps label sits flush against
	   the left edge of the row, in line with the other .msg-text
	   elements above. */
	.typing-row :global(.ripple-content) {
		padding: 0;
		justify-content: center;
		align-items: flex-start;
	}
	/* Canvas at full opacity — text renders pure white, same
	   brightness as the surrounding message bodies. The visual
	   differentiation now comes from the monospace font + caps
	   + letter-spacing + brackets, not the color. */
	.typing-row :global(.ripple-canvas) {
		opacity: 1;
	}

	/* ── Composer ─────────────────────────────────────────────── */
	.composer {
		display: flex;
		gap: 0;
		padding: 0;
		border-top: 1px solid #27272a;
	}
	.composer input {
		flex: 1;
		appearance: none;
		border: 0;
		background: transparent;
		color: #e4e4e7;
		padding: 14px 16px;
		font: inherit;
		font-size: 14px;
		outline: none;
	}
	.composer input::placeholder {
		color: #52525b;
	}
	.composer button {
		appearance: none;
		border: 0;
		border-left: 1px solid #27272a;
		background: transparent;
		color: #e4e4e7;
		font-weight: 600;
		font-size: 13px;
		padding: 0 18px;
		cursor: pointer;
		transition: background 120ms ease;
	}
	.composer button:hover:not(:disabled) {
		background: #18181b;
	}
	.composer button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	/* ── Controls (prototype-only) ────────────────────────────── */
	.controls {
		font-size: 12px;
		color: #71717a;
		display: flex;
		gap: 12px;
	}
	.controls label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}
	.controls input {
		accent-color: #38bdf8;
	}
</style>
