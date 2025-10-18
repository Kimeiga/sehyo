/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Create a unique cache name for this deployment
const CACHE = `cache-${version}`;

// Assets to cache on install
const ASSETS = [
	...build, // the app itself
	...files  // everything in `static`
];

// Install event - cache all assets
sw.addEventListener('install', (event) => {
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}

	event.waitUntil(addFilesToCache());
});

// Activate event - clean up old caches
sw.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}

	event.waitUntil(deleteOldCaches());
});

// Fetch event - serve from cache, fallback to network
sw.addEventListener('fetch', (event) => {
	// Ignore non-GET requests
	if (event.request.method !== 'GET') return;

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		// Serve build files from cache
		if (ASSETS.includes(url.pathname)) {
			const response = await cache.match(url.pathname);
			if (response) {
				return response;
			}
		}

		// Try the network first for everything else
		try {
			const response = await fetch(event.request);

			// Cache successful responses for static assets
			if (response.status === 200) {
				// Cache images, fonts, and other static assets
				if (
					url.pathname.startsWith('/sprites/') ||
					url.pathname.match(/\.(png|jpg|jpeg|svg|webp|woff|woff2|ttf|eot)$/)
				) {
					cache.put(event.request, response.clone());
				}
			}

			return response;
		} catch (err) {
			// If network fails, try cache
			const response = await cache.match(event.request);
			if (response) {
				return response;
			}

			// If both fail, return a generic offline page for navigation requests
			if (event.request.mode === 'navigate') {
				return new Response('Offline', {
					status: 503,
					statusText: 'Service Unavailable',
					headers: new Headers({
						'Content-Type': 'text/plain'
					})
				});
			}

			throw err;
		}
	}

	event.respondWith(respond());
});

// Handle messages from the client
sw.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		sw.skipWaiting();
	}
});

