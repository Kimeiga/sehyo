import { writable } from 'svelte/store';

// Global menu visibility — the floating logo button (and the home-screen
// big logo) both flip this. The menu component itself reacts to it.
export const menuOpen = writable(false);

export function openMenu() {
	menuOpen.set(true);
}

export function closeMenu() {
	menuOpen.set(false);
}

export function toggleMenu() {
	menuOpen.update((v) => !v);
}
