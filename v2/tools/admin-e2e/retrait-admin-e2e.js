// Recette ciblée « retrait d'un administrateur » (émulateurs auth + database + functions, sans navigateur).
// Vérifie que la suppression de admins/{uid} retire le claim « admin » et révoque les sessions.
// Lancement (depuis la racine du dépôt) :
//   firebase emulators:exec --only auth,database,functions --project demo-usm "node v2/tools/admin-e2e/retrait-admin-e2e.js"
const path = require('path');
const admin = require(path.resolve(__dirname, '../../../functions/node_modules/firebase-admin'));

process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
// Namespace « demo-usm » : c'est celui que l'émulateur Functions surveille (déclencheurs) et que les fonctions lisent
admin.initializeApp({ projectId: 'demo-usm', databaseURL: 'http://127.0.0.1:9000/?ns=demo-usm' });

const R = [];
const ok = (n, c, extra) => { R.push(!!c); console.log((c ? '✅ ' : '❌ ') + n + (c || extra === undefined ? '' : ' — ' + JSON.stringify(extra))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Attend l'EFFET (pas un délai fixe) : interroge jusqu'à 30 s
async function attendre(cond, ms = 30000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { try { if (await cond()) return true; } catch (e) { /* on réessaie */ } await sleep(400); }
  return false;
}

(async () => {
  const db = admin.database(), auth = admin.auth();

  // Cas 1 : ex-admin avec un autre claim → seul « admin » disparaît, sessions révoquées
  const u1 = await auth.createUser({ email: 'ex-admin@test.fr', password: 'Test-123456' });
  await auth.setCustomUserClaims(u1.uid, { admin: true, autre: 'garde-moi' });
  await db.ref(`admins/${u1.uid}`).set(true);
  const avant = (await auth.getUser(u1.uid)).tokensValidAfterTime;
  ok('Départ : claim admin posé', (await auth.getUser(u1.uid)).customClaims.admin === true);
  await sleep(1100); // tokensValidAfterTime a une précision d'une seconde
  await db.ref(`admins/${u1.uid}`).remove();
  const claimParti = await attendre(async () => !((await auth.getUser(u1.uid)).customClaims || {}).admin);
  ok('Retrait de admins/{uid} → claim « admin » retiré', claimParti);
  const u1b = await auth.getUser(u1.uid);
  ok('Les autres claims sont conservés', (u1b.customClaims || {}).autre === 'garde-moi', u1b.customClaims);
  ok('Sessions révoquées (tokensValidAfterTime avancé)', new Date(u1b.tokensValidAfterTime) > new Date(avant), { avant, apres: u1b.tokensValidAfterTime });

  // Cas 2 : seul claim = admin → plus aucun claim
  const u2 = await auth.createUser({ email: 'ex-admin2@test.fr', password: 'Test-123456' });
  await auth.setCustomUserClaims(u2.uid, { admin: true });
  await db.ref(`admins/${u2.uid}`).set(true);
  await db.ref(`admins/${u2.uid}`).remove();
  const vide = await attendre(async () => Object.keys((await auth.getUser(u2.uid)).customClaims || {}).length === 0);
  ok('Claim admin seul : compte sans aucun claim après retrait', vide);

  // Cas 3 : admin rétabli aussitôt → le claim n'est PAS retiré (garde anti-course)
  const u3 = await auth.createUser({ email: 'retabli@test.fr', password: 'Test-123456' });
  await auth.setCustomUserClaims(u3.uid, { admin: true });
  await db.ref(`admins/${u3.uid}`).set(true);
  await db.ref(`admins/${u3.uid}`).remove();
  await db.ref(`admins/${u3.uid}`).set(true);
  await sleep(6000);
  ok('Admin rétabli aussitôt : claim conservé', (await auth.getUser(u3.uid)).customClaims.admin === true);

  // Cas 4 : fiche admins/{uid} sans compte Auth → la fonction ne plante pas ; le suivant est encore traité
  await db.ref('admins/fantome-sans-compte').set(true);
  await db.ref('admins/fantome-sans-compte').remove();
  const u4 = await auth.createUser({ email: 'apres-fantome@test.fr', password: 'Test-123456' });
  await auth.setCustomUserClaims(u4.uid, { admin: true });
  await db.ref(`admins/${u4.uid}`).set(true);
  await db.ref(`admins/${u4.uid}`).remove();
  ok('Compte Auth introuvable : sans incident, le retrait suivant fonctionne',
    await attendre(async () => !((await auth.getUser(u4.uid)).customClaims || {}).admin));

  // Cas 5 : un retrait n'affecte pas un autre admin
  const u5 = await auth.createUser({ email: 'reste-admin@test.fr', password: 'Test-123456' });
  await auth.setCustomUserClaims(u5.uid, { admin: true });
  await db.ref(`admins/${u5.uid}`).set(true);
  ok('Un autre administrateur garde son claim', (await auth.getUser(u5.uid)).customClaims.admin === true);

  const bons = R.filter(Boolean).length;
  console.log(`\n${bons}/${R.length} contrôles retrait d'administrateur`);
  process.exit(bons === R.length ? 0 : 1);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
