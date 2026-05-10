<script lang="ts" module>
	export const START_CARD_WIDTH = 280;
	export const START_CARD_HEIGHT = 180;
</script>

<article class="start-card">
	<div class="start-card-eyebrow">製 SEHYO</div>
	<h2 class="start-card-title">You are here.</h2>
	<p class="start-card-body">Drag to explore. Posts spiral outward from this point.</p>
</article>

<style>
	.start-card {
		display: flex;
		flex-direction: column;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 24px 22px;
		box-sizing: border-box;
		background: #fafafa;
		border: 1px solid #e4e4e7;
		color: #0a0a0a;
		transition:
			transform 120ms ease,
			border-color 120ms ease;
	}

	.start-card:hover {
		border-color: #a1a1aa;
		transform: translateY(-1px);
	}

	.start-card-eyebrow {
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 11px;
		letter-spacing: 0.06em;
		color: #71717a;
		margin: 0 0 14px;
	}

	.start-card-title {
		font-size: 20px;
		line-height: 1.2;
		font-weight: 600;
		margin: 0 0 8px;
		color: #0a0a0a;
	}

	.start-card-body {
		font-size: 13px;
		line-height: 1.5;
		color: #52525b;
		margin: 0;
	}
</style>
