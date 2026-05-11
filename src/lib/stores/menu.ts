import { writable, get } from 'svelte/store';

// Global menu visibility — the floating logo button (and the home-screen
// big logo) both flip this. The menu component itself reacts to it.
export const menuOpen = writable(false);

// Viewport-space coordinates of whatever element triggered the open,
// plus its half-extent (treated as the starting reveal radius). The
// Menu uses {x,y} as the circular reveal epicenter and `r` to seed the
// initial circle so it visually matches the trigger button rather than
// flashing to a large radius on the first frame.
export type MenuOrigin = { x: number; y: number; r?: number };
export const menuOrigin = writable<MenuOrigin | null>(null);

export function openMenu(origin?: MenuOrigin) {
	if (origin) menuOrigin.set(origin);
	menuOpen.set(true);
}

export function closeMenu() {
	menuOpen.set(false);
}

export function toggleMenu(origin?: MenuOrigin) {
	// Only update the origin when transitioning open — closing shouldn't
	// rewrite it (and we don't currently animate the close).
	if (!get(menuOpen) && origin) menuOrigin.set(origin);
	menuOpen.update((v) => !v);
}
