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

/**
 * Cloud Function pour supprimer un compte membre
 */
exports.deleteMember = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const adminSnap = await admin.database().ref(`admins/${context.auth.uid}`).once('value');
    if (!adminSnap.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'Accès réservé aux administrateurs.');
    }

    const { uid } = data;
    if (!uid) throw new functions.https.HttpsError('invalid-argument', 'UID membre requis.');

    // Supprimer les données DB
    await admin.database().ref(`members/${uid}`).remove();

    // Supprimer le compte Auth si il existe
    try {
        await admin.auth().deleteUser(uid);
    } catch (authErr) {
        console.warn(`deleteMember: compte Auth introuvable pour uid ${uid}:`, authErr.message);
    }

    return { success: true };
});

// Note: La fonction de nettoyage automatique peut être ajoutée ultérieurement
// avec Firebase Scheduled Functions si nécessaire

/**
 * Cloud Function Webhook — Création d'une actualité depuis Metricool via Make.com
 *
 * Endpoint : POST https://us-central1-[project-id].cloudfunctions.net/createNewsWebhook
 * Body JSON : { "text": "...", "imageUrl": "https://...", "secret": "votre_secret" }
 *
 * Configuration du secret :
 *   firebase functions:config:set webhook.secret="VOTRE_SECRET_ICI"
 *   puis : firebase deploy --only functions
 */
