#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const routesPath = '.svelte-kit/cloudflare/_routes.json';
const routes = JSON.parse(readFileSync(routesPath, 'utf-8'));

routes.exclude = routes.exclude.filter(path => !path.startsWith('/sprites/'));

routes.exclude.unshift(
	'/',
	'/index.html',
	'/_app/immutable/*',
	'/_app/version.json',
	'/sw.js',
	'/workbox-*.js',
	'/sprites/*',
	'/manifest.json',
	'/manifest.webmanifest',
	'/pwa-192x192.png',
	'/pwa-512x512.png',
	'/pwa-icon.svg',
	'/favicon.png',
	'/robots.txt'
);

routes.exclude = [...new Set(routes.exclude)];

writeFileSync(routesPath, JSON.stringify(routes, null, '\t'));
console.log('✅ Fixed _routes.json - root and critical static assets bypass Functions');
