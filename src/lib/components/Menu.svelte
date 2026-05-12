<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { menuOpen, menuOrigin, closeMenu } from '$lib/stores/menu';
	import { promptSignIn } from '$lib/stores/sign-in-modal';
	import type { User } from '$lib/types';

	interface Props {
		user: User | null;
		unreadCount?: number;
	}
	let { user, unreadCount = 0 }: Props = $props();

	let signingIn = $state(false);
	let host: HTMLDivElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	let navList: HTMLElement | undefined = $state();
	/* Local mount + closing state. The DOM is gated on `mounted`,
	   not directly on $menuOpen, so the close transition has time
	   to play before unmount. When $menuOpen flips false, we set
	   `closing = true` and schedule the actual unmount after the
	   dissolve duration. If the user re-opens during the closing
	   animation, the scheduled unmount is cancelled. */
	let mounted = $state(false);
	let closing = $state(false);
	let closingStart = $state(0);
	let closeTimeoutId = 0;
	const DISSOLVE_DURATION_MS = 1000;

	/* Track viewport size so the reveal-circle's final radius can grow
	   beyond the screen's diagonal regardless of which corner the
	   epicenter sits in. Initialised from `window` at instantiation
	   time (the Menu only ever instantiates client-side, behind an
	   {#if $menuOpen}, so window is always defined). */
	let viewportW = $state(typeof window !== 'undefined' ? window.innerWidth : 0);
	let viewportH = $state(typeof window !== 'undefined' ? window.innerHeight : 0);

	$effect(() => {
		if (!$menuOpen) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onResize = () => {
			viewportW = window.innerWidth;
			viewportH = window.innerHeight;
		};
		window.addEventListener('resize', onResize);
		return () => {
			document.body.style.overflow = prev;
			window.removeEventListener('resize', onResize);
		};
	});

	/* Mount/dissolve lifecycle. Opening: mount immediately and
	   cancel any pending close. Closing: keep mounted, switch into
	   the dissolve phase, schedule the real unmount after the
	   dissolve duration. */
	$effect(() => {
		if ($menuOpen) {
			mounted = true;
			closing = false;
			if (closeTimeoutId) {
				clearTimeout(closeTimeoutId);
				closeTimeoutId = 0;
			}
		} else if (mounted && !closing) {
			closing = true;
			closingStart = performance.now();
			closeTimeoutId = window.setTimeout(() => {
				mounted = false;
				closing = false;
				closeTimeoutId = 0;
			}, DISSOLVE_DURATION_MS);
		}
	});

	onMount(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') closeMenu();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	async function navigate(path: string) {
		// Hold the menu open until the destination has actually loaded so
		// the user never sees a flash of the previous page. View
		// Transitions API is used opportunistically when supported for a
		// smoother fade between menu and the new page; otherwise we just
		// fall back to plain navigation.
		const startTransition = (document as any).startViewTransition?.bind(document);
		if (typeof startTransition === 'function') {
			const t = startTransition(async () => {
				await goto(path);
				closeMenu();
			});
			try { await t.finished; } catch { /* user cancelled; ignore */ }
		} else {
			await goto(path);
			closeMenu();
		}
	}

	async function signInGoogle() {
		if (signingIn) return;
		signingIn = true;
		try {
			// authClient.signIn.social redirects the browser to Google. The
			// callbackURL brings the user back to the home feed after auth.
			await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
		} catch (err) {
			console.error('Google sign-in failed:', err);
			alert('Could not start sign-in. Try again.');
			signingIn = false;
		}
	}

	async function signOut() {
		try {
			await authClient.signOut();
			closeMenu();
			await goto('/');
			await invalidateAll();
		} catch (err) {
			console.error('Sign-out failed:', err);
		}
	}

	function showSignInGate() {
		closeMenu();
		promptSignIn('Sign in to use messages.');
	}

	const isSignedIn = $derived(!!user && !user.isAnonymous);

	type Item = {
		label: string;
		onSelect: () => void | Promise<void>;
		show: boolean;
		disabled?: boolean;
		hasUnread?: boolean;
	};

	const items = $derived<Item[]>(
		[
			{ label: 'Home',     onSelect: () => navigate('/'),                    show: true },
			{ label: 'Search',   onSelect: () => navigate('/search'),              show: true },
			{ label: 'Messages', onSelect: () => navigate('/messages'),            show: isSignedIn, hasUnread: unreadCount > 0 },
			{ label: 'Messages', onSelect: showSignInGate,                         show: !isSignedIn, disabled: true },
			{ label: 'Friends',  onSelect: () => navigate('/friends'),             show: isSignedIn },
			{ label: 'Profile',  onSelect: () => { if (user) navigate(user.username ? `/${user.username}` : `/profile/${user.id}`); }, show: isSignedIn },
			{ label: 'About',    onSelect: () => navigate('/about'),               show: true },
			{ label: 'Sign in',  onSelect: signInGoogle,                           show: !isSignedIn },
			{ label: 'Sign out', onSelect: signOut,                                show: isSignedIn }
		].filter((it) => it.show)
	);

	let webglTeardown: (() => void) | null = null;

	/* Spin up the WebGL ripple once Svelte has mounted the canvas, the
	   nav list, and the host. One requestAnimationFrame of slack lets
	   layout settle so each nav-item's bounding rect is final before
	   we rasterize. The ripple lives only as long as the menu is open
	   — when {#if $menuOpen} unmounts the markup, the cleanup runs. */
	$effect(() => {
		if (!canvas || !navList || !host) return;
		let cancelled = false;
		requestAnimationFrame(() => {
			if (cancelled) return;
			webglTeardown = setupRipple();
		});
		return () => {
			cancelled = true;
			webglTeardown?.();
			webglTeardown = null;
		};
	});

	/* Procedural reveal-and-wave shader (no wave-equation simulation,
	   no FBO ping-pong). The reveal circle and the ripple wave are
	   both functions of `revealR`, the only animated value. The wave
	   is a finite band that trails the reveal edge at a fixed
	   distance — so the ripple is *always* slightly behind the edge,
	   and each glyph fades in just after the band passes over it.
	   This makes the choreography (edge → wave → text) precise and
	   tunable via constants, rather than something you have to
	   coax out of physics. */
	function setupRipple(): () => void {
		if (!canvas || !navList || !host) return () => {};

		const gl = canvas.getContext('webgl2', {
			premultipliedAlpha: false,
			antialias: false,
			alpha: true
		});
		if (!gl) return () => {};

		const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
	v_uv = a_pos * 0.5 + 0.5;
	gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

		const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_text;
uniform vec2 u_revealCenter;
uniform float u_revealR;
uniform float u_waveR;
uniform float u_revealFeather;
uniform vec2 u_resolution;
uniform vec3 u_bgColor;
uniform float u_time;
uniform float u_waveBand;
uniform float u_wavePeakPx;
uniform float u_chroma;
uniform float u_waveAmp;
uniform float u_dissolveT;
uniform float u_textFadeStart;
uniform float u_textFadeEnd;
uniform sampler2D u_sky;
uniform float u_skyDarkness;
uniform vec2 u_skyDrift;
/* 1.0 = sample sky texture as background, 0.0 = fall back to flat
   u_bgColor. The sky JPEG is only visually appropriate in compact
   mode where the navbar is short and wide; on fullscreen (mobile)
   the same sampling stretches awkwardly and competes with the menu
   text. The CPU side just flips this per-mode. */
uniform float u_useSky;
/* Native aspect ratio of the sky JPEG (width / height). Used to
   convert v_uv into sky-texture-space coordinates that preserve the
   sky's own aspect — without it, a 20:1 navbar canvas stretches the
   sky horizontally into long smears. */
uniform float u_skyAspect;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/* Smooth value noise — interpolates hashed corners of a unit grid
   with a smoothstep-like falloff. Builds the 2D scalar field that
   fbm() stacks into Perlin-like noise for the exit dissolve. */
float valueNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/* Fractal Brownian motion — sums octaves of value noise at doubling
   frequencies / halving amplitudes. Output is approximately in
   [0, 1] and reads like classic Perlin noise (organic blobs). */
float fbm(vec2 p) {
	float v = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * valueNoise(p);
		p *= 2.0;
		a *= 0.5;
	}
	return v;
}

