/* =====================================================================
   Filtre anti-spam des formulaires du nouveau site (site_v2_messages).

   Trois niveaux, décidés côté serveur (le navigateur ne peut pas être cru) :
     a) spam     : champ piège (honeypot) rempli, ou envoi en moins de 3 s
                   → aucun e-mail, message marqué spam: true dans l'admin.
     b) suspect  : lien dans le message, ou adresse e-mail jetable
                   (ou signal anti-spam absent : ancienne page en cache, envoi direct)
                   → e-mail uniquement à l'adresse Gmail du club, objet « [À vérifier] ».
     c) normal   : e-mail à l'adresse du club (info/email), comme avant.

   La liste des domaines jetables est ICI, et nulle part ailleurs : pour en ajouter
   un, ajouter une ligne à DISPOSABLE_DOMAINS puis redéployer la fonction.
   ===================================================================== */
'use strict';

const SUSPECT_TO = 'usmmtennis@gmail.com';
const MIN_FILL_MS = 3000; // en dessous : aucun humain n'a pu remplir le formulaire

const DISPOSABLE_DOMAINS = [
  'mailinator.com', 'yopmail.com', 'yopmail.fr', 'guerrillamail.com', 'sharklasers.com',
  '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'trashmail.com', 'getnada.com',
  'throwawaymail.com', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mintemail.com',
  'mohmal.com', 'emailondeck.com', 'tempail.com', 'burnermail.io', 'moakt.com'
];

// Adresse jetable : le domaine, ou un de ses sous-domaines, figure dans la liste
function isDisposable(email) {
  const at = String(email || '').lastIndexOf('@');
  if (at < 0) return false;
  const domain = String(email).slice(at + 1).trim().toLowerCase();
  return DISPOSABLE_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d));
}

// Lien : schéma http(s), « www. », ou nom de domaine nu avec une extension courante des spams.
// Les adresses e-mail écrites dans le texte sont retirées avant le test (un parent qui
// donne son e-mail dans le message n'est pas un lien).
const BARE_DOMAIN = /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|ru|xyz|top|info|biz|io|co|me|link|click|shop|online|site|store|club|live|cn|tk|ly|gl)\b/i;
function hasLink(text) {
  const t = String(text || '').replace(/[^\s@]+@[^\s@]+/g, ' ');
  return /https?:\/\//i.test(t) || /\bwww\./i.test(t) || BARE_DOMAIN.test(t);
}

/* m : message tel qu'enregistré (name, email, message, subject, hp, elapsed, extra…)
   Retourne { level: 'spam' | 'suspect' | 'normal', reason } */
function classify(m) {
  m = m || {};
  if (typeof m.hp === 'string' && m.hp.trim()) return { level: 'spam', reason: 'champ piège rempli' };
  if (typeof m.elapsed === 'number' && m.elapsed < MIN_FILL_MS) return { level: 'spam', reason: 'envoi en moins de 3 s' };
  if (hasLink(m.message) || hasLink(m.name)) return { level: 'suspect', reason: 'lien dans le message' };
  if (isDisposable(m.email)) return { level: 'suspect', reason: 'adresse e-mail jetable' };
  if (typeof m.elapsed !== 'number') return { level: 'suspect', reason: 'signal anti-spam absent' };
  return { level: 'normal', reason: '' };
}

module.exports = { classify, isDisposable, hasLink, SUSPECT_TO, MIN_FILL_MS, DISPOSABLE_DOMAINS };
