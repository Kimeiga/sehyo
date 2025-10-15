import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HTMLAttributes } from 'svelte/elements';

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

export type HTMLDivAttributes = HTMLAttributes<HTMLDivElement>;
export type HTMLSpanAttributes = HTMLAttributes<HTMLSpanElement>;
export type HTMLHeadingAttributes = HTMLAttributes<HTMLHeadingElement>;

