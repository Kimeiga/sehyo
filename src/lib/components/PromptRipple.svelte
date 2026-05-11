<script lang="ts">
	import { onMount, onDestroy, type Snippet } from 'svelte';

	type PendingSplat = { uv: [number, number]; radius: number; strength: number };
	/* Pending-splat queue hoisted to component scope (was previously
	   local to setupRipple) so the burstSignal $effect below can push
	   to it from outside the WebGL setup closure. The tick loop drains
	   this on each frame. */
	const pendingSplats: PendingSplat[] = [];

	let {
		text,
		children,
		headingStyle,
		interactive = true,
		knockout = false,
		autoRipple,
		burstSignal,
		burstUv,
		burstSpeed,
		burstWidth,
		burstStrength
	}: {
		text: string;
		children?: Snippet;
		/* Inline style applied to the underlying h1. Lets a consumer
		   override font-size / color / weight / letter-spacing without
		   needing to pierce scoped CSS. Existing call-sites pass
		   nothing → h1 keeps its original hero styling. */
		headingStyle?: string;
		/* When false, no pointer listeners are attached and the canvas
		   ripples only fire from the `autoRipple` timer below. Used by
		   small-scale reuses (e.g. the typing indicator) where mouse
		   interaction would be noise. */
		interactive?: boolean;
		/* When true, the display shader inverts: instead of rendering
		   the text as white pixels on a transparent background, it
		   paints a solid white rectangle filling the canvas and
		   knocks the text shape OUT as transparent holes. Ripples
		   still distort the cutout edges. Used to render the typing
		   indicator as a stencil-style label so it reads as a status
		   tag rather than a plain message. */
		knockout?: boolean;
		/* Optional: programmatically fire small random splats on a
		   timer to mimic "raindrops on a puddle". When set, each tick
		   queues a splat at a random UV inside the configured region
		   of the canvas with the configured radius/strength, then
		   schedules the next tick. Damping defaults to a more
		   aggressive value when autoRipple is provided so ripples
		   die out fast. uRange/vRange default to the central 60%×40%
		   of the canvas — narrow them when the visible text only
		   occupies part of the canvas (e.g. a left-aligned word) so
		   ripples land *on the glyphs* and produce visible refraction
		   instead of disturbing empty space. */
		autoRipple?: {
			intervalMs: number;
			radius?: number;
			strength?: number;
			damping?: number;
			uRange?: [number, number];
			vRange?: [number, number];
		};
		/* A monotonically-increasing counter bumped by the parent to
		   request a single big ripple. Each new non-zero value queues
		   a splat at `burstUv` with `burstRadius` / `burstStrength`.
		   Used to fire "ripple-in" and "ripple-out" bursts when the
		   typing indicator appears or disappears. Initial value 0
		   means no burst (skipped). */
		burstSignal?: number;
		/* Position (in UV coords, 0–1) where the burst splat should
		   land. Defaults to the canvas center. Callers can target the
		   text's actual center if the text isn't centered in the
		   canvas (e.g. left-aligned label in a wider row). */
		burstUv?: [number, number];
		/* Procedural-ring tuning (used when burstSignal fires).
		   - burstSpeed: how fast the ring's radius grows in UV/sec.
		     Default 1.5 means the ring reaches the canvas edge in
		     ~0.66s for a square canvas.
		   - burstWidth: Gaussian sigma of the ring's radial profile
		     in UV. Default 0.06 — wide enough to read as a band,
		     narrow enough that the leading and trailing edges'
		     gradients are clearly distinct.
		   - burstStrength: empirical scale applied to the analytical
		     ring gradient. The wave-equation grad is in `Δ-height
		     per 2-texel`; the procedural gradient is `per-UV`, so
		     this small factor (~0.01) brings them into the same
		     visual range. */
		burstSpeed?: number;
		burstWidth?: number;
		burstStrength?: number;
	} = $props();

	/* Burst is rendered as a PROCEDURAL ring expanding from
	   `burstUv`, separate from the wave-equation FBOs. Each new
	   non-zero burstSignal restarts the ring's age clock. The
	   render() loop passes the current age to the display shader,
	   which analytically adds a Gaussian-profile ring's gradient
	   to whatever the wave equation produced — so the ring sweeps
	   outward cleanly without sloshing against the canvas edges
	   the way a wave-equation splat does at small canvas sizes. */
	let burstStartTime = -Infinity;
	let lastBurstSignal: number | undefined;
	$effect(() => {
		const sig = burstSignal;
		if (sig === undefined || sig === 0) return;
		if (sig === lastBurstSignal) return;
		lastBurstSignal = sig;
		burstStartTime = performance.now();
	});

	let host: HTMLDivElement;
	let h1El: HTMLHeadingElement;
	let canvas: HTMLCanvasElement;
	let ready = $state(false);
	let teardown: (() => void) | null = null;

	onMount(() => {
		teardown = setupRipple();
	});

	onDestroy(() => {
		teardown?.();
		teardown = null;
	});

	/* WebGL2 wave-equation ripple. Three R16F heightfield textures
	   are rotated each frame (prev / curr / next) so the finite-
	   difference wave update has both timesteps it needs. Pointer
	   events splat additive Gaussians into the current heightfield;
	   damping in the update shader makes ripples decay naturally
	   without any explicit "fade" timer. The display shader samples
	   the rasterized text texture with UV offsets driven by the
	   heightfield gradient — that's what reads as "text projected
	   onto a water surface." */
	function setupRipple(): () => void {
		const gl = canvas.getContext('webgl2', {
			premultipliedAlpha: false,
			antialias: false,
			alpha: true
		});
		if (!gl) return () => {};
		if (!gl.getExtension('EXT_color_buffer_float')) return () => {};

		const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
	v_uv = a_pos * 0.5 + 0.5;
	gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

		const UPDATE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform sampler2D u_curr;
uniform vec2 u_texel;
uniform float u_damping;
in vec2 v_uv;
out vec4 outColor;
void main() {
	float n = texture(u_curr, v_uv + vec2(0.0, u_texel.y)).r;
	float s = texture(u_curr, v_uv - vec2(0.0, u_texel.y)).r;
	float e = texture(u_curr, v_uv + vec2(u_texel.x, 0.0)).r;
	float w = texture(u_curr, v_uv - vec2(u_texel.x, 0.0)).r;
	float p = texture(u_prev, v_uv).r;
	float h = (n + s + e + w) * 0.5 - p;
	outColor = vec4(h * u_damping, 0.0, 0.0, 1.0);
}`;

		const SPLAT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_strength;
in vec2 v_uv;
out vec4 outColor;
void main() {
	float existing = texture(u_src, v_uv).r;
	vec2 d = v_uv - u_center;
	float falloff = exp(-dot(d, d) / (u_radius * u_radius));
	outColor = vec4(existing + u_strength * falloff, 0.0, 0.0, 1.0);
}`;

		const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_text;
uniform sampler2D u_height;
uniform vec2 u_texel;
uniform float u_strength;
uniform float u_time;
uniform float u_invert;
/* Procedural ring "burst" — independent of the wave-equation
   FBOs. Each frame the JS side passes the burst's age (or a
   negative value when inactive) and we analytically add a
   Gaussian-profile ring's gradient to the existing wave grad. */
uniform vec2 u_burstCenter;
uniform float u_burstAge;
uniform float u_burstSpeed;
uniform float u_burstWidth;
uniform float u_burstStrength;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
	float hL = texture(u_height, v_uv - vec2(u_texel.x, 0.0)).r;
	float hR = texture(u_height, v_uv + vec2(u_texel.x, 0.0)).r;
	float hD = texture(u_height, v_uv - vec2(0.0, u_texel.y)).r;
	float hU = texture(u_height, v_uv + vec2(0.0, u_texel.y)).r;
	vec2 grad = vec2(hR - hL, hU - hD);

	/* Procedural ring contribution. At any pixel, the heightfield
	   contribution from the ring is a Gaussian centered at radius
	   ringR = burstAge * burstSpeed, measured from u_burstCenter.
	   The radial derivative of that Gaussian is what gets added to
	   the grad — so the leading edge of the ring (d > 0) pulls in
	   one direction and the trailing edge (d < 0) pulls the other,
	   exactly like a real wavefront passing through. The ring
	   amplitude decays exponentially with age so it doesn't ring
	   forever. */
	if (u_burstAge >= 0.0) {
		vec2 toPx = v_uv - u_burstCenter;
		float dist = length(toPx);
		if (dist > 1e-5) {
			float ringR = u_burstAge * u_burstSpeed;
			float d = dist - ringR;
			float sigma = u_burstWidth;
			float gauss = exp(-(d * d) / (2.0 * sigma * sigma));
			float radialDeriv = -d / (sigma * sigma) * gauss;
			float decay = exp(-u_burstAge * 1.5);
			grad += (toPx / dist) * (radialDeriv * u_burstStrength * decay);
		}
	}

	/* Three "layers" of text — red, green, blue — sampled with a
	   shared base displacement around 1.0 × grad (so the whole
	   word translates with the wave) plus a ±0.5 chromatic split
	   for visible aberration at smaller text scales. Wider spread
	   than the previous ±0.15 makes the colored fringe legible
	   on the small 12px monospace label. */
	vec2 uvR = clamp(v_uv + grad * (u_strength * 0.5), 0.0, 1.0);
	vec2 uvG = clamp(v_uv + grad * (u_strength * 1.0), 0.0, 1.0);
	vec2 uvB = clamp(v_uv + grad * (u_strength * 1.5), 0.0, 1.0);
	float aR = texture(u_text, uvR).a;
	float aG = texture(u_text, uvG).a;
	float aB = texture(u_text, uvB).a;

	/* Per-channel grain. Strength scales with the local wave
	   gradient (invisible at rest, visibly noisy during ripples)
	   and is gated by text coverage so noise only shows on the
	   glyphs, not in empty space. Each channel uses a different
	   seed so the noise is decorrelated across R/G/B and reads as
	   colored film grain rather than monochrome static. The time
	   step is quantized to ~30 grain frames/sec so individual
	   noise pixels have visible persistence instead of blurring
	   together at 60fps. */
	float coverage = max(max(aR, aG), aB);
	float fringe = clamp(length(grad) * 80.0, 0.0, 1.0);
	float t = floor(u_time * 30.0);
	float grain = 0.55 * fringe * coverage;
	float nR = hash(v_uv * 1500.0 + vec2(t * 1.3, 0.0));
	float nG = hash(v_uv * 1500.0 + vec2(t * 1.7 + 11.0, 23.0));
	float nB = hash(v_uv * 1500.0 + vec2(t * 2.1 + 47.0, 71.0));
	aR = clamp(aR + (nR - 0.5) * grain, 0.0, 1.0);
	aG = clamp(aG + (nG - 0.5) * grain, 0.0, 1.0);
	aB = clamp(aB + (nB - 0.5) * grain, 0.0, 1.0);

	float coverageMax = max(max(aR, aG), aB);

	if (u_invert > 0.5) {
		/* Knockout mode: solid white rectangle filling the canvas
		   with the text shape cut out (transparent). Chromatic
		   aberration shows up as soft, slightly chromatic edges
		   around the cutout during ripples — the max of the three
		   per-channel samples widens the hole at moving wavefronts
		   so the colored fringe reads at the cutout's rim. */
		outColor = vec4(1.0, 1.0, 1.0, 1.0 - coverageMax);
	} else {
		/* Text-as-paint (original behavior): glyphs render as the
		   three offset alpha samples, recombining to white at rest
		   and splitting into RGB fringes at moving wavefronts. */
		outColor = vec4(aR, aG, aB, coverageMax);
	}
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
		const updateProg = link(vs, compile(gl.FRAGMENT_SHADER, UPDATE_FRAG));
		const splatProg = link(vs, compile(gl.FRAGMENT_SHADER, SPLAT_FRAG));
		const displayProg = link(vs, compile(gl.FRAGMENT_SHADER, DISPLAY_FRAG));

		const quad = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW
		);
		function bindQuad(prog: WebGLProgram) {
			gl!.useProgram(prog);
			const loc = gl!.getAttribLocation(prog, 'a_pos');
			gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
			gl!.enableVertexAttribArray(loc);
			gl!.vertexAttribPointer(loc, 2, gl!.FLOAT, false, 0, 0);
		}

		let textTex: WebGLTexture | null = null;
		let cssW = 0;
		let cssH = 0;

		function renderTextToTexture() {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			/* Canvas is sized to the host (full hero), but the text
			   inside it is positioned at the h1's actual location
			   within the host — so the visible glyphs land exactly
			   where the (invisible) DOM h1 would have rendered, even
			   though the canvas itself extends well beyond it to
			   cover the whole hero area. */
			const hostRect = host.getBoundingClientRect();
			const h1Rect = h1El.getBoundingClientRect();
			cssW = Math.max(1, Math.round(hostRect.width));
			cssH = Math.max(1, Math.round(hostRect.height));
			const textX = h1Rect.left - hostRect.left;
			const textY = h1Rect.top - hostRect.top;
			const textW = Math.max(1, Math.round(h1Rect.width));
			const cs = getComputedStyle(h1El);

			const off = document.createElement('canvas');
			off.width = cssW * dpr;
			off.height = cssH * dpr;
			const ctx = off.getContext('2d')!;
			ctx.scale(dpr, dpr);
			ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
			/* Round-trip the fill color through canvas2d. If the
			   browser refuses the value (e.g. an oklch() string on
			   an older engine), fillStyle silently keeps the prior
			   sentinel — fall back to a contrasting color based on
			   the page background so we never end up rendering black
			   text on a black page. */
			ctx.fillStyle = '#ff00ff';
			ctx.fillStyle = cs.color;
			if (ctx.fillStyle === '#ff00ff' || ctx.fillStyle === 'rgb(255, 0, 255)') {
				const bg = getComputedStyle(document.body).backgroundColor;
				const m = bg.match(/\d+(?:\.\d+)?/g);
				const luma =
					m && m.length >= 3 ? 0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2] : 0;
				ctx.fillStyle = luma < 128 ? '#ffffff' : '#000000';
			}
			/* Mirror the h1's computed text-align so consumers can
			   override via inline style (e.g. left-aligned "typing"
			   indicator). `start`/`end` resolve to left/right under
			   the assumption of a LTR context. */
			let canvasAlign: CanvasTextAlign = 'center';
			if (cs.textAlign === 'left' || cs.textAlign === 'start') canvasAlign = 'left';
			else if (cs.textAlign === 'right' || cs.textAlign === 'end') canvasAlign = 'right';
			ctx.textAlign = canvasAlign;
			ctx.textBaseline = 'top';
			(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
				cs.letterSpacing;

			const lhRaw = parseFloat(cs.lineHeight);
			const fontPx = parseFloat(cs.fontSize);
			const lineH = isFinite(lhRaw) && lhRaw > 0 ? lhRaw : fontPx * 1.05;

			const words = text.split(/\s+/);
			const lines: string[] = [];
			let current = '';
			for (const word of words) {
				const test = current ? `${current} ${word}` : word;
				if (ctx.measureText(test).width > textW && current) {
					lines.push(current);
					current = word;
				} else {
					current = test;
				}
			}
			if (current) lines.push(current);

			let y = textY;
			/* Anchor X depends on the canvas textAlign chosen above:
			   left → text origin at the left edge of the wrap box,
			   right → at the right edge, center → at the midpoint. */
			const anchorX =
				canvasAlign === 'left'
					? textX
					: canvasAlign === 'right'
						? textX + textW
						: textX + textW / 2;
			for (const ln of lines) {
				ctx.fillText(ln, anchorX, y);
				y += lineH;
			}

			if (!textTex) textTex = gl!.createTexture();
			gl!.bindTexture(gl!.TEXTURE_2D, textTex);
			gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true);
			gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, off);
			gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);

			canvas.width = off.width;
			canvas.height = off.height;
		}

		let HW = 0;
		let HH = 0;
		const heightTexs: WebGLTexture[] = [];
		const heightFbos: WebGLFramebuffer[] = [];
		let pIdx = 0;
		let cIdx = 1;
		let nIdx = 2;

		function createHeightTextures(): boolean {
			for (const t of heightTexs) gl!.deleteTexture(t);
			for (const f of heightFbos) gl!.deleteFramebuffer(f);
			heightTexs.length = 0;
			heightFbos.length = 0;

			HW = 384;
			HH = Math.max(1, Math.round(HW * (canvas.height / canvas.width)));

			for (let i = 0; i < 3; i++) {
				const t = gl!.createTexture()!;
				gl!.bindTexture(gl!.TEXTURE_2D, t);
				/* RGBA16F is the most widely-supported renderable float
				   format with EXT_color_buffer_float. R16F is allowed by
				   spec but flaky on real hardware. We only ever read the
				   .r channel anyway. */
				gl!.texImage2D(
					gl!.TEXTURE_2D,
					0,
					gl!.RGBA16F,
					HW,
					HH,
					0,
					gl!.RGBA,
					gl!.HALF_FLOAT,
					null
				);
				gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
				gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
				gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
				gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
				heightTexs.push(t);

				const f = gl!.createFramebuffer()!;
				gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
				gl!.framebufferTexture2D(
					gl!.FRAMEBUFFER,
					gl!.COLOR_ATTACHMENT0,
					gl!.TEXTURE_2D,
					t,
					0
				);
				const status = gl!.checkFramebufferStatus(gl!.FRAMEBUFFER);
				if (status !== gl!.FRAMEBUFFER_COMPLETE) {
					console.error(
						'[PromptRipple] heightfield FBO incomplete (status 0x' +
							status.toString(16) +
							'). Falling back to plain h1.'
					);
					heightFbos.push(f);
					return false;
				}
				heightFbos.push(f);
			}
			/* Textures from texImage2D(..., null) have undefined contents
			   in WebGL — clear all three to zero so the wave update
			   doesn't sample garbage on frame 1. */
			for (const f of heightFbos) {
				gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
				gl!.viewport(0, 0, HW, HH);
				gl!.clearColor(0, 0, 0, 0);
				gl!.clear(gl!.COLOR_BUFFER_BIT);
			}
			gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
			pIdx = 0;
			cIdx = 1;
			nIdx = 2;
			return true;
		}

		/* pendingSplats + PendingSplat type are hoisted to component
		   scope above so the burstSignal $effect can write to them.
		   The setup closure just reads/drains. */

		/* Convert viewport-space client coords to canvas-relative UV,
		   clamped to [0, 1]. This means the cursor anywhere on the
		   page projects to the nearest canvas edge — mouse movement
		   below the canvas (e.g. over the textarea or navbar) ripples
		   the bottom edge, mouse to the right ripples the right edge,
		   etc. Returns null only if the canvas hasn't been laid out. */
		function clientToUv(clientX: number, clientY: number): [number, number] | null {
			const rect = canvas.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return null;
			const u = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
			const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
			return [u, v];
		}

		/* Only fire ripples when the cursor is actually over the
		   prompt text. The .ripple-h1 sits beneath the canvas (which
		   has pointer-events:none) so elementFromPoint will return
		   the h1 — or one of its ancestors via .closest — whenever
		   the cursor is on the text region. This naturally excludes
		   the navbar, the composer, comments below, and any other
		   page chrome without us needing to explicitly check for
		   each one. */
		function isOverText(clientX: number, clientY: number): boolean {
			const el = document.elementFromPoint(clientX, clientY);
			return !!el?.closest('.ripple-h1');
		}

		function onPointerDown(e: PointerEvent) {
			if (!isOverText(e.clientX, e.clientY)) return;
			const uv = clientToUv(e.clientX, e.clientY);
			if (!uv) return;
			pendingSplats.push({ uv, radius: 0.04, strength: 0.5 });
		}

		/* Movement splats — fired from a window-level pointermove
		   listener so the ripple responds even when the cursor is
		   over the textarea / send button / anywhere else on the
		   page. Throttled by a minimum-distance threshold so we
		   queue at most one splat per ~10 CSS px of motion instead
		   of one per pointermove (which fires up to 60+ times/sec). */
		let lastMoveX = -9999;
		let lastMoveY = -9999;
		const MOVE_MIN_DIST_SQ = 100; // 10px

		function onPointerMove(e: PointerEvent) {
			const dx = e.clientX - lastMoveX;
			const dy = e.clientY - lastMoveY;
			if (dx * dx + dy * dy < MOVE_MIN_DIST_SQ) return;
			lastMoveX = e.clientX;
			lastMoveY = e.clientY;
			/* Throttle check is cheap and runs first; the text hit-test
			   uses elementFromPoint (DOM hit-test) so we only do it
			   for the ~6/sec moves that pass the throttle. */
			if (!isOverText(e.clientX, e.clientY)) return;
			const uv = clientToUv(e.clientX, e.clientY);
			if (!uv) return;
			// Smaller, weaker than a click — we want a trail, not bursts.
			pendingSplats.push({ uv, radius: 0.025, strength: 0.06 });
		}

		function applySplat(s: PendingSplat) {
			gl!.bindFramebuffer(gl!.FRAMEBUFFER, heightFbos[nIdx]);
			gl!.viewport(0, 0, HW, HH);
			bindQuad(splatProg);
			gl!.activeTexture(gl!.TEXTURE0);
			gl!.bindTexture(gl!.TEXTURE_2D, heightTexs[cIdx]);
			gl!.uniform1i(gl!.getUniformLocation(splatProg, 'u_src'), 0);
			gl!.uniform2f(gl!.getUniformLocation(splatProg, 'u_center'), s.uv[0], s.uv[1]);
			gl!.uniform1f(gl!.getUniformLocation(splatProg, 'u_radius'), s.radius);
			gl!.uniform1f(gl!.getUniformLocation(splatProg, 'u_strength'), s.strength);
			gl!.drawArrays(gl!.TRIANGLES, 0, 6);
			const tmp = cIdx;
			cIdx = nIdx;
			nIdx = tmp;
		}

		function step() {
			while (pendingSplats.length > 0) applySplat(pendingSplats.shift()!);

			gl!.bindFramebuffer(gl!.FRAMEBUFFER, heightFbos[nIdx]);
			gl!.viewport(0, 0, HW, HH);
			bindQuad(updateProg);
			gl!.activeTexture(gl!.TEXTURE0);
			gl!.bindTexture(gl!.TEXTURE_2D, heightTexs[pIdx]);
			gl!.uniform1i(gl!.getUniformLocation(updateProg, 'u_prev'), 0);
			gl!.activeTexture(gl!.TEXTURE1);
			gl!.bindTexture(gl!.TEXTURE_2D, heightTexs[cIdx]);
			gl!.uniform1i(gl!.getUniformLocation(updateProg, 'u_curr'), 1);
			gl!.uniform2f(gl!.getUniformLocation(updateProg, 'u_texel'), 1 / HW, 1 / HH);
			/* autoRipple's default damping is more aggressive so the
			   small ripples decay quickly ("raindrops on a puddle").
			   Pointer-driven ripples keep the gentler 0.992 default. */
			const dampingValue = autoRipple?.damping ?? (autoRipple ? 0.945 : 0.992);
			gl!.uniform1f(gl!.getUniformLocation(updateProg, 'u_damping'), dampingValue);
			gl!.drawArrays(gl!.TRIANGLES, 0, 6);

			const oldP = pIdx;
			pIdx = cIdx;
			cIdx = nIdx;
			nIdx = oldP;
		}

		function render() {
			gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
			gl!.viewport(0, 0, canvas.width, canvas.height);
			gl!.clearColor(0, 0, 0, 0);
			gl!.clear(gl!.COLOR_BUFFER_BIT);

			bindQuad(displayProg);
			gl!.activeTexture(gl!.TEXTURE0);
			gl!.bindTexture(gl!.TEXTURE_2D, textTex);
			gl!.uniform1i(gl!.getUniformLocation(displayProg, 'u_text'), 0);
			gl!.activeTexture(gl!.TEXTURE1);
			gl!.bindTexture(gl!.TEXTURE_2D, heightTexs[cIdx]);
			gl!.uniform1i(gl!.getUniformLocation(displayProg, 'u_height'), 1);
			gl!.uniform2f(gl!.getUniformLocation(displayProg, 'u_texel'), 1 / HW, 1 / HH);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_strength'), 0.12);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_time'), performance.now() / 1000);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_invert'), knockout ? 1.0 : 0.0);

			/* Burst ring uniforms. burstStartTime stays at -Infinity
			   until a burstSignal triggers, so initially u_burstAge
			   is -∞ and the shader's `if (u_burstAge >= 0.0)` skips
			   the ring entirely. After 1.5s the decay term has
			   shrunk to <5% so we also gate by lifetime. */
			const burstLifetimeMs = 1500;
			const ageMs = performance.now() - burstStartTime;
			const burstAge = ageMs >= 0 && ageMs < burstLifetimeMs ? ageMs / 1000 : -1;
			const bc = burstUv ?? [0.5, 0.5];
			gl!.uniform2f(gl!.getUniformLocation(displayProg, 'u_burstCenter'), bc[0], bc[1]);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_burstAge'), burstAge);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_burstSpeed'), burstSpeed ?? 1.5);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_burstWidth'), burstWidth ?? 0.06);
			gl!.uniform1f(gl!.getUniformLocation(displayProg, 'u_burstStrength'), burstStrength ?? 0.012);

			gl!.drawArrays(gl!.TRIANGLES, 0, 6);
		}

		let raf = 0;
		let destroyed = false;
		let lastH1Top = -1;
		let lastH1Left = -1;
		function frame() {
			if (destroyed) return;
			/* Cheap per-frame check: if the h1 has shifted within the
			   host (because children resized and the flex column
			   re-centered), re-rasterize the text texture so the
			   glyphs stay glued to the DOM h1's actual position.
			   getBoundingClientRect is microsecond-cheap. */
			const hr = host.getBoundingClientRect();
			const h1r = h1El.getBoundingClientRect();
			const top = Math.round(h1r.top - hr.top);
			const left = Math.round(h1r.left - hr.left);
			if (top !== lastH1Top || left !== lastH1Left) {
				lastH1Top = top;
				lastH1Left = left;
				renderTextToTexture();
			}
			step();
			render();
			raf = requestAnimationFrame(frame);
		}

		renderTextToTexture();
		if (!createHeightTextures()) {
			/* FBO setup failed (e.g. RGBA16F not actually renderable on
			   this GPU). Don't flip ready=true — h1 stays visible as the
			   plain-text fallback. */
			return () => {
				if (textTex) gl!.deleteTexture(textTex);
				gl!.deleteBuffer(quad);
				gl!.deleteProgram(updateProg);
				gl!.deleteProgram(splatProg);
				gl!.deleteProgram(displayProg);
				gl!.deleteShader(vs);
				gl!.getExtension('WEBGL_lose_context')?.loseContext();
			};
		}
		ready = true;
		raf = requestAnimationFrame(frame);

		/* If custom fonts haven't loaded yet, the first rasterization
		   used the fallback. Re-render once fonts arrive so the on-
		   screen text matches the DOM h1's metrics. */
		document.fonts?.ready.then(() => {
			if (destroyed) return;
			renderTextToTexture();
		});

		/* Both pointerdown and pointermove listen on `window` (not
		   the canvas). This way:
		   - taps on the textarea, send button, or anywhere else on
		     the page still ripple at the projected canvas position
		     (instead of getting swallowed by whichever element is
		     on top of the canvas);
		   - on touch devices, the canvas doesn't have to absorb the
		     gesture itself — the browser's default touch-action
		     handles scrolling, and pointerdown/pointermove still
		     fire for our ripple while the finger is active.
		   `passive: true` lets the browser do its own gesture
		   handling without us blocking it. */
		if (interactive) {
			window.addEventListener('pointerdown', onPointerDown, { passive: true });
			window.addEventListener('pointermove', onPointerMove, { passive: true });
		}

		/* Auto-ripple timer: queue a small splat at a random UV
		   roughly under the rasterised text every `intervalMs`,
		   then schedule the next tick. Used by the typing-indicator
		   prototype to mimic raindrops landing on the "typing"
		   text. setTimeout (not setInterval) lets each tick jitter
		   the next delay slightly so the rhythm isn't metronomic. */
		let autoRippleTimer: number | undefined;
		if (autoRipple) {
			const [u0, u1] = autoRipple.uRange ?? [0.2, 0.8];
			const [v0, v1] = autoRipple.vRange ?? [0.3, 0.7];
			const tick = () => {
				if (destroyed) return;
				/* Random UV inside the caller's configured region (or
				   the central 60%×40% if none was given). UV y is
				   inverted in PromptRipple — see clientToUv — so
				   vRange's high value corresponds to the top of the
				   canvas, low to the bottom. */
				const u = u0 + Math.random() * (u1 - u0);
				const v = v0 + Math.random() * (v1 - v0);
				pendingSplats.push({
					uv: [u, v],
					radius: autoRipple.radius ?? 0.02,
					strength: autoRipple.strength ?? 0.4
				});
				/* ±25% jitter on the interval so back-to-back drops
				   feel a touch irregular rather than mechanical. */
				const jitter = autoRipple.intervalMs * 0.5 * (Math.random() - 0.5);
				autoRippleTimer = window.setTimeout(tick, autoRipple.intervalMs + jitter);
			};
			autoRippleTimer = window.setTimeout(tick, 400);
		}

		/* ResizeObserver handles canvas-pixel-size changes (viewport
		   resizes the host, FBOs need to be recreated). h1 *position*
		   shifts — caused by children below changing size and the
		   flex layout re-centering — aren't size events, so they're
		   handled in the frame loop via a cheap getBoundingClientRect
		   delta check (see `frame()`). */
		let lastHostW = cssW;
		let lastHostH = cssH;
		const ro = new ResizeObserver(() => {
			const hr = host.getBoundingClientRect();
			const w = Math.round(hr.width);
			const h = Math.round(hr.height);
			if (w === lastHostW && h === lastHostH) return;
			lastHostW = w;
			lastHostH = h;
			renderTextToTexture();
			createHeightTextures();
		});
		ro.observe(host);

		return () => {
			destroyed = true;
			cancelAnimationFrame(raf);
			if (autoRippleTimer !== undefined) window.clearTimeout(autoRippleTimer);
			if (interactive) {
				window.removeEventListener('pointerdown', onPointerDown);
				window.removeEventListener('pointermove', onPointerMove);
			}
			ro.disconnect();
			for (const t of heightTexs) gl!.deleteTexture(t);
			for (const f of heightFbos) gl!.deleteFramebuffer(f);
			if (textTex) gl!.deleteTexture(textTex);
			gl!.deleteBuffer(quad);
			gl!.deleteProgram(updateProg);
			gl!.deleteProgram(splatProg);
			gl!.deleteProgram(displayProg);
			gl!.deleteShader(vs);
			/* Force-release the WebGL context, but defer to the next
			   animation frame so the DOM unmount has time to remove
			   the canvas first — calling loseContext synchronously
			   between cleanup and unmount can cause the canvas to
			   paint its default state for a frame (white flash). */
			const ctx = gl!;
			requestAnimationFrame(() => {
				ctx.getExtension('WEBGL_lose_context')?.loseContext();
			});
		};
	}
