import type { RequestHandler } from './$types';

/**
 * Dynamic OG image: 1200x630 PNG showing today's prompt rendered with
 * Geist (thin headline) + M PLUS 2 (kanji logo). The same daily-prompt
 * text that appears on the home page lands in the link preview.
 *
 * Cached at the edge for 1 hour. The prompt rotates once per day UTC,
 * so the OG image lags by at most an hour after rotation.
 */

function todayUTC(): string {
	const d = new Date();
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

// workers-og's HTML parser does NOT decode numeric/named entities, so
// classic HTML escaping (e.g. ' -> &#39;) ends up rendered literally.
// We just strip the two characters that could actually break tag
// parsing; the prompt is AI-generated and never contains them in
// practice.
function safeText(s: string): string {
	return s.replace(/[<>]/g, '');
}

export const GET: RequestHandler = async ({ platform }) => {
	// Dynamic import so Vite doesn't try to resolve the bundled WASM at
	// SSR-build time. workers-og lazy-loads its yoga + resvg WASM at first
	// invocation in the Worker runtime.
	const { ImageResponse, loadGoogleFont } = await import('workers-og');

	const db = platform?.env?.DB;
	let promptText = 'A daily question. Share your thoughts.';
	if (db) {
		const row = await db
			.prepare('SELECT prompt_text FROM daily_prompts WHERE active_date = ?')
			.bind(todayUTC())
			.first<{ prompt_text: string }>();
		if (row?.prompt_text) promptText = row.prompt_text;
	}

	const [geistLight, geistMid, mplusBold] = await Promise.all([
		// 200 (ExtraLight / "ultralight") reads better than 100 (Thin)
		// at link-preview sizes (~250px wide in most chat apps) without
		// going as solid as 300 (Light).
		loadGoogleFont({ family: 'Geist', weight: 200 }),
		loadGoogleFont({ family: 'Geist', weight: 500 }),
		loadGoogleFont({ family: 'M PLUS 2', weight: 700 })
	]);

	const safe = safeText(promptText);

	const html = `
		<div style="display:flex; flex-direction:column; justify-content:space-between; width:100%; height:100%; padding:72px 80px; background:#0a0a0a; font-family:Geist;">
			<div style="display:flex; align-items:center; gap:24px;">
				<div style="display:flex; align-items:center; justify-content:center; background:#00A5D8; border-radius:22px; width:88px; height:88px; font-family:'M PLUS 2'; font-weight:700; font-size:64px; color:white; line-height:1;">製</div>
				<span style="font-size:24px; color:#888; font-weight:500; letter-spacing:0.08em; text-transform:uppercase;">Today on sehyo.com</span>
			</div>
			<div style="display:flex; flex-direction:column;">
				<h1 style="font-size:72px; font-weight:200; line-height:1.08; color:#f5f5f5; margin:0; letter-spacing:-0.02em;">${safe}</h1>
			</div>
			<div style="display:flex; justify-content:flex-end;">
				<span style="font-size:26px; color:#888; font-weight:500;">Share your thoughts on sehyo.com</span>
			</div>
		</div>
	`;

	const response = await new ImageResponse(html, {
		width: 1200,
		height: 630,
		fonts: [
			{ name: 'Geist',     data: geistLight, weight: 200, style: 'normal' },
			{ name: 'Geist',     data: geistMid,   weight: 500, style: 'normal' },
			{ name: 'M PLUS 2',  data: mplusBold,  weight: 700, style: 'normal' }
		]
	});

	// Wrap to add caching headers; ImageResponse already sets content-type.
	return new Response(response.body, {
		status: response.status,
		headers: {
			...Object.fromEntries(response.headers),
			// Short cache so design iterations and the daily-prompt
			// rollover surface within 5 minutes. Once the layout settles
			// we can bump this back to an hour.
			'Cache-Control': 'public, max-age=300, s-maxage=300'
		}
	});
};
