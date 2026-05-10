<script lang="ts" module>
	export type PostData = {
		id: string;
		text: string;
		displayName: string;
		handle: string;
		where: string;
		when: string;
		gradient?: string;
		imageHeight?: number;
	};
</script>

<script lang="ts">
	type Props = {
		post: PostData;
		highlight?: boolean;
	};

	let { post, highlight = false }: Props = $props();
</script>

<article class="tile" class:tile-highlight={highlight}>
	{#if post.gradient}
		<div
			class="tile-image"
			style="background: {post.gradient}; height: {post.imageHeight ?? 160}px"
		></div>
	{/if}
	<div class="tile-body">
		<p class="tile-text">{post.text}</p>
		<div class="tile-meta-box">
			<div class="tile-meta-row meta-primary">
				<span class="meta-name">{post.displayName}</span>
				<span class="meta-dot">·</span>
				<span class="meta-where">{post.where}</span>
				<span class="meta-dot">·</span>
				<span class="meta-when">{post.when}</span>
			</div>
			<div class="tile-meta-row meta-handle">@{post.handle}</div>
		</div>
	</div>
</article>

<style>
	.tile {
		display: block;
		break-inside: avoid;
		background: #18181b;
		border: 1px solid #27272a;
		overflow: hidden;
		color: #e4e4e7;
		transition:
			transform 120ms ease,
			border-color 120ms ease;
	}

	.tile:hover {
		border-color: #3f3f46;
		transform: translateY(-1px);
	}

	.tile-image {
		width: 100%;
	}

	.tile-body {
		padding: 12px 14px 14px;
	}

	.tile-text {
		/* Use a concrete loaded font (not ui-sans-serif) so that pretext's
		   canvas measurement matches the rendered glyph metrics exactly. */
		font-family: Geist, sans-serif;
		font-size: 14px;
		line-height: 21px;
		margin: 0 0 12px;
		color: #e4e4e7;
		font-weight: 400;
	}

	.tile-meta-box {
		height: 36px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		overflow: hidden;
	}

	.tile-meta-row {
		height: 16px;
		line-height: 16px;
		font-size: 11px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta-primary {
		color: #a1a1aa;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.meta-name {
		color: #e4e4e7;
		font-weight: 600;
	}

	.meta-dot {
		color: #52525b;
	}

	.meta-handle {
		color: #71717a;
		font-family: ui-monospace, SFMono-Regular, monospace;
	}

	/* Debug variant: inverted theme used to mark local-anchor cards in the
	   masonry prototype. Keeps the same dimensions/typography so prediction
	   still holds. */
	.tile-highlight {
		background: #fafafa;
		border-color: #e4e4e7;
		color: #0a0a0a;
	}
	.tile-highlight:hover {
		border-color: #a1a1aa;
	}
	.tile-highlight .tile-text {
		color: #0a0a0a;
	}
	.tile-highlight .meta-primary {
		color: #52525b;
	}
	.tile-highlight .meta-name {
		color: #0a0a0a;
	}
	.tile-highlight .meta-dot {
		color: #a1a1aa;
	}
	.tile-highlight .meta-handle {
		color: #71717a;
	}
</style>
