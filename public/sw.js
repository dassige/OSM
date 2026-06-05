/* OpReady Service Worker — App Shell + Offline Fallback */

// On localhost the SW registers (satisfying PWA criteria) but skips all
// caching so every file is always fetched fresh from the dev server.
const IS_DEV = self.location.hostname === 'localhost' ||
               self.location.hostname === '127.0.0.1';

const CACHE_VERSION = 'v5';
const SHELL_CACHE   = `opready-shell-${CACHE_VERSION}`;
const PAGES_CACHE   = `opready-pages-${CACHE_VERSION}`;

// Core app shell — cached on install.
// Keep this list lean: every byte here is downloaded on every SW install.
// Large decorative assets (logo.png ~4.6 MB) must NOT be listed here —
// they will be cached lazily by stale-while-revalidate on first use instead.
const SHELL_ASSETS = [
    '/offline.html',
    '/styles.css',
    '/sidebar.css',
    '/js/sidebar.js',
    '/utils.js',
    '/toast.js',
    '/js/pwa.js',
    '/resources/favicon.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    // /manifest.json — served dynamically, not pre-cached
    // /resources/logo.png — 4.6 MB, cached lazily on first page load
];

// ── Install: pre-cache the app shell ────────────────────────────────────────
// Non-atomic: each asset is attempted individually so one slow or missing
// file cannot abort the entire service worker installation (critical on
// mobile connections where a single timeout would block Android installability).
// On localhost (IS_DEV) skip pre-caching entirely so edits are visible immediately.
self.addEventListener('install', event => {
    self.skipWaiting();
    if (IS_DEV) return;
    event.waitUntil(
        caches.open(SHELL_CACHE).then(async cache => {
            await Promise.all(
                SHELL_ASSETS.map(async url => {
                    try {
                        await cache.add(url);
                    } catch (err) {
                        console.warn('[SW] Failed to pre-cache ' + url + ':', err);
                    }
                })
            );
        })
    );
});

// ── Activate: delete old cache versions ─────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== SHELL_CACHE && k !== PAGES_CACHE)
                    .map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// ── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Never intercept non-GET, cross-origin, or API requests
    if (request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;
    if (url.pathname.startsWith('/socket.io/')) return;

    // Dev mode: pass everything straight to the network so edits are instant
    if (IS_DEV) return;

    // Shell assets → cache-first (always fresh after SW update)
    if (SHELL_ASSETS.includes(url.pathname)) {
        event.respondWith(cacheFirst(request, SHELL_CACHE));
        return;
    }

    // Static assets (CSS, JS, images, fonts) → stale-while-revalidate
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/i.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
        return;
    }

    // HTML page navigations → network-first, fallback to cache, then offline
    if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(networkFirstWithOfflineFallback(request));
        return;
    }
});

// ── Strategy helpers ─────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return caches.match('/offline.html');
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
    }).catch(() => null);

    return cached || (await fetchPromise) || caches.match('/offline.html');
}

async function networkFirstWithOfflineFallback(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(PAGES_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match('/offline.html');
    }
}
