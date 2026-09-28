import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

const root = 'dist'
const files = []

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await collect(path)
    else if (entry.name !== 'sw.js') files.push(path)
  }
}

await collect(root)
files.sort()
const urls = files.map((file) => `/${relative(root, file).split(sep).join('/')}`)
const hash = createHash('sha256')
for (const file of files) hash.update(await readFile(file))
const cacheName = `learn-japanese-${hash.digest('hex').slice(0, 12)}`

const source = `const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRECACHE_URLS = ${JSON.stringify(urls)};
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
`

await writeFile(join(root, 'sw.js'), source)
