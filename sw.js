const CACHE_NAME = 'usm-tennis-v41';
const ASSETS = [
    '/',
    '/index.html',
    '/espace-membre.html',
    '/style.css',
    '/script.js',
    '/member.js',
    '/admin.js',
    '/notifications.js',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-membre-192.png',
    '/icon-membre-512.png',
    '/logo_usm_new.png',
    '/manifest.json',
    '/manifest-membre.json'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => clients.claim())
    );
});

// =============================================
// GESTION DES NOTIFICATIONS PUSH
// =============================================

self.addEventListener('push', (event) => {
    console.log('[SW] Push reçu:', event);

    let data = {
        title: 'USM Tennis Montargis',
        body: 'Nouvelle actualité !',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        url: '/'
    };

    // Essayer de récupérer les données du push
    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            console.log('[SW] Erreur parsing data:', e);
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        },
        actions: [
            { action: 'open', title: 'Voir' },
            { action: 'close', title: 'Fermer' }
        ],
        requireInteraction: true,
        tag: 'usm-tennis-notification'
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Gestion du clic sur la notification
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification cliquée:', event);

    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    // Ouvrir ou focus sur la page
    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Si une fenêtre est déjà ouverte, la focus
                for (const client of clientList) {
                    if (client.url.includes('usm-tennis') && 'focus' in client) {
                        client.navigate(urlToOpen);
                        return client.focus();
                    }
                }
                // Sinon ouvrir une nouvelle fenêtre
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Fermeture de notification
self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notification fermée');
});

// =============================================
// GESTION DU CACHE ET FETCH
// =============================================

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Stratégie Network First pour HTML, JS, CSS (toujours récupérer la dernière version)
    if (e.request.destination === 'document' ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css')) {
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    // Mettre en cache la nouvelle version
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // En cas d'erreur réseau, utiliser le cache
                    return caches.match(e.request);
                })
        );
        return;
    }

    // Stratégie Cache First pour les ressources statiques (images, fonts)
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
