<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const archive = $derived(data.archive);

	function formatDate(iso: string) {
		const d = new Date(iso + 'T00:00:00Z');
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>{archive.prompt.text} · Sehyo</title>
</svelte:head>

<main class="page">
	<a class="back" href="/history">← History</a>
	<p class="date">{formatDate(archive.prompt.active_date)}</p>
	<h1 class="prompt">{archive.prompt.text}</h1>

	{#if archive.answers.length === 0}
		<p class="empty">No answers were posted on this day.</p>
	{:else}
		<p class="count">{archive.answers.length} answer{archive.answers.length === 1 ? '' : 's'}</p>
		<section class="answers">
			{#each archive.answers as a (a.id)}
				<article class="answer">
					<header class="author-row">
						<span class="author author-mask">{a.display_name ?? 'Anonymous'}</span>
					</header>
					<p class="answer-body">{a.content}</p>
					{#if a.comment_count > 0}
						<p class="meta">{a.comment_count} comment{a.comment_count === 1 ? '' : 's'}</p>
					{/if}
				</article>
			{/each}
		</section>
	{/if}
</main>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 120px 24px 96px;
	}
	.back {
		display: inline-block;
		font-size: 13px;
		color: var(--muted-foreground);
		text-decoration: none;
		margin-bottom: 24px;
	}
	.back:hover { color: var(--foreground); }
	.date {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted-foreground);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		margin: 0 0 8px;
	}
	.prompt {
		font-family: var(--font-sans);
		font-weight: 800;
		letter-spacing: -0.025em;
		font-size: clamp(28px, 5vw, 44px);
		line-height: 1.12;
		color: var(--foreground);
		margin: 0 0 32px;
	}
	.count {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted-foreground);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin: 0 0 12px;
	}
	.answers { display: flex; flex-direction: column; }
	.answer {
		padding: 20px 0;
		border-top: 1px solid var(--border);
	}
	.author-row {
		font-size: 13px;
		color: var(--muted-foreground);
		margin-bottom: 6px;
	}
	.author { font-weight: 600; }
	.answer-body {
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.5;
		color: var(--foreground);
		margin: 0;
		white-space: pre-wrap;
	}
	.meta {
		font-size: 12px;
		color: var(--muted-foreground);
		margin: 8px 0 0;
	}
	.empty {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
	}
</style>
