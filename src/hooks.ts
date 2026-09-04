import type { Reroute } from '@sveltejs/kit';

export const reroute: Reroute = ({ url }) => {
	if (url.pathname === '/live') return '/';
	return url.pathname;
};
