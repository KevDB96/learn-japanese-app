import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const root = 'dist'
const base = process.argv[2]
if (base !== '/learn-japanese-app/') throw new Error('Expected Pages base /learn-japanese-app/')
const files = []
const audioManifest = JSON.parse(await readFile('src/content/audio-manifest.json', 'utf8'))
const offlineAudio = {}
for (const entry of audioManifest.entries.filter((item) => item.provider === 'bundled' && item.offline === true && item.asset)) {
  const asset = entry.asset.replace(/^\/+/, '')
  const bytes = await readFile(join(root, asset))
  offlineAudio[`${base}${asset}`] = createHash('sha256').update(bytes).digest('hex')
}

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else if (entry.name !== 'sw.js') files.push(path)
  }
}

await collect(root)
files.sort()
const audioPaths = new Set(Object.keys(offlineAudio).map((url) => new URL(url, 'https://local.invalid').pathname))
const urls = files.map((file) => `${base}${relative(root, file).split(sep).join('/')}`).filter((url) => !audioPaths.has(new URL(url, 'https://local.invalid').pathname))
const coreHash = createHash('sha256')
coreHash.update(await readFile('package.json'))
coreHash.update(await readFile('src/content/catalog.json'))
for (const file of files) {
  const url = `${base}${relative(root, file).split(sep).join('/')}`
  if (!audioPaths.has(new URL(url, 'https://local.invalid').pathname)) coreHash.update(await readFile(file))
}
const cacheName = `learn-japanese-core-${coreHash.digest('hex').slice(0, 12)}`
const audioHash = createHash('sha256').update(await readFile('src/content/audio-manifest.json'))
for (const [url, digest] of Object.entries(offlineAudio).sort()) audioHash.update(`${url}:${digest}`)
const audioCacheName = `learn-japanese-audio-${audioHash.digest('hex').slice(0, 12)}`

const source = `const CACHE_NAME = ${JSON.stringify(cacheName)};
const AUDIO_CACHE_NAME = ${JSON.stringify(audioCacheName)};
const PRECACHE_URLS = ${JSON.stringify(urls)};
const OFFLINE_AUDIO = ${JSON.stringify(offlineAudio)};
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
  if (/\\.(?:mp3|ogg|wav|m4a|aac|webm)$/i.test(url.pathname)) { event.respondWith(fetch(request)); return; }
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
`

await writeFile(join(root, 'sw.js'), source)
