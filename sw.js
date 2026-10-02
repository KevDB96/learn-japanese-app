const CACHE_NAME = "learn-japanese-core-286b181cf040";
const AUDIO_CACHE_NAME = "learn-japanese-audio-3f7173b722e6";
const PRECACHE_URLS = ["/learn-japanese-app/assets/avatars/janne.webp","/learn-japanese-app/assets/avatars/kevin.webp","/learn-japanese-app/assets/icons/app-icon-janne-16.png","/learn-japanese-app/assets/icons/app-icon-janne-180.png","/learn-japanese-app/assets/icons/app-icon-janne-192.png","/learn-japanese-app/assets/icons/app-icon-janne-32.png","/learn-japanese-app/assets/icons/app-icon-janne-512.png","/learn-japanese-app/assets/icons/app-icon-kevin-16.png","/learn-japanese-app/assets/icons/app-icon-kevin-180.png","/learn-japanese-app/assets/icons/app-icon-kevin-192.png","/learn-japanese-app/assets/icons/app-icon-kevin-32.png","/learn-japanese-app/assets/icons/app-icon-kevin-512.png","/learn-japanese-app/assets/icons/app-icon-shared-16.png","/learn-japanese-app/assets/icons/app-icon-shared-180.png","/learn-japanese-app/assets/icons/app-icon-shared-192.png","/learn-japanese-app/assets/icons/app-icon-shared-32.png","/learn-japanese-app/assets/icons/app-icon-shared-512.png","/learn-japanese-app/icon-192.png","/learn-japanese-app/icon-192.svg","/learn-japanese-app/icon-512.png","/learn-japanese-app/icon-512.svg","/learn-japanese-app/icon.svg","/learn-japanese-app/index.html","/learn-japanese-app/manifest.webmanifest"];
const OFFLINE_AUDIO = {};
const SHELL_URL = new URL('./', self.registration.scope).pathname;
const INDEX_URL = new URL('index.html', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith('learn-japanese-core-') && key !== CACHE_NAME) || (key.startsWith('learn-japanese-audio-') && key !== AUDIO_CACHE_NAME) || (key.startsWith('learn-japanese-') && !key.startsWith('learn-japanese-core-') && !key.startsWith('learn-japanese-audio-'))).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const audioUrl = Object.keys(OFFLINE_AUDIO).find((value) => new URL(value, self.location.origin).pathname === url.pathname);
  if (audioUrl) {
    event.respondWith((async () => {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (!response.ok) return response;
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (digest !== OFFLINE_AUDIO[audioUrl]) return new Response('', { status: 502, statusText: 'Audio integrity check failed' });
      await cache.put(request, response.clone());
      return response;
    })());
    return;
  }
  if (/\.(?:mp3|ogg|wav|m4a|aac|webm)$/i.test(url.pathname)) { event.respondWith(fetch(request)); return; }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match(INDEX_URL)) ?? caches.match(SHELL_URL) ?? Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
