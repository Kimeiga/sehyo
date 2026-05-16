<script lang="ts">
	/* Static visual preview of the FORUM typing indicators (the
	   .world-typing / .thread-typing labels on the home page). No
	   WebSocket, no stores, no RPCs — just the exact markup, CSS and
	   formatTyping() logic from src/routes/+page.svelte with
	   hardcoded sample data, so the visuals can be eyeballed in
	   isolation. Route: /prototype/forum-typing */

	import PromptRipple from '$lib/components/PromptRipple.svelte';

	type TypingUser = { userId: string; displayName: string };

	// Verbatim copy of formatTyping() from +page.svelte. Keep in sync.
	function formatTyping(users: TypingUser[]): string {
		if (users.length === 0) return '';
		const names = users.map((u) => u.displayName);
		if (names.length === 1) return `${names[0]} is typing…`;
		if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
		return `${names[0]}, ${names[1]}, and ${names.length - 2} other${
			names.length - 2 === 1 ? '' : 's'
		} are typing…`;
	}

	const mk = (n: number): TypingUser[] =>
		['Tab lxva', 'Mira K.', 'dashiell', 'Aoife', 'Theron', 'Yael']
			.slice(0, n)
			.map((displayName, i) => ({ userId: 'u' + i, displayName }));

	const cases = [0, 1, 2, 3, 5];

	// Interactive row: toggle visibility + typer count to inspect the
	// 180ms opacity fade and the green "sending" composer halo.
	let liveVisible = $state(true);
	let liveCount = $state(1);
	let sending = $state(false);

	// Ripple variant: render the same typing string through the
	// WebGL PromptRipple (the component already used by the DM
	// typing-indicator prototype). `interactive={false}` so no
	// pointer noise; a gentle autoRipple makes the glyphs shimmer
	// like raindrops on a puddle. burstSignal fires one bigger
	// ring each time it (re)appears.
	let rippleVisible = $state(true);
	let rippleCount = $state(1);
	let rippleBurst = $state(1);
	function toggleRipple() {
		rippleVisible = !rippleVisible;
		if (rippleVisible) rippleBurst++;
	}
	const SUBTLE_RIPPLE = {
		intervalMs: 1000,
		radius: 0.035,
		strength: 1.2,
		damping: 0.94,
		// "<name> is typing…" in 13px sans ≈ 60% of the row width;
		// keep splats on the glyph band, not the empty surround.
		uRange: [0.06, 0.78] as [number, number],
		vRange: [0.42, 0.58] as [number, number]
	};
</script>

<svelte:head><title>Prototype — forum typing indicators</title></svelte:head>

