/* OpReady Service Worker — App Shell + Offline Fallback */

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `opready-shell-${CACHE_VERSION}`;
const PAGES_CACHE   = `opready-pages-${CACHE_VERSION}`;

// Core app shell — cached on install
const SHELL_ASSETS = [
    '/offline.html',
    '/styles.css',
    '/sidebar.css',
    '/js/sidebar.js',
    '/utils.js',
    '/toast.js',
    '/js/pwa.js',
    '/resources/favicon.png',
    '/resources/logo.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    // /manifest.json is served dynamically — not pre-cached
];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS))
    );
    self.skipWaiting();
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
