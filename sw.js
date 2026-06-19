// GMAZ Rutas — Service Worker (PWA instalable)
const CACHE = 'gmaz-rutas-v1';
const ESENCIALES = [
  './gmaz-rutas-v3.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// Instalar: precachear lo esencial (la app abre aunque haya señal débil)
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESENCIALES)).then(() => self.skipWaiting()));
});

// Activar: limpiar cachés viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first para datos (Supabase/Maps siempre frescos),
// cache-first solo para los archivos propios de la app.
self.addEventListener('fetch', e => {
  const url = e.request.url;
  const esApp = ESENCIALES.some(f => url.endsWith(f.replace('./', '')));
  if (esApp) {
    // archivos propios: red primero, cae a caché si no hay señal
    e.respondWith(
      fetch(e.request).then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return r;
      }).catch(() => caches.match(e.request))
    );
  }
  // todo lo demás (Supabase, Google Maps, fuentes): pasa directo a la red
});
