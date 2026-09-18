<script lang="ts">
	type Context = 'Everyday' | 'Friendships' | 'Work';
	let context = $state<Context>('Everyday');
	const contexts: Context[] = ['Everyday', 'Friendships', 'Work'];
	const examples: Record<Context, { title: string; description: string; strength: string; tension: string; experiment: string }> = {
		Everyday: {
			title: 'Direct in conversation. Deliberate with your energy.',
			description: 'You may prefer a few conversations with room to go deeper over a full calendar of brief encounters.',
			strength: 'You can make space for the people and interests you care about.',
			tension: 'Waiting for the right setting can mean missing a connection you would enjoy.',
			experiment: 'Try one small invitation this week, with a clear time to head home.'
		},
		Friendships: {
			title: 'Say what you mean. Make room for how it lands.',
			description: 'Being direct can make your intentions easier to understand. A friend may still need reassurance before advice.',
			strength: 'You can bring clarity to a conversation others are avoiding.',
			tension: 'An honest answer can feel abrupt when someone wanted to be heard first.',
			experiment: 'Before giving advice, ask: “Do you want ideas, or someone to listen?”'
		},
		Work: {
			title: 'Protect thinking time. Keep others in the loop.',
			description: 'You may prefer to develop an idea before sharing it. Letting others see a rough version can help you find gaps earlier.',
			strength: 'Time to concentrate can help you explain your reasoning clearly.',
			tension: 'Working quietly can leave collaborators unsure about your progress.',
			experiment: 'Share one unfinished idea and name the question you are still working through.'
		}
	};
	const example = $derived(examples[context]);
</script>

