// ===== SERVICE WORKER — Alfa Team LifeWave CRM =====
// Estratégia: network-first para o HTML (garante que vês sempre a versão mais
// recente quando há internet), com fallback para cache quando estás offline.

const CACHE_NAME = 'alfateam-crm-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Instala e guarda os ficheiros essenciais em cache
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

// Limpa caches antigas quando uma nova versão do SW assume controlo
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só tratamos pedidos GET (POST/PUT a APIs de IA, Google, etc. passam direto à rede)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Pedidos a APIs externas (IA, Google OAuth/Drive/Calendar) — nunca passam por cache,
  // vão sempre à rede tal como antes.
  const isExternalAPI = url.origin !== self.location.origin;
  if (isExternalAPI) return;

  // Navegação principal (o ficheiro HTML da app): network-first com fallback offline
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Restantes pedidos same-origin (manifest, ícones): cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => cached);
    })
  );
});
