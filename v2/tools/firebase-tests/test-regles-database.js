const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const results = [];
async function t(name, p, expect) {
  try { await (expect === 'ok' ? assertSucceeds(p) : assertFails(p)); results.push(['ok', name]); }
  catch (e) { results.push(['KO', name + ' — ' + (e.message || e).split('\n')[0]]); }
}
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-usm', database: { rules: fs.readFileSync(__dirname + '/../../../database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 } });
  const day = 864e5, now = Date.now();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set({
      admins: { admin1: true }, coaches: { coach1: true },
      members: { alice: { prenom: 'Alice', nom: 'A', actif: true, email: 'a@x.fr' }, bob: { prenom: 'Bob', nom: 'B', actif: false } },
      news: { 0: { title: 'Ancienne actu' } },
      site_v2: { settings: { email: 'club@x.fr' }, shopProducts: {
        sp1: { name: 'Veste', status: 'ouverte', deadlineTs: now + day, priceMember: 39, markingPrice: 5, draft: false },
        sp2: { name: 'Short', status: 'ouverte', deadlineTs: now - day, priceMember: 20, draft: false },
        sp3: { name: 'Casquette', status: 'terminee', deadlineTs: now - 60 * day, priceMember: 12 },
        sp4: { name: 'Masqué', status: 'ouverte', deadlineTs: now + day, priceMember: 10, draft: true } } },
      boutique_reservations: { sp1: { bob: { r0: { size: 'L', qty: 1, unitPrice: 39, total: 39, status: 'reservee', paid: false, pickedUp: false, createdAt: now } } } }
    });
  });
  const anon = env.unauthenticatedContext().database();
  const alice = env.authenticatedContext('alice').database();
  const bob = env.authenticatedContext('bob').database();
  const adm = env.authenticatedContext('admin1').database();
  const coach = env.authenticatedContext('coach1').database();
  const R = (o) => Object.assign({ size: 'M', color: 'Bleu royal', qty: 2, marking: '', unitPrice: 39, total: 78, status: 'reservee', paid: false, pickedUp: false, createdAt: now, updatedAt: now, name: 'Alice A' }, o || {});

  // Site actuel : inchangé
  await t('Visiteur : lit les actus du site actuel', anon.ref('news').once('value'), 'ok');
  await t('Visiteur : ne peut pas écrire les actus du site actuel', anon.ref('news/1').set({ title: 'x' }), 'ko');
  await t('Nœud inconnu toujours bloqué', anon.ref('pirate').set(1), 'ko');
  // Nouveau site
  await t('Visiteur : lit le contenu du nouveau site (site_v2)', anon.ref('site_v2').once('value'), 'ok');
  await t('Visiteur : ne peut pas modifier site_v2', anon.ref('site_v2/settings/email').set('x@y.fr'), 'ko');
  await t('Admin : modifie site_v2', adm.ref('site_v2/settings/email').set('club@x.fr'), 'ok');
  const msg = { id: 'm1', name: 'Paul', email: 'p@x.fr', message: 'Bonjour', createdAt: new Date().toISOString(), read: false, type: 'contact' };
  await t('Visiteur : envoie un message (formulaire)', anon.ref('site_v2_messages/m1').set(msg), 'ok');
  await t('Visiteur : ne peut pas écraser un message existant', anon.ref('site_v2_messages/m1').set(Object.assign({}, msg, { message: 'spam' })), 'ko');
  await t('Visiteur : ne peut pas lire les messages', anon.ref('site_v2_messages').once('value'), 'ko');
  await t('Message sans e-mail refusé', anon.ref('site_v2_messages/m2').set({ id: 'm2', name: 'X', message: 'y', createdAt: 'z' }), 'ko');
  await t('Admin : lit et marque les messages', adm.ref('site_v2_messages/m1/read').set(true), 'ok');
  // Boutique : réservations
  await t('Membre actif : réserve (produit ouvert, avant la date limite)', alice.ref('boutique_reservations/sp1/alice/r1').set(R()), 'ok');
  await t('Membre actif : lit ses réservations', alice.ref('boutique_reservations/sp1/alice').once('value'), 'ok');
  await t('Membre : ne lit pas les réservations des autres', alice.ref('boutique_reservations/sp1/bob').once('value'), 'ko');
  await t('Membre : ne lit pas toutes les réservations', alice.ref('boutique_reservations/sp1').once('value'), 'ko');
  await t('Membre non actif : ne peut pas réserver', bob.ref('boutique_reservations/sp1/bob/r2').set(R({ name: 'Bob' })), 'ko');
  await t('Visiteur : ne peut pas réserver', anon.ref('boutique_reservations/sp1/x/r1').set(R()), 'ko');
  await t('Membre : ne peut pas réserver au nom d\'un autre', alice.ref('boutique_reservations/sp1/bob/r3').set(R()), 'ko');
  await t('Refusé : se marquer « réglé »', alice.ref('boutique_reservations/sp1/alice/r4').set(R({ paid: true })), 'ko');
  await t('Refusé : prix inférieur au prix membre', alice.ref('boutique_reservations/sp1/alice/r5').set(R({ unitPrice: 1, total: 2 })), 'ko');
  await t('Refusé : total incohérent', alice.ref('boutique_reservations/sp1/alice/r6').set(R({ total: 10 })), 'ko');
  await t('Refusé : quantité 0', alice.ref('boutique_reservations/sp1/alice/r7').set(R({ qty: 0, total: 0 })), 'ko');
  await t('Refusé : marquage de plus de 12 caractères', alice.ref('boutique_reservations/sp1/alice/r8').set(R({ marking: 'ABCDEFGHIJKLM', unitPrice: 44, total: 88 })), 'ko');
  await t('Refusé : champ inconnu', alice.ref('boutique_reservations/sp1/alice/r9').set(R({ remise: 50 })), 'ko');
  await t('Refusé : après la date limite', alice.ref('boutique_reservations/sp2/alice/r1').set(R({ unitPrice: 20, total: 40 })), 'ko');
  await t('Refusé : produit terminé', alice.ref('boutique_reservations/sp3/alice/r1').set(R({ unitPrice: 12, total: 24 })), 'ko');
  await t('Refusé : produit masqué', alice.ref('boutique_reservations/sp4/alice/r1').set(R({ unitPrice: 10, total: 20 })), 'ko');
  await t('Membre : modifie sa réservation avant la date limite', alice.ref('boutique_reservations/sp1/alice/r1').update({ qty: 1, total: 39, updatedAt: now + 1 }), 'ok');
  await t('Membre : ne peut pas se marquer « retiré »', alice.ref('boutique_reservations/sp1/alice/r1/pickedUp').set(true), 'ko');
  // Compteur public
  await t('Membre actif : lit le compteur', alice.ref('boutique_compteurs').once('value'), 'ok');
  await t('Coach : lit le compteur', coach.ref('boutique_compteurs').once('value'), 'ok');
  await t('Visiteur : ne lit pas le compteur', anon.ref('boutique_compteurs').once('value'), 'ko');
  await t('Membre non actif : ne lit pas le compteur', bob.ref('boutique_compteurs').once('value'), 'ko');
  await t('Membre actif : +2 sur le compteur (transaction)', alice.ref('boutique_compteurs/sp1').transaction((c) => { c = c || {}; c.total = (c.total || 0) + 2; c.parTaille = c.parTaille || {}; c.parTaille.M = (c.parTaille.M || 0) + 2; return c; }), 'ok');
  await t('Refusé : +50 d\'un coup sur le compteur', alice.ref('boutique_compteurs/sp1/total').set(52), 'ko');
  await t('Refusé : compteur négatif', alice.ref('boutique_compteurs/sp1/total').set(-1), 'ko');
  await t('Refusé : compteur d\'un produit inexistant', alice.ref('boutique_compteurs/zz').set({ total: 1 }), 'ko');
  // Liste d'attente et messages
  await t('Membre actif : s\'inscrit sur la liste d\'attente', alice.ref('boutique_attente/sp3/alice').set(now), 'ok');
  await t('Membre : n\'inscrit pas un autre membre', alice.ref('boutique_attente/sp3/bob').set(now), 'ko');
  await t('Membre : ne lit pas toute la liste d\'attente', alice.ref('boutique_attente/sp3').once('value'), 'ko');
  await t('Admin : écrit un message aux membres', adm.ref('boutique_avis/alice/n1').set({ pid: 'sp1', title: 'Commande lancée', text: '…', at: now }), 'ok');
  await t('Membre : lit ses messages boutique', alice.ref('boutique_avis/alice').once('value'), 'ok');
  await t('Membre : ne lit pas les messages des autres', alice.ref('boutique_avis/bob').once('value'), 'ko');
  await t('Membre : ne peut pas écrire de message boutique', alice.ref('boutique_avis/alice/n2').set({ title: 'x' }), 'ko');
  // Admin : suivi
  await t('Admin : lit toutes les réservations', adm.ref('boutique_reservations').once('value'), 'ok');
  await t('Admin : coche « réglé »', adm.ref('boutique_reservations/sp1/alice/r1').update({ paid: true, updatedAt: now + 2 }), 'ok');
  await t('Admin : passe les statuts en « commandee » (multi-chemins)', adm.ref('boutique_reservations').update({ 'sp1/alice/r1/status': 'commandee', 'sp1/bob/r0/status': 'commandee' }), 'ok');
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('site_v2/shopProducts/sp1/status').set('commandee'));
  await t('Après « Commandée » : le membre ne peut plus annuler', alice.ref('boutique_reservations/sp1/alice/r1').remove(), 'ko');
  await t('Après « Commandée » : le membre ne peut plus modifier', alice.ref('boutique_reservations/sp1/alice/r1/qty').set(3), 'ko');
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('site_v2/shopProducts/sp1/status').set('ouverte'));
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref('boutique_reservations/sp1/alice/r1').update({ status: 'reservee', paid: false }));
  await t('Avant la date limite : le membre annule', alice.ref('boutique_reservations/sp1/alice/r1').remove(), 'ok');
  await env.cleanup();
  const ko = results.filter((r) => r[0] === 'KO');
  results.forEach((r) => console.log((r[0] === 'ok' ? '✅ ' : '❌ ') + r[1]));
  console.log(`\n${results.length - ko.length}/${results.length} règles vérifiées`);
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