</script>

<div class="ripple-host" bind:this={host}>
	<canvas class="ripple-canvas" class:ready bind:this={canvas} aria-hidden="true"></canvas>
	<div class="ripple-content">
		<h1
			class="ripple-h1"
			class:is-faded={ready}
			style={headingStyle ?? ''}
			bind:this={h1El}
		>{text}</h1>
		{@render children?.()}
	</div>
</div>

<style>
	/* Host fills its parent (the .hero section) so the canvas can
	   span the entire hero, not just the prompt text. The flex
	   column vertically centers the content stack (h1 + composer)
	   within the hero, matching the previous .hero-inner layout. */
	.ripple-host {
		position: relative;
		isolation: isolate;
		width: 100%;
		/* height: 100% so the canvas fills the parent's box vertically
		   when the parent has an explicit height (e.g. .typing-row at
		   36px). min-height: inherit is kept as a fallback for cases
		   like .hero where the parent only sets min-height. */
		height: 100%;
		min-height: inherit;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: stretch;
	}
	/* Canvas is the lowest layer — fills the host. Children render
	   above it via .ripple-content's higher z-index. Pointer events
	   are listened on `window` (not the canvas), so the canvas
	   itself doesn't need `touch-action` overrides — the browser's
	   default touch handling stays intact and users can scroll the
	   page with a swipe over the canvas area on mobile. `pointer-
	   events: none` makes that even more explicit: the canvas can't
	   intercept anything, taps and swipes pass through to whatever
	   element is at that position. */
	.ripple-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms ease;
		z-index: 0;
	}
	.ripple-canvas.ready {
		opacity: 1;
	}
	/* Content layer sits above the canvas. Stacks h1 and the
	   composer (passed via the children snippet) in a centered
	   column with a 40px gap between them. */
	.ripple-content {
		position: relative;
		z-index: 1;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 40px;
		padding: 0 12px;
	}
	/* H1 styling matches the original .prompt-today rule from the
	   parent page. The h1 stays in the DOM (a11y, SSR, no-JS
	   fallback) and only fades to transparent once WebGL is up — the
	   visible glyphs are then drawn into the canvas at the same
	   on-page position. */
	.ripple-content > .ripple-h1 {
		font-family: var(--font-sans);
		font-weight: 100;
		letter-spacing: -0.025em;
		font-size: clamp(48px, 12vw, 144px);
		line-height: 1.02;
		text-align: center;
		color: var(--foreground);
		margin: 0;
		max-width: 1000px;
		width: 100%;
		transition: opacity 200ms ease;
	}
	.ripple-content > .ripple-h1.is-faded {
		opacity: 0;
	}
</style>
