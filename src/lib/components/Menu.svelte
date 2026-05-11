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
	let canvasReady = $state(false);
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
			canvasReady = false;
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
	waveDispPx += wakeAt(withinWave, 0.0, u_waveBand, u_wavePeakPx, 0.5);
	waveDispPx += wakeAt(withinWave, u_waveBand * 0.75, u_waveBand * 0.85, u_wavePeakPx * 0.30, 1.5);
	waveDispPx += wakeAt(withinWave, u_waveBand * 1.40, u_waveBand * 0.65, u_wavePeakPx * 0.13, 1.5);
	waveDispPx *= u_waveAmp;

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
	float textFadeStart = 20.0;
	float textFadeEnd = 90.0;
	float textShown = smoothstep(textFadeStart, textFadeEnd, withinReveal);
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
	vec3 textColor = vec3(aR, aG, aB);
	vec3 baseColor = mix(u_bgColor, textColor, coverage);
	float revealAlpha = 1.0 - smoothstep(u_revealR - u_revealFeather, u_revealR, pixelDist);

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
	float perlinValue = fbm(v_uv * 6.0);
	float bn = blueNoiseIGN(gl_FragCoord.xy);
	float effThresh = mix(-0.1, 1.1, u_dissolveT);
	float ditheredThresh = effThresh + (bn - 0.5) * 0.18;
	float dissolveMask = step(ditheredThresh, perlinValue);

	outColor = vec4(baseColor, revealAlpha * dissolveMask);
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

		let textTex: WebGLTexture | null = null;

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
		const REVEAL_FEATHER_PX = 220;
		/* Wave timing is decoupled from the reveal. Reveal snaps
		   open in REVEAL_DURATION_MS; the ripple itself takes
		   WAVE_PROPAGATION_MS to traverse the menu (slow, so the
		   wake intervals + lingering match the feel the wave had
		   back when the entire reveal was 4s long). After
		   propagation completes, WAVE_SETTLE_MS gives the wakes
		   trailing time to keep sweeping outward at terminal
		   velocity while fading their amplitude to zero. */
		const WAVE_PROPAGATION_MS = 4000;
		const WAVE_SETTLE_MS = 2200;
		/* Primary wave: 300px band lets the ripple linger at each
		   pixel for a meaningful slice of the reveal. 100px peak
		   displacement is intentionally massive — paired with the
		   slow `decayPow=0.5` bell in the shader, this puts a lot
		   of warp into the visible-text zone. Wakes scale off this
		   in the shader at 0.30× and 0.13×, with sharper decay so
		   they read as quick echoes rather than competing peers. */
		const WAVE_BAND_PX = 300;
		const WAVE_PEAK_PX = 35;
		/* Chroma multiplier dialed back from 1.0 → 0.55 since the
		   raw wave displacement is now ~5× larger; without the
		   compensation the chromatic-aberration fringes would
		   stretch into rainbow streaks. */
		const CHROMA = 0.55;

		const revealStart = performance.now();
		const revealCenterUv: [number, number] = [
			($menuOrigin?.x ?? viewportW / 2) / viewportW,
			1 - ($menuOrigin?.y ?? viewportH / 2) / viewportH
		];
		const revealFinalPx = Math.hypot(viewportW, viewportH) * 1.15;

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

			const elapsed = performance.now() - revealStart;

			/* Reveal radius — fast sqrt easing over REVEAL_DURATION_MS,
			   then continues at terminal velocity (no need to fade
			   reveal-alpha since we want it to stay full once the
			   circle has covered the screen). */
			const revealT = Math.min(1, elapsed / REVEAL_DURATION_MS);
			let revealR = Math.sqrt(revealT) * revealFinalPx;
			if (elapsed > REVEAL_DURATION_MS) {
				const revealSettleElapsed = elapsed - REVEAL_DURATION_MS;
				const revealTerminalV = (0.5 * revealFinalPx) / REVEAL_DURATION_MS;
				revealR += revealSettleElapsed * revealTerminalV;
			}

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
			const waveT = Math.min(1, elapsed / WAVE_PROPAGATION_MS);
			let waveR = Math.pow(waveT, 0.3) * revealFinalPx;
			let waveAmp = 1.0;
			if (elapsed > WAVE_PROPAGATION_MS) {
				const waveSettleElapsed = elapsed - WAVE_PROPAGATION_MS;
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
				viewportW,
				viewportH
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
			gl!.drawArrays(gl!.TRIANGLES, 0, 6);
		}

		let raf = 0;
		let destroyed = false;
		function frame() {
			if (destroyed) return;
			render();
			raf = requestAnimationFrame(frame);
		}

		renderTextToTexture();
		canvasReady = true;
		raf = requestAnimationFrame(frame);

		document.fonts?.ready.then(() => {
			if (destroyed) return;
			renderTextToTexture();
		});

		return () => {
			destroyed = true;
			cancelAnimationFrame(raf);
			if (textTex) gl!.deleteTexture(textTex);
			gl!.deleteBuffer(quad);
			gl!.deleteProgram(displayProg);
			gl!.deleteShader(vs);
			/* Force-release the WebGL context, but defer to the next
			   animation frame so Svelte's DOM unmount has time to
			   actually remove the canvas first. Calling loseContext
			   synchronously between cleanup and DOM removal causes
			   the canvas to briefly paint its default state — which
			   reads as a white flash before the menu fully
			   disappears. The deferred call fires after the canvas
			   is gone, so the lost-context state is never visible.
			   The closure captures `gl`, so the deferred call still
			   works even though the canvas element is already gone. */
			const ctx = gl!;
			requestAnimationFrame(() => {
				ctx.getExtension('WEBGL_lose_context')?.loseContext();
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
			class:ready={canvasReady}
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
		inset: 0;
		z-index: 90;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	/* The canvas sits in front of the nav list and renders the label
	   text with the WebGL ripple effect. `pointer-events: none` so
	   clicks pass through to the underlying buttons (which still
	   handle navigation and a11y). Fades in once the WebGL pipeline
	   has rasterized the first text texture. */
	.menu-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		opacity: 0;
		pointer-events: none;
		transition: opacity 80ms ease;
		z-index: 1;
	}
	.menu-canvas.ready {
		opacity: 1;
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
