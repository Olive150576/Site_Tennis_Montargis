const functions = require('firebase-functions');
const admin = require('firebase-admin');
const webpush = require('web-push');
const nodemailer = require('nodemailer');

admin.initializeApp();

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Envoi d'email via SMTP Gmail (mot de passe d'application).
// Configuré via: firebase functions:config:set gmail.user="..." gmail.pass="..."
// ou via functions/.env (GMAIL_USER / GMAIL_APP_PASSWORD).
let _mailTransporter = null;
function getMailTransporter() {
    if (_mailTransporter) return _mailTransporter;
    const gmailUser = functions.config().gmail?.user || process.env.GMAIL_USER;
    const gmailPass = functions.config().gmail?.pass || process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
        throw new functions.https.HttpsError('failed-precondition', 'Configuration email serveur incomplète.');
    }
    _mailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass }
    });
    return _mailTransporter;
}

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
 * Cloud Function pour envoyer une push Web à un membre spécifique (par uid)
 * Stockage : push_subscriptions_membres/{uid}/{tokenHash}
 * Appelée par l'admin lors d'une convocation ou validation d'inscription
 */
exports.sendMemberPush = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Vous devez être connecté.');
    }
    // Accessible aux admins ET aux coaches (convocations, validations d'inscription)
    const [adminSnap, coachSnap] = await Promise.all([
        admin.database().ref(`admins/${context.auth.uid}`).once('value'),
        admin.database().ref(`coaches/${context.auth.uid}`).once('value')
    ]);
    if (!adminSnap.exists() && !coachSnap.exists()) {
        throw new functions.https.HttpsError('permission-denied', 'Accès réservé aux administrateurs et coaches.');
    }

    const { uid, title, body, url } = data;
    if (!uid || !title || !body) {
        throw new functions.https.HttpsError('invalid-argument', 'uid, title et body sont requis.');
    }

    const vapidPrivateKey = functions.config().vapid?.private_key || process.env.VAPID_PRIVATE_KEY;
    if (!vapidPrivateKey) {
        console.error('[sendMemberPush] Clé VAPID privée non configurée');
        return { success: false, sent: 0, message: 'Clé VAPID manquante (configuration serveur).' };
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivateKey);

    // Lire les abonnements push de ce membre
    const subsSnap = await admin.database().ref(`push_subscriptions_membres/${uid}`).once('value');
    if (!subsSnap.exists()) {
        console.log(`[sendMemberPush] Aucun abonnement push pour uid=${uid}`);
        return { success: true, sent: 0, message: 'Membre non abonné aux push.' };
    }

    const payload = JSON.stringify({
        title,
        body: body.length > 120 ? body.substring(0, 117) + '...' : body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        url: url || 'https://tennismontargis.fr/espace-membre.html'
    });

    const options = { TTL: 60 * 60 * 48, urgency: 'high' }; // 48h, priorité haute

    let sent = 0;
    const toRemove = [];

    const subsData = subsSnap.val();
    const promises = Object.entries(subsData).map(async ([tokenHash, sub]) => {
        if (!sub.token || !sub.keys) { toRemove.push(tokenHash); return; }
        try {
            await webpush.sendNotification({ endpoint: sub.token, keys: sub.keys }, payload, options);
            sent++;
        } catch (err) {
            console.error(`[sendMemberPush] Échec envoi ${tokenHash}:`, err.statusCode);
            if (err.statusCode === 410 || err.statusCode === 404) toRemove.push(tokenHash);
        }
    });

    await Promise.all(promises);

    // Nettoyage tokens invalides
    if (toRemove.length > 0) {
        const updates = {};
        toRemove.forEach(k => { updates[k] = null; });
        await admin.database().ref(`push_subscriptions_membres/${uid}`).update(updates);
    }

    console.log(`[sendMemberPush] uid=${uid} → ${sent} push envoyées, ${toRemove.length} nettoyés`);
    return { success: true, sent, cleaned: toRemove.length };
});

/**
 * Trigger DB — Nouveau message dans une discussion d'équipe
 * Envoie une push Web à tous les joueurs de l'équipe sauf l'auteur.
 * Chemin : chats_equipe/{equipeId}/{msgId}
 */
