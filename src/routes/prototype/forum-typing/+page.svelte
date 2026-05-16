<script lang="ts">
	/* Static visual preview of the FORUM typing indicators (the
	   .world-typing / .thread-typing labels on the home page). No
	   WebSocket, no stores, no RPCs — just the exact markup, CSS and
	   formatTyping() logic from src/routes/+page.svelte with
	   hardcoded sample data, so the visuals can be eyeballed in
	   isolation. Route: /prototype/forum-typing */

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
</style>
