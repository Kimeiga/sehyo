<script lang="ts">
	import { onMount } from 'svelte';
	import Post, { type PostData } from '../_components/Post.svelte';
	import StartCard, {
		START_CARD_HEIGHT,
		START_CARD_WIDTH
	} from '../_components/StartCard.svelte';
	import { predictPostHeight } from '../_components/predictHeight';
	import { spiralLayout, type Placed } from '../_lib/spiralLayout';

	type LayoutItem =
		| { id: string; kind: 'start' }
		| { id: string; kind: 'post'; post: PostData };

	const POST_TEXTS = [
		'Subway car stuck between Shibuya and Omotesando — packed.',
		'Power flicker in Brooklyn around 11:47pm. Anyone else?',
		'Cherry blossoms peaking early this year in Ueno Park.',
		'Long line outside the new ramen spot in Shimokitazawa, ~40 min wait.',
		'Smoke visible from BQE going east — not sure where the source is.',
		'Free coffee being handed out at the new Blue Bottle on 3rd Ave. They had a soft launch and overshot the staffing, so the manager came out and started giving away cortados to the line.',
		'Marching band crossing Brooklyn Bridge — Saturday parade prep?',
		'Construction starting on the corner of 5th and Atlantic. Lots of noise.',
		'Heavy rain in Setagaya for the last 30 minutes. Drains overflowing on Chitose-Karasuyama.',
		'Saw a fox outside Kichijoji station around 6am. Just sitting there.',
		'New mural going up on the side of the bagel shop near Bedford-Stuyvesant.',
		'Mt. Fuji visible all the way from Shinjuku skyline today. Crystal clear, no haze.',
		'Big crowd gathering outside the Apple Store in Ginza. New product launch?',
		'Power outage on the F line — train just held at York Street for 25 min. Conductor came on the PA twice but couldn’t hear over the AC.',
		'Pop-up food market in Yoyogi Park, Saturday only. Korean, Thai, Mexican stalls.',
		'Cat that lives in the bookshop near Jimbocho station has had kittens.',
		'Fire trucks on Flatbush around 2pm, three of them. No visible smoke.',
		'Sumida River cruise running on a holiday schedule — confirmed at the dock.',
		'Small earthquake felt in Yokohama around 9:14. Maybe a 3? Hanging lamps swayed.',
		'Burst water main on Bedford Ave. Entire block being redirected.',
		'Spotted the Roomba cat at Tokyu Hands again. Different floor today.',
		'Free zine release at the venue under Nakameguro tracks, doors at 7.',
		'Three guys with a piano in Washington Square Park, no idea where they’re going.',
		'Sea lion escaped briefly at the aquarium in Shinagawa — back in pen now.',
		'Yakitori smell drifting from a corner I’ve never seen before. Found a tiny izakaya tucked behind the Family Mart, eight seats, smoke up to the ceiling.',
		'Massive flock of starlings turning over Prospect Park around dusk.',
		'Train delay on the Yamanote line — passenger illness reported at Shibuya.',
		'Garage sale in Park Slope, Saturday morning. Mostly books and lamps.',
		'Tokyo Tower lit pink tonight. Don’t know what it’s for.',
		'New bike lane just painted on Court Street. Sharper than the old one.',
		'Saw a wedding photo shoot in Meiji Jingu garden around 11am.',
		'Free outdoor movie at Brooklyn Bridge Park tomorrow night, 8pm. Bring a blanket.',
		'The udon place in Asagaya raised prices ¥100 across the board.',
		'Helicopter circling Williamsburg for the past 20 minutes.',
		'Cherry tree at the corner of Aoyama-dori already shedding petals.',
		'Skating session on the new ramp in Tama Hills park — packed.',
		'Saw a film crew on Thompson Street, looked like a period piece. Vintage cars roped off, extras in hats.',
		'Vending machine at Shimokitazawa station has new cold lemon tea — actually good.',
		'Old man playing trumpet in Yoyogi park, maybe 7am most mornings.',
		'Power’s back on across most of Brooklyn Heights as of 12:34.',
		'Massive moon rising over Tokyo Bay tonight. Worth a walk to the waterfront.',
		'New donut shop in Williamsburg, queue around the block. They open at 8.',
		'Construction crew dug up an old streetcar rail on Court Street.',
		'Cat cafe in Akihabara has a new tabby. Sleeps in the window.',
		'Two food trucks parked at Domino Park since this morning.',
		'Free yoga class on the Brooklyn Promenade at 6:30am, all summer.',
		'Old bookshop in Jimbocho with a cardboard sign: "closing forever, everything 50% off." Whole inventory being carted out by hand.',
		'The pigeon that always sits on the Hachiko statue is back.',
		'Small fire in a trash bin near 14th and 6th. NYFD already on it.',
		'New mural finished on the wall behind Tsukiji outer market — looks great.',
		'Long shadow over half of Shibuya crossing right now from a new tower under construction.',
		'Pop-up at Domino Park selling raspas. Long line.',
		'Walk through Yanaka cemetery — all the cherry trees are still blooming, late this year.',
		'Saw a giant sturgeon at the Tsukiji fish market early this morning. Maybe 2 meters.',
		'New cafe opened where the old laundromat used to be on Atlantic. Brutalist concrete, expensive.',
		'Asahikawa snow festival photos floating around — pretty incredible this year.',
		'Truck broke down blocking the Marunouchi exit at Tokyo station. Avoid for the next hour.',
		'The dog that begs at the Family Mart in Higashi-Nakano is wearing a sweater today.',
		'Brooklyn Public Library doing free tax filing through April 15.',
		'Saw lightning over Tokyo Bay around 22:30 — no thunder yet.',
		'Quiet morning at the corner of Smith and Bergen. Steam rising off the manhole covers, nobody around but the bagel guy setting up.',
		'Crow stole a piece of melonpan from a kid at Inokashira park. Kid was unbothered.',
		'Free piano in the lobby of the Brooklyn Museum, anyone can play.',
		'Three different cherry varieties in bloom along the Sumida river path right now.',
		'Long delay at JFK — saw the queue from the AirTrain platform, maybe 200 deep at security.',
		'Old neon sign at the kissaten near Ebisu finally got replaced.',
		'Fireworks somewhere in Sunset Park, can’t see them but can hear them. Maybe 9:50.'
	];

	const AUTHORS = [
		'alice',
		'bob',
		'carol',
		'dan',
		'erin',
		'frank',
		'gina',
		'haru',
		'iris',
		'jun',
		'kate',
		'leo',
		'mei',
		'nora',
		'oki',
		'paul'
	];

	const PLACES = [
		'Shibuya',
		'Brooklyn',
		'Ueno Park',
		'Shimokitazawa',
		'BQE',
		'Ginza',
		'Setagaya',
		'Kichijoji',
		'Bedford-Stuyvesant',
		'Shinjuku',
		'York Street',
		'Yoyogi Park',
		'Jimbocho',
		'Flatbush',
		'Sumida River',
		'Yokohama',
		'Bedford Ave',
		'Tokyu Hands',
		'Nakameguro',
		'Washington Sq',
		'Shinagawa',
		'Asagaya',
		'Williamsburg',
		'Aoyama',
		'Tama Hills',
		'Thompson St',
		'Brooklyn Heights',
		'Akihabara',
		'Domino Park',
		'Promenade',
		'Tokyo Bay',
		'Court St',
		'Tsukiji',
		'Atlantic Ave',
		'Yanaka',
		'Park Slope',
		'Inokashira',
		'Sunset Park',
		'Ebisu',
		'Higashi-Nakano',
		'Marunouchi'
	];

	const WHENS = [
		'2m ago',
		'7m ago',
		'14m ago',
		'22m ago',
		'38m ago',
		'1h ago',
		'2h ago',
		'3h ago',
		'5h ago',
		'8h ago',
		'yesterday',
		'2d ago',
		'3d ago',
		'last week'
	];

	const GRADIENTS = [
		'linear-gradient(135deg, #4f46e5, #ec4899)',
		'linear-gradient(135deg, #f59e0b, #ef4444)',
		'linear-gradient(135deg, #06b6d4, #6366f1)',
		'linear-gradient(135deg, #10b981, #14b8a6)',
		'linear-gradient(135deg, #8b5cf6, #d946ef)',
		'linear-gradient(135deg, #f43f5e, #f97316)',
		'linear-gradient(135deg, #0ea5e9, #22d3ee)',
		'linear-gradient(135deg, #65a30d, #84cc16)',
		'linear-gradient(135deg, #b91c1c, #fb923c)',
		'linear-gradient(135deg, #1e293b, #475569)',
		'linear-gradient(135deg, #581c87, #db2777)',
		'linear-gradient(135deg, #064e3b, #0891b2)'
	];

	const IMAGE_HEIGHTS = [120, 140, 160, 180, 200, 220, 260];

	function pick<T>(arr: T[], i: number, salt: number): T {
		return arr[(i * 7 + salt) % arr.length];
	}

	const posts: PostData[] = POST_TEXTS.map((text, i) => {
		const hasImage = i % 3 === 0;
		const handle = pick(AUTHORS, i, 3);
		return {
			id: `p${i}`,
			text,
			displayName: handle.charAt(0).toUpperCase() + handle.slice(1),
			handle,
			where: pick(PLACES, i, 11),
			when: pick(WHENS, i, 5),
			gradient: hasImage ? pick(GRADIENTS, i, 1) : undefined,
			imageHeight: hasImage ? pick(IMAGE_HEIGHTS, i, 13) : undefined
		};
	});

	const TILE_WIDTH = 280;
	let placedItems = $state<Placed<LayoutItem>[]>([]);

	$effect(() => {
		const onResize = () => {
			vw = window.innerWidth;
			vh = window.innerHeight;
		};
		window.addEventListener('resize', onResize);
		onResize();
		return () => window.removeEventListener('resize', onResize);
	});

	onMount(async () => {
		if (document.fonts?.ready) {
			await document.fonts.ready;
		}
		const items: (LayoutItem & { w: number; h: number })[] = [
			{
				id: 'start',
				kind: 'start',
				w: START_CARD_WIDTH,
				h: START_CARD_HEIGHT
			},
			...posts.map((p) => ({
				id: p.id,
				kind: 'post' as const,
				post: p,
				w: TILE_WIDTH,
				h: predictPostHeight(p, TILE_WIDTH).total
			}))
		];
		placedItems = spiralLayout(items, {
			padding: 40,
			xStep: 320,
			jiggle: 100,
			localAnchorThreshold: 800,
			searchRadius: 800
		});
	});

	let viewport: HTMLDivElement;
	let camX = $state(0);
	let camY = $state(0);
	let isDragging = $state(false);
	let dragStart = { x: 0, y: 0, camX: 0, camY: 0 };

	// The world point under the viewport center is (-camX, -camY) because the
	// world is translated by (camX, camY) before centering. Whichever local
	// anchor is closest to that point is currently "active" — the spiral that
	// new cards would expand from if loaded now.
	const activeAnchorId = $derived.by(() => {
		if (placedItems.length === 0) return null;
		const targetX = -camX;
		const targetY = -camY;
		let bestId: string | null = null;
		let bestDist = Infinity;
		for (const p of placedItems) {
			if (!p.isLocalAnchor) continue;
			const d = Math.hypot(p.x - targetX, p.y - targetY);
			if (d < bestDist) {
				bestDist = d;
				bestId = p.id;
			}
		}
		return bestId;
	});

	// Edge-proximity scaling. Once the screen-space center of a card is within
	// EDGE_THRESHOLD pixels of any viewport edge, it shrinks linearly toward
	// scale 0 at the edge. Beyond the threshold it renders at full size.
	const EDGE_THRESHOLD = 100;
	let vw = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
	let vh = $state(typeof window !== 'undefined' ? window.innerHeight : 768);

	function edgeScale(x: number, y: number): number {
		const cx = vw / 2 + camX + x;
		const cy = vh / 2 + camY + y;
		const dist = Math.min(cx, vw - cx, cy, vh - cy);
		if (dist >= EDGE_THRESHOLD) return 1;
		if (dist <= 0) return 0;
		// Ease-out on distance (cubic): cards stay near full size for most of
		// the threshold, then shrink rapidly as they approach the edge.
		const t = dist / EDGE_THRESHOLD;
		return 1 - (1 - t) ** 3;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		isDragging = true;
		dragStart = { x: e.clientX, y: e.clientY, camX, camY };
		viewport.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!isDragging) return;
		camX = dragStart.camX + (e.clientX - dragStart.x);
		camY = dragStart.camY + (e.clientY - dragStart.y);
	}

	function onPointerUp(e: PointerEvent) {
		if (!isDragging) return;
		isDragging = false;
		if (viewport.hasPointerCapture(e.pointerId)) {
			viewport.releasePointerCapture(e.pointerId);
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		camX -= e.deltaX;
		camY -= e.deltaY;
	}
</script>

<svelte:head>
	<title>Sehyo · Masonry prototype</title>
</svelte:head>

<div
	class="viewport"
	class:dragging={isDragging}
	bind:this={viewport}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onwheel={onWheel}
>
	<div class="world" style="transform: translate(-50%, -50%) translate({camX}px, {camY}px)">
		{#each placedItems as placed (placed.id)}
			{@const s = edgeScale(placed.x, placed.y)}
			<div
				class="post-slot"
				style="left: {placed.x}px; top: {placed.y}px; width: {placed.w}px; height: {placed.h}px; transform: translate(-50%, -50%) scale({s}); opacity: {s};"
			>
				{#if placed.kind === 'start'}
					<StartCard />
				{:else}
					<Post post={placed.post} highlight={placed.isLocalAnchor} />
				{/if}
				{#if placed.isGridlocked}
					<span class="lock-badge" aria-hidden="true" title="gridlocked">
						<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
							<path d="M7 11V7a5 5 0 0 1 10 0v4" />
						</svg>
					</span>
				{/if}
				{#if placed.id === activeAnchorId}
					<span class="active-badge" aria-hidden="true" title="active anchor">
						<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="9" />
							<circle cx="12" cy="12" r="4" fill="currentColor" />
						</svg>
					</span>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #0a0a0a;
		color: #e4e4e7;
		font-family:
			ui-sans-serif,
			system-ui,
			sans-serif;
		overflow: hidden;
	}

	.viewport {
		position: fixed;
		inset: 0;
		overflow: hidden;
		touch-action: none;
		overscroll-behavior: none;
		background:
			radial-gradient(ellipse at top left, #1a1a1a 0%, #0a0a0a 60%) fixed;
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
	}

	.viewport.dragging {
		cursor: grabbing;
	}

	.world {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 0;
		height: 0;
		will-change: transform;
	}

	.post-slot {
		position: absolute;
		transform: translate(-50%, -50%);
	}

	.lock-badge {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #3b82f6;
		color: #fff;
		border-radius: 3px;
		pointer-events: none;
		z-index: 1;
	}

	.active-badge {
		position: absolute;
		top: 6px;
		left: 6px;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #22c55e;
		color: #fff;
		border-radius: 3px;
		pointer-events: none;
		z-index: 1;
	}
</style>
