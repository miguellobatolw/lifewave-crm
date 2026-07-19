// ===== SERVICE WORKER — Alfa Team LifeWave CRM =====
// Estratégia: network-first para o HTML (garante que vês sempre a versão mais
// recente quando há internet), com fallback para cache quando estás offline.

const CACHE_NAME = 'alfateam-crm-v3';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Instala e guarda os ficheiros essenciais em cache.
// NOTA: não chamamos self.skipWaiting() aqui de propósito — o novo SW fica
// "waiting" até a própria página (index.html) decidir a altura certa de o
// ativar (ver listener de 'message' abaixo). Isto é o que permite à app
// detetar "há uma versão nova" e só trocar quando quiser (ex: no login,
// com reload automático), em vez de trocar às cegas por baixo do utilizador.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

// Permite à página pedir ao SW em espera para assumir controlo imediatamente
// (chamado depois de mostrarmos/aplicarmos o aviso de nova versão).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
          // Compara o novo HTML (por tamanho, via header Content-Length ou
          // corpo) com o que já estava em cache. Isto é o que detecta "há
          // uma versão nova" quando só o index.html mudou (o caso mais
          // comum) — sem isto, o Service Worker só reagia a mudanças no
          // próprio ficheiro sw.js, o que nunca acontecia nas atualizações
          // normais da app, e por isso o reload automático nunca disparava.
          caches.open(CACHE_NAME).then(async (cache) => {
            const cachedRes = await cache.match(req);
            let mudou = true;
            if (cachedRes) {
              try {
                // Comparação rápida por tamanho primeiro (barata); só se
                // os tamanhos coincidirem (raro mas possível) comparamos o
                // texto completo para ter a certeza.
                const tamanhoNovo = res.headers.get('content-length');
                const tamanhoAntigo = cachedRes.headers.get('content-length');
                if (tamanhoNovo && tamanhoAntigo && tamanhoNovo !== tamanhoAntigo) {
                  mudou = true;
                } else {
                  const [textoNovo, textoAntigo] = await Promise.all([
                    resClone.clone().text(),
                    cachedRes.clone().text()
                  ]);
                  mudou = textoNovo !== textoAntigo;
                }
              } catch (e) {}
            }
            await cache.put(req, resClone);
            if (mudou && cachedRes) {
              // Avisa todas as páginas abertas que o conteúdo mudou, para
              // decidirem recarregar (ver listener 'message' no index.html).
              const clientList = await self.clients.matchAll({ type: 'window' });
              clientList.forEach((client) => client.postMessage('CONTENT_UPDATED'));
            }
          });
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

// ===== PUSH NOTIFICATIONS =====
// Aditivo (v2 → continua a ser a mesma CACHE_NAME, isto não mexe em cache
// nenhuma). Permite receber notificações reais mesmo com a app fechada ou
// o telemóvel bloqueado — o que o Notification API sozinho não conseguia.

self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (e) {
    dados = { titulo: 'LifeWave CRM', corpo: event.data ? event.data.text() : 'Tens um lembrete pendente.' };
  }

  const titulo = dados.titulo || '🔔 LifeWave CRM';
  const opcoes = {
    body: dados.corpo || 'Tens um lembrete pendente.',
    icon: dados.icon || './icon-192.png',
    badge: dados.icon || './icon-192.png',
    tag: dados.tag || 'lifewave-crm-lembrete',
    requireInteraction: true,
    data: { url: dados.url || './' }
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
