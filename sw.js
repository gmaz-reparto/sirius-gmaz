// GMAZ Rutas — Service Worker (PWA instalable + caché de librerías)
const CACHE = 'gmaz-rutas-v2';
const LIBS = 'gmaz-libs-v2';
const ESENCIALES = [
  './gmaz-rutas-v3.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];
// CDNs de librerías estáticas (seguras para cache-first → aperturas siguientes instantáneas)
const LIB_HOSTS = ['cdn.jsdelivr.net','cdnjs.cloudflare.com','unpkg.com','fonts.googleapis.com','fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESENCIALES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== LIBS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  let host = '';
  try { host = new URL(url).hostname; } catch (err) {}

  // 1) Librerías de CDN: cache-first (sirve de caché al instante, descarga solo la 1ª vez)
  if (LIB_HOSTS.includes(host)) {
    e.respondWith(
      caches.open(LIBS).then(c => c.match(e.request).then(hit => {
        if (hit) return hit;
        return fetch(e.request).then(r => { if (r && r.status === 200) c.put(e.request, r.clone()); return r; });
      }))
    );
    return;
  }

  // 2) Archivos propios de la app: red primero, caché de respaldo si no hay señal
  const esApp = ESENCIALES.some(f => url.endsWith(f.replace('./', '')));
  if (esApp) {
    e.respondWith(
      fetch(e.request).then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // 3) Todo lo demás (Supabase REST, Google Maps API): directo a la red, siempre fresco
});
