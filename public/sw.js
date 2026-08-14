const CACHE_NAME = "mafateeh-al-tharwa-v24";
const RUNTIME_CACHE = "mafateeh-runtime-v24";
const PIPER_RUNTIME_CACHE = "mafateeh-piper-runtime-v22";
const OFFLINE_FALLBACK = "/reader.html?v=24";
const OFFLINE_FILES = [
  OFFLINE_FALLBACK,
  "/reader-tools.css?v=13",
  "/reader-ambience.css?v=13",
  "/reader-studio.css?v=13",
  "/reader-mixer.css?v=24",
  "/reader-smart-suite.css?v=24",
  "/reader-formats.js?v=13",
  "/reader-tools.js?v=13",
  "/reader-ambience.js?v=13",
  "/reader-studio.js?v=13",
  "/reader-mixer.js?v=24",
  "/reader-smart-suite.js?v=24",
  "/piper-worker.js?v=24",
  "/backgrounds/ocean-dawn.webp",
  "/backgrounds/forest-mist.webp",
  "/backgrounds/desert-night.webp",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];
const PERSISTENT_CACHE_PREFIXES = ["mafateeh-narrator-bank-", "mafateeh-smart-voice-", "mafateeh-piper-"];
const EXTERNAL_RUNTIME_CACHE = "mafateeh-external-runtime-v24";
const TRUSTED_PIPER_HOSTS = new Set([
  "cdn.jsdelivr.net",
  "huggingface.co",
  "cdn-lfs.huggingface.co",
  "cas-bridge.xethub.hf.co",
  "cdn-lfs-us-1.hf.co"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => {
        if ([CACHE_NAME, RUNTIME_CACHE, PIPER_RUNTIME_CACHE, EXTERNAL_RUNTIME_CACHE].includes(key)) return false;
        return !PERSISTENT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
      }).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    try { await cache.put(request, response.clone()); } catch (_) {}
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestURL = new URL(event.request.url);
  if (requestURL.origin !== self.location.origin) {
    if (requestURL.hostname === "unpkg.com") {
      event.respondWith(cacheFirst(event.request, EXTERNAL_RUNTIME_CACHE));
    } else if (TRUSTED_PIPER_HOSTS.has(requestURL.hostname)) {
      event.respondWith(cacheFirst(event.request, PIPER_RUNTIME_CACHE));
    }
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_FALLBACK)))
    );
    return;
  }

  // iOS requests streamed audio in byte ranges. When a full MP3 is cached,
  // synthesize a standards-compliant 206 response so offline seeking still works.
  if (event.request.headers.has("range")) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request.url);
      if (!cached) return fetch(event.request);
      const bytes = await cached.arrayBuffer();
      const match = /bytes=(\d*)-(\d*)/.exec(event.request.headers.get("range") || "");
      const start = Math.min(bytes.byteLength - 1, Math.max(0, +(match?.[1] || 0)));
      const requestedEnd = match?.[2] ? +match[2] : bytes.byteLength - 1;
      const end = Math.min(bytes.byteLength - 1, Math.max(start, requestedEnd));
      return new Response(bytes.slice(start, end + 1), {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
          "Content-Length": String(end - start + 1),
          "Content-Type": cached.headers.get("Content-Type") || "audio/mpeg"
        }
      });
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached ||
      fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
    )
  );
});
