// Recette automatique de l'ESPACE MEMBRE v2 en MODE FIREBASE, contre les émulateurs locaux
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
  const at = (y, m, d) => new Date(y, m - 1, d).getTime();
  const uid = await signUp('camille@test.fr', 'Membre-Test-123');
  const inactif = await signUp('inactif@test.fr', 'Membre-Test-123');
  await signUp('sansfiche@test.fr', 'Membre-Test-123');
  const camille = { prenom: 'Camille', nom: 'Durand', email: 'camille@test.fr', telephone: '06 01 02 03 04', licence: '1234567 X', categorie: 'Adulte F', statut: 'Membre', actif: true,
    classement: '30/3', createdAt: at(2019, 9, 1), classementHistory: { h1: { from: '30/4', to: '30/3', at: at(2025, 11, 10) } },
    partenaire: { public_profile: false, updatedAt: 1, style_jeu: 'competitif', dispo: { samedi: { matin: true } }, partager_telephone: false, partager_email: false, message: '' } };
  const iso = (n) => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const ev = (id, o) => Object.assign({ id, title: 'Évé ' + id, category: 'animation', location: 'Club house', dateStart: iso(10), dateEnd: '', time: '', summary: 'Résumé ' + id, draft: false, memberSignup: false }, o);
  const site_v2 = { settings: { email: 'club@test.fr' }, events: {
    ev1: ev('ev1', { title: 'Soirée double surprise', time: '18 h 30', memberSignup: true }),
    ev2: ev('ev2', { title: 'Tournoi interne', category: 'tournoi', dateStart: iso(20) }),
    ev3: ev('ev3', { title: 'Brouillon secret', draft: true }),
    ev4: ev('ev4', { title: 'Événement passé', dateStart: iso(-10), memberSignup: true }) } };
  const club_messages = { cm1: { titre: 'Courts fermés mardi', contenu: 'Entretien de 8 h à 12 h.', type: 'urgent', actif: true, createdAt: Date.now() - 36e5 },
    cm2: { titre: 'Assemblée générale', contenu: 'En novembre au club house.', type: 'info', actif: true, createdAt: Date.now() - 864e5 },
    cm3: { titre: 'Ancien message masqué', contenu: 'x', type: 'info', actif: false, createdAt: 1 } };
  await fetch(DB(''), { method: 'PUT', headers: OWN, body: JSON.stringify({ members: { [uid]: camille, [inactif]: { prenom: 'I', nom: 'N', actif: false } }, site_v2, club_messages }) });
  const M = async () => (await (await fetch(DB('members/' + uid), { headers: OWN })).json());

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/assets/js/config.js', async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()) + OVERRIDE }); });
  const page = await ctx.newPage(); const errors = []; let expectAuthFail = false;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|clarity|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon|settings\.json/.test(r.url())) { if (!(expectAuthFail && /accounts:signInWithPassword/.test(r.url()))) errors.push(r.status() + ' ' + r.url().slice(0, 120)); } });
  const body = async () => page.innerText('body');
  const login = async (e, p) => {
    await page.fill('#lg-email', e); await page.fill('#lg-pw', p); await page.click('#login-form [type=submit]');
    await page.waitForTimeout(300);
    await page.waitForFunction(() => !document.querySelector('#app').hidden || (!document.querySelector('#login-form [type=submit]').disabled && !document.querySelector('#lg-err').hidden), null, { timeout: 25000 });
    await page.waitForTimeout(600);
  };
  const err = async () => page.innerText('#lg-err').catch(() => '');

  await page.goto(SITE + '/espace-membre.html'); await page.waitForTimeout(1500);
  ok('Mode réel : bouton « compte démo » masqué', !(await page.isVisible('#demo-btn')));
  ok('Bandeau « Nouvel espace membre en test »', /en test/.test(await body()));
  expectAuthFail = true;
  await login('camille@test.fr', 'mauvais');
  ok('Mauvais mot de passe refusé', /incorrect/i.test(await err()), await err());
  expectAuthFail = false;
  await login('inactif@test.fr', 'Membre-Test-123');
  ok('Adhésion inactive refusée', /pas active/i.test(await err()), await err());
  await login('sansfiche@test.fr', 'Membre-Test-123');
  ok('Compte sans fiche membre refusé', /Aucune fiche/i.test(await err()), await err());

  await login('camille@test.fr', 'Membre-Test-123');
  ok('Connexion : accueil « Bonjour Camille »', await page.isVisible('#app') && /Bonjour Camille/.test(await body()));
  ok('Aucune donnée fictive affichée (Julien, Thomas Girard…)', !/Julien|Mercier|Girard|Benali/.test(await body()));
  await page.waitForTimeout(800);
  let m = await M();
  ok('Visite comptée (visites, derniereVisite)', m.visites === 1 && m.derniereVisite > 0, JSON.stringify({ v: m.visites, d: m.derniereVisite }));

  // Messages du bureau (club_messages) : urgent dans « À faire », masqué jamais affiché
  const acc = await page.innerText('#v-accueil');
  ok('Accueil : message urgent du bureau dans « À faire »', /Courts fermés mardi/.test(acc), acc.slice(0, 200));
  ok('Accueil : prochains événements réels (pas de brouillon ni de passé)', /Soirée double surprise/.test(acc) && !/Brouillon secret|Événement passé/.test(acc));
  // Agenda unique (site_v2/events) + inscriptions
  await page.goto(SITE + '/espace-membre.html#agenda'); await page.waitForTimeout(1200);
  const ag = await page.innerText('#v-agenda');
  ok('Agenda : événements à venir, horaire texte « 18 h 30 », brouillon et passé exclus', /Soirée double surprise/.test(ag) && /Tournoi interne/.test(ag) && /18 h 30/.test(ag) && !/Brouillon secret|Événement passé/.test(ag), ag.slice(0, 300));
  ok('Agenda : messages du bureau (2 visibles, le masqué absent)', /Assemblée générale/.test(ag) && /Courts fermés mardi/.test(ag) && !/Ancien message masqué/.test(ag));
  ok("Agenda : bouton d'inscription seulement si l'admin l'a ouvert", !!(await page.$('#v-agenda [data-evin="ev1"]')) && !(await page.$('#v-agenda [data-evin="ev2"]')));
  await page.click('#v-agenda [data-evin="ev1"]'); await page.waitForTimeout(1500);
  let reg = await (await fetch(DB('inscriptions_evenement/ev1/' + uid), { headers: OWN })).json();
  ok('Inscription enregistrée (inscriptions_evenement, format actuel) + « 1 inscrit »', reg && reg.prenom === 'Camille' && reg.nom === 'Durand' && reg.at > 0 && /1 inscrit/.test(await page.innerText('#v-agenda')), JSON.stringify(reg));
  await page.click('#v-agenda [data-evin="ev1"]'); await page.waitForTimeout(1500);
  reg = await (await fetch(DB('inscriptions_evenement/ev1/' + uid), { headers: OWN })).json();
  ok('Désinscription : supprimée de Firebase', reg === null, JSON.stringify(reg));
  await page.click('#v-agenda [data-evin="ev1"]'); await page.waitForTimeout(1200); // réinscrit pour la suite

  await page.goto(SITE + '/espace-membre.html#carte'); await page.waitForSelector('#app:not([hidden])', { timeout: 20000 }); await page.waitForTimeout(1200);
  const carte = await page.innerText('#v-carte');
  const qr = await page.$eval('#mc-qr', (e) => e.getAttribute('title') || '').catch(() => '');
  ok('Carte : nom, licence, classement réels', /Camille/.test(carte) && /DURAND/.test(carte) && /1234567 X/.test(carte) && /30\/3/.test(carte), carte.slice(0, 160));
  ok('Carte : QR vers /v/{uid} (page de vérification existante)', qr.endsWith('/v/' + uid), qr);
  ok('Carte : « Membre · cotisation à jour »', /Membre · cotisation à jour/.test(carte));

  await page.goto(SITE + '/espace-membre.html#profil'); await page.waitForTimeout(1200);
  ok('Profil : « Membre depuis 2019 · Adulte F »', /Membre depuis 2019 · Adulte F/.test(await page.innerText('#v-profil')));
  ok('Profil : pas de bouton « Réinitialiser la démo »', !(await page.$('[data-reset]')));
  await page.fill('#pe-tel', '06 11 22 33 44'); await page.click('#coord-form [type=submit]'); await page.waitForTimeout(1500);
  m = await M(); ok('Téléphone enregistré dans Firebase', m.telephone === '06 11 22 33 44', m.telephone);
  await page.fill('#pe-tel', 'pas un numéro'); await page.click('#coord-form [type=submit]'); await page.waitForTimeout(1800);
  m = await M(); ok('Téléphone invalide : refusé, message affiché, Firebase inchangé', m.telephone === '06 11 22 33 44' && /Enregistrement impossible/.test(await body()), m.telephone);
  await page.fill('#pe-tel', '06 11 22 33 44'); await page.click('#coord-form [type=submit]'); await page.waitForTimeout(1200);

  await page.click('#v-profil [data-rank]'); await page.waitForSelector('#rk-v'); await page.selectOption('#rk-v', '30/2'); await page.click('#rk-form [type=submit]'); await page.waitForTimeout(1500);
  m = await M(); const hist = Object.values(m.classementHistory || {});
  ok('Classement : 30/2 enregistré + historique {from, to, at} (format actuel)', m.classement === '30/2' && hist.length === 2 && hist.some((h) => h.from === '30/3' && h.to === '30/2' && h.at > 0), JSON.stringify(hist));

  await page.click('#v-profil [data-pstyle="Double"]'); await page.click('#v-profil [data-cell="lun|soir"]'); await page.waitForTimeout(300);
  await page.goto(SITE + '/espace-membre.html#jouer'); await page.waitForTimeout(800); await page.click('#v-jouer [data-ptab="annuaire"]'); await page.waitForTimeout(400);
  await page.check('#v-jouer [data-visible]', { force: true }); await page.waitForTimeout(1500);
  m = await M(); const p = m.partenaire || {}; const idx = await (await fetch(DB('partenaire_index/' + uid), { headers: OWN })).json();
  ok('Profil joueur : format actuel conservé (style_jeu, dispo.lundi…, public_profile)', p.public_profile === true && p.style_jeu === 'competitif' && p.dispo && p.dispo.lundi.soir === true && p.dispo.samedi.matin === true && p.updatedAt > 1 && JSON.stringify(p.styles) === '["Compétitif","Double"]', JSON.stringify(p).slice(0, 220));
  ok("Annuaire : fiche publique créée (partenaire_index), sans téléphone non partagé", idx && idx.prenom === 'Camille' && idx.classement === '30/2' && idx.telephone === '', JSON.stringify(idx).slice(0, 200));

  await page.goto(SITE + '/espace-membre.html#profil'); await page.waitForTimeout(1000);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAANAAH+oX6GAAAAAElFTkSuQmCC', 'base64');
  await page.setInputFiles('#v-profil [data-photo]', { name: 'moi.png', mimeType: 'image/png', buffer: png }); await page.waitForTimeout(3500);
  m = await M(); ok('Photo : envoyée dans Storage (members/{uid}/photo.jpg) et liée au profil', /9199/.test(m.photoURL || '') && /photo\.jpg/.test(decodeURIComponent(m.photoURL || '')), m.photoURL);

  await page.reload(); await page.waitForSelector('#app:not([hidden])', { timeout: 20000 }); await page.waitForTimeout(800);
  ok('Session conservée après rechargement', /Camille/.test(await page.textContent('#top-avatar')));
  await page.goto(SITE + '/espace-membre.html#profil'); await page.waitForTimeout(800); await page.click('#v-profil [data-logout]'); await page.waitForTimeout(1200);
  ok('Déconnexion → écran de connexion', await page.isVisible('#login-view') && !(await page.isVisible('#app')));
  ok('Aucune erreur JS sur tout le parcours', errors.length === 0, errors.join(' | '));
  await browser.close(); server.close();
  console.log(`\n${R.filter(Boolean).length}/${R.length} contrôles espace membre (mode Firebase)`); process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