exports.onTeamChatMessage = functions.database.ref('/chats_equipe/{equipeId}/{msgId}')
    .onCreate(async (snap, context) => {
        const msg = snap.val() || {};
        const equipeId = context.params.equipeId;
        if (!msg.uid || !msg.texte) return null;

        const eqSnap = await admin.database().ref(`equipes/${equipeId}`).once('value');
        const eq = eqSnap.val();
        if (!eq) return null;

        const destinataires = Object.keys(eq.joueurs || {}).filter(u => u !== msg.uid);
        if (!destinataires.length) return null;

        const vapidPrivateKey = functions.config().vapid?.private_key || process.env.VAPID_PRIVATE_KEY;
        if (!vapidPrivateKey) {
            console.warn('[onTeamChatMessage] Clé VAPID privée non configurée — pas de push.');
            return null;
        }
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivateKey);

        const auteur = (`${msg.prenom || ''} ${msg.nom || ''}`).trim() || (msg.role === 'coach' ? 'Le coach' : 'Un coéquipier');
        const texte = msg.texte.length > 100 ? msg.texte.substring(0, 97) + '...' : msg.texte;
        const payload = JSON.stringify({
            title: `💬 ${eq.nom || 'Équipe'} — ${auteur}`,
            body: texte,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            url: 'https://tennismontargis.fr/espace-membre.html'
        });
        const options = { TTL: 60 * 60 * 24, urgency: 'normal' };

        let sent = 0;
        await Promise.all(destinataires.map(async (uid) => {
            const subsSnap = await admin.database().ref(`push_subscriptions_membres/${uid}`).once('value');
            if (!subsSnap.exists()) return;
            const toRemove = [];
            await Promise.all(Object.entries(subsSnap.val()).map(async ([tokenHash, sub]) => {
                if (!sub.token || !sub.keys) { toRemove.push(tokenHash); return; }
                try {
                    await webpush.sendNotification({ endpoint: sub.token, keys: sub.keys }, payload, options);
                    sent++;
                } catch (err) {
                    if (err.statusCode === 410 || err.statusCode === 404) toRemove.push(tokenHash);
                }
            }));
            if (toRemove.length) {
                const updates = {};
                toRemove.forEach(k => { updates[k] = null; });
                await admin.database().ref(`push_subscriptions_membres/${uid}`).update(updates);
            }
        }));

        console.log(`[onTeamChatMessage] équipe=${equipeId} auteur=${msg.uid} → ${sent} push envoyées`);
        return null;
    });

// ─────────────────────────────────────────────────────────────────────────
//  NOTIFICATIONS PAR EMAIL (championnats par équipes)
// ─────────────────────────────────────────────────────────────────────────

// Transporteur email « sûr » pour les triggers : renvoie null au lieu de throw.
function getMailTransporterSafe() {
    const gmailUser = functions.config().gmail?.user || process.env.GMAIL_USER;
    const gmailPass = functions.config().gmail?.pass || process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
        console.warn('[email] Configuration Gmail absente — email non envoyé.');
        return null;
    }
    if (!_mailTransporter) {
        _mailTransporter = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } });
    }
    return _mailTransporter;
}