<svelte:head>
	<title>Personality-first product preview | Sehyo</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="preview">
	<aside class="preview-note" aria-label="Preview status">
		<strong>Product preview</strong>
		<span>Example content, not a live personality test.</span>
	</aside>

	<section class="hero" aria-labelledby="hero-title">
		<p class="eyebrow">A new direction for Sehyo</p>
		<h1 id="hero-title">Understand your personality.</h1>
		<p class="intro">A clearer picture of how you think, connect, and make decisions. Start with yourself. Choose what to share.</p>
		<a class="primary-action" href="#example">See an example result <span aria-hidden="true">↗</span></a>
		<a class="secondary-action" href="/">Visit the current community <span aria-hidden="true">→</span></a>
	</section>

	<section id="example" class="result" aria-labelledby="result-title">
		<div class="section-heading">
			<div><p class="eyebrow">What a useful result could look like</p><h2 id="result-title">Beyond a type label.</h2></div>
			<span class="sample-label">Example only</span>
		</div>
		<p class="result-intro">Explore one illustrative profile in different parts of life. These descriptions are not generated from your answers.</p>
		<div class="contexts" role="group" aria-label="Example context">
			{#each contexts as item}
				<button type="button" aria-pressed={context === item} onclick={() => { context = item; }}>{item}</button>
			{/each}
		</div>
		<div class="report" aria-live="polite" aria-atomic="true">
			<p class="eyebrow">{context}</p>
			<h3>{example.title}</h3>
			<p class="description">{example.description}</p>
			<div class="dimensions">
				<div><h4>What may work for you</h4><p>{example.strength}</p></div>
				<div><h4>What to watch for</h4><p>{example.tension}</p></div>
			</div>
			<div class="experiment"><h4>Something to try</h4><p>{example.experiment}</p></div>
		</div>
		<p class="caption">Illustrative writing, not a scored result or a claim about accuracy. A real report must follow the actual test evidence.</p>
	</section>

	<section class="journey" aria-labelledby="journey-title">
		<p class="eyebrow">Proposed experience</p>
		<h2 id="journey-title">One clear path.</h2>
		<ol>
			<li><span aria-hidden="true">01</span><div><h3>Take the test</h3><p>One question at a time, with a clear stopping point.</p></div></li>
			<li><span aria-hidden="true">02</span><div><h3>Understand your result</h3><p>Readable tendencies, tradeoffs, and examples you can use.</p></div></li>
			<li><span aria-hidden="true">03</span><div><h3>Decide what to share</h3><p>Conversations come after the result, not before it.</p></div></li>
		</ol>
	</section>

	<section class="launch-note" aria-labelledby="launch-title">
		<h2 id="launch-title">The existing test comes first.</h2>
		<p>This is a direction preview. The existing questionnaire and scoring implementation still need to be located and connected. This page does not collect answers, calculate scores, or save a personality profile.</p>
		<a href="/">Back to the current Sehyo community <span aria-hidden="true">→</span></a>
	</section>
</main>

<style>
	.preview { width: min(100%, 640px); margin: 0 auto; padding: 0 20px 48px; color: var(--foreground); }
	.preview-note { display: flex; flex-wrap: wrap; column-gap: 12px; row-gap: 3px; padding: 14px 0; border-bottom: 1px solid var(--border); font-size: 12px; line-height: 1.5; color: var(--muted-foreground); }
	.preview-note strong { color: var(--foreground); font-weight: 600; }
	.hero { padding: clamp(30px, 7vw, 64px) 0 40px; }
	.eyebrow { margin: 0 0 12px; color: var(--muted-foreground); font-size: 11px; font-weight: 650; line-height: 1.5; letter-spacing: .09em; text-transform: uppercase; }
	h1 { max-width: 10ch; margin: 0; font-size: clamp(40px, 9vw, 76px); line-height: 1.02; font-weight: 550; letter-spacing: -.045em; text-wrap: balance; }
	.intro { max-width: 43ch; margin: 24px 0; color: var(--muted-foreground); font-size: 17px; line-height: 1.65; }
	.primary-action { display: flex; justify-content: space-between; align-items: center; gap: 20px; max-width: 340px; min-height: 52px; padding: 14px 18px; background: var(--primary); color: var(--primary-foreground); font-size: 15px; font-weight: 650; text-decoration: none; }
	.primary-action:hover { filter: brightness(1.1); }
	.secondary-action { display: inline-flex; align-items: center; min-height: 48px; gap: 12px; color: var(--muted-foreground); font-size: 13px; text-underline-offset: 4px; }
	.result { scroll-margin-top: 80px; border: 1px solid var(--border); }
	.section-heading { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 24px 24px 0; }
	.section-heading .eyebrow { margin-bottom: 8px; }
	h2 { margin: 0; font-size: clamp(25px, 5vw, 32px); line-height: 1.2; font-weight: 550; letter-spacing: -.025em; }
	.sample-label { flex-shrink: 0; border: 1px solid var(--border); padding: 5px 8px; font-size: 11px; color: var(--muted-foreground); }
	.result-intro { margin: 16px 24px 20px; color: var(--muted-foreground); font-size: 14px; line-height: 1.65; }
	.contexts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-block: 1px solid var(--border); }
	.contexts button { min-height: 48px; border: 0; border-right: 1px solid var(--border); padding: 12px 6px; background: transparent; color: var(--muted-foreground); font-size: 13px; cursor: pointer; }
	.contexts button:last-child { border-right: 0; }
	.contexts button[aria-pressed='true'] { background: var(--secondary); color: var(--foreground); box-shadow: inset 0 -2px var(--brand); font-weight: 650; }
	.contexts button:hover { color: var(--foreground); }
	.report { padding: 28px 24px 24px; }
	.report h3 { max-width: 24ch; margin: 0; font-size: clamp(24px, 5vw, 34px); font-weight: 500; line-height: 1.2; letter-spacing: -.025em; text-wrap: balance; }
	.description { margin: 16px 0 24px; color: var(--muted-foreground); font-size: 15px; line-height: 1.7; }
	.dimensions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--border); }
	.dimensions > div { padding: 20px 20px 20px 0; }
	.dimensions > div + div { padding-right: 0; padding-left: 20px; border-left: 1px solid var(--border); }
	h4 { margin: 0 0 8px; font-size: 13px; font-weight: 650; line-height: 1.5; }
	.dimensions p, .experiment p { margin: 0; color: var(--muted-foreground); font-size: 14px; line-height: 1.65; }
	.experiment { border-top: 1px solid var(--border); padding-top: 20px; }
	.experiment h4 { color: var(--foreground); }
	.caption { margin: 0; border-top: 1px solid var(--border); padding: 16px 24px; color: var(--muted-foreground); font-size: 12px; line-height: 1.6; }
	.journey { padding-top: 48px; }
	ol { list-style: none; padding: 0; margin: 24px 0 0; }
	li { display: grid; grid-template-columns: 40px 1fr; gap: 12px; padding: 20px 0; border-top: 1px solid var(--border); }
	li > span { color: var(--muted-foreground); font-size: 13px; font-variant-numeric: tabular-nums; }
	li h3 { margin: 0 0 5px; font-size: 17px; font-weight: 550; }
	li p { margin: 0; color: var(--muted-foreground); font-size: 14px; line-height: 1.65; }
	.launch-note { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }
	.launch-note h2 { font-size: 18px; letter-spacing: 0; }
	.launch-note p { margin: 12px 0; color: var(--muted-foreground); font-size: 13px; line-height: 1.7; }
	.launch-note a { display: inline-flex; align-items: center; gap: 12px; min-height: 44px; color: var(--foreground); font-size: 13px; text-underline-offset: 4px; }
	a:focus-visible, button:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
	@media (max-width: 400px) { .preview { padding-inline: 16px; } .intro { font-size: 16px; margin-block: 20px; } .section-heading { padding: 20px 16px 0; } .result-intro { margin-inline: 16px; } .report, .caption { padding-inline: 16px; } .dimensions { grid-template-columns: 1fr; } .dimensions > div, .dimensions > div + div { padding: 16px 0; border-left: 0; } .dimensions > div + div { border-top: 1px solid var(--border); } }
</style>
