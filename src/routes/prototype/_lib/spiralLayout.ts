export type Sized<T> = T & { w: number; h: number };
export type Placed<T> = T & {
	w: number;
	h: number;
	x: number;
	y: number;
	isLocalAnchor?: boolean;
	isActiveAnchor?: boolean;
	isGridlocked?: boolean;
};

export type SpiralLayoutOptions = {
	/** Gap between adjacent cards, in px. Default 24. */
	padding?: number;
	/** Max per-axis random y offset applied to candidates, in px. Default 6.
	 *  When `xStep` is set, this only applies to the first card opening a
	 *  column (subsequent cards stack with exact `padding` gaps). When `xStep`
	 *  is unset, applies to both x and y of every candidate. */
	jiggle?: number;
	/** When set, every candidate's x snaps to the nearest multiple of this
	 *  value (relative to `center.x`). Use when all cards share a fixed width
	 *  to enforce strict vertical column alignment. */
	xStep?: number;
	/** When a placed card's distance to its nearest anchor exceeds this, the
	 *  card itself becomes a new local anchor. Subsequent candidates are scored
	 *  by distance to their *nearest* anchor, so distant clusters form their
	 *  own spirals instead of every card being measured against `center`.
	 *  Default `Infinity` (no local anchors; original behavior). */
	localAnchorThreshold?: number;
	/** Candidate generation only considers placed cards whose center is within
	 *  this distance of some anchor (center or a local anchor). Caps the work
	 *  per iteration so the algorithm scales to large canvases. Must be at
	 *  least `localAnchorThreshold` or new clusters can't bootstrap. Default
	 *  `Infinity` (no filtering). */
	searchRadius?: number;
	/** World-space anchor for items[0]. Default (0, 0). */
	center?: { x: number; y: number };
	/** Reference point used to pick the *active* anchor: among all anchors
	 *  (center + local), the one closest to this point governs candidate
	 *  scoring. Defaults to `center`, which is what initial layout wants —
	 *  cards spiral around start. At runtime (for lazy loading) you'd set this
	 *  to the viewport center so new placements spiral around whichever anchor
	 *  is closest to the user's view. */
	activeAnchor?: { x: number; y: number };
};

type Direction = { dx: -1 | 0 | 1; dy: -1 | 0 | 1; idx: 0 | 1 | 2 | 3 };

// Clockwise from top — also encodes tiebreak priority (lower idx wins ties).
const DIRECTIONS: Direction[] = [
	{ dx: 0, dy: -1, idx: 0 }, // top
	{ dx: 1, dy: 0, idx: 1 }, // right
	{ dx: 0, dy: 1, idx: 2 }, // bottom
	{ dx: -1, dy: 0, idx: 3 } // left
];

const TIE_EPSILON = 1e-6;

/**
 * Place sized items in a grid-anchored greedy spiral. items[0] sits at the
 * center; each subsequent item is positioned adjacent to an already-placed
 * card (top/right/bottom/left). Among valid (non-colliding) candidates, the
 * one closest to its *nearest* anchor wins; ties break clockwise (top > right
 * > bottom > left) then by earliest placed neighbor.
 *
 * Anchors start with just `center`. When `localAnchorThreshold` is set, any
 * placed card whose nearest-anchor distance exceeds the threshold gets
 * promoted to a new anchor, so distant clusters form their own spirals.
 *
 * Order of `items` encodes closeness to center. Caller decides sort order.
 */