// Enveloppe HTML brandée du club autour du contenu du message.
function _clubEmailHtml(heading, bodyHtml, ctaLabel, ctaUrl) {
    const url = ctaUrl || 'https://tennismontargis.fr/espace-membre.html';
    const cta = ctaLabel
        ? `<tr><td style="padding:8px 0 4px;"><a href="${url}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;font-size:14px;">${escapeHtml(ctaLabel)}</a></td></tr>`
        : '';
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0b1220;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;padding:24px 12px;">
        <tr><td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0f172a;border:1px solid #1e293b;border-radius:14px;overflow:hidden;">
            <tr><td style="background:linear-gradient(135deg,#0d1b2e,#1a2f4a);padding:20px 24px;border-bottom:1px solid #1e293b;">
              <div style="color:#ffd700;font-family:Arial,sans-serif;font-weight:bold;font-size:16px;letter-spacing:1px;">USM TENNIS MONTARGIS</div>
              <div style="color:#94a3b8;font-family:Arial,sans-serif;font-size:12px;margin-top:2px;">Championnats par équipes</div>
            </td></tr>
            <tr><td style="padding:24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;">
                <tr><td style="color:#e2e8f0;font-size:17px;font-weight:bold;padding-bottom:10px;">${escapeHtml(heading)}</td></tr>
                <tr><td style="color:#cbd5e1;font-size:14px;line-height:1.6;padding-bottom:16px;">${bodyHtml}</td></tr>
                ${cta}
              </table>
            </td></tr>
            <tr><td style="padding:16px 24px;border-top:1px solid #1e293b;color:#64748b;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;">
              Vous recevez cet email en tant que membre inscrit à un championnat de l'USM Tennis Montargis.<br>
              Retrouvez le détail dans votre espace membre.
            </td></tr>
          </table>
        </td></tr>
      </table></body></html>`;
}

// Envoi d'un email du club (renvoie true/false, ne throw jamais).
async function sendClubEmail(to, subject, heading, bodyHtml, ctaLabel, ctaUrl, textFallback) {
    if (!to) return false;
    const transporter = getMailTransporterSafe();
    if (!transporter) return false;
    const gmailUser = functions.config().gmail?.user || process.env.GMAIL_USER;
    try {
        await transporter.sendMail({
            from: `"USM Tennis Montargis" <${gmailUser}>`,
            to,
            subject,
            text: textFallback || heading,
            html: _clubEmailHtml(heading, bodyHtml, ctaLabel, ctaUrl)
        });
        return true;
    } catch (err) {
        console.error('[email] Échec envoi à', to, ':', err.message);
        return false;
    }
}

/**
 * Trigger DB — Notification interne créée → email au joueur concerné.
 * Double automatiquement chaque notification_equipe d'un email (hors chat,
 * qui n'écrit pas dans notifications_equipe).
 * Chemin : notifications_equipe/{notifId}
 */
const _EMAIL_SUJETS = {
    convoque:            { sujet: '🎾 Vous êtes convoqué(e) — USM Tennis',        titre: 'Nouvelle convocation' },
    inscription_validee: { sujet: '✅ Inscription validée — USM Tennis',           titre: 'Inscription validée' },
    inscription_refusee: { sujet: 'Inscription au championnat — USM Tennis',       titre: 'Inscription refusée' },
    equipe_assignee:     { sujet: '🎾 Vous êtes dans une équipe — USM Tennis',     titre: 'Vous avez rejoint une équipe' }
};

exports.onNotificationEmail = functions.database.ref('/notifications_equipe/{notifId}')
    .onCreate(async (snap) => {
        const n = snap.val() || {};
        const cfg = _EMAIL_SUJETS[n.type];
        if (!n.uid || !cfg) return null; // type non concerné par l'email

        const memberSnap = await admin.database().ref(`members/${n.uid}`).once('value');
        const member = memberSnap.val();
        if (!member || !member.email) {
            console.log(`[onNotificationEmail] pas d'email pour uid=${n.uid}`);
            return null;
        }

        const prenom = member.prenom ? escapeHtml(member.prenom) : '';
        const body = (prenom ? `Bonjour ${prenom},<br><br>` : '') + escapeHtml(n.message || '');
        const ok = await sendClubEmail(
            member.email, cfg.sujet, cfg.titre, body,
            'Ouvrir mon espace membre', 'https://tennismontargis.fr/espace-membre.html',
            n.message || cfg.titre
        );
        console.log(`[onNotificationEmail] type=${n.type} uid=${n.uid} email=${ok ? 'envoyé' : 'non envoyé'}`);
        return null;
    });

/**
 * Trigger DB — Un joueur se désiste d'une convocation → alerte email au coach + club.
 * Chemin : equipes/{equipeId}/convocations/{rencontreId}/reponses/{uid}
 */
