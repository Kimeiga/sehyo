// Deterministic mesh-gradient backgrounds, computed from a stable seed
// (user id). 12 hand-tuned 4-color palettes; the seed selects one and
// the colors are placed at the four corners of the header so they
// bleed toward the centre, producing a soft "blob" mesh.

const PALETTES: readonly (readonly [string, string, string, string])[] = [
	['#FF6B6B', '#FFD93D', '#6BCF7F', '#4D96FF'],
	['#A8E6CF', '#DCEDC1', '#FFD3B6', '#FFAAA5'],
	['#FFD93D', '#FF6B6B', '#C44569', '#574B90'],
	['#3D5A80', '#98C1D9', '#E0FBFC', '#EE6C4D'],
	['#5F0F40', '#9A031E', '#FB8B24', '#E36414'],
	['#264653', '#2A9D8F', '#E9C46A', '#F4A261'],
	['#1A535C', '#4ECDC4', '#F7FFF7', '#FF6B6B'],
	['#2D3047', '#419D78', '#E0A458', '#FFDBB5'],
	['#22223B', '#4A4E69', '#9A8C98', '#C9ADA7'],
	['#0B132B', '#3A506B', '#5BC0BE', '#6FFFE9'],
	['#1B1B3A', '#693668', '#A74482', '#F84AA7'],
	['#0F4C5C', '#9A031E', '#E36414', '#FFCA3A']
];

function hash(seed: string): number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/**
 * Build the CSS `background` value for a header gradient. Four
 * radial-gradients placed at the four corners, each fading to
 * transparent, layered over a solid base color.
 */
export function gradientFor(seed: string): string {
	const palette = PALETTES[hash(seed) % PALETTES.length];
	const [a, b, c, d] = palette;
	return [
		`radial-gradient(at 0% 0%, ${a} 0%, transparent 55%)`,
		`radial-gradient(at 100% 0%, ${b} 0%, transparent 55%)`,
		`radial-gradient(at 0% 100%, ${c} 0%, transparent 55%)`,
		`radial-gradient(at 100% 100%, ${d} 0%, transparent 55%)`,
		palette[0]
	].join(', ');
}
