const CACHE_NAME = 'house-of-briar-v1';
const APP_SHELL = ['/', '/styles.css', '/script.js', '/manifest.webmanifest', '/369d1fcc2901e810c35601d8f4376324e65b00844c0d9e223fbfa0bf44249c22.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(response => response || caches.match('/'))));
});
