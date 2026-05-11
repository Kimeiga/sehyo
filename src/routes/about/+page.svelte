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
		<p>
			Built by <a href="https://hakanalpay.com" target="_blank" rel="noopener noreferrer">Hakan Alpay</a> and <a href="https://github.com/tfukaza" target="_blank" rel="noopener noreferrer">Tomoki Fukazawa</a>.
		</p>
		<p class="credit">
			Sky texture: photos by
			<a
				href="https://unsplash.com/@cspek?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText"
				target="_blank"
				rel="noopener noreferrer"
			>Chris Nguyen</a>
			(<a
				href="https://unsplash.com/photos/blue-sky-and-white-clouds-lbmrrNgq2lo?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText"
				target="_blank"
				rel="noopener noreferrer"
			>source</a>),
			<a
				href="https://unsplash.com/@leronep?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText"
				target="_blank"
				rel="noopener noreferrer"
			>Lerone Pieters</a>
			(<a
				href="https://unsplash.com/photos/panoramic-photography-of-sunset-at-the-city-g0enUw24TBI?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText"
				target="_blank"
				rel="noopener noreferrer"
			>source</a>),
			and
			<a
				href="https://unsplash.com/@mnelson?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText"
				target="_blank"
				rel="noopener noreferrer"
			>Matt Nelson</a>
			(<a
				href="https://unsplash.com/photos/aerial-view-of-city-lights-and-z4X3yABcf5g?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText"
				target="_blank"
				rel="noopener noreferrer"
			>source</a>)
			on Unsplash.
		</p>
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
	.byline p { margin: 0 0 6px; }
	.byline p:last-child { margin-bottom: 0; }
	.byline .credit {
		font-size: 12px;
		opacity: 0.75;
	}
	.byline a {
		color: var(--foreground);
		text-decoration: none;
	}
	.byline a:hover { text-decoration: underline; }
</style>
