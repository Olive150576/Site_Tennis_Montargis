// Recette ciblée « invitations » (admin v2 en MODE FIREBASE, émulateurs auth + database) : envoi individuel et groupé,
// puis parcours complet d'un invité. Lancement : voir LISEZMOI.md. Version courte de admin-e2e.js (≈ 40 s).
// (aucune donnée réelle touchée). Lancement : voir LISEZMOI.md dans ce dossier.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const V2 = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
function serve() { // mini serveur statique du dossier v2/
  return new Promise((ok) => { const s = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(V2, p); if (!f.startsWith(V2) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }); s.listen(8080, '127.0.0.1', () => ok(s)); });
}
const H = '127.0.0.1', NS = 'demo-usm-default-rtdb', SITE = 'http://127.0.0.1:8080';
const DB = (p) => `http://${H}:9000/${p}.json?ns=${NS}`;
const OWN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const R = []; const ok = (n, c, extra) => { R.push(!!c); console.log((c ? '✅ ' : '❌ ') + n + (extra && !c ? ' — ' + extra : '')); };
async function signUp(email, pw) {
  const r = await fetch(`http://${H}:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw, returnSecureToken: true }) });
  return (await r.json()).localId;
}
const OVERRIDE = `;(function(c){c.mode='firebase';c.firebase=Object.assign({},c.firebase,{apiKey:'fake',projectId:'demo-usm',databaseURL:'https://${NS}.firebaseio.com',storageBucket:'demo-usm.appspot.com'});c.emulators={host:'${H}',auth:9099,database:9000,storage:9199,functions:5001,ns:'${NS}'};c.clarity=Object.assign({},c.clarity,{hosts:[]});})(window.USM_CONFIG);`;

(async () => {
  const server = await serve();
  const adm = await signUp('admin@test.fr', 'Admin-Test-123');
  await fetch(`http://${H}:9000/.json?ns=${NS}`, { method: 'PUT', headers: OWN, body: JSON.stringify({ admins: { [adm]: true } }) });
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/assets/js/config.js', async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()) + OVERRIDE }); });
  const errors = []; const page = await ctx.newPage(); let expectMailFail = false;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|clarity|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) { if (!(/accounts:sendOobCode/.test(r.url()) && expectMailFail)) errors.push(r.status() + ' ' + r.url().slice(0, 120)); } });
  const go = async (h) => { await page.goto(SITE + '/admin/' + h); await page.waitForTimeout(1200); };
  const login = async (e, p) => { await page.fill('#lg-email', e); await page.fill('#lg-pass', p); await page.click('#login button[type=submit]'); await page.waitForTimeout(300); await page.waitForFunction(() => document.querySelector('nav') || (document.querySelector('#login button[type=submit]') && !document.querySelector('#login button[type=submit]').disabled), null, { timeout: 25000 }); await page.waitForTimeout(800); };
  const getJ = async (u) => (await fetch(u, { headers: OWN })).json();
  const allOob = async (email) => ((await (await fetch(`http://${H}:9099/emulator/v1/projects/demo-usm/oobCodes`)).json()).oobCodes || []).filter((c) => c.email === email && c.requestType === 'PASSWORD_RESET');
  const put = (id, m) => fetch(DB('members/' + id), { method: 'PUT', headers: OWN, body: JSON.stringify(m) });
  // Jeu de données : Paul (compte, jamais invité), Léa (compte), Fantôme (fiche sans compte), Déjà Vu (déjà venu), Inactif
  const paul = await signUp('paul.durand@test.fr', 'Provisoire-Aleatoire-1'), lea = await signUp('lea.bulk@test.fr', 'Provisoire-Aleatoire-2');
  await put(paul, { prenom: 'Paul', nom: 'Durand', email: 'paul.durand@test.fr', actif: true, categorie: 'Vétéran H', statut: 'Membre' });
  await put(lea, { prenom: 'Léa', nom: 'Bulk', email: 'lea.bulk@test.fr', actif: true, categorie: 'Adulte F', statut: 'Membre' });
  await put('ghostbulk', { prenom: 'Fantôme', nom: 'Bulk', email: 'ghost.bulk@test.fr', actif: true });
  await put('vubulk', { prenom: 'Déjà', nom: 'Vu', email: 'deja.vu@test.fr', actif: true, derniereVisite: Date.now(), visites: 3 });
  await put('inactbulk', { prenom: 'Inactif', nom: 'Bulk', email: 'inactif.bulk@test.fr', actif: false });
  await go(''); await login('admin@test.fr', 'Admin-Test-123');
  ok('Admin connecté', await page.isVisible('nav'), page.url());

  // Liste : état de chaque fiche
  await go('#/membres'); await page.waitForTimeout(600);
  const rowOf = async (id) => page.innerText(`tbody tr[data-id="${id}"]`);
  ok('Liste : « Jamais connecté · pas encore invité » pour un nouveau', /Jamais connecté · pas encore invité/.test(await rowOf(paul)), await rowOf(paul));
  ok('Liste : « Dernière visite le … · 3 visites » pour un membre déjà venu', /Dernière visite le \d\d\/\d\d · 3 visites/.test(await rowOf('vubulk')), await rowOf('vubulk'));
  ok('Liste : pas de bouton d\'invitation pour un membre inactif (filtre « Tous »)', await (async () => { await page.selectOption('#mb-f', ''); await page.waitForTimeout(300); return !(await page.$('.mb-inv[data-id="inactbulk"]')) && !!(await page.$(`.mb-inv[data-id="${paul}"]`)); })());
  await page.selectOption('#mb-f', 'actifs');

  // Envoi individuel depuis la fiche
  await go('#/membres/' + paul); await page.click('#mb-mail'); await page.click('.modal [data-a="1"]'); await page.waitForTimeout(1500);
  ok('Fiche : e-mail envoyé et daté sur la fiche (invitedAt)', (await allOob('paul.durand@test.fr')).length === 1 && (await getJ(DB('members/' + paul + '/invitedAt'))) > 0);
  // Envoi individuel depuis la liste
  await go('#/membres'); await page.waitForTimeout(600);
  ok('Liste : « Jamais connecté · invité le … » après l\'envoi', /Jamais connecté · invité le \d\d\/\d\d/.test(await rowOf(paul)), await rowOf(paul));
  await page.click(`.mb-inv[data-id="${paul}"]`); await page.waitForTimeout(300);
  ok('Liste : l\'envoi individuel demande confirmation avec l\'adresse du membre', /paul\.durand@test\.fr/.test(await page.innerText('.modal')));
  await page.click('.modal [data-a="0"]'); await page.waitForTimeout(300);
  ok('Liste : annuler n\'envoie rien', (await allOob('paul.durand@test.fr')).length === 1);
  await page.click(`.mb-inv[data-id="${paul}"]`); await page.waitForTimeout(300); await page.click('.modal [data-a="1"]'); await page.waitForTimeout(1500);
  ok('Liste : envoi individuel après confirmation', (await allOob('paul.durand@test.fr')).length === 2);
  ok('Liste : la ligne n\'a pas ouvert la fiche', page.url().endsWith('#/membres'), page.url());

  // Envoi groupé
  await page.click('#mb-inv-all'); await page.waitForSelector('.modal');
  const bm = await page.innerText('.modal');
  ok('Groupé : récapitulatif (jamais connectés, jamais invités, déjà invités, lien valable 1 h, « Mot de passe oublié »)', /3 membres actifs ne se sont jamais connecté/.test(bm) && /2 jamais invités/.test(bm) && /1 déjà invité/.test(bm) && /1 heure/.test(bm) && /Mot de passe oublié/.test(bm), bm.slice(0, 500));
  expectMailFail = true;
  await page.click('.modal [data-a="1"]'); await page.waitForSelector('.modal h2:has-text("envoyée")', { timeout: 60000 });
  const rm = await page.innerText('.modal'); expectMailFail = false;
  ok('Groupé : Léa reçoit l\'e-mail et sa fiche est datée', (await allOob('lea.bulk@test.fr')).length === 1 && (await getJ(DB('members/' + lea + '/invitedAt'))) > 0);
  ok('Groupé : Paul (déjà invité) n\'est pas relancé par défaut', (await allOob('paul.durand@test.fr')).length === 2);
  ok('Groupé : ni l\'inactif ni le membre déjà connecté ne reçoivent d\'e-mail', !(await allOob('inactif.bulk@test.fr')).length && !(await allOob('deja.vu@test.fr')).length);
  ok('Groupé : le compte introuvable est signalé en échec sans bloquer les autres', /1 invitation envoyée/.test(rm) && /Fantôme Bulk/.test(rm) && /1 en échec/.test(rm), rm);
  await page.click('.modal [data-a="1"]'); await page.waitForTimeout(400);
  // Relance : case « relancer aussi les déjà invités »
  await page.click('#mb-inv-all'); await page.waitForSelector('.modal');
  ok('Groupé : proposition de relancer les déjà invités', /2 déjà invités/.test(await page.innerText('.modal')) && !!(await page.$('#inv-again')));
  await page.click('.modal label.switch:has(#inv-again)'); expectMailFail = true;
  await page.click('.modal [data-a="1"]'); await page.waitForSelector('.modal h2:has-text("envoyée")', { timeout: 60000 }); expectMailFail = false;
  ok('Groupé : relance → Paul et Léa reçoivent un nouvel e-mail', (await allOob('paul.durand@test.fr')).length === 3 && (await allOob('lea.bulk@test.fr')).length === 2);
  await page.click('.modal [data-a="1"]'); await page.waitForTimeout(400);

  // Parcours complet d'un invité : lien de l'e-mail → mot de passe choisi → connexion à l'espace membre → visite visible dans la liste
  const code = (await allOob('lea.bulk@test.fr'))[1];
  ok('Parcours : le lien de l\'e-mail ramène vers l\'espace membre', /espace-membre\.html/.test(decodeURIComponent(code.oobLink || '')), code.oobLink);
  const rs = await (await fetch(`http://${H}:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oobCode: code.oobCode, newPassword: 'Choisi-Par-Lea-1' }) })).json();
  ok('Parcours : le lien permet de choisir son mot de passe', rs && rs.email === 'lea.bulk@test.fr', JSON.stringify(rs));
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.route('**/assets/js/config.js', async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()) + OVERRIDE }); });
  const pm = await ctx2.newPage(); await pm.goto(SITE + '/espace-membre.html'); await pm.waitForTimeout(1500);
  await pm.fill('#lg-email', 'lea.bulk@test.fr'); await pm.fill('#lg-pw', 'Provisoire-Aleatoire-2'); await pm.click('#login-form [type=submit]'); await pm.waitForTimeout(2500);
  ok('Parcours : l\'ancien mot de passe provisoire ne marche plus', !(await pm.isVisible('#app')));
  await pm.fill('#lg-pw', 'Choisi-Par-Lea-1'); await pm.click('#login-form [type=submit]');
  let entree = true; try { await pm.waitForFunction(() => !document.querySelector('#app').hidden, null, { timeout: 25000 }); } catch (e) { entree = false; }
  ok('Parcours : connexion à l\'espace membre avec le mot de passe choisi', entree, await pm.innerText('#lg-err').catch(() => ''));
  await pm.waitForTimeout(1800);
  ok('Parcours : sa première visite est enregistrée', (await getJ(DB('members/' + lea + '/derniereVisite'))) > 0);
  await ctx2.close();
  await go('#/tableau'); await go('#/membres'); await page.waitForTimeout(600);
  ok('Parcours : la liste passe de « Jamais connecté » à « Dernière visite le … »', /Dernière visite le \d\d\/\d\d/.test(await rowOf(lea)), await rowOf(lea));
  await page.click('#mb-inv-all'); await page.waitForSelector('.modal');
  ok('Groupé : Léa, désormais connectée, n\'est plus à inviter (reste Paul + Fantôme)', /2 membres actifs ne se sont jamais connecté/.test(await page.innerText('.modal')), await page.innerText('.modal'));
  await page.click('.modal [data-a="0"]'); await page.waitForTimeout(300);
  ok('Aucune erreur JS sur tout le parcours', errors.length === 0, errors.join(' | '));
  await browser.close(); server.close();
  console.log(`\n${R.filter(Boolean).length}/${R.length} contrôles invitations (mode Firebase)`); process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
