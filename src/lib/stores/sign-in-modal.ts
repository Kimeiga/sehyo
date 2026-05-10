import { writable } from 'svelte/store';

interface SignInModalState {
	open: boolean;
	message: string;
}

const initial: SignInModalState = { open: false, message: '' };

export const signInModal = writable<SignInModalState>(initial);

export function promptSignIn(message: string) {
	signInModal.set({ open: true, message });
}

export function closeSignInModal() {
	signInModal.update((s) => ({ ...s, open: false }));
}
