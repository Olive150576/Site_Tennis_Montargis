// =============================================
// SYSTÈME DE NOTIFICATIONS TOAST
// =============================================

class ToastManager {
    constructor() {
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            document.body.appendChild(this.container);
        }
    }

    /**
     * Affiche une notification toast
     * @param {string} title - Titre de la notification
     * @param {string} message - Message de la notification
     * @param {string} type - Type: 'success', 'error', 'warning', 'info'
     * @param {number} duration - Durée en ms (0 = infini)
     */
    show(title, message, type = 'info', duration = 5000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        this.container.appendChild(toast);

        // Auto-fermeture
        if (duration > 0) {
            setTimeout(() => {
                this.close(toast);
            }, duration);
        }

        return toast;
    }

    close(toast) {
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }

    // Raccourcis
    success(title, message, duration) {
        return this.show(title, message, 'success', duration);
    }

    error(title, message, duration) {
        return this.show(title, message, 'error', duration);
    }

    warning(title, message, duration) {
        return this.show(title, message, 'warning', duration);
    }

    info(title, message, duration) {
        return this.show(title, message, 'info', duration);
    }
}

// Instance globale
window.toast = new ToastManager();

// =============================================
// SYSTÈME DE CONFIRMATION
// =============================================

class ConfirmDialog {
    constructor() {
        this.modal = document.getElementById('confirm-modal');
        this.icon = document.getElementById('confirm-icon');
        this.title = document.getElementById('confirm-title');
        this.message = document.getElementById('confirm-message');
        this.cancelBtn = document.getElementById('confirm-cancel');
        this.confirmBtn = document.getElementById('confirm-confirm');

        // Créer les éléments si pas dans le DOM
        if (!this.modal) {
            this.createModal();
        }

        this.setupEventListeners();
    }

    createModal() {
        const modalHTML = `
            <div id="confirm-modal" class="confirm-modal">
                <div class="confirm-box">
                    <div class="confirm-icon" id="confirm-icon"></div>
                    <div class="confirm-title" id="confirm-title"></div>
                    <div class="confirm-message" id="confirm-message"></div>
                    <div class="confirm-actions">
                        <button class="confirm-btn cancel" id="confirm-cancel">Annuler</button>
                        <button class="confirm-btn confirm" id="confirm-confirm">Confirmer</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        this.modal = document.getElementById('confirm-modal');
        this.icon = document.getElementById('confirm-icon');
        this.title = document.getElementById('confirm-title');
        this.message = document.getElementById('confirm-message');
        this.cancelBtn = document.getElementById('confirm-cancel');
        this.confirmBtn = document.getElementById('confirm-confirm');
    }

    setupEventListeners() {
        // Fermer si clic en dehors
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close(false);
            }
        });

        // ESC pour fermer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.close(false);
            }
        });
    }

    /**
     * Affiche un dialogue de confirmation
     * @param {Object} options - Options du dialogue
     * @param {string} options.title - Titre
     * @param {string} options.message - Message
     * @param {string} options.type - 'warning' ou 'danger'
     * @param {string} options.confirmText - Texte bouton confirmation
     * @param {string} options.cancelText - Texte bouton annulation
     * @returns {Promise<boolean>} - true si confirmé, false si annulé
     */
    show(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirmation',
                message = 'Êtes-vous sûr ?',
                type = 'warning',
                confirmText = 'Confirmer',
                cancelText = 'Annuler'
            } = options;

            // Icônes
            const icons = {
                warning: '<i class="fas fa-exclamation-triangle"></i>',
                danger: '<i class="fas fa-trash-alt"></i>'
            };

            // Mettre à jour le contenu
            this.icon.innerHTML = icons[type] || icons.warning;
            this.icon.className = `confirm-icon ${type}`;
            this.title.textContent = title;
            this.message.textContent = message;
            this.confirmBtn.textContent = confirmText;
            this.cancelBtn.textContent = cancelText;

            // Afficher le modal
            this.modal.classList.add('show');

            // Gérer les clics
            const handleConfirm = () => {
                this.close(true);
                resolve(true);
                cleanup();
            };

            const handleCancel = () => {
                this.close(false);
                resolve(false);
                cleanup();
            };

            const cleanup = () => {
                this.confirmBtn.removeEventListener('click', handleConfirm);
                this.cancelBtn.removeEventListener('click', handleCancel);
            };

            this.confirmBtn.addEventListener('click', handleConfirm);
            this.cancelBtn.addEventListener('click', handleCancel);
        });
    }

    close(confirmed) {
        this.modal.classList.remove('show');
    }
}

// Instance globale
window.confirmDialog = new ConfirmDialog();

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Affiche un message d'erreur user-friendly
 * @param {Error} error - L'erreur
 * @param {string} context - Contexte de l'erreur
 */
window.showErrorMessage = function(error, context = '') {
    console.error(`[${context}]`, error);

    // Map des codes d'erreur Firebase vers messages clairs
    const errorMessages = {
        'permission-denied': 'Vous n\'avez pas les permissions nécessaires pour cette action.',
        'PERMISSION_DENIED': 'Vous n\'avez pas les permissions nécessaires pour cette action.',
        'auth/user-not-found': 'Aucun compte trouvé avec cet email.',
        'auth/wrong-password': 'Mot de passe incorrect.',
        'auth/email-already-in-use': 'Cet email est déjà utilisé.',
        'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
        'auth/invalid-email': 'L\'adresse email n\'est pas valide.',
        'auth/network-request-failed': 'Erreur de connexion. Vérifiez votre connexion Internet.',
        'storage/unauthorized': 'Vous n\'êtes pas autorisé à accéder à ce fichier.',
        'storage/quota-exceeded': 'Quota de stockage dépassé.',
        'storage/canceled': 'L\'upload a été annulé.',
        'storage/unknown': 'Une erreur inconnue s\'est produite lors de l\'upload.',
        'unavailable': 'Service temporairement indisponible. Réessayez dans quelques instants.'
    };

    let userMessage = errorMessages[error.code] || errorMessages[error.message];

    if (!userMessage) {
        // Message générique si code inconnu
        userMessage = 'Une erreur est survenue. Si le problème persiste, contactez le support.';
    }

    let title = 'Erreur';
    if (context) {
        const contextTitles = {
            'upload': 'Erreur d\'upload',
            'save': 'Erreur de sauvegarde',
            'delete': 'Erreur de suppression',
            'login': 'Erreur de connexion',
            'load': 'Erreur de chargement'
        };
        title = contextTitles[context] || `Erreur - ${context}`;
    }

    window.toast.error(title, userMessage, 7000);
};

/**
 * Affiche un message de succès
 * @param {string} title - Titre
 * @param {string} message - Message
 * @param {Object} options - Options additionnelles (showFacebookShare, facebookUrl)
 */
window.showSuccessMessage = function(title, message = '', options = {}) {
    if (options.showFacebookShare && options.facebookUrl) {
        // Toast spécial avec bouton de partage Facebook
        const toast = document.createElement('div');
        toast.className = 'toast success';

        toast.innerHTML = `
            <div class="toast-icon">✓</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
                <a href="${options.facebookUrl}" target="_blank" rel="noopener noreferrer"
                   class="facebook-share-btn"
                   style="display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 16px; background: #1877F2; color: white; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    Partager sur Facebook
                </a>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        window.toast.container.appendChild(toast);

        // Auto-fermeture après 15 secondes (plus long pour laisser le temps de cliquer)
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 15000);
    } else {
        window.toast.success(title, message, 4000);
    }
};

