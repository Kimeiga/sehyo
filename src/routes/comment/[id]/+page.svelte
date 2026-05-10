<script lang="ts">
	import type { PageProps } from './$types';
	import { ArrowLeft } from 'lucide-svelte';

	let { data }: PageProps = $props();
	const c = $derived(data.comment);
	const p = $derived(data.post);
	const parent = $derived(data.parentComment);
	const replies = $derived(data.replies ?? []);

	function avatarFor(image: string | null | undefined, seed: string): string {
		return image ?? `https://i.pravatar.cc/200?u=${encodeURIComponent(seed)}`;
	}
</script>

<svelte:head>
	<title>Comment by {c.display_name ?? '@' + (c.username ?? 'user')} · Sehyo</title>
</svelte:head>

<main class="page">
	<a class="back" href="/post/{c.post_id}">
		<ArrowLeft size="16" strokeWidth="2" />
		<span>Back to post</span>
	</a>

	<!-- Context: the post this comment lives under -->
	{#if p}
		<a class="context-link" href="/post/{p.id}">
			{#if p.prompt_text}
				<p class="context-eyebrow">In response to the daily question</p>
				<p class="context-prompt">{p.prompt_text}</p>
			{:else if p.is_question}
				<p class="context-eyebrow">Asked by @{p.post_author_username ?? 'user'}</p>
				<p class="context-snippet">{p.content}</p>
			{:else}
				<p class="context-eyebrow">Posted by @{p.post_author_username ?? 'user'}</p>
				<p class="context-snippet">{p.content}</p>
			{/if}
		</a>
	{/if}

	<!-- Parent comment, if this is a nested reply -->
	{#if parent}
		<a class="parent-link" href="/comment/{parent.id}">
			<div class="row faded">
				<div class="row-left">
					<span class="avatar small">
						<img src={avatarFor(parent.image, parent.user_id)} alt="" draggable="false" />
					</span>
				</div>
				<div class="row-main">
					<header class="meta">
						{#if parent.username}
							<span class="name">{parent.display_name ?? 'Anonymous'}</span>
							<span class="handle">@{parent.username}</span>
						{:else}
							<span class="name">{parent.display_name ?? 'Anonymous'}</span>
						{/if}
					</header>
					<p class="body">{parent.content}</p>
				</div>
			</div>
		</a>
		<div class="thread-line" aria-hidden="true"></div>
	{/if}

	<!-- The comment itself -->
	<article class="row primary">
		<div class="row-left">
			<a href={c.username ? `/${c.username}` : '#'}>
				<span class="avatar">
					<img src={avatarFor(c.image, c.user_id)} alt="" draggable="false" />
				</span>
			</a>
		</div>
		<div class="row-main">
			<header class="meta">
				{#if c.username}
					<a class="name" href="/{c.username}">{c.display_name ?? 'Anonymous'}</a>
					<a class="handle" href="/{c.username}">@{c.username}</a>
				{:else}
					<span class="name">{c.display_name ?? 'Anonymous'}</span>
				{/if}
			</header>
			<p class="body big">{c.content}</p>
		</div>
	</article>

	<!-- Replies to this comment -->
	{#if replies.length > 0}
		<h3 class="replies-title">Replies</h3>
		<ul class="thread">
			{#each replies as r (r.id)}
				<li class="thread-item">
					<a class="thread-link" href="/comment/{r.id}">
						<div class="row">
							<div class="row-left">
								<span class="avatar small">
									<img src={avatarFor(r.image, r.user_id)} alt="" draggable="false" />
								</span>
							</div>
							<div class="row-main">
								<header class="meta">
									<span class="name">{r.display_name ?? 'Anonymous'}</span>
									{#if r.username}<span class="handle">@{r.username}</span>{/if}
								</header>
								<p class="body">{r.content}</p>
							</div>
						</div>
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
		padding: 80px 12px 96px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--muted-foreground);
		text-decoration: none;
		font-size: 13px;
		margin-bottom: 12px;
	}
	.back:hover { color: var(--foreground); }

	.context-link {
		display: block;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--card);
		text-decoration: none;
		color: inherit;
		margin-bottom: 12px;
	}
	.context-link:hover { background: var(--muted); }
	.context-eyebrow {
		font-size: 11px;
		font-weight: 600;
		color: var(--muted-foreground);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin: 0 0 4px;
	}
	.context-prompt {
		font-family: var(--font-sans);
		font-weight: 100;
		font-size: 18px;
		line-height: 1.2;
		color: var(--foreground);
		margin: 0;
	}
	.context-snippet {
		font-size: 14px;
		color: var(--foreground);
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.parent-link {
		display: block;
		text-decoration: none;
		color: inherit;
	}
	.row.faded { opacity: 0.7; padding: 12px 0; }
	.parent-link:hover .row.faded { opacity: 1; }
	.thread-line {
		width: 2px;
		height: 16px;
		background: var(--border);
		margin-left: 19px;
	}

	.row { display: flex; gap: 8px; align-items: flex-start; }
	.row.primary { padding: 16px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
	.row-left { flex-shrink: 0; width: 40px; }
	.row-main { flex: 1; min-width: 0; }
	.avatar {
		display: block;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--muted);
		user-select: none;
	}
	.avatar.small { width: 32px; height: 32px; }
	.avatar img { display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }

	.meta {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
		margin: 0 0 2px;
	}
	.name {
		font-weight: 600;
		font-size: 15px;
		color: var(--foreground);
		text-decoration: none;
	}
	.name:hover { text-decoration: underline; }
	.handle {
		font-size: 13px;
		color: var(--muted-foreground);
		text-decoration: none;
	}
	.handle:hover { text-decoration: underline; }
	.body {
		font-size: 16px;
		line-height: 1.55;
		color: var(--foreground);
		margin: 2px 0 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}
	.body.big { font-size: 18px; }

	.replies-title {
		font-family: var(--font-sans);
		font-weight: 100;
		font-size: 20px;
		margin: 28px 0 8px;
		color: var(--foreground);
	}
	.thread { list-style: none; padding: 0; margin: 0; }
	.thread-item { padding: 12px 0; border-top: 1px solid var(--border); }
	.thread-link { display: block; text-decoration: none; color: inherit; }
	.thread-link:hover .row { opacity: 0.85; }
</style>