/* Interleaved gradient noise (Jorge Jimenez, Call of Duty AC).
   High-frequency, low spatial correlation — visually
   indistinguishable from blue noise at typical screen resolutions
   without needing a precomputed lookup texture. Used to dither the
   dissolve threshold so the binary mask's edge breaks into
   pixelated grain instead of a clean curve. */
float blueNoiseIGN(vec2 pixelPos) {
	return fract(52.9829189 * fract(0.06711056 * pixelPos.x + 0.00583715 * pixelPos.y));
}

/* One wake = a finite radial band whose crest is at its leading edge
   (pos = 0) and which decays inward across its band width. The
   offset parameter shifts the whole wake further behind the reveal
   edge. decayPow controls how quickly the amplitude envelope falls
   off — small values (0.4-0.6) keep the wake forceful through most
   of its band (good for the primary pulse, where we want the warp
   visible across the entire fade-in zone); larger values (1.2-1.6)
   give a sharper, quicker echo (good for trailing wakes). Returns
   radial displacement in CSS px. */
float wakeAt(float wr, float offsetPx, float bandPx, float peakPx, float decayPow) {
	float pos = (wr - offsetPx) / bandPx;
	if (pos < 0.0 || pos > 1.0) return 0.0;
	float bell = pow(1.0 - pos, decayPow);
	/* One full sin cycle per band (was two — that read as a
	   high-frequency vibration when the band swept fast). One
	   cycle gives a single crest + trough, which scans visually
	   as an actual wave. */
	float waveSign = sin(pos * 3.14159 * 2.0);
	return waveSign * bell * peakPx;
}

