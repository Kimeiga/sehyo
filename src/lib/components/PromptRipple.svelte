<script lang="ts">
	import { onMount, onDestroy, type Snippet } from 'svelte';

	let { text, children }: { text: string; children?: Snippet } = $props();

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

	/* Three "layers" of text — red, green, blue — each displaced
	   by a different multiple of the gradient. When the wave is
	   quiet, grad == 0 so all three samples land at the same UV
	   and the channels recombine to white. When the wave is
	   active, the three samples diverge and the offset shows up
	   as RGB chromatic aberration along moving wavefronts. */
	vec2 uvR = clamp(v_uv + grad * (u_strength * 0.55), 0.0, 1.0);
	vec2 uvG = clamp(v_uv + grad * (u_strength * 1.00), 0.0, 1.0);
	vec2 uvB = clamp(v_uv + grad * (u_strength * 1.45), 0.0, 1.0);
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

	outColor = vec4(aR, aG, aB, max(max(aR, aG), aB));
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
			ctx.textAlign = 'center';
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
			const centerX = textX + textW / 2;
			for (const ln of lines) {
				ctx.fillText(ln, centerX, y);
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

		type PendingSplat = { uv: [number, number]; radius: number; strength: number };
		const pendingSplats: PendingSplat[] = [];

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
			gl!.uniform1f(gl!.getUniformLocation(updateProg, 'u_damping'), 0.992);
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
		window.addEventListener('pointerdown', onPointerDown, { passive: true });
		window.addEventListener('pointermove', onPointerMove, { passive: true });

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
			window.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('pointermove', onPointerMove);
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
		<h1 class="ripple-h1" class:is-faded={ready} bind:this={h1El}>{text}</h1>
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
