<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const u = $derived(data.profileUser);

	function formatDate(iso: string | null) {
		if (!iso) return '';
		const d = new Date(iso + 'T00:00:00Z');
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>{u.name ?? `@${u.username}`} · Sehyo</title>
</svelte:head>

<main class="page">
	<header class="profile-header">
		<h1 class="display-name">{u.name ?? '—'}</h1>
		<p class="handle">@{u.username}</p>
		{#if u.bio}<p class="bio">{u.bio}</p>{/if}
	</header>

	{#if data.posts.length === 0}
		<p class="empty">Nothing yet.</p>
	{:else}
		<section class="feed">
			{#each data.posts as p (p.id)}
				<article class="entry">
					{#if p.prompt_id && p.prompt_text}
						<p class="entry-meta">
							<span class="entry-tag">Answered</span>
							<span class="entry-date">{formatDate(p.prompt_active_date)}</span>
						</p>
						<h3 class="entry-prompt">{p.prompt_text}</h3>
						<p class="entry-body">{p.content}</p>
					{:else if p.is_question}
						<p class="entry-meta">
							<span class="entry-tag">Asked</span>
						</p>
						<h3 class="entry-question">{p.content}</h3>
					{:else}
						<p class="entry-meta">
							<span class="entry-tag">Posted</span>
						</p>
						<p class="entry-body">{p.content}</p>
					{/if}
					{#if p.comment_count > 0}
						<p class="entry-foot">{p.comment_count} comment{p.comment_count === 1 ? '' : 's'}</p>
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

	.profile-header {
		margin-bottom: 56px;
	}
	.display-name {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.025em;
		font-size: clamp(40px, 7vw, 64px);
		line-height: 1.05;
		color: var(--foreground);
		margin: 0 0 4px;
	}
	.handle {
		font-size: 15px;
		color: var(--muted-foreground);
		margin: 0 0 16px;
		font-weight: 500;
	}
	.bio {
		font-size: 16px;
		color: var(--foreground);
		line-height: 1.5;
		margin: 0;
		max-width: 540px;
	}

	.feed {
		display: flex;
		flex-direction: column;
	}
	.entry {
		padding: 24px 0;
		border-top: 1px solid var(--border);
	}
	.entry-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 8px;
	}
	.entry-tag {
		font-size: 11px;
		font-weight: 600;
		color: var(--muted-foreground);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.entry-date {
		font-size: 11px;
		color: var(--muted-foreground);
	}
	.entry-prompt,
	.entry-question {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.018em;
		font-size: clamp(22px, 3.5vw, 30px);
		line-height: 1.15;
		color: var(--foreground);
		margin: 0 0 12px;
	}
	.entry-body {
		font-family: var(--font-sans);
		font-size: 16px;
		line-height: 1.55;
		color: var(--foreground);
		margin: 0;
		white-space: pre-wrap;
	}
	.entry-foot {
		font-size: 12px;
		color: var(--muted-foreground);
		margin: 10px 0 0;
	}

	.empty {
		text-align: center;
		color: var(--muted-foreground);
		padding: 40px 0;
	}
</style>
