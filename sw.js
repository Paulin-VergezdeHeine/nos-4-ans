/*
 * Service worker : met l'app en cache pour un fonctionnement hors-ligne.
 * Stratégie "cache d'abord" pour la coquille de l'app, avec repli réseau.
 */
var CACHE = 'echecs-coach-v1';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './engine.js',
  './coach.js',
  './vendor/chess.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll échoue si UNE ressource manque ; on ajoute donc une par une.
      return Promise.all(ASSETS.map(function (url) {
        return c.add(url).catch(function () { /* ignore les absents */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // Met en cache au passage les ressources de même origine.
        try {
          var url = new URL(req.url);
          if (url.origin === self.location.origin && res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
        } catch (err) { /* ignore */ }
        return res;
      }).catch(function () {
        // Hors-ligne : pour une navigation, on sert la page d'accueil.
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