/**
 * Affiche un avertissement
 * @param {string} title - Titre
 * @param {string} message - Message
 */
window.showWarningMessage = function(title, message = '') {
    window.toast.warning(title, message, 5000);
};

/**
 * Demande une confirmation avant une action critique
 * @param {string} title - Titre
 * @param {string} message - Message
 * @param {string} type - 'warning' ou 'danger'
 * @returns {Promise<boolean>}
 */
window.askConfirmation = async function(title, message, type = 'warning') {
    return await window.confirmDialog.show({ title, message, type });
};

console.log('✓ Système de notifications chargé');

// =============================================
// NOTIFICATIONS PUSH (FCM)
// =============================================

// Clé VAPID publique depuis Firebase Console
const VAPID_PUBLIC_KEY = 'BE_V9DmFlRDbPfnWrrtY4xneo1xP9tOtf7-mj7qLFjCM3A-36aiXORjlQDpEynZLdsKEH-P9UsAl48TvrT2dXXQ';

// Vérifier si les notifications sont supportées
function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Vérifier l'état actuel de l'abonnement
async function checkSubscriptionStatus() {
    if (!isPushSupported()) return 'unsupported';

    const permission = Notification.permission;
    if (permission === 'denied') return 'denied';

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        return subscription ? 'subscribed' : 'unsubscribed';
    } catch (error) {
        console.error('Erreur vérification abonnement:', error);
        return 'error';
    }
}

