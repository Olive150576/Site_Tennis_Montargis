/* Test du filtre anti-spam des formulaires : functions/spam-filter.js + déclencheur onSiteV2Message.
   Sans émulateur ni réseau : l'envoi d'e-mails et la base sont simulés.
   Lancer : node v2/tools/test_spam_filter.js   (attendu : tous les contrôles ✅, code 0) */
'use strict';
const path = require('path');
const fdir = path.join(__dirname, '..', '..', 'functions');
const { classify, hasLink, isDisposable, SUSPECT_TO } = require(path.join(fdir, 'spam-filter.js'));
const results = [];
const check = (name, ok) => results.push([ok ? 'ok' : 'KO', name]);

const base = { type: 'contact', name: 'Paul Martin', email: 'paul@orange.fr', message: 'Bonjour, mon fils a 9 ans et voudrait essayer le tennis.', hp: '', elapsed: 12000 };
const lvl = (o) => classify(Object.assign({}, base, o)).level;

// a) spam
check('Champ piège rempli → spam', lvl({ hp: 'http://x.ru' }) === 'spam');
check('Envoi en 1 s → spam', lvl({ elapsed: 1000 }) === 'spam');
check('Envoi à 2,9 s → spam', lvl({ elapsed: 2999 }) === 'spam');
check('Envoi à 3 s pile → pas spam', lvl({ elapsed: 3000 }) === 'normal');
check('Spam prioritaire sur le lien', lvl({ hp: 'x', message: 'http://spam.ru' }) === 'spam');
// b) suspect
check('Lien http dans le message → suspect', lvl({ message: 'Voir https://exemple.xyz/promo' }) === 'suspect');
check('Lien www dans le message → suspect', lvl({ message: 'Allez sur www.truc.fr' }) === 'suspect');
check('Domaine nu .com dans le message → suspect', lvl({ message: 'casino-gratuit.com vous attend' }) === 'suspect');
check('Lien dans le nom → suspect', lvl({ name: 'Visitez promo.ru' }) === 'suspect');
check('Adresse jetable → suspect', lvl({ email: 'x@yopmail.com' }) === 'suspect');
check('Sous-domaine d\'une adresse jetable → suspect', lvl({ email: 'x@a.mailinator.com' }) === 'suspect');
check('Signal anti-spam absent (ancienne page, envoi direct) → suspect', lvl({ elapsed: undefined }) === 'suspect');
// c) normal : pas de faux positifs sur les messages d'un parent
check('Message ordinaire → normal', lvl({}) === 'normal');
check('E-mail donné dans le message → normal', lvl({ message: 'Écrivez-moi à paul@gmail.com ou au 06 12 34 56 78.' }) === 'normal');
check('Heures et ponctuation (« 18h.Merci ») → normal', lvl({ message: 'Disponible le mercredi à 18h.Merci beaucoup !' }) === 'normal');
check('Adresse Gmail légitime → normal', lvl({ email: 'paul@gmail.com' }) === 'normal');
check('hasLink(vide) = false', hasLink('') === false && hasLink(null) === false);
check('isDisposable(sans @) = false', isDisposable('pasmail') === false);

// Déclencheur : on charge site-v2.js avec un transporteur et une base simulés
const sent = [];
const factory = require(path.join(fdir, 'site-v2.js'));
const fakeFunctions = { config: () => ({ gmail: { user: 'usmmtennis@gmail.com' } }), database: { ref: () => ({ onCreate: () => null }) }, https: { onCall: () => null, onRequest: () => null } };
const fakeAdmin = { database: () => ({ ref: (p) => ({ once: async () => ({ val: () => (p === 'info/email' ? 'usmmtennis@orange.fr' : null) }) }) }) };
const v2 = factory({ functions: fakeFunctions, admin: fakeAdmin, getMailTransporterSafe: () => ({ sendMail: async (o) => { sent.push(o); } }), escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) });
const handle = v2._test.handleSiteMessage;
const mkRef = () => { const r = { calls: [], update: async (o) => { r.calls.push(o); } }; return r; };

(async () => {
  let ref = mkRef(), n = sent.length;
  let r = await handle(Object.assign({}, base, { hp: 'bot' }), ref);
  check('a) spam : aucun e-mail', sent.length === n && r.sent === false);
  check('a) spam : message marqué spam: true', ref.calls[0] && ref.calls[0].spam === true && ref.calls[0].suspect === false);

  ref = mkRef(); n = sent.length;
  r = await handle(Object.assign({}, base, { message: 'Promo sur http://spam.xyz' }), ref);
  const o = sent[sent.length - 1];
  check('b) suspect : un seul e-mail', sent.length === n + 1);
  check('b) suspect : envoyé uniquement à ' + SUSPECT_TO, o && o.to === SUSPECT_TO);
  check('b) suspect : objet préfixé [À vérifier]', o && o.subject.indexOf('[À vérifier] ') === 0);
  check('b) suspect : pas de « répondre à » vers le visiteur', o && !o.replyTo);
  check('b) suspect : message marqué suspect: true', ref.calls[0] && ref.calls[0].suspect === true && ref.calls[0].spam === false);

  ref = mkRef(); n = sent.length;
  r = await handle(Object.assign({}, base), ref);
  const o2 = sent[sent.length - 1];
  check('c) normal : e-mail à info/email', sent.length === n + 1 && o2.to === 'usmmtennis@orange.fr');
  check('c) normal : objet sans préfixe', o2 && o2.subject.indexOf('[À vérifier]') === -1);
  check('c) normal : « répondre à » = visiteur', o2 && o2.replyTo === base.email);
  check('c) normal : aucun drapeau', ref.calls[0] && ref.calls[0].spam === false && ref.calls[0].suspect === false);

  const ko = results.filter((x) => x[0] === 'KO');
  results.forEach((x) => console.log((x[0] === 'ok' ? '✅ ' : '❌ ') + x[1]));
  console.log(`\n${results.length - ko.length}/${results.length} contrôles anti-spam`);
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
