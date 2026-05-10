<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Post, { type PostData } from '../_components/Post.svelte';
	import { predictPostHeight, type Prediction } from '../_components/predictHeight';

	const TILE_WIDTH = 280;

	const variants: { label: string; post: PostData }[] = [
		{
			label: 'Text only · short',
			post: {
				id: 'demo-1',
				text: 'Cherry blossoms peaking early this year in Ueno Park.',
				displayName: 'Haru',
				handle: 'haru',
				where: 'Ueno Park',
				when: '7m ago'
			}
		},
		{
			label: 'Text only · long',
			post: {
				id: 'demo-2',
				text: 'Old bookshop in Jimbocho with a cardboard sign: "closing forever, everything 50% off." Whole inventory being carted out by hand. Stack of art monographs on the sidewalk, no one watching them.',
				displayName: 'Mei',
				handle: 'mei',
				where: 'Jimbocho',
				when: '38m ago'
			}
		},
		{
			label: 'With image · short tile',
			post: {
				id: 'demo-3',
				text: 'New mural going up on the side of the bagel shop near Bedford-Stuyvesant.',
				displayName: 'Leo',
				handle: 'leo',
				where: 'Bedford-Stuyvesant',
				when: '2h ago',
				gradient: 'linear-gradient(135deg, #4f46e5, #ec4899)',
				imageHeight: 140
			}
		},
		{
			label: 'With image · tall tile',
			post: {
				id: 'demo-4',
				text: 'Mt. Fuji visible all the way from Shinjuku skyline today. Crystal clear, no haze.',
				displayName: 'Jun',
				handle: 'jun',
				where: 'Shinjuku',
				when: '5h ago',
				gradient: 'linear-gradient(135deg, #06b6d4, #6366f1)',
				imageHeight: 240
			}
		}
	];

	let predictions = $state<Record<string, Prediction>>({});
	let measured = $state<Record<string, number>>({});
	const tileEls: Record<string, HTMLElement> = {};

	onMount(async () => {
		// Wait for fonts (Geist) to load. Without this, pretext's canvas
		// measurement will fall back to a different font than the DOM ends up
		// rendering with, causing off-by-one-line predictions.
		if (document.fonts && document.fonts.ready) {
			await document.fonts.ready;
		}

		const next: Record<string, Prediction> = {};
		for (const v of variants) {
			next[v.post.id] = predictPostHeight(v.post, TILE_WIDTH);
		}
		predictions = next;

		// Wait for the DOM to commit the rendered tiles, then measure.
		await tick();

		const measurements: Record<string, number> = {};
		for (const v of variants) {
			const el = tileEls[v.post.id];
			if (el) measurements[v.post.id] = Math.round(el.getBoundingClientRect().height);
		}
		measured = measurements;
	});

	function formatDiff(predicted?: number, actual?: number): string {
		if (predicted == null || actual == null) return '…';
		const diff = actual - predicted;
		const sign = diff > 0 ? '+' : '';
		return `${sign}${diff}px`;
	}
</script>

<svelte:head>
	<title>Sehyo · Post prototype</title>
</svelte:head>

<div class="page">
	<header>
		<h1>Post component</h1>
		<p>
			A singular post tile in isolation. Same component is reused inside the
			masonry prototype. Tile width is locked at {TILE_WIDTH}px so predictions
			are deterministic.
		</p>
		<a class="back" href="/prototype">← back to prototypes</a>
	</header>

	<div class="grid">
		{#each variants as v (v.post.id)}
			{@const pred = predictions[v.post.id]}
			{@const actual = measured[v.post.id]}
			<section class="cell">
				<div class="cell-label">{v.label}</div>
				<div class="cell-frame" style="width: {TILE_WIDTH}px">
					<div
						class="tile-host"
						bind:this={tileEls[v.post.id]}
					>
						<Post post={v.post} />
					</div>
				</div>
				<dl class="debug">
					<div><dt>image</dt><dd>{pred?.imageHeight ?? '…'}px</dd></div>
					<div>
						<dt>text</dt>
						<dd>
							{pred?.textHeight ?? '…'}px
							{#if pred}<span class="muted">({pred.textLineCount} lines)</span>{/if}
						</dd>
					</div>
					<div><dt>meta box</dt><dd>{pred?.metaHeight ?? '…'}px</dd></div>
					<div>
						<dt>chrome</dt>
						<dd>
							{pred ? pred.bodyPadding + pred.textMarginBottom + pred.border : '…'}px
							<span class="muted">(padding + margin + border)</span>
						</dd>
					</div>
					<div class="row-total">
						<dt>predicted</dt>
						<dd>{pred?.total ?? '…'}px</dd>
					</div>
					<div class="row-total">
						<dt>measured</dt>
						<dd>{actual ?? '…'}px</dd>
					</div>
					<div class="row-diff" class:row-ok={actual != null && pred && actual === pred.total}>
						<dt>diff</dt>
						<dd>{formatDiff(pred?.total, actual)}</dd>
					</div>
				</dl>
			</section>
		{/each}
	</div>
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
		max-width: 1200px;
		margin: 0 auto;
		padding: 64px 32px 96px;
	}

	header {
		margin-bottom: 40px;
	}

	h1 {
		font-size: 22px;
		font-weight: 600;
		margin: 0 0 6px;
	}

	header p {
		font-size: 13px;
		color: #a1a1aa;
		margin: 0 0 12px;
		max-width: 60ch;
	}

	.back {
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 12px;
		color: #38bdf8;
		text-decoration: none;
	}

	.back:hover {
		text-decoration: underline;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 40px 24px;
		align-items: start;
	}

	.cell {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.cell-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #71717a;
		font-family: ui-monospace, SFMono-Regular, monospace;
	}

	.tile-host {
		display: block;
	}

	.debug {
		margin: 0;
		padding: 10px 12px;
		background: #111114;
		border: 1px solid #1f1f23;
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 11px;
		color: #a1a1aa;
		display: grid;
		grid-template-columns: 1fr;
		gap: 4px;
	}

	.debug > div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}

	dt {
		color: #71717a;
	}

	dd {
		margin: 0;
		color: #e4e4e7;
		text-align: right;
	}

	.muted {
		color: #52525b;
		margin-left: 6px;
	}

	.row-total {
		border-top: 1px dashed #27272a;
		padding-top: 4px;
		margin-top: 2px;
	}

	.row-total dd {
		color: #fafafa;
		font-weight: 600;
	}

	.row-diff dd {
		color: #f97316;
		font-weight: 600;
	}

	.row-diff.row-ok dd {
		color: #22c55e;
	}
</style>
