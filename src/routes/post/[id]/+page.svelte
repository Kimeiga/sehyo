<script lang="ts">
	import type { PageProps } from './$types';
	import { ArrowLeft, MessageCircle } from 'lucide-svelte';

	let { data }: PageProps = $props();
	const p = $derived(data.post);
	const tops = $derived((data.comments ?? []).filter((c) => c.parent_comment_id === null));
	function childrenOf(id: string) {
		return (data.comments ?? []).filter((c) => c.parent_comment_id === id);
	}

	function avatarFor(image: string | null | undefined, seed: string): string {
		return image ?? `https://i.pravatar.cc/200?u=${encodeURIComponent(seed)}`;
	}
</script>

<svelte:head>
	<title>{p.display_name ?? '@' + (p.username ?? 'user')} on Sehyo</title>
</svelte:head>

<main class="page">
	<a class="back" href={p.username ? `/${p.username}` : '/'}>
		<ArrowLeft size="16" strokeWidth="2" />
		<span>Back</span>
	</a>

	{#if p.prompt_id && p.prompt_text}
		<p class="context-eyebrow">Answered the daily question</p>
		<h1 class="context-prompt">{p.prompt_text}</h1>
	{:else if p.is_question}
		<p class="context-eyebrow">Asked</p>
	{:else}
		<p class="context-eyebrow">Posted</p>
	{/if}

	<article class="row">
		<div class="row-left">
			<a href={p.username ? `/${p.username}` : '#'}>
				<span class="avatar">
					<img src={avatarFor(p.image, p.user_id)} alt="" draggable="false" />
				</span>
			</a>
		</div>
		<div class="row-main">
			<header class="meta">
				{#if p.username}
					<a class="name" href="/{p.username}">{p.display_name ?? 'Anonymous'}</a>
					<a class="handle" href="/{p.username}">@{p.username}</a>
				{:else}
					<span class="name">{p.display_name ?? 'Anonymous'}</span>
				{/if}
			</header>
			{#if p.is_question}
				<h2 class="question">{p.content}</h2>
			{:else}
				<p class="body">{p.content}</p>
			{/if}
		</div>
	</article>

	{#if tops.length > 0}
		<h3 class="comments-title">Comments</h3>
		<ul class="thread">
			{#each tops as c (c.id)}
				<li class="thread-item">
					<a class="thread-link" href="/comment/{c.id}">
						<div class="row">
							<div class="row-left">
								<span class="avatar small">
									<img src={avatarFor(c.user?.profile_picture_url, c.user_id)} alt="" draggable="false" />
								</span>
							</div>
							<div class="row-main">
								<header class="meta">
									<span class="name">{c.user?.display_name ?? 'Anonymous'}</span>
									{#if c.user?.username}<span class="handle">@{c.user.username}</span>{/if}
								</header>
								<p class="body">{c.content}</p>
							</div>
						</div>
					</a>
					{#if childrenOf(c.id).length > 0}
						<ul class="thread nested">
							{#each childrenOf(c.id) as kid (kid.id)}
								<li class="thread-item">
									<a class="thread-link" href="/comment/{kid.id}">
										<div class="row">
											<div class="row-left">
												<span class="avatar small">
													<img src={avatarFor(kid.user?.profile_picture_url, kid.user_id)} alt="" draggable="false" />
												</span>
											</div>
											<div class="row-main">
												<header class="meta">
													<span class="name">{kid.user?.display_name ?? 'Anonymous'}</span>
													{#if kid.user?.username}<span class="handle">@{kid.user.username}</span>{/if}
												</header>
												<p class="body">{kid.content}</p>
											</div>
										</div>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">
			<MessageCircle size="14" strokeWidth="1.7" />
			<span>No comments yet.</span>
		</p>
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

	.context-eyebrow {
		font-size: 12px;
		font-weight: 600;
		color: var(--muted-foreground);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin: 0 0 8px;
	}
	.context-prompt {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.022em;
		font-size: clamp(24px, 4vw, 36px);
		line-height: 1.15;
		color: var(--foreground);
		margin: 0 0 20px;
	}

	.row {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
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
	.question {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.018em;
		font-size: clamp(22px, 3.4vw, 30px);
		line-height: 1.18;
		color: var(--foreground);
		margin: 4px 0 0;
	}

	.comments-title {
		font-family: var(--font-sans);
		font-weight: 100;
		font-size: 22px;
		margin: 32px 0 12px;
		color: var(--foreground);
	}
	.thread { list-style: none; padding: 0; margin: 0; }
	.thread.nested { padding: 8px 0 0 48px; }
	.thread-item { padding: 12px 0; border-top: 1px solid var(--border); }
	.thread-link { display: block; text-decoration: none; color: inherit; }
	.thread-link:hover .row { opacity: 0.85; }

	.empty {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted-foreground);
		font-style: italic;
		padding: 24px 0;
		font-size: 14px;
	}
</style>
