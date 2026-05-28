<svelte:head>
	<title>About · Sehyo</title>
</svelte:head>

<main class="page">
	<h1 class="title">About</h1>

	<p class="lede">
		Sehyo is based on <span class="kanji">製評</span> (<i>seihyou</i>) — &ldquo;to make commentary.&rdquo;
		It is a masked timeline for posts that should not have to become part of a public identity trail.
	</p>

	<section class="manifesto">
		<p>
			Most social apps make casual expression feel reputational. A joke, a stray thought, a
			small plan, or an honest question gets attached to a real name, a polished profile, and
			an audience that may not share the context.
		</p>

		<p>
			Sehyo separates participation from exposure. Public posts use fresh masks by default,
			comments get thread-local identities, stable personas are optional, and real identity is
			only revealed through explicit grants.
		</p>

		<p>
			The product is built around posts, asks, offers, circles, and threshold plans: lightweight
			social objects that let people talk and coordinate without turning every action into
			public performance.
		</p>
	</section>

	<footer class="byline">
		<p>
			Built by <a href="https://hakanalpay.com" target="_blank" rel="noopener noreferrer">Hakan Alpay</a> and <a href="https://github.com/tfukaza" target="_blank" rel="noopener noreferrer">Tomoki Fukazawa</a>.
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
	.byline a {
		color: var(--foreground);
		text-decoration: none;
	}
	.byline a:hover { text-decoration: underline; }
</style>
