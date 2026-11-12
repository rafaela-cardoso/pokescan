// pokescan · Copyright © 2026 Rafaela Cardoso · PolyForm Noncommercial 1.0.0
// Service worker: permite instalar o app e abrir a tela sem internet.
// Rede primeiro (sempre a versão mais nova); o cache só é usado quando não há conexão.
const CACHE = 'pokescan-v12';
const ARQUIVOS = [
  './', 'index.html', 'estilo.css', 'manifest.webmanifest',
  'icones/icone-192.png', 'icones/icone-512.png', 'icones/icone-maskable-192.png', 'icones/icone-maskable-512.png',
  'icones/apple-touch-icon.png', 'icones/favicon-32.png',
  'src/app.js', 'src/armazenamento.js', 'src/camera.js', 'src/carta.js', 'src/edicoes.js', 'src/extras.js', 'src/liga.js',
  'src/config.js', 'src/drive.js', 'src/edicoes-liga.js', 'src/google.js', 'src/idioma.js', 'src/ocr.js', 'src/planilha.js', 'src/visao.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // APIs do Google/catálogo: direto
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
