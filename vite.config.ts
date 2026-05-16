import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	server: {
		proxy: {
			// Local-dev hop: forward /ws/* to the typing Worker running under
			// `wrangler dev` (workers/typing). Keeping the path on the same
			// origin as Vite means the browser sends our session cookie on
			// the WebSocket handshake — the typing Worker validates it. In
			// production this proxy doesn't exist; the client connects
			// directly to wss://typing.sehyo.com/ws/... instead.
			'/ws': {
				target: 'http://localhost:8787',
				ws: true,
				changeOrigin: false
			}
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			srcDir: './src',
			mode: 'production',
			strategies: 'generateSW',
			// autoUpdate so a new deploy's service worker takes over
			// without users needing to hard-refresh. Without this the
			// previous SW continued serving the old precache for tabs
			// that stayed open across deploys, leaving people on
			// stale bundles for hours and making "wait, I deployed
			// the fix, why is X still broken" a recurring pattern.
			registerType: 'autoUpdate',
			scope: '/',
			base: '/',
			selfDestroying: false,
			manifest: {
				name: 'Sehyo',
				short_name: 'Sehyo',
				description: 'A daily question. Share your thoughts.',
				theme_color: '#00A5D8',
				background_color: '#ffffff',
				display: 'standalone',
				start_url: '/',
				icons: [
					{
						src: '/pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable'
					},
					{
						src: '/pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				// Sehyo is fully SSR — no SPA shell to fall back to. Disable
				// navigation precaching so workbox stops trying to serve "/"
				// from the precache (which throws non-precached-url at runtime).
				navigateFallback: null,
				// Activate the new SW the moment it installs and take over
				// every open tab on the next event loop turn. Pairs with
				// registerType: 'autoUpdate' above.
				skipWaiting: true,
				clientsClaim: true,
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'google-fonts-cache',
							expiration: {
								maxEntries: 10,
								maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
							},
							cacheableResponse: {
								statuses: [0, 200]
							}
						}
					}
				]
			},
			devOptions: {
				enabled: true,
				type: 'module',
				navigateFallback: null
			}
		})
	]
});
