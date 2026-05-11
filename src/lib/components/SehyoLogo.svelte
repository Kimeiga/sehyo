<script lang="ts">
	import { onMount } from 'svelte';
	import { menuOpen } from '$lib/stores/menu';

	let { size = 32 }: { size?: number } = $props();

	/* Tilt state in [-1, 1]. Driven by a time-based animation
	   below — no gyro, no permission flow. */
	let tiltX = $state(0);
	let tiltY = $state(-0.3);

	let raf = 0;
	let phaseX = 0;
	let phaseY = 0;
	let lastTime = 0;
	/* Timestamp when the most recent menu-toggle "shine boost"
	   started. Set to -Infinity until the first toggle so the
	   tick's boost calculation is always clamped out. */
	let shineBoostStart = -Infinity;
	const SHINE_BOOST_MS = 700;
	const SHINE_BOOST_PEAK = 6;

	/* Steady baseline drift rate — no pulse, no variable-rate
	   wander. The highlight just glides slowly and uniformly until
	   a discrete event (menu opening, hover) kicks the shine
	   boost. */
	const BASE_RATE = 0.5;

	function tick(now: number) {
		const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000;
		lastTime = now;

		/* Shine boost: a menu-OPEN kick or hover multiplies the
		   integration rate by up to SHINE_BOOST_PEAK× for a brief
		   window so the highlight zips across the badge once before
		   settling back into the steady drift. Quadratic decay
		   keeps the peak instantaneous and the tail-off natural. */
		const boostElapsed = now - shineBoostStart;
		let boost = 1;
		if (boostElapsed >= 0 && boostElapsed < SHINE_BOOST_MS) {
			const tBoost = boostElapsed / SHINE_BOOST_MS;
			boost = 1 + (SHINE_BOOST_PEAK - 1) * Math.pow(1 - tBoost, 2);
		}
		const rateMul = BASE_RATE * boost;

		/* Integrate two independent phases at incommensurate base
		   rates (0.27 and 0.41 cycles/sec) so the X/Y motion forms
		   a non-repeating Lissajous-like path. Modulo 1 keeps the
		   accumulated phase from losing float precision over long
		   sessions — sin is periodic so the wrap is invisible. */
		phaseX = (phaseX + dt * 0.27 * rateMul) % 1;
		phaseY = (phaseY + dt * 0.41 * rateMul) % 1;

		tiltX = Math.sin(phaseX * 2 * Math.PI) * 0.65;
		tiltY = -0.25 + Math.cos(phaseY * 2 * Math.PI) * 0.35;
		raf = requestAnimationFrame(tick);
	}

	function triggerShineBoost() {
		shineBoostStart = performance.now();
	}

	onMount(() => {
		raf = requestAnimationFrame(tick);
		/* Subscribe to menu-open changes. Skip the initial
		   synchronous emit, then only boost on closed→open
		   transitions (not on close). */
		let initial = true;
		let prevOpen = false;
		const unsub = menuOpen.subscribe((open) => {
			if (initial) {
				initial = false;
				prevOpen = open;
				return;
			}
			if (open && !prevOpen) {
				triggerShineBoost();
			}
			prevOpen = open;
		});
		return () => {
			unsub();
			cancelAnimationFrame(raf);
		};
	});

	/* All shine positions are in viewBox userSpaceOnUse coords (0-200).
	   The face highlights drift OPPOSITE to the tilt (as if the
	   shine pivots toward the light source as the badge tilts away).
	   The edge highlight rotates around the perimeter so a different
	   edge catches the light depending on tilt direction. */
	const shine1Cx = $derived(60 - tiltX * 35);
	const shine1Cy = $derived(60 - tiltY * 35);
	const shine2Cx = $derived(150 + tiltX * 28);
	const shine2Cy = $derived(150 + tiltY * 28);
	const shine3Cx = $derived(100 + tiltX * 60);
	const shine3Cy = $derived(40 - tiltY * 50);

	const edgeAngle = $derived(Math.atan2(-tiltY, -tiltX));
	const ex1 = $derived(0.5 - Math.cos(edgeAngle) * 0.5);
	const ey1 = $derived(0.5 - Math.sin(edgeAngle) * 0.5);
	const ex2 = $derived(0.5 + Math.cos(edgeAngle) * 0.5);
	const ey2 = $derived(0.5 + Math.sin(edgeAngle) * 0.5);

	/* Counter-edge shine, perpendicular to the main edge highlight,
	   weaker — gives the impression of a secondary light source. */
	const edgeAngle2 = $derived(edgeAngle + Math.PI * 0.65);
	const e2x1 = $derived(0.5 - Math.cos(edgeAngle2) * 0.5);
	const e2y1 = $derived(0.5 - Math.sin(edgeAngle2) * 0.5);
	const e2x2 = $derived(0.5 + Math.cos(edgeAngle2) * 0.5);
	const e2y2 = $derived(0.5 + Math.sin(edgeAngle2) * 0.5);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 200 200"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
	class="sehyo-logo"
	onpointerenter={triggerShineBoost}