// Mettre à jour l'interface du bouton
async function updateNotificationButton() {
    const btn = document.getElementById('notification-btn');
    const statusText = document.getElementById('notification-status');
    if (!btn) return;

    const status = await checkSubscriptionStatus();

    btn.disabled = false;

    switch (status) {
        case 'unsupported':
            btn.style.display = 'none';
            if (statusText) statusText.textContent = 'Notifications non supportées';
            break;
        case 'denied':
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-bell-slash"></i> Notifications bloquées';
            btn.style.opacity = '0.5';
            btn.style.background = '#64748b';
            if (statusText) statusText.textContent = 'Autorisez dans les paramètres du navigateur';
            break;
        case 'subscribed':
            btn.innerHTML = '<i class="fas fa-bell"></i> Notifications activées';
            btn.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
            btn.onclick = unsubscribeFromNotifications;
            if (statusText) statusText.textContent = 'Vous recevrez les actualités du club';
            break;
        case 'unsubscribed':
        default:
            btn.innerHTML = '<i class="fas fa-bell"></i> Activer les notifications';
            btn.style.background = 'linear-gradient(135deg, #00d2ff, #00a8cc)';
            btn.onclick = subscribeToNotifications;
            if (statusText) statusText.textContent = 'Soyez informé des nouvelles actualités';
            break;
    }
}

// S'abonner aux notifications
async function subscribeToNotifications() {
    const btn = document.getElementById('notification-btn');

    try {
        // Afficher état de chargement
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Activation...';
        }

        // Demander la permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Permission refusée');
        }

        // Récupérer le service worker
        const registration = await navigator.serviceWorker.ready;

        // S'abonner au push
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        // Sauvegarder dans Firebase
        await saveSubscriptionToDatabase(subscription);

        // Mettre à jour l'UI
        await updateNotificationButton();

        // Notification de confirmation
        window.toast.success('Notifications activées', 'Vous recevrez les actualités du club.');

    } catch (error) {
        console.error('Erreur abonnement:', error);
        if (btn) btn.disabled = false;
        await updateNotificationButton();

        if (error.message === 'Permission refusée') {
            window.toast.warning('Notifications refusées', 'Vous pouvez les activer dans les paramètres du navigateur.');
        } else {
            window.toast.error('Erreur', 'Impossible d\'activer les notifications. Réessayez.');
        }
    }
}

// Se désabonner des notifications
async function unsubscribeFromNotifications() {
    const btn = document.getElementById('notification-btn');

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Désactivation...';
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            // Supprimer de Firebase
            await removeSubscriptionFromDatabase(subscription);

            // Désabonner du push
            await subscription.unsubscribe();
        }

        await updateNotificationButton();
        window.toast.info('Notifications désactivées', 'Vous ne recevrez plus les actualités.');

    } catch (error) {
        console.error('Erreur désabonnement:', error);
        if (btn) btn.disabled = false;
        await updateNotificationButton();
        window.toast.error('Erreur', 'Impossible de désactiver les notifications.');
    }
}

// Convertir la clé VAPID en Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Sauvegarder l'abonnement dans Firebase
async function saveSubscriptionToDatabase(subscription) {
    const subscriptionData = subscription.toJSON();
    const endpoint = subscriptionData.endpoint;

    // Créer un hash unique basé sur l'endpoint
    const tokenHash = btoa(endpoint).replace(/[^a-zA-Z0-9]/g, '').substring(0, 28);

    await firebase.database().ref('push_subscriptions/' + tokenHash).set({
        token: endpoint,
        keys: subscriptionData.keys,
        subscribedAt: Date.now(),
        userAgent: navigator.userAgent.substring(0, 150)
    });
}

// Supprimer l'abonnement de Firebase
async function removeSubscriptionFromDatabase(subscription) {
    const endpoint = subscription.endpoint;
    const tokenHash = btoa(endpoint).replace(/[^a-zA-Z0-9]/g, '').substring(0, 28);

    await firebase.database().ref('push_subscriptions/' + tokenHash).remove();
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
    if (isPushSupported()) {
        navigator.serviceWorker.ready.then(async () => {
            updateNotificationButton();

            // Auto-prompt au premier geste utilisateur (Chrome exige une interaction)
            const alreadyAsked = localStorage.getItem('notif_asked');
            if (!alreadyAsked) {
                const status = await checkSubscriptionStatus();
                if (status === 'unsubscribed') {
                    const triggerOnGesture = () => {
                        ['click', 'scroll', 'touchstart', 'keydown'].forEach(e =>
                            document.removeEventListener(e, triggerOnGesture)
                        );
                        setTimeout(() => {
                            localStorage.setItem('notif_asked', '1');
                            subscribeToNotifications();
                        }, 1000);
                    };
                    ['click', 'scroll', 'touchstart', 'keydown'].forEach(e =>
                        document.addEventListener(e, triggerOnGesture, { once: true, passive: true })
                    );
                }
            }
        });
    }
});

// Exposer les fonctions globalement
window.subscribeToNotifications = subscribeToNotifications;
window.unsubscribeFromNotifications = unsubscribeFromNotifications;
window.updateNotificationButton = updateNotificationButton;
window.isPushSupported = isPushSupported;

console.log('✓ Système Push notifications chargé');
