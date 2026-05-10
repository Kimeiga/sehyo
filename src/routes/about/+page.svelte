<svelte:head>
	<title>About · Sehyo</title>
</svelte:head>

<main class="page">
	<h1 class="title">About</h1>

	<p class="lede">
		Sehyo is based on <span class="kanji">製評</span> (<i>seihyou</i>) — &ldquo;to make commentary.&rdquo;
		The goal is to become the most human social media on earth™.
	</p>

	<section class="manifesto">
		<p>
			Humanity is in a loneliness crisis. We spend our days scrolling and consuming content,
			but when we try to share our thoughts we don't know where to go — every social media
			we're on now is designed to reward virality. It's hard to be seen or heard when you
			just want to share what you really think about something.
		</p>

		<p>
			There are places like Medium and Substack, but the activation energy is high because
			they're meant for formal articles. Maybe you have a thought, but you don't necessarily
			have a full dissertation on it.
		</p>

		<p>
			Sehyo is trying to create a space where people can share what they really think and
			how they really feel about things — in a calm, thoughtful place where your friends
			can hear what you actually think, and where you might make new ones.
		</p>
	</section>

	<footer class="byline">
		Built by <a href="https://hakanalpay.com" target="_blank" rel="noopener noreferrer">Hakan Alpay</a>.
	</footer>
</main>

<style>
	.page {
		min-height: 100dvh;
		max-width: 640px;
		margin: 0 auto;
		padding: 80px 12px 96px;
	}
	.title {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.025em;
		font-size: clamp(40px, 7vw, 64px);
		line-height: 1.05;
		color: var(--foreground);
		margin: 0 0 24px;
	}
	.lede {
		font-size: 18px;
		line-height: 1.55;
		color: var(--foreground);
		margin: 0 0 40px;
	}
	.kanji {
		font-family: var(--font-jp);
		font-weight: 700;
		font-size: 1.05em;
		color: var(--primary);
	}
	.manifesto {
		display: flex;
		flex-direction: column;
		gap: 20px;
		font-size: 16px;
		line-height: 1.65;
		color: var(--foreground);
	}
	.manifesto p { margin: 0; }
	.byline {
		margin-top: 56px;
		padding-top: 24px;
		border-top: 1px solid var(--border);
		font-size: 14px;
		color: var(--muted-foreground);
	}
	.byline a {
		color: var(--foreground);
		text-decoration: none;
	}
	.byline a:hover { text-decoration: underline; }
</style>