<div class="wrap">
	<h1>Forum typing indicators</h1>
	<p class="sub">
		Static preview of <code>.world-typing</code> / <code>.thread-typing</code> +
		<code>formatTyping()</code>. No sockets. Mirrors <code>src/routes/+page.svelte</code>.
	</p>

	<section>
		<h2>World composer — <code>.world-typing</code> (centered, 13px)</h2>
		{#each cases as n (n)}
			<div class="demo-row">
				<span class="tag">{n} typer{n === 1 ? '' : 's'}</span>
				<p class="world-typing" class:visible={n > 0}>{formatTyping(mk(n))}</p>
			</div>
		{/each}
	</section>

	<section>
		<h2>Per-thread — <code>.thread-typing</code> (left-aligned, 12px)</h2>
		{#each cases as n (n)}
			<div class="demo-row">
				<span class="tag">{n} typer{n === 1 ? '' : 's'}</span>
				<p class="thread-typing" class:visible={n > 0}>{formatTyping(mk(n))}</p>
			</div>
		{/each}
	</section>

	<section>
		<h2>Interactive — fade transition + sending halo</h2>
		<div class="controls">
			<button onclick={() => (liveVisible = !liveVisible)}>
				toggle visible ({liveVisible ? 'on' : 'off'})
			</button>
			<button onclick={() => (liveCount = (liveCount % 5) + 1)}>
				cycle count ({liveCount})
			</button>
			<button onclick={() => (sending = !sending)}>
				toggle sending halo ({sending ? 'on' : 'off'})
			</button>
		</div>
		<p class="world-typing" class:visible={liveVisible}>{formatTyping(mk(liveCount))}</p>
		<textarea
			class:typing-sending={sending}
			rows="3"
			placeholder="What's on your mind?"
		></textarea>
	</section>

	<section>
		<h2>With ripple — <code>PromptRipple</code> (WebGL, subtle autoRipple)</h2>
		<p class="note">
			The same string rendered through the wave-equation ripple component
			(<code>interactive=false</code>, gentle <code>autoRipple</code>). This is
			the candidate effect for the real indicator — eyeball it before wiring in.
		</p>

		<div class="demo-row">
			<span class="tag">1 typer</span>
			<div class="ripple-slot">
				<PromptRipple
					text={formatTyping(mk(1))}
					interactive={false}
					headingStyle="font-family: var(--font-sans); font-size: 13px; font-weight: 400; line-height: 1; max-width: none; text-align: left;"
					autoRipple={SUBTLE_RIPPLE}
				/>
			</div>
		</div>

		<div class="demo-row">
			<span class="tag">3 typers</span>
			<div class="ripple-slot wide">
				<PromptRipple
					text={formatTyping(mk(3))}
					interactive={false}
					headingStyle="font-family: var(--font-sans); font-size: 13px; font-weight: 400; line-height: 1; max-width: none; text-align: left;"
					autoRipple={SUBTLE_RIPPLE}
				/>
			</div>
		</div>

		<div class="controls" style="margin-top:16px">
			<button onclick={toggleRipple}>
				toggle ripple indicator ({rippleVisible ? 'on' : 'off'})
			</button>
			<button onclick={() => (rippleCount = (rippleCount % 5) + 1)}>
				cycle count ({rippleCount})
			</button>
		</div>
		{#if rippleVisible}
			<div class="ripple-slot wide">
				<PromptRipple
					text={formatTyping(mk(rippleCount))}
					interactive={false}
					headingStyle="font-family: var(--font-sans); font-size: 13px; font-weight: 400; line-height: 1; max-width: none; text-align: left;"
					autoRipple={SUBTLE_RIPPLE}
					burstSignal={rippleBurst}
					burstUv={[0.3, 0.5]}
				/>
			</div>
		{/if}
	</section>
</div>

<style>
	.wrap {
		max-width: 680px;
		margin: 0 auto;
		padding: 48px 20px 120px;
		font-family: var(--font-sans);
		color: var(--foreground);
	}
	h1 {
		font-weight: 200;
		font-size: 32px;
		letter-spacing: -0.02em;
		margin: 0 0 4px;
	}
	.sub {
		color: var(--muted-foreground);
		font-size: 14px;
		margin: 0 0 32px;
	}
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.88em;
		background: color-mix(in srgb, var(--foreground) 8%, transparent);
		padding: 1px 5px;
		border-radius: 4px;
	}
	section {
		border-top: 1px solid var(--border);
		padding: 24px 0;
	}
	h2 {
		font-weight: 400;
		font-size: 15px;
		color: var(--muted-foreground);
		margin: 0 0 16px;
	}
	.demo-row {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 6px 0;
		border-bottom: 1px dashed color-mix(in srgb, var(--border) 60%, transparent);
	}
	.tag {
		flex: 0 0 84px;
		font-size: 11px;
		color: var(--muted-foreground);
		font-family: ui-monospace, monospace;
	}
	.controls {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin: 0 0 16px;
	}
	.controls button {
		font-family: var(--font-sans);
		font-size: 13px;
		padding: 6px 12px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: transparent;
		color: var(--foreground);
		cursor: pointer;
	}
	.controls button:hover {
		background: color-mix(in srgb, var(--foreground) 6%, transparent);
	}
	textarea {
		width: 100%;
		margin-top: 8px;
		padding: 12px 14px;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--foreground);
		font-family: var(--font-sans);
		font-size: 16px;
		resize: vertical;
		box-sizing: border-box;
	}

	/* ── Verbatim from +page.svelte (keep in sync) ───────────────── */
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
	.world-typing.visible {
		opacity: 1;
	}
	.thread-typing {
		font-family: var(--font-sans);
		font-size: 12px;
		color: var(--muted-foreground);
		margin: 4px 0 0;
		min-height: 1.2em;
		opacity: 0;
		transition: opacity 180ms ease;
	}
	.thread-typing.visible {
		opacity: 1;
	}
	textarea.typing-sending {
		border-color: #7ee787 !important;
		box-shadow: 0 0 0 2px rgba(126, 231, 135, 0.35);
		transition:
			border-color 120ms ease,
			box-shadow 120ms ease;
	}

	/* ── Ripple variant ──────────────────────────────────────────
	   The WebGL canvas needs explicit room: enough width for the
	   longest string + a little vertical surround so ripples can
	   spread above/below the 13px glyphs instead of clipping at
	   the baseline. */
	.note {
		font-size: 13px;
		color: var(--muted-foreground);
		margin: 0 0 16px;
		line-height: 1.5;
	}
	.ripple-slot {
		position: relative;
		width: 240px;
		height: 34px;
	}
	.ripple-slot.wide {
		width: 440px;
		max-width: 100%;
	}
	/* Strip PromptRipple's hero padding so the label sits flush
	   left, and keep the canvas fully opaque (the muted tone for a
	   real wire-in would come from a lower canvas opacity). */
	.ripple-slot :global(.ripple-content) {
		padding: 0;
		justify-content: flex-start;
		align-items: center;
	}
	.ripple-slot :global(.ripple-canvas) {
		opacity: 0.72;
	}
</style>