exports.createNewsWebhook = functions.https.onRequest(async (req, res) => {
    // Headers CORS (requis pour Make.com)
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
        return;
    }

    // Vérification du secret
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.error('[createNewsWebhook] WEBHOOK_SECRET non configuré');
        res.status(500).json({ error: 'Configuration serveur incomplète.' });
        return;
    }

    // Parser le body quel que soit le format envoyé par Make.com
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) { body = {}; }
    } else if (Buffer.isBuffer(body)) {
        try { body = JSON.parse(body.toString('utf8')); } catch(e) { body = {}; }
    }
    body = body || {};

    const { text: bodyText, imageUrl: bodyImageUrl, secret: bodySecret } = body;

    // Accepter le secret, text et imageUrl depuis l'URL (?param=...) ou depuis le body
    // Les query params sont encodés automatiquement par Make.com — plus fiable pour les textes avec caractères spéciaux
    const secret = (req.query.secret || bodySecret || '').trim();
    const text = req.query.text || bodyText;
    const imageUrl = req.query.imageUrl || bodyImageUrl;

    if (!secret || secret !== webhookSecret) {
        console.warn('[createNewsWebhook] Tentative avec secret invalide. Reçu:', JSON.stringify(secret));
        res.status(401).json({ error: 'Secret invalide.' });
        return;
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'Le champ "text" est requis.' });
        return;
    }

    // Générer le titre automatiquement depuis les premiers mots du texte
    const cleanText = text.trim();
    let autoTitle = cleanText.substring(0, 60);
    if (cleanText.length > 60) {
        const lastSpace = autoTitle.lastIndexOf(' ');
        if (lastSpace > 20) autoTitle = autoTitle.substring(0, lastSpace);
        autoTitle += '...';
    }
    // Supprimer les emojis en début de titre pour un rendu propre sur le site
    autoTitle = autoTitle.replace(/^[\p{Emoji}\s]+/u, '').trim() || autoTitle.trim();

    // Télécharger et re-uploader l'image dans Firebase Storage (URL permanente)
    let finalImageUrl = null;
    if (imageUrl && typeof imageUrl === 'string') {
        try {
            const imgResponse = await fetch(imageUrl);
            if (imgResponse.ok) {
                const buffer = await imgResponse.arrayBuffer();
                const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
                const ext = contentType.includes('png') ? 'png'
                          : contentType.includes('webp') ? 'webp' : 'jpg';
                const fileName = `images/metricool_${Date.now()}.${ext}`;

                // Générer un token de téléchargement Firebase (format standard)
                const { randomUUID } = require('crypto');
                const downloadToken = randomUUID();

                const bucket = admin.storage().bucket();
                const file = bucket.file(fileName);
                await file.save(Buffer.from(buffer), {
                    metadata: {
                        contentType,
                        metadata: { firebaseStorageDownloadTokens: downloadToken }
                    }
                });

                finalImageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${downloadToken}`;
                console.log(`[createNewsWebhook] Image uploadée : ${fileName}`);
            }
        } catch (imgErr) {
            // On publie sans image plutôt que de bloquer toute la publication
            console.warn('[createNewsWebhook] Impossible de télécharger l\'image :', imgErr.message);
        }
    }

    // Construire l'entrée actualité (même format que le panneau admin)
    const newItem = {
        title: autoTitle,
        desc: cleanText,
        price: null,
        url: null,
        avantage: null,
        images: finalImageUrl ? [finalImageUrl] : [],
        date: new Date().toLocaleDateString('fr-FR'),
        createdAt: Date.now(),
        featured: false,
        draft: false
    };

    // Récupérer le tableau existant et ajouter la nouvelle actualité
    const newsRef = admin.database().ref('news');
    const snapshot = await newsRef.once('value');
    const items = snapshot.val() || [];
    items.push(newItem);
    await newsRef.set(items);

    console.log(`[createNewsWebhook] Actualité créée : "${autoTitle}"`);
    res.status(200).json({
        success: true,
        title: autoTitle,
        hasImage: !!finalImageUrl,
        message: 'Actualité publiée avec succès sur le site.'
    });
});

/**
 * Cloud Function pour envoyer le formulaire de contact via EmailJS (côté serveur)
 * La clé API n'est plus exposée dans le code client
 */
exports.sendContactEmail = functions.https.onCall(async (data, context) => {
    const { name, email, message } = data || {};

    // Validation serveur
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 200) {
        throw new functions.https.HttpsError('invalid-argument', 'Nom invalide.');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email) || email.length > 200) {
        throw new functions.https.HttpsError('invalid-argument', 'Email invalide.');
    }
    if (!message || typeof message !== 'string' || message.trim().length < 5 || message.trim().length > 5000) {
        throw new functions.https.HttpsError('invalid-argument', 'Message invalide.');
    }

    const EMAILJS_SERVICE_ID  = 'service_79xjawi';
    const EMAILJS_TEMPLATE_ID = 'template_fcd7xgn';
    const EMAILJS_USER_ID     = functions.config().emailjs?.user_id || process.env.EMAILJS_USER_ID || 's6g88S5JA8ppy1GKg';

    const payload = JSON.stringify({
        service_id:      EMAILJS_SERVICE_ID,
        template_id:     EMAILJS_TEMPLATE_ID,
        user_id:         EMAILJS_USER_ID,
        template_params: {
            name:      name.trim(),
            email:     email.trim(),
            message:   message.trim(),
            reply_to:  email.trim()
        }
    });

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    payload
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error('EmailJS error:', response.status, errText);
        throw new functions.https.HttpsError('internal', 'Échec envoi email.');
    }

    // Sauvegarder dans Firebase DB
    await admin.database().ref('contacts').push({
        name:      name.trim(),
        email:     email.trim(),
        message:   message.trim(),
        date:      new Date().toISOString(),
        timestamp: Date.now()
    });

    return { success: true };
});

/**
 * Cloud Function pour créer un compte membre
 * Appelée par l'admin depuis le panel d'administration
 */
exports.createMember = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    // Vérifier que l'appelant est admin
    const adminSnap = await admin.database().ref(`admins/${context.auth.uid}`).once('value');
    if (!adminSnap.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'Accès réservé aux administrateurs.');
    }

    const { email, password, nom, prenom, telephone, licence, classement, categorie, statut } = data;

    if (!email || !password || !nom || !prenom) {
        throw new functions.https.HttpsError('invalid-argument', 'Prénom, nom, email et mot de passe sont requis.');
    }

    // Créer le compte Firebase Auth
    let userRecord;
    try {
        userRecord = await admin.auth().createUser({ email, password, displayName: `${prenom} ${nom}` });
    } catch (authErr) {
        if (authErr.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', `L'email ${email} est déjà utilisé par un autre compte.`);
        }
        throw new functions.https.HttpsError('internal', authErr.message);
    }

    // Créer le profil membre dans Realtime DB
    await admin.database().ref(`members/${userRecord.uid}`).set({
        nom,
        prenom,
        email,
        telephone: telephone || '',
        licence: licence || '',
        classement: classement || '',
        categorie: categorie || 'Adulte H',
        statut: statut || 'Membre',
        actif: true,
        createdAt: Date.now()
    });

    return { uid: userRecord.uid, success: true };
});

/**
 * Cloud Function pour désactiver / réactiver un membre
 */
exports.toggleMemberStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    const adminSnap = await admin.database().ref(`admins/${context.auth.uid}`).once('value');
    if (!adminSnap.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'Accès réservé aux administrateurs.');
    }

    const { uid, actif } = data;
    if (!uid) throw new functions.https.HttpsError('invalid-argument', 'UID membre requis.');

    await admin.database().ref(`members/${uid}/actif`).set(!!actif);

    // Mettre à jour le compte Auth si il existe (peut ne pas exister pour les données de test)
    try {
        await admin.auth().updateUser(uid, { disabled: !actif });
    } catch (authErr) {
        console.warn(`toggleMemberStatus: compte Auth introuvable pour uid ${uid}:`, authErr.message);
    }

    return { success: true };
});
