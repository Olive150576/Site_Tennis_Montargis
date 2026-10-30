/* =====================================================================
   USM Tennis Montargis — service worker du nouveau site
   ---------------------------------------------------------------------
   L'ancien site enregistrait /sw.js (cache des pages + notifications push
   des membres et des admins). Les navigateurs qui l'ont installé vont
   chercher ce fichier après la bascule : cette version
     • efface les anciens caches (pas de vieilles pages affichées) ;
     • ne met plus rien en cache : le site est toujours servi à jour ;
     • garde la réception des notifications push, pour que les abonnements
       existants des membres continuent de fonctionner.
   ===================================================================== */
const VERSION = 'usm-v2-1';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Notifications push (même format que l'ancien site : title, body, icon, badge, url) */
self.addEventListener('push', (event) => {
  let data = { title: 'USM Tennis Montargis', body: 'Nouvelle information du club', icon: '/icon-192.png', badge: '/icon-192.png', url: '/' };
  if (event.data) {
    try { data = Object.assign(data, event.data.json()); } catch (e) { data.body = event.data.text(); }
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [{ action: 'open', title: 'Voir' }, { action: 'close', title: 'Fermer' }],
    requireInteraction: true,
    tag: 'usm-tennis-notification'
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : null;
    })
  );
});