export function spiralLayout<T>(
	items: Sized<T>[],
	options: SpiralLayoutOptions = {}
): Placed<T>[] {
	const padding = options.padding ?? 24;
	const jiggle = options.jiggle ?? 6;
	const xStep = options.xStep;
	const center = options.center ?? { x: 0, y: 0 };
	const localAnchorThreshold = options.localAnchorThreshold ?? Infinity;
	const searchRadius = options.searchRadius ?? Infinity;
	const activeAnchorRef = options.activeAnchor ?? center;

	if (items.length === 0) return [];

	const placed: Placed<T>[] = [
		{ ...items[0], x: center.x, y: center.y, isLocalAnchor: true }
	];
	const anchors: Array<{ x: number; y: number }> = [{ x: center.x, y: center.y }];
	// Parallel to `placed`. Once a card has neighbors on all four sides, it
	// can't ever produce a useful candidate — top/bottom candidates duplicate
	// what the topmost/bottommost card in its column already generates, and
	// left/right candidates duplicate what cards in the adjacent column
	// generate. Marking it gridlocked skips it in future iterations.
	const gridlocked: boolean[] = [false];

	for (let i = 1; i < items.length; i++) {
		const item = items[i];
		let best: { x: number; y: number; dist: number; tie: number } | null = null;

		// Active anchor: the one closest to `activeAnchorRef`. For one-shot
		// initial layout this is always `start` since activeAnchorRef defaults
		// to center; for runtime continuation the caller can repoint this to
		// the viewport center to switch active clusters.
		const active = closestAnchor(anchors, activeAnchorRef);

		for (let p = 0; p < placed.length; p++) {
			if (gridlocked[p]) continue;
			const neighbor = placed[p];

			// Skip neighbors that aren't within searchRadius of any anchor. Keeps
			// candidate generation O(neighbors-near-anchors) rather than O(N).
			if (nearestAnchorDistance(neighbor.x, neighbor.y, anchors) > searchRadius) {
				continue;
			}

			for (const dir of DIRECTIONS) {
				const baseX = neighbor.x + dir.dx * (neighbor.w / 2 + padding + item.w / 2);
				const baseY = neighbor.y + dir.dy * (neighbor.h / 2 + padding + item.h / 2);
				const x =
					xStep === undefined
						? baseX + jitter(i, p, dir.idx, 0) * jiggle
						: center.x + Math.round((baseX - center.x) / xStep) * xStep;

				let y: number;
				if (xStep === undefined) {
					y = baseY + jitter(i, p, dir.idx, 1) * jiggle;
				} else {
					// Column-stacking: y is fully determined by what's already in this
					// column. Either inherit the neighbor's y (empty column) or sit
					// exactly `padding` above the topmost / below the bottommost card.
					let minTop = Infinity;
					let maxBottom = -Infinity;
					for (const c of placed) {
						if (Math.abs(c.x - x) >= 0.5) continue;
						const top = c.y - c.h / 2;
						const bottom = c.y + c.h / 2;
						if (top < minTop) minTop = top;
						if (bottom > maxBottom) maxBottom = bottom;
					}
					if (minTop === Infinity) {
						y = baseY + jitter(i, p, dir.idx, 1) * jiggle;
					} else {
						const yAbove = minTop - padding - item.h / 2;
						const yBelow = maxBottom + padding + item.h / 2;
						if (dir.dy < 0) {
							y = yAbove;
						} else if (dir.dy > 0) {
							y = yBelow;
						} else {
							y =
								Math.abs(yAbove - baseY) <= Math.abs(yBelow - baseY)
									? yAbove
									: yBelow;
						}
					}
				}

				if (collides(x, y, item.w, item.h, placed, 0)) continue;

				// Score: distance to the *active* anchor only. Distant local
				// anchors don't pull placements during the run that created them,
				// which prevents cards from drifting away from `start` before the
				// area around it is filled.
				const dist = Math.hypot(x - active.x, y - active.y);
				const tie = p * 4 + dir.idx;

				if (
					best === null ||
					dist < best.dist - TIE_EPSILON ||
					(Math.abs(dist - best.dist) <= TIE_EPSILON && tie < best.tie)
				) {
					best = { x, y, dist, tie };
				}
			}
		}

		if (best !== null) {
			// Promotion uses *nearest*-anchor distance, not the active-anchor
			// score: a card already near a local anchor shouldn't be promoted
			// just because it's far from `start`. This keeps anchors sparse
			// (each one >threshold from all others) while placement remains
			// centered on `start`.
			const nearestDist = nearestAnchorDistance(best.x, best.y, anchors);
			const isLocalAnchor = nearestDist > localAnchorThreshold;
			placed.push({ ...item, x: best.x, y: best.y, isLocalAnchor });
			gridlocked.push(false);
			if (isLocalAnchor) {
				anchors.push({ x: best.x, y: best.y });
			}
		} else {
			// Fallback: no candidate was free — should be impossible for sane
			// inputs (4 sides × N placed cards always yields a frontier slot).
			console.warn('spiralLayout: no candidate available; placing at fallback', {
				index: i
			});
			const fallbackX =
				Math.max(...placed.map((c) => c.x + c.w / 2)) + padding + item.w / 2;
			placed.push({ ...item, x: fallbackX, y: center.y, isLocalAnchor: false });
			gridlocked.push(false);
		}

		// Refresh gridlock flags. Adding the new card can only fill a side that
		// was previously open, so we only need to recheck cards that aren't
		// already gridlocked. xStep-mode only: the test relies on column ids.
		if (xStep !== undefined) {
			for (let q = 0; q < placed.length; q++) {
				if (gridlocked[q]) continue;
				if (isCardGridlocked(placed[q], placed, xStep)) {
					gridlocked[q] = true;
				}
			}
		}
	}

	// Surface the final gridlock state so callers can visualize it.
	for (let q = 0; q < placed.length; q++) {
		placed[q].isGridlocked = gridlocked[q];
	}

	// Mark whichever local anchor is currently active so callers can label it.
	const active = closestAnchor(anchors, activeAnchorRef);
	for (const p of placed) {
		if (
			p.isLocalAnchor &&
			Math.abs(p.x - active.x) < 0.5 &&
			Math.abs(p.y - active.y) < 0.5
		) {
			p.isActiveAnchor = true;
			break;
		}
	}

	return placed;
}

