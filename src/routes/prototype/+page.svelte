<script lang="ts">
	const prototypes = [
		{
			href: '/prototype/post',
			name: 'Post component',
			summary: 'A singular post tile in isolation. Reused inside the masonry.'
		},
		{
			href: '/prototype/masonry',
			name: 'Masonry canvas',
			summary: '2D-scrollable masonry of posts. Mock data, finite size.'
		},
		{
			href: '/prototype/typing-indicators',
			name: 'Typing indicators',
			summary: 'Mock chat UI for iterating on the typing-indicator animation.'
		}
	];
</script>

<svelte:head>
	<title>Sehyo · Prototypes</title>
</svelte:head>

<div class="page">
	<header>
		<h1>Prototypes</h1>
		<p>UI prototypes for Sehyo. No login required — pure front-end mocks.</p>
	</header>

	<ul>
		{#each prototypes as p (p.href)}
			<li>
				<a href={p.href}>{p.name}</a>
				<span>{p.summary}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	:global(body) {
		background: #0a0a0a;
		color: #e4e4e7;
		font-family:
			ui-sans-serif,
			system-ui,
			sans-serif;
	}

	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 64px 32px;
	}

	header {
		margin-bottom: 32px;
	}

	h1 {
		font-size: 22px;
		font-weight: 600;
		margin: 0 0 6px;
	}

	header p {
		font-size: 13px;
		color: #a1a1aa;
		margin: 0;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	li {
		display: flex;
		align-items: baseline;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 8px;
	}

	li:hover {
		background: #18181b;
	}

	a {
		color: #38bdf8;
		text-decoration: none;
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 13px;
	}

	a:hover {
		text-decoration: underline;
	}

	li span {
		color: #71717a;
		font-size: 12px;
	}
</style>
