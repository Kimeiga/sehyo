#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

// Read the _routes.json file
const routesPath = '.svelte-kit/cloudflare/_routes.json';
const routes = JSON.parse(readFileSync(routesPath, 'utf-8'));

// Filter out individual sprite files and replace with wildcard
routes.exclude = routes.exclude.filter(path => !path.startsWith('/sprites/'));

// Add critical excludes at the beginning
routes.exclude.unshift(
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

// Remove duplicates
routes.exclude = [...new Set(routes.exclude)];

// Write back
writeFileSync(routesPath, JSON.stringify(routes, null, '\t'));
console.log('✅ Fixed _routes.json - added sw.js and sprites/* to exclude list');

