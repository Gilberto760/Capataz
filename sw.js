const CACHE_NAME = 'capataz-v68';
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/utils.js',
  './js/api.js',
  './js/jsQR.min.js',
  './js/zxing.min.js',
  './js/ui.js',
  './js/dashboard.js',
  './js/rebanho.js',
  './js/compras.js',
  './js/relatorios.js',
  './js/cadastros.js',
  './js/mapa.js',
  './js/empreendimentos.js',
  './js/atividades.js',
  './js/config.js',
  './js/app.js',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        // Só guarda respostas de sucesso — um 404/500 passageiro (ex: arquivo opcional
        // ainda não adicionado) nunca pode ficar preso no cache como se fosse definitivo.
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
