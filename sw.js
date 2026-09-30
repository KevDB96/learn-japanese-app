const CACHE_NAME = "learn-japanese-e81c2ddfac89";
const PRECACHE_URLS = ["/learn-japanese-app/assets/activities/listening-janne.webp","/learn-japanese-app/assets/activities/listening-kevin.webp","/learn-japanese-app/assets/activities/practice-janne.webp","/learn-japanese-app/assets/activities/practice-kevin.webp","/learn-japanese-app/assets/avatars/janne.webp","/learn-japanese-app/assets/avatars/kevin.webp","/learn-japanese-app/assets/courses/janne/grammar.webp","/learn-japanese-app/assets/courses/janne/hiragana.webp","/learn-japanese-app/assets/courses/janne/kana-fluency.webp","/learn-japanese-app/assets/courses/janne/katakana.webp","/learn-japanese-app/assets/courses/janne/phrases.webp","/learn-japanese-app/assets/courses/janne/practice.webp","/learn-japanese-app/assets/courses/janne/vocabulary.webp","/learn-japanese-app/assets/courses/kevin/grammar.webp","/learn-japanese-app/assets/courses/kevin/hiragana.webp","/learn-japanese-app/assets/courses/kevin/kana-fluency.webp","/learn-japanese-app/assets/courses/kevin/katakana.webp","/learn-japanese-app/assets/courses/kevin/phrases.webp","/learn-japanese-app/assets/courses/kevin/practice.webp","/learn-japanese-app/assets/courses/kevin/vocabulary.webp","/learn-japanese-app/assets/icons/app-icon-janne-16.png","/learn-japanese-app/assets/icons/app-icon-janne-180.png","/learn-japanese-app/assets/icons/app-icon-janne-192.png","/learn-japanese-app/assets/icons/app-icon-janne-32.png","/learn-japanese-app/assets/icons/app-icon-janne-512.png","/learn-japanese-app/assets/icons/app-icon-kevin-16.png","/learn-japanese-app/assets/icons/app-icon-kevin-180.png","/learn-japanese-app/assets/icons/app-icon-kevin-192.png","/learn-japanese-app/assets/icons/app-icon-kevin-32.png","/learn-japanese-app/assets/icons/app-icon-kevin-512.png","/learn-japanese-app/assets/icons/app-icon-shared-16.png","/learn-japanese-app/assets/icons/app-icon-shared-180.png","/learn-japanese-app/assets/icons/app-icon-shared-192.png","/learn-japanese-app/assets/icons/app-icon-shared-32.png","/learn-japanese-app/assets/icons/app-icon-shared-512.png","/learn-japanese-app/assets/index-BDV0qme5.js","/learn-japanese-app/assets/index-DaueY-7D.js","/learn-japanese-app/assets/index-DzfpfDxh.css","/learn-japanese-app/assets/manifest.json","/learn-japanese-app/assets/motifs/faerie.webp","/learn-japanese-app/assets/motifs/joyful-cat.webp","/learn-japanese-app/assets/motifs/sakura-book.webp","/learn-japanese-app/assets/motifs/spirit-cat.webp","/learn-japanese-app/assets/splash/janne.webp","/learn-japanese-app/assets/splash/kevin.webp","/learn-japanese-app/assets/states/all-caught-up-janne.webp","/learn-japanese-app/assets/states/all-caught-up-kevin.webp","/learn-japanese-app/assets/states/no-reviews-due-janne.webp","/learn-japanese-app/assets/states/no-reviews-due-kevin.webp","/learn-japanese-app/assets/states/offline-janne.webp","/learn-japanese-app/assets/states/offline-kevin.webp","/learn-japanese-app/assets/states/saved-janne.webp","/learn-japanese-app/assets/states/saved-kevin.webp","/learn-japanese-app/assets/states/syncing-janne.webp","/learn-japanese-app/assets/states/syncing-kevin.webp","/learn-japanese-app/assets/status/course-complete-janne.webp","/learn-japanese-app/assets/status/course-complete-kevin.webp","/learn-japanese-app/assets/status/learning-janne.webp","/learn-japanese-app/assets/status/learning-kevin.webp","/learn-japanese-app/assets/status/lesson-complete-janne.webp","/learn-japanese-app/assets/status/lesson-complete-kevin.webp","/learn-japanese-app/assets/status/locked-janne.webp","/learn-japanese-app/assets/status/locked-kevin.webp","/learn-japanese-app/assets/status/mastered-janne.webp","/learn-japanese-app/assets/status/mastered-kevin.webp","/learn-japanese-app/assets/status/struggling-janne.webp","/learn-japanese-app/assets/status/struggling-kevin.webp","/learn-japanese-app/icon-192.png","/learn-japanese-app/icon-192.svg","/learn-japanese-app/icon-512.png","/learn-japanese-app/icon-512.svg","/learn-japanese-app/icon.svg","/learn-japanese-app/index.html","/learn-japanese-app/manifest.webmanifest"];
const SHELL_URL = new URL('./', self.registration.scope).pathname;
const INDEX_URL = new URL('index.html', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('learn-japanese-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
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