function closestAnchor(
	anchors: Array<{ x: number; y: number }>,
	ref: { x: number; y: number }
): { x: number; y: number } {
	let best = anchors[0];
	let bestDist = Math.hypot(best.x - ref.x, best.y - ref.y);
	for (let i = 1; i < anchors.length; i++) {
		const d = Math.hypot(anchors[i].x - ref.x, anchors[i].y - ref.y);
		if (d < bestDist) {
			bestDist = d;
			best = anchors[i];
		}
	}
	return best;
}

/** A card is gridlocked when, in xStep mode, it has at least one neighbor on
 *  each of its four cardinal sides: same column above, same column below, the
 *  adjacent column to the left with y-overlap, and the adjacent column to the
 *  right with y-overlap. Such a card can no longer contribute novel candidates. */
function isCardGridlocked<T>(
	card: Placed<T>,
	placed: Placed<T>[],
	xStep: number
): boolean {
	let topFilled = false;
	let bottomFilled = false;
	let leftFilled = false;
	let rightFilled = false;
	const cTop = card.y - card.h / 2;
	const cBottom = card.y + card.h / 2;

	for (const p of placed) {
		if (p === card) continue;
		const colDiff = Math.round((p.x - card.x) / xStep);
		if (colDiff === 0) {
			if (p.y < card.y) topFilled = true;
			else if (p.y > card.y) bottomFilled = true;
		} else if (colDiff === -1 || colDiff === 1) {
			const pTop = p.y - p.h / 2;
			const pBottom = p.y + p.h / 2;
			if (pTop < cBottom && pBottom > cTop) {
				if (colDiff === -1) leftFilled = true;
				else rightFilled = true;
			}
		}
		if (topFilled && bottomFilled && leftFilled && rightFilled) return true;
	}
	return false;
}

function nearestAnchorDistance(
	x: number,
	y: number,
	anchors: Array<{ x: number; y: number }>
): number {
	let min = Infinity;
	for (const a of anchors) {
		const d = Math.hypot(x - a.x, y - a.y);
		if (d < min) min = d;
	}
	return min;
}

/** Deterministic noise in [-1, 1]. */
function jitter(i: number, p: number, dirIdx: number, axis: number): number {
	const s = Math.sin(i * 12.9898 + p * 78.233 + dirIdx * 37.719 + axis * 9.001) * 43758.5453;
	const f = s - Math.floor(s);
	return f * 2 - 1;
}

function collides(
	x: number,
	y: number,
	w: number,
	h: number,
	placed: Array<{ x: number; y: number; w: number; h: number }>,
	padding: number
): boolean {
	const halfW = w / 2;
	const halfH = h / 2;
	for (const p of placed) {
		const dx = Math.abs(x - p.x);
		const dy = Math.abs(y - p.y);
		if (dx < halfW + p.w / 2 + padding && dy < halfH + p.h / 2 + padding) {
			return true;
		}
	}
	return false;
}