exports.onDesistementAlerte = functions.database.ref('/equipes/{equipeId}/convocations/{rencontreId}/reponses/{uid}')
    .onWrite(async (change, context) => {
        const after = change.after.val();
        const before = change.before.val();
        // On n'alerte que sur un NOUVEAU désistement
        if (!after || after.statut !== 'decline') return null;
        if (before && before.statut === 'decline') return null;

        const { equipeId, rencontreId, uid } = context.params;
        const [eqSnap, joueurSnap, infoSnap] = await Promise.all([
            admin.database().ref(`equipes/${equipeId}`).once('value'),
            admin.database().ref(`members/${uid}`).once('value'),
            admin.database().ref('info/email').once('value')
        ]);
        const eq = eqSnap.val() || {};
        const joueur = joueurSnap.val() || {};
        const rencontre = (eq.rencontres && eq.rencontres[rencontreId]) || {};

        const champSnap = eq.champId
            ? await admin.database().ref(`championnats_equipe/${eq.champId}/nom`).once('value')
            : null;
        const champNom = champSnap ? (champSnap.val() || '') : '';

        // Destinataires : email du club + emails des coaches
        const destinataires = new Set();
        const clubEmail = infoSnap.val();
        if (clubEmail) destinataires.add(clubEmail);

        const coachesSnap = await admin.database().ref('coaches').once('value');
        const coaches = coachesSnap.val() || {};
        await Promise.all(Object.keys(coaches).map(async (cUid) => {
            const cSnap = await admin.database().ref(`members/${cUid}/email`).once('value');
            if (cSnap.val()) destinataires.add(cSnap.val());
        }));

        if (!destinataires.size) {
            console.warn('[onDesistementAlerte] aucun destinataire (club/coach) — email non envoyé.');
            return null;
        }

        const nomJoueur = ((joueur.prenom || '') + ' ' + (joueur.nom || '')).trim() || 'Un joueur';
        const dateMatch = (rencontre.date || '?') + (rencontre.heure ? ' à ' + rencontre.heure : '')
            + (rencontre.adversaire ? ' vs ' + rencontre.adversaire : '');
        const body = `<strong style="color:#ef4444;">${escapeHtml(nomJoueur)}</strong> vient de se désister d'une convocation.<br><br>`
            + `<strong>Équipe :</strong> ${escapeHtml(eq.nom || '—')}${champNom ? ' (' + escapeHtml(champNom) + ')' : ''}<br>`
            + `<strong>Rencontre :</strong> ${escapeHtml(dateMatch)}<br><br>`
            + `Pensez à revoir la composition de l'équipe.`;

        const ok = await sendClubEmail(
            Array.from(destinataires).join(','),
            '⚠️ Désistement — ' + (eq.nom || 'Équipe') + ' — USM Tennis',
            'Désistement d\'un joueur',
            body,
            'Gérer les équipes', 'https://tennismontargis.fr/admin-panel.html',
            `${nomJoueur} se désiste — ${eq.nom || 'Équipe'} — ${dateMatch}`
        );
        console.log(`[onDesistementAlerte] joueur=${uid} équipe=${equipeId} → ${destinataires.size} destinataire(s), email=${ok ? 'envoyé' : 'non envoyé'}`);
        return null;
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

    // Garde-fou serveur : jamais de suppression d'un compte portant un rôle admin ou coach
    const [targetAdmin, targetCoach] = await Promise.all([
        admin.database().ref(`admins/${uid}`).once('value'),
        admin.database().ref(`coaches/${uid}`).once('value')
    ]);
    if (targetAdmin.exists()) {
        throw new functions.https.HttpsError('failed-precondition', 'Ce compte est administrateur — suppression refusée. Retirez d\'abord son rôle admin.');
    }
    if (targetCoach.exists()) {
        throw new functions.https.HttpsError('failed-precondition', 'Ce compte a l\'accès coach — retirez d\'abord son accès coach avant de le supprimer.');
    }

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
 * Cloud Function pour envoyer le formulaire de contact par email (SMTP direct)
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

    const cleanName    = name.trim();
    const cleanEmail   = email.trim();
    const cleanMessage = message.trim();

    const transporter = getMailTransporter();
    const gmailUser    = functions.config().gmail?.user || process.env.GMAIL_USER;

    const infoSnap  = await admin.database().ref('info/email').once('value');
    const destEmail = infoSnap.val() || gmailUser;

    try {
        await transporter.sendMail({
            from:    `"Site USM Tennis Montargis" <${gmailUser}>`,
            to:      destEmail,
            replyTo: cleanEmail,
            subject: `Nouveau message de contact — ${cleanName}`,
            text:    `Nom : ${cleanName}\nEmail : ${cleanEmail}\n\n${cleanMessage}`,
            html:    `<p><strong>Nom :</strong> ${escapeHtml(cleanName)}</p>`
                   + `<p><strong>Email :</strong> ${escapeHtml(cleanEmail)}</p>`
                   + `<p><strong>Message :</strong></p><p>${escapeHtml(cleanMessage).replace(/\n/g, '<br>')}</p>`
        });
    } catch (err) {
        console.error('Erreur envoi email SMTP:', err);
        throw new functions.https.HttpsError('internal', 'Échec envoi email.');
    }

    // Sauvegarder dans Firebase DB
    await admin.database().ref('contacts').push({
        name:      cleanName,
        email:     cleanEmail,
        message:   cleanMessage,
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