void main() {
	vec2 toCenter = (v_uv - u_revealCenter) * u_resolution;
	float pixelDist = length(toCenter);
	vec2 dir = pixelDist > 0.5 ? toCenter / pixelDist : vec2(0.0);
	float withinReveal = u_revealR - pixelDist;
	float withinWave = u_waveR - pixelDist;
	/* Hoisted to the top of main() so it's available for the wake-
	   spacing scaler below as well as the sky/perlin sections
	   later. canvasAspect > 5 is the marker for "compact navbar
	   mode" (the only mode with a hugely-wide canvas). */
	float canvasAspect = u_resolution.x / max(u_resolution.y, 1.0);

	/* Wave bands ride u_waveR (its own slow propagation),
	   independent of u_revealR (which expands fast for the
	   reveal-circle visibility). This lets the reveal snap open
	   in 1s while the ripple itself takes ~4s to traverse the
	   menu — same lingering, low-frequency feel the wave had
	   when the entire reveal was 4 seconds long, but with a
	   crisp fast circle on top.

	   Primary uses a slow decay (decayPow 0.5) so amplitude
	   stays high across most of its band; trailing wakes use
	   sharper decay (1.5) so they read as quick echoes. */
	float waveDispPx = 0.0;
	/* Trailing wake spacing — on the wide compact navbar canvas
	   (aspect > 5) the wave propagates faster in screen pixels so
	   the wakes arrive too quickly behind the primary. Stretch
	   their offsets ~1.8× on compact so the gap between successive
	   wakes feels paced rather than crowded. Mobile fullscreen
	   keeps the original 0.75/1.40 spacing where the wave already
	   feels appropriately spaced relative to the canvas size. */
	float wakeSpacing = canvasAspect > 5.0 ? 1.8 : 1.0;
	waveDispPx += wakeAt(withinWave, 0.0, u_waveBand, u_wavePeakPx, 0.5);
	waveDispPx += wakeAt(withinWave, u_waveBand * 0.75 * wakeSpacing, u_waveBand * 0.85, u_wavePeakPx * 0.30, 1.5);
	waveDispPx += wakeAt(withinWave, u_waveBand * 1.40 * wakeSpacing, u_waveBand * 0.65, u_wavePeakPx * 0.13, 1.5);
	waveDispPx *= u_waveAmp;
	/* Radius-based amplitude falloff — simulates the energy
	   conservation of a real expanding ripple. Wave energy spreads
	   along an ever-growing ring perimeter (~2π·r), and since
	   energy ~ amplitude², amplitude ~ 1/sqrt(r). Reference radius
	   is u_waveBand so the amplitude is unattenuated while the
	   wave is still close to the epicenter (waveR < waveBand) and
	   only starts falling off once the ring has expanded past one
	   wave-band's worth of distance. By the time waveR has grown
	   to ~4× waveBand, amplitude is at 50%; at ~16× waveBand it's
	   at 25%. This makes the ripple visibly "die out" as it
	   reaches the screen edges, matching how dropped-stone water
	   ripples behave. */
	float radiusFalloff = sqrt(u_waveBand / max(u_waveR, u_waveBand));
	waveDispPx *= radiusFalloff;

	/* Per-channel chromatic offsets, displaced radially from the
	   epicenter — so the wave reads as a shockwave moving outward. */
	vec2 baseOff = (dir * waveDispPx) / u_resolution;
	vec2 uvR = clamp(v_uv + baseOff * (u_chroma * 0.55), 0.0, 1.0);
	vec2 uvG = clamp(v_uv + baseOff * (u_chroma * 1.00), 0.0, 1.0);
	vec2 uvB = clamp(v_uv + baseOff * (u_chroma * 1.45), 0.0, 1.0);
	float aR = texture(u_text, uvR).a;
	float aG = texture(u_text, uvG).a;
	float aB = texture(u_text, uvB).a;

	/* Text fades in early — by the time the primary wave's crest
	   is passing over a glyph the glyph is already mostly visible,
	   so the warp reads as text being shoved around (rather than
	   text being absent in the warp zone).

	   Tied to withinReveal (not withinWave) so text appears just
	   behind the fast reveal edge — by the time the slow wave
	   arrives later, the glyph is already solid and gets visibly
	   distorted by the ripple as it passes through. */
	float textShown = smoothstep(u_textFadeStart, u_textFadeEnd, withinReveal);
	aR *= textShown;
	aG *= textShown;
	aB *= textShown;

	/* Grain only along the colored fringes — invisible on settled
	   text. */
	float coverage = max(max(aR, aG), aB);
	float fringe = clamp(abs(waveDispPx) * 0.05, 0.0, 1.0);
	float t = floor(u_time * 30.0);
	float grain = 0.55 * fringe * coverage;
	float nR = hash(v_uv * 1500.0 + vec2(t * 1.3, 0.0));
	float nG = hash(v_uv * 1500.0 + vec2(t * 1.7 + 11.0, 23.0));
	float nB = hash(v_uv * 1500.0 + vec2(t * 2.1 + 47.0, 71.0));
	aR = clamp(aR + (nR - 0.5) * grain, 0.0, 1.0);
	aG = clamp(aG + (nG - 0.5) * grain, 0.0, 1.0);
	aB = clamp(aB + (nB - 0.5) * grain, 0.0, 1.0);

	coverage = max(max(aR, aG), aB);
	/* Normalize to keep glyph brightness independent of coverage —
	   without dividing, an AA edge pixel where all 3 channels equal
	   0.5 would mix into mid-gray (0.25 vs the bg) and the text
	   reads as washed out. After normalize, an equal-channel pixel
	   stays vec3(1.0) and mixes properly with bg by alpha; a
	   chromatic-split pixel keeps its color tilt. */
	vec3 textColor = coverage > 0.001 ? vec3(aR, aG, aB) / coverage : vec3(0.0);

	/* Background: heavily-darkened sky texture in BOTH modes now
	   (compact navbar + mobile fullscreen). The sky reads as
	   "almost black" but retains enough cloud texture to make the
	   reveal circle visibly different from the surrounding bg —
	   solving the "black expanding on black" problem. u_skyDrift
	   gives it a slow pan so it doesn't feel static, and a sqrt-ish
	   gamma (pow 0.7) gently boosts the highlights so cloud edges
	   stay legible after the darkness multiplier.

	   Cover-fit (handles both wider-than-sky AND taller-than-sky
	   canvases). The "scale" is canvasAspect / skyAspect:
	     - scale > 1  → canvas is wider than sky → fit sky width to
	       canvas width, crop top/bottom (compact navbar case).
	     - scale < 1  → canvas is taller than sky → fit sky height
	       to canvas height, crop left/right (mobile fullscreen).
	   The branchless min() picks the right sample axis lengths so
	   the smaller axis stays at 1 (full coverage) and the larger
	   one shrinks (cropping the overflow). Centered on 0.5 so the
	   crop sits in the middle of the sky by default. */
	/* canvasAspect was hoisted to the top of main() — see there. */
	float coverScale = canvasAspect / max(u_skyAspect, 0.01);
	vec2 skySampleAxes = vec2(min(coverScale, 1.0), min(1.0 / coverScale, 1.0));
	vec2 skyUv = vec2(
		(v_uv.x - 0.5) * skySampleAxes.x + 0.5,
		(v_uv.y - 0.5) * skySampleAxes.y + 0.5
	) + u_skyDrift;
	/* Gamma-correct the raw sky once — this is the "natural" cloud
	   color we'll mix toward for the brightening effect below. The
	   darkened-by-u_skyDarkness version is what shows as the
	   ambient bg. */
	vec3 skyNatural = pow(texture(u_sky, skyUv).rgb, vec3(0.7));
	vec3 skyDim = skyNatural * u_skyDarkness;
	vec3 bg = mix(u_bgColor, skyDim, u_useSky);
	vec3 baseColor = mix(bg, textColor, coverage);

	/* Back to amplitude-based crest/trough detection — the
	   curvature/dFdx approach worked in theory but the highlights
	   ended up reading as inconsistent thin bands that didn't
	   track the visible wave shape well. Plain amplitude
	   thresholding gives a more legible "this part of the wave is
	   the bright/dark moment" feel even though it scales with
	   displacement (trailing wakes get less highlight, which is
	   actually consistent with the radius-falloff above).

	   waveSignal is normalized against u_wavePeakPx (the nominal
	   max before u_waveAmp and the radius-falloff modulate it),
	   so it naturally fades as the wave expands and settles. The
	   smoothstep keeps the dead-zone for low |waveSignal| but is
	   tightened (0.6 → 0.85, was 0.5 → 0.9) so the highlight is
	   concentrated near the actual peak amplitude rather than
	   smeared across most of the wake. */
	float waveSignal = waveDispPx / max(u_wavePeakPx, 0.001);
	float waveCrest = max(waveSignal, 0.0);
	float waveTrough = max(-waveSignal, 0.0);
	/* Smoothstep window widened to [0.0, 0.4] (was [0.05, 0.2]) for
	   a gentler ramp into and out of the affected band. The
	   previous narrower window had a visible "hard edge" where
	   the effect kicked in — the transition from unaffected to
	   affected pixels happened over only a small range of wave
	   amplitudes, which read as a sharp boundary. The wider
	   window stretches that transition across more amplitude,
	   giving a soft gradient that fades in/out invisibly. The
	   lower bound at 0.0 means the effect starts as soon as
	   there's any wave at all (even sub-percent amplitudes get a
	   tiny ramp), and the upper bound at 0.4 means most of each
	   wake is in the partial-effect regime rather than fully
	   saturated.

	   Asymmetric crest/trough treatment: crests get a meaningful
	   color brighten (×0.25 → up to 25% lift toward the saturated
	   sky target). Troughs hardly darken the color at all (×0.02
	   → 2% mix toward black, basically imperceptible) but DO
	   open up an alpha hollow (×0.5 → alpha drops as low as 0.5),
	   so the trough reads as "translucent" rather than as a dark
	   counterpart to the crest. The visual focus is the bright
	   crest; the trough is a subtle see-through of the page. */
	float crestRamp = smoothstep(0.0, 0.4, waveCrest);
	float troughRamp = smoothstep(0.0, 0.4, waveTrough);
	/* Multiply BOTH the brighten and darken caps by the same
	   radiusFalloff already applied to waveDispPx — so the visible
	   color/alpha modulation fades in lockstep with the ripple's
	   amplitude as it expands. At the epicenter (waveR ≤ waveBand)
	   the cap is at full strength (×0.25 brighten, ×0.2 alpha
	   drop). By the time the ripple has expanded ~4 wave-bands
	   out, both caps are halved; at the screen edge they're at
	   ~25-37% of nominal. The visual effect: highlights are punchy
	   near the epicenter and gracefully die away as the wave
	   spreads, matching the displacement falloff. */
	float brightenFactor = crestRamp * 0.25 * radiusFalloff;
	/* Trough no longer shifts the color toward black at all — the
	   entire trough effect is now an alpha drop. darkenAlphaFactor
	   peaks at 0.15 (capped here, also scaled by radiusFalloff),
	   so a peak trough near the epicenter drops alpha only to
	   0.85 (a very subtle translucency) and the see-through fades
	   gracefully as the wave spreads. */
	float darkenAlphaFactor = troughRamp * 0.15 * radiusFalloff;
	/* Brighten target = a more-SATURATED version of the sky
	   texture, not just a brighter one. Pushing toward gray/white
	   at the crest washed the color out — the highlight read as
	   "lit but bland". Increasing saturation instead makes the
	   crest look like the sky's underlying colors are more vivid
	   (cloud blues deepen, warm patches glow), which is what
	   "illuminated by the wave" actually looks like in nature.

	   Saturation boost works by extrapolating away from the
	   luminance: mix(vec3(luma), color, k) with k > 1 pushes the
	   color further from gray than the source. k=2.2 roughly
	   doubles the apparent chroma. We then gently lift the result
	   (× 1.15) so it's also slightly brighter, then clamp to
	   keep channels in [0,1]. Falls back to mid-gray when sky
	   is disabled so the effect still reads in the no-sky path. */
	float skyLuma = dot(skyNatural, vec3(0.299, 0.587, 0.114));
	vec3 skySaturated = clamp(
		mix(vec3(skyLuma), skyNatural, 2.2) * 1.15,
		vec3(0.0),
		vec3(1.0)
	);
	vec3 brightTarget = mix(vec3(0.7), skySaturated, u_useSky);
	baseColor = mix(baseColor, brightTarget, brightenFactor);
	/* Trough alpha — at peak trough the alpha drops to 0.5 (the
	   coefficient on troughRamp), opening a translucent hollow
	   the page peeks through. Color of baseColor is unchanged in
	   the trough — the dark side is purely a see-through, never
	   a color shift. Crests stay fully opaque. */
	float waveAlphaMul = 1.0 - darkenAlphaFactor;

	/* Reveal-edge perturbation. The angular wave (sin/cos at
	   different harmonics around the angle from epicenter) makes
	   the leading boundary curl and ripple — looking like water
	   spreading rather than a hard expanding circle. Modulated by
	   u_waveAmp so it dies down as the wave settles, and by a small
	   constant (12px) so the curl reads but doesn't shatter the
	   circle's overall shape. */
	/* toCenter was already computed at the top of main(); reuse it
	   here for the angular calculation. */
	float angle = atan(toCenter.y, toCenter.x);
	float edgeWake = sin(angle * 7.0 - u_time * 5.0) * cos(angle * 4.0 + u_time * 3.0) * 12.0 * u_waveAmp;
	float perturbedR = u_revealR + edgeWake;
	float revealAlpha = 1.0 - smoothstep(perturbedR - u_revealFeather, perturbedR, pixelDist);

	/* Exit dissolve. u_dissolveT animates 0 → 1 during the closing
	   phase. We sample fbm noise at this UV (the "Perlin field" the
	   user described), compare it against a threshold that rises
	   with u_dissolveT, and step() to a hard binary mask — that's
	   the "max contrast" requirement: pure black or pure white, no
	   grays. The threshold range maps 0 → -0.1 and 1 → 1.1 so the
	   menu is fully visible at t=0 and fully gone at t=1 (with
	   slight overshoot to absorb the dither slop).

	   Blue noise IGN dithers the threshold per pixel, breaking the
	   smooth contour of the binary mask into a fuzzy/pixelated
	   border — the requested "blue noise dithering" look. */
	/* Aspect-correct the perlin sampling too — without this the
	   noise blobs squash into long horizontal streaks on a 20:1
	   navbar canvas. Multiplying x by canvasAspect gives roughly
	   square blobs in screen space.

	   Frequency: × 6.0 was tuned for the mobile canvas (~800px
	   tall) where it produces ~130px blobs. On the compact navbar
	   (~63px tall) the same multiplier yields ~10px granular
	   speckle that reads as fine noise rather than the intended
	   "blob" dissolve. The aspect threshold (> 5) cleanly
	   distinguishes the two modes — compact navbar aspect is ~20,
	   mobile fullscreen is < 1. Compact uses ~1.5× to give blobs
	   sized ~40px (proportional to the navbar's height). */
	float perlinFreq = canvasAspect > 5.0 ? 1.5 : 6.0;
	float perlinValue = fbm(vec2(v_uv.x * canvasAspect, v_uv.y) * perlinFreq);
	float bn = blueNoiseIGN(gl_FragCoord.xy);
	float effThresh = mix(-0.1, 1.1, u_dissolveT);
	float ditheredThresh = effThresh + (bn - 0.5) * 0.18;
	float dissolveMask = step(ditheredThresh, perlinValue);

	outColor = vec4(baseColor, revealAlpha * dissolveMask * waveAlphaMul);
}`;

		function compile(type: number, src: string): WebGLShader {
			const sh = gl!.createShader(type)!;
			gl!.shaderSource(sh, src);
			gl!.compileShader(sh);
			if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
				console.error('shader compile:', gl!.getShaderInfoLog(sh));
			}
			return sh;
		}
		function link(vs: WebGLShader, fs: WebGLShader): WebGLProgram {
			const p = gl!.createProgram()!;
			gl!.attachShader(p, vs);
			gl!.attachShader(p, fs);
			gl!.linkProgram(p);
			if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
				console.error('program link:', gl!.getProgramInfoLog(p));
			}
			return p;
		}

		const vs = compile(gl.VERTEX_SHADER, VERT);
		const displayProg = link(vs, compile(gl.FRAGMENT_SHADER, DISPLAY_FRAG));

		const quad = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW
		);

		/* Need alpha blending so the procedural reveal's gradient edge
		   composites correctly with the page underneath. */
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		function bindQuad(prog: WebGLProgram) {
			gl!.useProgram(prog);
			const loc = gl!.getAttribLocation(prog, 'a_pos');
			gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
			gl!.enableVertexAttribArray(loc);
			gl!.vertexAttribPointer(loc, 2, gl!.FLOAT, false, 0, 0);
		}

		/* Hoisted up here (was declared later by the frame loop) so
		   the async skyImage.onload below can check whether the
		   component has already been torn down before touching gl. */
		let destroyed = false;

		let textTex: WebGLTexture | null = null;

		/* Sky texture used as the menu background — really dark but
		   with visible cloud pattern so the expanding reveal circle
		   reads against the surrounding bg. Initialised to a 1×1
		   black pixel so the shader has SOMETHING to sample before
		   the JPEG arrives, then upgraded to the real image when
		   the load completes. */
		const skyTex = gl.createTexture()!;
		gl.bindTexture(gl.TEXTURE_2D, skyTex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			1,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			new Uint8Array([0, 0, 0, 255])
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
		/* Pick the sky texture by local time of day:
		     5–7   → sunset.jpg (dawn / early morning twilight)
		     7–17  → sky.jpg    (full daylight)
		     17–19 → sunset.jpg (dusk / late afternoon twilight)
		     19–5  → night.jpg  (nighttime)
		   Reads the local clock at setup time, so the texture choice
		   matches the user's current local hour. (No live update if
		   the menu happens to be open across the hour boundary —
		   probably not worth the complexity for an animation that
		   typically renders for <2 seconds.) */
		const localHour = new Date().getHours();
		let skyFilename: string;
		if (localHour >= 7 && localHour < 17) skyFilename = '/sky.jpg';
		else if (localHour >= 19 || localHour < 5) skyFilename = '/night.jpg';
		else skyFilename = '/sunset.jpg';

		/* Track aspect ratio dynamically from whichever image actually
		   loads — the three textures have different native aspects
		   (sky 0.75, night/sunset ~0.67), so a hard-coded uniform
		   would crop incorrectly for two of them. The shader uses
		   u_skyAspect every frame, so we just update it from the
		   loaded image's naturalWidth/naturalHeight inside onload. */
		let dynamicSkyAspect = 2268 / 3024; // initial guess (sky.jpg's ratio)

		const skyImage = new Image();
		skyImage.onload = () => {
			if (destroyed) return;
			dynamicSkyAspect = skyImage.naturalWidth / skyImage.naturalHeight;
			/* Pre-blur via multi-pass downscale, NOT canvas filter.
			   iOS Safari's `ctx.filter = 'blur(...)'` is a long-
			   standing no-op (the property exists but is ignored),
			   so the previous CSS-filter approach produced sharp
			   textures on iPhones/iPads while looking soft on every
			   other browser.

			   Workaround: halve the image N× using drawImage's
			   built-in bilinear smoothing. Successive box filters
			   converge to a Gaussian — each halving doubles the
			   effective blur radius. 6 halvings (64× downscale)
			   ≈ 64px blur, which keeps the sky bg from competing
			   with the menu text. Works in WebKit, Blink, and
			   Gecko identically (no engine-specific quirks). */
			const blurPasses = 6;
			let curSrc: CanvasImageSource = skyImage;
			let curW = skyImage.naturalWidth;
			let curH = skyImage.naturalHeight;
			for (let i = 0; i < blurPasses; i++) {
				const newW = Math.max(1, Math.floor(curW / 2));
				const newH = Math.max(1, Math.floor(curH / 2));
				const c = document.createElement('canvas');
				c.width = newW;
				c.height = newH;
				const cx = c.getContext('2d');
				if (!cx) break;
				cx.imageSmoothingEnabled = true;
				cx.imageSmoothingQuality = 'high';
				cx.drawImage(curSrc, 0, 0, newW, newH);
				curSrc = c;
				curW = newW;
				curH = newH;
			}
			gl!.bindTexture(gl!.TEXTURE_2D, skyTex);
			gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
			gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, curSrc as HTMLCanvasElement);
			gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
		};
		skyImage.src = skyFilename;

		/* Iterate every visible nav-item label and draw its text at the
		   label's exact viewport-relative position. The result texture
		   is sampled by the procedural display shader. */
		function renderTextToTexture() {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const hostRect = host!.getBoundingClientRect();
			const W = Math.max(1, Math.round(hostRect.width));
			const H = Math.max(1, Math.round(hostRect.height));

			const off = document.createElement('canvas');
			off.width = W * dpr;
			off.height = H * dpr;
			const ctx = off.getContext('2d')!;
			ctx.scale(dpr, dpr);

			const labels = navList!.querySelectorAll<HTMLElement>('.nav-item-label');
			labels.forEach((labelEl) => {
				const text = labelEl.textContent ?? '';
				if (!text) return;
				const cs = getComputedStyle(labelEl);
				const r = labelEl.getBoundingClientRect();

				ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
				ctx.fillStyle = '#ff00ff';
				ctx.fillStyle = cs.color;
				if (ctx.fillStyle === '#ff00ff' || ctx.fillStyle === 'rgb(255, 0, 255)') {
					const bg = getComputedStyle(document.body).backgroundColor;
					const m = bg.match(/\d+(?:\.\d+)?/g);
					const luma =
						m && m.length >= 3 ? 0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2] : 0;
					ctx.fillStyle = luma < 128 ? '#ffffff' : '#000000';
				}
				ctx.textAlign = 'left';
				ctx.textBaseline = 'top';
				(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
					cs.letterSpacing;
				ctx.fillText(text, r.left - hostRect.left, r.top - hostRect.top);
			});

			if (!textTex) textTex = gl!.createTexture();
			gl!.bindTexture(gl!.TEXTURE_2D, textTex);
			gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
			gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, off);
			gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);

			canvas!.width = off.width;
			canvas!.height = off.height;
		}

		/* Reveal + wave timing knobs. The wave's crest is pinned to
		   the reveal edge (no offset behind), decays inward over
		   WAVE_BAND_PX with peak displacement WAVE_PEAK_PX, and
		   text fades in over the trailing half of the band.

		   REVEAL_DURATION_MS is intentionally slow (4s) for testing —
		   drop to ~420ms once the visual is dialed in. */
		const REVEAL_DURATION_MS = 1000;
		const WAVE_PROPAGATION_MS = 4000;
		const WAVE_SETTLE_MS = 2200;
		const REVEAL_FEATHER_PX = 220;
		const WAVE_BAND_PX = 300;
		const WAVE_PEAK_PX = 35;
		const CHROMA = 0.55;
		/* Text fade-in window (px behind the reveal edge). */
		const TEXT_FADE_START = 20;
		const TEXT_FADE_END = 90;

		/* Reveal/wave start timestamps are LAZILY initialised inside
		   the first render() call — not here at setup time. Capturing
		   them at setup means the time between setup and first visible
		   paint (text-texture upload + at least one rAF + Svelte's
		   reactive update tick) counts toward the elapsed clock, so
		   by the time the user sees the canvas the sqrt easing has
		   already advanced the reveal radius hundreds of pixels.
		   Deferring to first render aligns the clock-zero with the
		   user's first perceived frame, so the circle truly opens
		   from `initialRevealR` instead of mid-easing. */
		let revealStart = 0;
		let waveStart = 0;
		/* Compute reveal geometry from the host's actual bounding
		   rect (works for both fullscreen and compact modes — in
		   compact mode the host is positioned over the navbar's
		   bounds, so hostRect is the navbar). The epicenter is
		   $menuOrigin (viewport-space) translated into host-space. */
		const hostInitRect = host!.getBoundingClientRect();
		const hostInitW = hostInitRect.width;
		const hostInitH = hostInitRect.height;
		const originX = $menuOrigin?.x ?? hostInitRect.left + hostInitW / 2;
		const originY = $menuOrigin?.y ?? hostInitRect.top + hostInitH / 2;
		const revealCenterUv: [number, number] = [
			(originX - hostInitRect.left) / hostInitW,
			1 - (originY - hostInitRect.top) / hostInitH
		];
		const revealFinalPx = Math.hypot(hostInitW, hostInitH) * 1.15;
		/* Reveal starts at radius 0 — the easing then expands to
		   revealFinalPx. Anchoring to the hamburger button size
		   didn't help in practice because the rAF scheduling +
		   compositor latency still let the circle flash in at a
		   visible size by the time it was painted; starting at 0
		   makes the very first painted frame strictly invisible
		   (smoothstep collapses inside the feather), and growth
		   becomes apparent on subsequent frames. */
		const initialRevealR = 0;

		const bgString = getComputedStyle(document.body).backgroundColor;
		const bgMatch = bgString.match(/\d+(?:\.\d+)?/g);
		const bgColor: [number, number, number] =
			bgMatch && bgMatch.length >= 3
				? [+bgMatch[0] / 255, +bgMatch[1] / 255, +bgMatch[2] / 255]
				: [0, 0, 0];

		function render() {
			gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
			gl!.viewport(0, 0, canvas!.width, canvas!.height);
			gl!.clearColor(0, 0, 0, 0);
			gl!.clear(gl!.COLOR_BUFFER_BIT);

			/* Lazy clock init — see the declaration above for why this
			   is deferred to the first render call. After this point
			   both timestamps are in sync with the first paint. */
			if (revealStart === 0) {
				const t0 = performance.now();
				revealStart = t0;
				waveStart = t0;
			}
			const elapsed = performance.now() - revealStart;

			/* Reveal radius — quadratic ease-out: 1 - (1-t)². Fast
			   initial expansion that decelerates into a soft
			   landing at REVEAL_DURATION_MS. Slope at t=0 is 2 (in
			   normalized units), so the first painted frame lifts
			   the radius by ~46px on a 1500px diagonal — visible
			   motion from frame one but no sqrt-style flash where
			   frame 1 was already at ~190px. Slope tapers to 0 at
			   t=1, so the circle gracefully settles at
			   revealFinalPx instead of overshooting. */
			const revealT = Math.min(1, elapsed / REVEAL_DURATION_MS);
			const oneMinusT = 1 - revealT;
			const revealEase = 1 - oneMinusT * oneMinusT;
			let revealR = initialRevealR + revealEase * (revealFinalPx - initialRevealR);
			/* Ease-out's slope at t=1 is 0, so there's no velocity
			   to "continue" past REVEAL_DURATION_MS — the radius
			   just stays at revealFinalPx. revealFinalPx already
			   includes a 1.15× hypot multiplier, so it covers the
			   canvas with margin from any epicenter. */

			/* Wave radius — front-loaded easing over WAVE_PROPAGATION_MS
			   (independent of the reveal), then continues at its own
			   terminal velocity for WAVE_SETTLE_MS while waveAmp
			   fades to zero.

			   Easing exponent 0.30 (vs sqrt's 0.5) makes the wave
			   catch up to the reveal edge much faster early on — at
			   the moment the reveal completes (t = 25% of wave
			   duration) the primary wave is already at ~66% of
			   revealFinal instead of 50%. Total duration is
			   unchanged, so the lingering tail keeps its slow feel.
			   Smaller exponents → more front-loaded; sqrt = 0.5. */
			/* Wave timing uses its own waveStart (vs `elapsed` from
			   reveal) so interactive triggers in compact mode can
			   reset it independently of the reveal phase. */
			const waveElapsed = performance.now() - waveStart;
			const waveT = Math.min(1, waveElapsed / WAVE_PROPAGATION_MS);
			let waveR = Math.pow(waveT, 0.3) * revealFinalPx;
			let waveAmp = 1.0;
			if (waveElapsed > WAVE_PROPAGATION_MS) {
				const waveSettleElapsed = waveElapsed - WAVE_PROPAGATION_MS;
				const waveTerminalV = (0.5 * revealFinalPx) / WAVE_PROPAGATION_MS;
				waveR += waveSettleElapsed * waveTerminalV;
				const waveSettleT = Math.min(1, waveSettleElapsed / WAVE_SETTLE_MS);
				waveAmp = Math.pow(1 - waveSettleT, 3);
			}

			/* Exit dissolve. While the menu is closing we animate
			   u_dissolveT 0 → 1 over DISSOLVE_DURATION_MS. The
			   shader uses this to raise the noise threshold,
			   step()s to a binary mask, dithers the threshold with
			   blue noise — yielding the pixelated/fuzzy disappear. */
			let dissolveT = 0;
			if (closing) {
				const dissolveElapsed = performance.now() - closingStart;
				dissolveT = Math.min(1, dissolveElapsed / DISSOLVE_DURATION_MS);
			}

			bindQuad(displayProg);
			gl!.activeTexture(gl!.TEXTURE0);
			gl!.bindTexture(gl!.TEXTURE_2D, textTex);
			gl!.uniform1i(gl!.getUniformLocation(displayProg, 'u_text'), 0);
			gl!.activeTexture(gl!.TEXTURE1);
			gl!.bindTexture(gl!.TEXTURE_2D, skyTex);
			gl!.uniform1i(gl!.getUniformLocation(displayProg, 'u_sky'), 1);
			/* Sky is stationary — no drift. The cloud pattern reads
			   fine without animation, and removing the pan saves
			   a per-frame uniform update plus avoids any cognitive
			   distraction from a slowly-moving background. */
			gl!.uniform2f(gl!.getUniformLocation(displayProg, 'u_skyDrift'), 0, 0);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_skyDarkness'), 0.18);
			/* Sky background applied to BOTH modes now — compact navbar
			   AND mobile fullscreen. The shader's cover-fit logic
			   handles each mode's aspect (wide → fit-width, tall →
			   fit-height), so the sky doesn't stretch awkwardly in
			   either case. */
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_useSky'), 1);
			/* Aspect ratio of whichever sky/sunset/night image is
			   currently loaded — set by the onload handler from the
			   image's naturalWidth/naturalHeight. The three textures
			   have different ratios (sky 0.75, sunset/night ~0.67),
			   so a single hard-coded value would mis-crop two of
			   them. Until the image arrives, dynamicSkyAspect holds
			   the initial 0.75 guess so the shader has a reasonable
			   value to sample with against the 1×1 black placeholder. */
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_skyAspect'), dynamicSkyAspect);
			gl!.uniform2f(
				gl!.getUniformLocation(displayProg, 'u_revealCenter'),
				revealCenterUv[0],
				revealCenterUv[1]
			);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_revealR'), revealR);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_waveR'), waveR);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_revealFeather'), REVEAL_FEATHER_PX);
			gl!.uniform2f(
				gl!.getUniformLocation(displayProg, 'u_resolution'),
				hostInitW,
				hostInitH
			);
			gl!.uniform3f(
				gl!.getUniformLocation(displayProg, 'u_bgColor'),
				bgColor[0],
				bgColor[1],
				bgColor[2]
			);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_time'), performance.now() / 1000);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_waveBand'), WAVE_BAND_PX);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_wavePeakPx'), WAVE_PEAK_PX);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_chroma'), CHROMA);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_waveAmp'), waveAmp);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_dissolveT'), dissolveT);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_textFadeStart'), TEXT_FADE_START);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_textFadeEnd'), TEXT_FADE_END);
			gl!.drawArrays(gl!.TRIANGLES, 0, 6);
		}

		let raf = 0;
		function frame() {
			if (destroyed) return;
			render();
			raf = requestAnimationFrame(frame);
		}

		renderTextToTexture();
		/* Synchronous first render — guarantees the canvas's first
		   composited paint contains an actual frame (initial circle
		   at `initialRevealR`) rather than the default-cleared
		   transparent state. Without this, the browser would paint
		   the empty canvas first, then a frame later paint the
		   shader's first output — and during that gap the easing
		   clock advances enough to make the circle look "already
		   big" by the time it becomes visible. */
		render();
		raf = requestAnimationFrame(frame);

		document.fonts?.ready.then(() => {
			if (destroyed) return;
			renderTextToTexture();
		});

		return () => {
			destroyed = true;
			cancelAnimationFrame(raf);
			/* Defer ALL WebGL teardown (resource deletion + context
			   release) to after the DOM has actually removed the
			   canvas. Synchronously deleting the program / textures
			   while the canvas is still mounted leaves the GL state
			   invalid — and the next compositor pass before the DOM
			   update can paint the canvas's default state (which
			   reads as a white flash) before the unmount lands. By
			   waiting two animation frames, we guarantee Svelte's
			   DOM update + the browser's composite have both
			   completed, so the canvas is gone when we touch the GL
			   handle. The closure captures everything we need; no
			   reference to `host`/`canvas` after they're unbound. */
			const ctx = gl!;
			const tex = textTex;
			const sky = skyTex;
			const q = quad;
			const dp = displayProg;
			const v = vs;
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (tex) ctx.deleteTexture(tex);
					ctx.deleteTexture(sky);
					ctx.deleteBuffer(q);
					ctx.deleteProgram(dp);
					ctx.deleteShader(v);
					ctx.getExtension('WEBGL_lose_context')?.loseContext();
				});
			});
		};
	}
</script>

{#if mounted}
	<div
		class="menu"
		role="dialog"
		aria-modal="true"
		aria-label="Menu"
		bind:this={host}
	>
		<canvas
			class="menu-canvas"
			bind:this={canvas}
			aria-hidden="true"
		></canvas>
		<nav class="nav-list" bind:this={navList}>
			{#each items as item (item.label + (item.disabled ? ':d' : ''))}
				<button
					type="button"
					class="nav-item"
					class:disabled={item.disabled}
					onclick={item.onSelect}
					disabled={signingIn}
				>
					<span class="nav-item-label">{item.label}</span>
					{#if item.hasUnread}
						<span class="nav-item-dot" aria-label="unread"></span>
					{/if}
				</button>
			{/each}
		</nav>
	</div>
{/if}

<style>
	/* Menu is now a transparent host — the canvas inside renders BOTH
	   the expanding black reveal circle AND the rippling text. The
	   page below shows through wherever the canvas's alpha is < 1
	   (i.e. outside the reveal circle's edge), without needing a CSS
	   mask. */
	.menu {
		position: fixed;
		/* Switched from `inset: 0` to explicit top/left/right plus
		   `height: 100lvh` so the menu extends UNDER iOS Safari's
		   floating URL bar. `inset: 0` resolves the bottom to the
		   small visual viewport (where the URL bar lives), leaving
		   a visible gap below the menu when the bar is on-screen.
		   `100lvh` (large viewport height) is the height of the
		   viewport when browser chrome is fully retracted, so the
		   element always covers the maximum possible area —
		   including the area BEHIND the URL bar. The 100vh line is
		   a fallback for older browsers without `lvh` support
		   (which historically computed `vh` as the large viewport
		   anyway, so behavior is similar). */
		top: 0;
		left: 0;
		right: 0;
		height: 100vh;
		height: 100lvh;
		/* z-index 90 sits below the navbar (z-index 100), so the
		   brand + hamburger remain visible above this overlay and
		   the X button stays clickable to close the menu. */
		z-index: 90;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	/* The canvas sits in front of the nav list and renders the label
	   text with the WebGL ripple effect. `pointer-events: none` so
	   clicks pass through to the underlying buttons (which still
	   handle navigation and a11y). No opacity fade-in — setupRipple
	   does a synchronous first render() before yielding, so the
	   first composited paint already contains a real frame. Adding
	   an 80ms transition would just defer the visible animation
	   start by 80ms, by which time the easing has already advanced
	   enough to make the reveal circle look "already big". */
	.menu-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		opacity: 1;
		pointer-events: none;
		z-index: 1;
	}
	/* DOM labels are NEVER visible — the canvas is the only renderer.
	   Keeping the label spans in the DOM (with opacity:0) preserves
	   layout (so getBoundingClientRect gives the canvas the correct
	   text positions) and accessibility (screen readers still see
	   the button text). The canvas-rendered glyphs are what the user
	   actually sees. */
	.nav-item-label {
		opacity: 0;
	}
	.nav-list {
		position: relative;
		z-index: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 64px 24px;
		max-width: 480px;
		width: 100%;
	}
	.nav-item {
		appearance: none;
		border: 0;
		background: transparent;
		text-align: left;
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.025em;
		font-size: clamp(32px, 7vw, 48px);
		line-height: 1.05;
		color: var(--foreground);
		padding: 8px 0;
		cursor: pointer;
		/* No slideDown animation: the entrance effect is the canvas
		   ripple, which only works if each button's bounding rect is
		   stable from the first frame. (When buttons animated their
		   transform, the text texture got captured at the translated
		   position and didn't follow when they settled.) */
		transition: opacity 160ms ease;
		display: inline-flex;
		align-items: center;
		gap: 12px;
	}
	.nav-item-label {
		display: inline-block;
	}
	.nav-item-dot {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--brand);
		flex-shrink: 0;
	}
	.nav-item:hover {
		opacity: 0.6;
	}
	.nav-item.disabled {
		color: var(--muted-foreground);
		opacity: 0.45;
	}
	.nav-item.disabled:hover {
		opacity: 0.55;
	}
	@media (prefers-reduced-motion: reduce) {
		.menu, .nav-item { animation: none !important; opacity: 1 !important; transform: none !important; }
		/* Skip the circular reveal too — just show the menu fully. */
		.menu {
			-webkit-mask-image: none !important;
			mask-image: none !important;
		}
	}
</style>