>
	<defs>
		<!-- Base body fill: very dark gray with a subtle diagonal
		     gradient so even the "flat" face has shading. -->
		<linearGradient id="sl-base" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="#1c1c1c" />
			<stop offset="55%" stop-color="#0d0d0d" />
			<stop offset="100%" stop-color="#050505" />
		</linearGradient>

		<!-- Soft white face shine (primary light source). -->
		<radialGradient
			id="sl-shine1"
			cx={shine1Cx}
			cy={shine1Cy}
			r="90"
			gradientUnits="userSpaceOnUse"
		>
			<stop offset="0%" stop-color="white" stop-opacity="0.40" />
			<stop offset="40%" stop-color="white" stop-opacity="0.10" />
			<stop offset="100%" stop-color="white" stop-opacity="0" />
		</radialGradient>

		<!-- Cool blue-tinted shine (a secondary, distant fill light
		     using the brand color). -->
		<radialGradient
			id="sl-shine2"
			cx={shine2Cx}
			cy={shine2Cy}
			r="110"
			gradientUnits="userSpaceOnUse"
		>
			<stop offset="0%" stop-color="#6cd0f3" stop-opacity="0.28" />
			<stop offset="55%" stop-color="#00A5D8" stop-opacity="0.08" />
			<stop offset="100%" stop-color="#00A5D8" stop-opacity="0" />
		</radialGradient>

		<!-- Tight specular spot (a hard highlight that wanders most
		     dramatically with tilt — reads as a sharp glint). -->
		<radialGradient
			id="sl-shine3"
			cx={shine3Cx}
			cy={shine3Cy}
			r="35"
			gradientUnits="userSpaceOnUse"
		>
			<stop offset="0%" stop-color="white" stop-opacity="0.55" />
			<stop offset="60%" stop-color="white" stop-opacity="0.05" />
			<stop offset="100%" stop-color="white" stop-opacity="0" />
		</radialGradient>

		<!-- Primary edge highlight: a streak across the perimeter
		     that rotates with tilt direction. -->
		<linearGradient id="sl-edge1" x1={ex1} y1={ey1} x2={ex2} y2={ey2}>
			<stop offset="0%" stop-color="white" stop-opacity="0.7" />
			<stop offset="18%" stop-color="white" stop-opacity="0.05" />
			<stop offset="82%" stop-color="white" stop-opacity="0" />
			<stop offset="100%" stop-color="white" stop-opacity="0.28" />
		</linearGradient>

		<!-- Secondary, dimmer edge highlight perpendicular to the
		     primary — implies a second light source bouncing off
		     the rounded corners. -->
		<linearGradient id="sl-edge2" x1={e2x1} y1={e2y1} x2={e2x2} y2={e2y2}>
			<stop offset="0%" stop-color="#cfe9f5" stop-opacity="0.32" />
			<stop offset="25%" stop-color="white" stop-opacity="0" />
			<stop offset="75%" stop-color="white" stop-opacity="0" />
			<stop offset="100%" stop-color="#cfe9f5" stop-opacity="0.18" />
		</linearGradient>

		<!-- Mask that confines the edge highlights to the rounded
		     ring around the badge perimeter (white = visible). The
		     inner inset matches the badge's natural rounded square. -->
		<mask id="sl-edge-mask">
			<rect width="200" height="200" rx="42.1871" fill="white" />
			<rect x="6" y="6" width="188" height="188" rx="36.5" fill="black" />
		</mask>

		<!-- Inner shadow / bevel: a subtle dark ring around the
		     interior of the badge that sells the depth of the
		     rounded edge. -->
		<radialGradient id="sl-bevel" cx="100" cy="100" r="105" gradientUnits="userSpaceOnUse">
			<stop offset="80%" stop-color="black" stop-opacity="0" />
			<stop offset="100%" stop-color="black" stop-opacity="0.45" />
		</radialGradient>
	</defs>

	<!-- Base dark fill -->
	<rect width="200" height="200" rx="42.1871" fill="url(#sl-base)" />

	<!-- Inner bevel shadow (gives the sense of a curved edge) -->
	<rect width="200" height="200" rx="42.1871" fill="url(#sl-bevel)" />

	<!-- Face highlights -->
	<rect width="200" height="200" rx="42.1871" fill="url(#sl-shine1)" />
	<rect width="200" height="200" rx="42.1871" fill="url(#sl-shine2)" />
	<rect width="200" height="200" rx="42.1871" fill="url(#sl-shine3)" />

	<!-- Edge highlights (masked to perimeter ring) -->
	<rect width="200" height="200" rx="42.1871" fill="url(#sl-edge1)" mask="url(#sl-edge-mask)" />
	<rect width="200" height="200" rx="42.1871" fill="url(#sl-edge2)" mask="url(#sl-edge-mask)" />

	<!-- Original 製 character paths, unchanged -->
	<path d="M63.3234 37.5001H82.691V93.9482H63.3234V37.5001Z" fill="white" />
	<path
		d="M155.149 88.321L160.129 105.705L42.4793 145.964L37.4995 128.58L155.149 88.321Z"
		fill="white"
	/>
	<path
		d="M157.604 115.827L162.5 132.917L120.908 147.15L116.013 130.059L157.604 115.827Z"
		fill="white"
	/>
	<path
		d="M100.461 142.108L103.112 159.781L53.0629 168.75L50.4116 151.078L100.461 142.108Z"
		fill="white"
	/>
	<path d="M82.691 150.395H63.3233V122.171H82.691L82.691 150.395Z" fill="white" />
	<path
		d="M162.475 149.568L155.895 165.783L77.0669 127.574L83.6465 111.359L162.475 149.568Z"
		fill="white"
	/>
	<path d="M37.4998 101.004H127.882V115.116H37.4998V101.004Z" fill="white" />
	<path d="M114.97 37.5001H134.338V86.8922L114.97 93.9482V37.5001Z" fill="white" />
	<path d="M140.794 37.5001H160.161V105.597L140.794 101.004V37.5001Z" fill="white" />
	<path
		d="M37.4998 71.9743C37.4998 68.5225 40.298 65.7243 43.7498 65.7243H102.265C105.716 65.7243 108.515 68.5225 108.515 71.9743V73.5863C108.515 77.0381 105.716 79.8363 102.265 79.8363H43.7498C40.298 79.8363 37.4998 77.0381 37.4998 73.5863V71.9743Z"
		fill="white"
	/>
	<path d="M37.4998 44.5558H108.515V58.6678H37.4998V44.5558Z" fill="white" />
	<path d="M37.4998 72.78H56.8674V93.948H37.4998V72.78Z" fill="white" />
	<path d="M89.1466 72.78H108.514V108.06H89.1466V72.78Z" fill="white" />
	<path d="M40.7279 37.5001H53.6397L50.4117 44.5561L37.4998 44.5558L40.7279 37.5001Z" fill="white" />
</svg>

<style>
	.sehyo-logo {
		display: block;
		border-radius: 7px;
	}
</style>
