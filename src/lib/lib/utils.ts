import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HTMLAttributes } from 'svelte/elements';
import type { Snippet } from 'svelte';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type WithElementRef<T extends Record<string, any>> = T & {
	ref?: HTMLElement | null;
};

export type WithAsChild<T extends Record<string, any>> = T & {
	asChild?: boolean;
};

export type WithChild<T extends Record<string, any>> = T & {
	children?: any;
};

export type WithoutChildren<T extends Record<string, any>> = Omit<T, 'children'>;
export type WithoutChild<T extends Record<string, any>> = Omit<T, 'child'> & {
	children?: Snippet<[any]> | Snippet | null;
};
export type WithoutChildrenOrChild<T extends Record<string, any>> = Omit<T, 'children' | 'child'>;

export type HTMLDivAttributes = HTMLAttributes<HTMLDivElement>;
export type HTMLSpanAttributes = HTMLAttributes<HTMLSpanElement>;
export type HTMLHeadingAttributes = HTMLAttributes<HTMLHeadingElement>;
