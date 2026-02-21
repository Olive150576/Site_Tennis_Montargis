const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();

// Configuration VAPID pour Web Push
// La clé privée doit être configurée via: firebase functions:config:set vapid.private_key="VOTRE_CLE_PRIVEE"
// Ou via les variables d'environnement dans Firebase Console
const VAPID_PUBLIC_KEY = 'BE_V9DmFlRDbPfnWrrtY4xneo1xP9tOtf7-mj7qLFjCM3A-36aiXORjlQDpEynZLdsKEH-P9UsAl48TvrT2dXXQ';
const VAPID_SUBJECT = 'mailto:usmmtennis@orange.fr';

/**
 * Cloud Function pour envoyer des notifications push
 * Déclenchée via appel HTTP depuis l'admin
 */
exports.sendNotification = functions.https.onCall(async (data, context) => {
    // Vérifier que l'utilisateur est authentifié
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Vous devez être connecté.');
    }

    // Vérifier que l'utilisateur est admin
    const adminSnapshot = await admin.database().ref(`admins/${context.auth.uid}`).once('value');
    if (!adminSnapshot.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'Accès réservé aux administrateurs.');
    }

    const { title, body, url } = data;

    if (!title || !body) {
        throw new functions.https.HttpsError('invalid-argument', 'Titre et contenu requis.');
    }

    // Récupérer la clé privée VAPID depuis la configuration
    const vapidPrivateKey = functions.config().vapid?.private_key || process.env.VAPID_PRIVATE_KEY;

    if (!vapidPrivateKey) {
        console.error('Clé VAPID privée non configurée');
        throw new functions.https.HttpsError('failed-precondition', 'Configuration serveur incomplète.');
    }

    // Configurer web-push
    console.log('Configuration VAPID avec clé privée de longueur:', vapidPrivateKey.length);
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivateKey);

    // Récupérer tous les abonnements
    const subsSnapshot = await admin.database().ref('push_subscriptions').once('value');
    const subsData = subsSnapshot.val();

    console.log('Abonnements trouvés:', subsData ? Object.keys(subsData).length : 0);

    if (!subsData) {
        return { success: true, sent: 0, message: 'Aucun abonné aux notifications.' };
    }

    // Construire le payload de notification
    const payload = JSON.stringify({
        title: title,
        body: body.substring(0, 150) + (body.length > 150 ? '...' : ''),
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        url: url || 'https://tennismontargis.fr/#news-section'
    });

    console.log('Payload notification:', payload);

    const options = {
        TTL: 60 * 60 * 24, // 24 heures
        urgency: 'normal'
    };

    let successCount = 0;
    let failureCount = 0;
    const tokensToRemove = [];

    // Envoyer à chaque abonné
    const sendPromises = Object.entries(subsData).map(async ([key, sub]) => {
        console.log(`Traitement abonné ${key}:`, {
            hasToken: !!sub.token,
            hasKeys: !!sub.keys,
            tokenStart: sub.token ? sub.token.substring(0, 50) + '...' : 'N/A',
            keysP256dh: sub.keys?.p256dh ? 'présent' : 'manquant',
            keysAuth: sub.keys?.auth ? 'présent' : 'manquant'
        });

        if (!sub.token || !sub.keys) {
            console.log(`Abonné ${key} invalide - token ou keys manquant`);
            tokensToRemove.push(key);
            return;
        }

        // Reconstruire l'objet subscription pour web-push
        const subscription = {
            endpoint: sub.token,
            keys: sub.keys
        };

        console.log(`Envoi à ${key} - endpoint: ${subscription.endpoint.substring(0, 80)}...`);

        try {
            const result = await webpush.sendNotification(subscription, payload, options);
            console.log(`SUCCÈS envoi à ${key}:`, result.statusCode, result.headers);
            successCount++;
        } catch (error) {
            console.error(`ERREUR envoi à ${key}:`, {
                statusCode: error.statusCode,
                body: error.body,
                message: error.message,
                endpoint: subscription.endpoint.substring(0, 80)
            });
            failureCount++;

            // Supprimer les abonnements invalides (410 Gone ou 404 Not Found)
            if (error.statusCode === 410 || error.statusCode === 404) {
                tokensToRemove.push(key);
            }
        }
    });

    await Promise.all(sendPromises);

    // Nettoyer les tokens invalides
    if (tokensToRemove.length > 0) {
        const updates = {};
        tokensToRemove.forEach(key => {
            updates[key] = null;
        });
        await admin.database().ref('push_subscriptions').update(updates);
        console.log(`Nettoyé ${tokensToRemove.length} abonnements invalides.`);
    }

    return {
        success: true,
        sent: successCount,
        failed: failureCount,
        cleaned: tokensToRemove.length,
        message: `Notification envoyée à ${successCount} abonné(s).`
    };
});

/**
 * Cloud Function pour attribuer le custom claim "admin" dans Firebase Auth
 * Utilisé pour restreindre la suppression dans Firebase Storage aux admins uniquement
 */
exports.grantAdminClaim = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Non authentifié.');
    }

    // Vérifier que l'utilisateur est bien dans la liste des admins (Realtime DB)
    const adminSnap = await admin.database().ref(`admins/${context.auth.uid}`).once('value');
    if (!adminSnap.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'Non autorisé.');
    }

    // Poser le custom claim admin = true sur ce compte Firebase Auth
    await admin.auth().setCustomUserClaims(context.auth.uid, { admin: true });
    return { success: true };
});

// Note: La fonction de nettoyage automatique peut être ajoutée ultérieurement
// avec Firebase Scheduled Functions si nécessaire
