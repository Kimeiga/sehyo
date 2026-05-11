import { writable, get } from 'svelte/store';

// Global menu visibility — the floating logo button (and the home-screen
// big logo) both flip this. The menu component itself reacts to it.
export const menuOpen = writable(false);

// Viewport-space coordinates of whatever element triggered the open.
// The Menu uses these as the epicenter of the circular reveal animation.
// Null means "no specific origin" — Menu falls back to viewport center.
export const menuOrigin = writable<{ x: number; y: number } | null>(null);

export function openMenu(origin?: { x: number; y: number }) {
	if (origin) menuOrigin.set(origin);
	menuOpen.set(true);
}

export function closeMenu() {
	menuOpen.set(false);
}

export function toggleMenu(origin?: { x: number; y: number }) {
	// Only update the origin when transitioning open — closing shouldn't
	// rewrite it (and we don't currently animate the close).
	if (!get(menuOpen) && origin) menuOrigin.set(origin);
	menuOpen.update((v) => !v);
}
