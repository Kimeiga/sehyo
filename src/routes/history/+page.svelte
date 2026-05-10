<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function formatDate(iso: string) {
		const d = new Date(iso + 'T00:00:00Z');
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function todayUTC(): string {
		const d = new Date();
		const yyyy = d.getUTCFullYear();
		const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
		const dd = String(d.getUTCDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	}
</script>

<svelte:head>
	<title>History · 製 SEHYO</title>
</svelte:head>

<main class="page">
	<h1 class="title">History</h1>
	<p class="lede">Every question, going back.</p>

	{#if data.prompts.length === 0}
		<p class="empty">No questions yet.</p>
	{:else}
		<ul class="list">
			{#each data.prompts as p (p.id)}
				<li>
					<a class="row" href="/history/{p.active_date}">
						<div class="meta">
							<span class="date">{formatDate(p.active_date)}</span>
							{#if p.active_date === todayUTC()}<span class="today">today</span>{/if}
						</div>
						<p class="question">{p.prompt_text}</p>
						<p class="count">{p.answer_count} answer{p.answer_count === 1 ? '' : 's'}</p>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 120px 24px 96px;
	}
	.title {
		font-family: var(--font-sans);
		font-weight: 800;
		letter-spacing: -0.025em;
		font-size: clamp(32px, 6vw, 48px);
		line-height: 1.05;
		margin: 0 0 8px;
	}
	.lede {
		color: var(--muted-foreground);
		margin: 0 0 40px;
		font-size: 16px;
	}
	.list { list-style: none; padding: 0; margin: 0; }
	.row {
		display: block;
		padding: 22px 0;
		border-top: 1px solid var(--border);
		text-decoration: none;
		color: var(--foreground);
		transition: opacity 120ms ease;
	}
	.row:hover { opacity: 0.7; }
	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}
	.date {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted-foreground);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.today {
		font-size: 11px;
		font-weight: 700;
		color: var(--background);
		background: var(--foreground);
		padding: 2px 8px;
		border-radius: 999px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.question {
		font-family: var(--font-sans);
		font-weight: 700;
		letter-spacing: -0.015em;
		font-size: 20px;
		line-height: 1.3;
		margin: 0 0 6px;
		color: var(--foreground);
	}
	.count {
		font-size: 13px;
		color: var(--muted-foreground);
		margin: 0;
	}
	.empty {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
	}
</style>
