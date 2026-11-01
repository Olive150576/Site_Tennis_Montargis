// Recette automatique de l'admin v2 en MODE FIREBASE, contre les émulateurs locaux
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
  // Jeu de données : 1 admin, 1 membre (non admin)
  const adm = await signUp('admin@test.fr', 'Admin-Test-123'), mem = await signUp('membre@test.fr', 'Membre-Test-123');
  for (const ns of [NS, 'demo-usm']) await fetch(`http://${H}:9000/.json?ns=${ns}`, { method: 'PUT', headers: OWN, body: JSON.stringify({ admins: { [adm]: true }, members: { [mem]: { prenom: 'M', nom: 'B', actif: true } } }) }); // la fonction serveur lit le namespace par défaut de l'émulateur
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/assets/js/config.js', async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()) + OVERRIDE }); });
  const errors = []; const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|clarity|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  // Requêtes en échec : seules les refus de connexion attendus (mauvais mot de passe, compte non admin) sont tolérés
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) { const expected = /accounts:signInWithPassword/.test(r.url()) && expectAuthFail; if (!expected) errors.push(r.status() + ' ' + r.url().slice(0, 120)); } });
  let expectAuthFail = false;
  const go = async (h) => { await page.goto(SITE + '/admin/' + h); await page.waitForTimeout(1200); };
  const login = async (e, p) => { await page.fill('#lg-email', e); await page.fill('#lg-pass', p); await page.click('#login button[type=submit]'); await page.waitForTimeout(300); await page.waitForFunction(() => document.querySelector('nav') || (document.querySelector('#login button[type=submit]') && !document.querySelector('#login button[type=submit]').disabled), null, { timeout: 25000 }); await page.waitForTimeout(800); };

  await go('');
  ok("Écran de connexion : pas d'indice de mot de passe d'aperçu", !(await page.content()).includes('usm2026'));
  ok('Écran de connexion : champ e-mail visible', await page.isVisible('#lg-email'));
  expectAuthFail = true; await login('admin@test.fr', 'mauvais'); expectAuthFail = false;
  ok('Mauvais mot de passe refusé', /incorrect/i.test(await page.innerText('body')));
  await login('membre@test.fr', 'Membre-Test-123');
  ok("Compte membre (non admin) refusé", /droits d.administration/i.test(await page.innerText('body')));
  await login('admin@test.fr', 'Admin-Test-123');
  ok('Admin connecté → tableau de bord', /#\/tableau/.test(page.url()) && await page.isVisible('nav'), page.url());
  ok('Bandeau « En ligne · Firebase »', /En ligne/.test(await page.textContent('body')));
  const claim = await page.evaluate(async () => (await firebase.auth().currentUser.getIdTokenResult()).claims.admin);
  ok('Droit admin Storage posé automatiquement (claim)', claim === true, String(claim));

  // Première mise en service : bouton « Publier le contenu de départ » (site_v2 vide)
  ok('Tableau de bord : alerte « contenu non publié »', /pas encore publié/.test(await page.innerText('body')));
  await go('#/sauvegarde'); await page.click('#b-publish'); await page.click('.modal [data-a="1"]'); await page.waitForTimeout(2500);
  const pubd = await (await fetch(DB('site_v2'))).json();
  ok('Publier le contenu de départ : site_v2 rempli, bouton disparu', pubd && pubd.news && Object.keys(pubd.news).length > 10 && !(await page.$('#b-publish')), pubd && Object.keys(pubd).join(','));
  // Import du contenu de départ (même chemin que Sauvegarde › Restaurer)
  await page.evaluate(async () => { const s = window.USM.store; const c = Object.assign(s.seed(), { settings: Object.assign({}, s.seed().settings, { adminPasswordHash: 'secret-hash' }) }); await s.saveAll(c); });
  const remote = await (await fetch(DB('site_v2'))).json();
  ok('Import : contenu écrit dans site_v2', remote && remote.news && Object.keys(remote.news).length > 10, remote && Object.keys(remote).join(','));
  ok("Import : empreinte du mot de passe d'aperçu non publiée", remote && remote.settings && !('adminPasswordHash' in remote.settings));
  ok('Import : aucun produit d\'exemple publié', !remote.shopProducts || !Object.values(remote.shopProducts).some((p) => p.demo));

  // Reprise des actualités de l'ancien site (liste numérotée, numéros décalés par la purge)
  const seedN56 = await page.evaluate(() => window.USM.store.seed().news.find((n) => n.id === 'n56'));
  await fetch(DB('news'), { method: 'PUT', headers: OWN, body: JSON.stringify([
    { title: 'Déjà reprise (même date de création)', desc: 'x', date: '24/10/2026', createdAt: seedN56.createdAt, images: [] },
    { title: '🎾 NOUVELLE ACTU DE L\'ANCIEN PANNEAU 🎾', desc: 'Texte <b>gras</b><br>ligne 2 &amp; fin', date: '29/10/2026', createdAt: Date.now() - 864e5, images: ['https://exemple.fr/a.jpg'] }]) });
  await go('#/sauvegarde'); await page.click('#b-legacy'); await page.waitForSelector('.modal', { timeout: 15000 });
  const mtxt = await page.innerText('.modal');
  ok("Ancien site : 1 actu proposée, l'actu déjà reprise est ignorée", /Ajouter 1 actualité/.test(mtxt) && /Nouvelle actu de l.ancien panneau/.test(mtxt), mtxt.slice(0, 150));
  await page.click('.modal [data-a="1"]'); await page.waitForTimeout(1500);
  const nv = Object.values(await (await fetch(DB('site_v2/news'))).json()).find((n) => n.source === 'ancien-site');
  ok('Ancien site : actu ajoutée dans Firebase (texte nettoyé, photo, date)', nv && nv.body === 'Texte gras\nligne 2 & fin' && nv.images[0].src === 'https://exemple.fr/a.jpg' && nv.date === '2026-10-29', JSON.stringify(nv).slice(0, 200));
  await go('#/sauvegarde'); await page.click('#b-legacy'); await page.waitForTimeout(2000);
  ok('Ancien site : 2e passage sans doublon', /Rien à récupérer/.test(await page.innerText('body')));

  // Chaque rubrique s'ouvre sans erreur
  const routes = ['tableau','actualites','agenda','tarifs','planning','equipe','installations','galerie','documents','faq','partenaires','offres','boutique','messages','textes','reglages','sauvegarde','avis'];
  const before = errors.length;
  for (const r of routes) { await go('#/' + r); }
  ok(`18 rubriques ouvertes sans erreur JS`, errors.length === before, errors.slice(before).join(' | '));

  // Modifier une actualité dans l'interface
  await go('#/actualites'); await page.click('tbody tr'); await page.waitForTimeout(800);
  const fid = await page.$$eval('#ed-form label', (ls) => (ls.find((l) => /^Titre\b/.test(l.textContent.trim())) || {}).htmlFor); const t = page.locator('#' + fid); const newTitle = 'Titre modifié par la recette ' + Date.now();
  await t.fill(newTitle); await page.keyboard.press('Control+s'); await page.waitForTimeout(1500);
  const news = await (await fetch(DB('site_v2/news'))).json();
  ok("Modification d'une actualité enregistrée dans Firebase", Object.values(news).some((n) => n.title === newTitle));

  // Paramètres › Espace membre : interrupteur Boutique (désactivé par défaut)
  await go('#/reglages');
  const sw = await page.$eval('[data-f="showShop"] input', (i) => i.id).catch(() => null);
  const shopBefore = await (await fetch(DB('site_v2/settings/showShop'))).json();
  if (sw) { await page.locator('#' + sw).check({ force: true }); await page.keyboard.press('Control+s'); await page.waitForTimeout(1500); }
  const shopAfter = await (await fetch(DB('site_v2/settings/showShop'))).json();
  ok('Interrupteur Boutique : désactivé au départ, activation enregistrée dans Firebase', sw && shopBefore === false && shopAfter === true, `champ:${sw} avant:${shopBefore} après:${shopAfter}`);

  // Agenda : ouvrir les inscriptions des membres + liste des inscrits
  const evId = await page.evaluate(() => (window.USM.store.content.events || []).find((e) => e.dateStart).id);
  await go('#/agenda/' + evId);
  const msId = await page.$eval('[data-f="memberSignup"] input', (i) => i.id);
  await page.locator('#' + msId).check({ force: true }); await page.keyboard.press('Control+s'); await page.waitForTimeout(1500);
  ok("Agenda : « Inscriptions dans l'espace membre » enregistré", (await (await fetch(DB('site_v2/events/' + evId + '/memberSignup'))).json()) === true);
  await fetch(DB('inscriptions_evenement/' + evId + '/m1'), { method: 'PUT', headers: OWN, body: JSON.stringify({ prenom: 'Léa', nom: 'Martin', at: Date.now() }) });
  await go('#/agenda'); await go('#/agenda/' + evId); await page.waitForTimeout(1200);
  ok('Agenda : liste des inscrits affichée sous le formulaire', /Inscrits depuis l'espace membre \(1\)/.test(await page.innerText('body')) && /Léa Martin/.test(await page.innerText('#ev-signups')));
  // Inscriptions plus visibles : tuile du tableau de bord + colonne dans la liste de l'agenda
  await page.waitForTimeout(300);
  await fetch(DB('inscriptions_evenement/' + evId + '/m2'), { method: 'PUT', headers: OWN, body: JSON.stringify({ prenom: 'Paul', nom: 'Durand', at: Date.now() + 1000 }) });
  await go('#/tableau'); await page.waitForTimeout(800);
  const tile = await page.innerText('#kpi-inscriptions').catch(() => '');
  ok('Tableau de bord : tuile « 1 nouvelle inscription » avec le nom et l\'événement', /^\s*Inscriptions aux événements\s*1\b/.test(tile) && /Paul Durand/.test(tile), tile);
  await go('#/agenda'); await page.waitForTimeout(600);
  const row = await page.innerText(`tr[data-id="${evId}"]`).catch(() => '');
  ok('Agenda : nombre d\'inscrits dans la liste (2)', /\b2\b/.test(row), row);
  await go('#/tableau'); await page.waitForTimeout(600);
  ok('Tableau de bord : après consultation de l\'agenda, plus de « nouvelle »', /aucune nouvelle/.test(await page.innerText('#kpi-inscriptions').catch(() => '')));

  // Messages aux membres (club_messages, format de l'ancien panneau)
  await go('#/annonces');
  const fld = async (k) => page.$eval(`#cm-form [data-f="${k}"] input, #cm-form [data-f="${k}"] textarea, #cm-form [data-f="${k}"] select`, (i) => i.id);
  await page.fill('#' + await fld('titre'), 'Courts couverts fermés'); await page.selectOption('#' + await fld('type'), 'urgent');
  await page.fill('#' + await fld('contenu'), 'Entretien jeudi matin.'); await page.click('#cm-save'); await page.waitForTimeout(1500);
  let cms = Object.entries(await (await fetch(DB('club_messages'), { headers: OWN })).json() || {});
  const cm = cms.find(([, m]) => m.titre === 'Courts couverts fermés');
  ok('Messages aux membres : publié au format actuel (titre, contenu, type, actif, createdAt)', cm && cm[1].contenu === 'Entretien jeudi matin.' && cm[1].type === 'urgent' && cm[1].actif === true && cm[1].createdAt > 0, JSON.stringify(cms).slice(0, 200));
  await page.click(`[data-cm-toggle="${cm[0]}"]`); await page.waitForTimeout(1200);
  ok('Messages aux membres : masquer', (await (await fetch(DB('club_messages/' + cm[0] + '/actif'), { headers: OWN })).json()) === false);
  await page.click(`[data-cm-del="${cm[0]}"]`); await page.click('.modal [data-a="1"]'); await page.waitForTimeout(1200);
  ok('Messages aux membres : supprimer', (await (await fetch(DB('club_messages/' + cm[0]), { headers: OWN })).json()) === null);

  // Membres : création par la fonction createMember, e-mail « choisir son mot de passe », fiche, désactivation
  // (dans l'émulateur, la fonction écrit dans le namespace par défaut « demo-usm » : on lit les deux)
  const DBF = (p) => `http://${H}:9000/${p}.json?ns=demo-usm`;
  const getJ = async (u) => (await fetch(u, { headers: OWN })).json();
  await go('#/membres');
  ok('Membres : rubrique ouverte, membre existant listé', /\bM B\b/.test(await page.innerText('#mb-table').catch(() => '')));
  await go('#/membres/nouveau');
  const mf = async (k) => page.$eval(`#mb-form [data-f="${k}"] input, #mb-form [data-f="${k}"] select`, (i) => i.id);
  await page.fill('#' + await mf('prenom'), 'Paul'); await page.fill('#' + await mf('nom'), 'Durand');
  await page.fill('#' + await mf('email'), ' Paul.Durand@Test.fr ');
  await page.fill('#' + await mf('telephone'), '06 12 34 56 78'); await page.fill('#' + await mf('licence'), '1234567');
  await page.selectOption('#' + await mf('classement'), '30/2'); await page.selectOption('#' + await mf('categorie'), 'Vétéran H');
  await page.click('#mb-save'); await page.waitForSelector('.modal', { timeout: 25000 });
  ok('Membres : confirmation de création (e-mail annoncé)', /Réinitialisez votre mot de passe/.test(await page.innerText('.modal')), await page.innerText('.modal'));
  const allM = Object.assign({}, await getJ(DB('members')), await getJ(DBF('members')));
  const pd = Object.entries(allM).find(([, m]) => m && m.nom === 'Durand');
  ok('Membres : fiche créée au format actuel (actif, e-mail en minuscules, classement, catégorie)', pd && pd[1].actif === true && pd[1].email === 'paul.durand@test.fr' && pd[1].classement === '30/2' && pd[1].categorie === 'Vétéran H' && pd[1].telephone === '06 12 34 56 78', JSON.stringify(pd).slice(0, 220));
  const oobs = async () => ((await (await fetch(`http://${H}:9099/emulator/v1/projects/demo-usm/oobCodes`)).json()).oobCodes || []).filter((c) => c.email === 'paul.durand@test.fr' && c.requestType === 'PASSWORD_RESET');
  ok('Membres : e-mail « choisir son mot de passe » envoyé au nouveau membre', (await oobs()).length === 1);
  const uidP = pd && pd[0];
  if (uidP) await fetch(DB('members/' + uidP), { method: 'PUT', headers: OWN, body: JSON.stringify(pd[1]) }); // une seule base en production
  await page.click('.modal [data-a="1"]'); await page.waitForTimeout(1500);
  ok('Membres : ouverture de la fiche après création', page.url().endsWith('#/membres/' + uidP) && /Paul Durand/.test(await page.innerText('h1')), page.url());
  await page.selectOption('#' + await mf('classement'), '30/1'); await page.click('#mb-save'); await page.waitForTimeout(1200);
  ok('Membres : fiche modifiée (classement)', (await getJ(DB('members/' + uidP + '/classement'))) === '30/1');
  await page.fill('#' + await mf('telephone'), 'abc'); await page.click('#mb-save'); await page.waitForTimeout(500);
  ok('Membres : téléphone invalide refusé', /téléphone invalide/i.test(await page.innerText('.toasts').catch(() => '')) && (await getJ(DB('members/' + uidP + '/telephone'))) === '06 12 34 56 78');
  await page.fill('#' + await mf('telephone'), '06 12 34 56 78'); await page.click('#mb-save'); await page.waitForTimeout(800);
  await page.click('#mb-mail'); await page.click('.modal [data-a="1"]'); await page.waitForTimeout(1500);
  ok('Membres : renvoi de l\'e-mail de mot de passe', (await oobs()).length === 2);
  await page.click('#mb-active'); await page.click('.modal [data-a="1"]'); await page.waitForTimeout(2500);
  const look = await (await fetch(`http://${H}:9099/identitytoolkit.googleapis.com/v1/projects/demo-usm/accounts:lookup`, { method: 'POST', headers: OWN, body: JSON.stringify({ localId: [uidP] }) })).json();
  const actF = await getJ(DBF('members/' + uidP + '/actif'));
  ok('Membres : désactivation (fiche inactive + compte bloqué)', actF === false && look.users && look.users[0].disabled === true && /Inactif/.test(await page.innerText('#mb-state')), JSON.stringify({ actF, look }).slice(0, 200));
  await page.click('#mb-active'); await page.waitForTimeout(2500);
  ok('Membres : réactivation', (await getJ(DBF('members/' + uidP + '/actif'))) === true && /Actif/.test(await page.innerText('#mb-state')));

  // Un seul identifiant : l'admin connecté crée sa propre fiche membre
  await go('#/membres');
  ok('Membres : bandeau « Créer ma fiche membre » pour l\'admin sans fiche', await page.isVisible('#mb-own'));
  await page.click('#mb-own a'); await page.waitForTimeout(1200);
  await page.fill('#' + await mf('prenom'), 'Olivier'); await page.fill('#' + await mf('nom'), 'Admin'); await page.selectOption('#' + await mf('classement'), '30/3');
  await page.click('#mb-save'); await page.waitForTimeout(1500);
  const own = await getJ(DB('members/' + adm));
  ok('Membres : fiche de l\'admin créée (même compte, actif)', own && own.actif === true && own.email === 'admin@test.fr' && own.nom === 'Admin' && own.classement === '30/3', JSON.stringify(own).slice(0, 200));
  await go('#/membres');
  ok('Membres : bandeau disparu une fois la fiche créée', !(await page.isVisible('#mb-own')));
  const mp = await ctx.newPage(); await mp.goto(SITE + '/espace-membre.html'); await mp.waitForTimeout(1500);
  if (await mp.isVisible('#lg-email')) { await mp.fill('#lg-email', 'admin@test.fr'); await mp.fill('#lg-pw', 'Admin-Test-123'); await mp.click('#login-form [type=submit]'); }
  await mp.waitForSelector('#app:not([hidden])', { timeout: 20000 }).catch(() => {});
  ok('Espace membre : connexion avec les identifiants admin', await mp.isVisible('#app'));
  await mp.close();

  // Agenda : retirer un inscrit (compte supprimé repéré)
  await go('#/agenda/' + evId); await page.waitForTimeout(1200);
  ok('Agenda : inscrit sans fiche signalé « Compte supprimé »', /Compte supprimé/.test(await page.innerText('#ev-signups').catch(() => '')));
  await page.click('[data-su-rm="m1"]'); await page.click('.modal [data-a="1"]'); await page.waitForTimeout(1200);
  ok('Agenda : « Retirer » supprime l\'inscription', (await getJ(DB('inscriptions_evenement/' + evId + '/m1'))) === null && !/Léa Martin/.test(await page.innerText('#ev-signups')));
  // Suppression d'un compte (fonction deleteMember de l'ancien panneau) : plus aucune trace
  await fetch(DBF('inscriptions_evenement/evX/' + uidP), { method: 'PUT', headers: OWN, body: JSON.stringify({ prenom: 'Paul', nom: 'Durand', at: Date.now() }) });
  await fetch(DBF('inscriptions_evenement/evX/autre'), { method: 'PUT', headers: OWN, body: JSON.stringify({ prenom: 'A', nom: 'B', at: Date.now() }) });
  await fetch(DBF('partenaire_index/' + uidP), { method: 'PUT', headers: OWN, body: JSON.stringify({ prenom: 'Paul', nom: 'Durand' }) });
  const delR = await page.evaluate(async (u) => { try { await firebase.functions().httpsCallable('deleteMember')({ uid: u }); return 'ok'; } catch (e) { return e.message; } }, uidP);
  const lk2 = await (await fetch(`http://${H}:9099/identitytoolkit.googleapis.com/v1/projects/demo-usm/accounts:lookup`, { method: 'POST', headers: OWN, body: JSON.stringify({ localId: [uidP] }) })).json();
  ok('Suppression d\'un membre : fiche, compte, inscriptions et annuaire effacés (les autres inscrits gardés)', delR === 'ok' && (await getJ(DBF('members/' + uidP))) === null && !lk2.users && (await getJ(DBF('inscriptions_evenement/evX/' + uidP))) === null && (await getJ(DBF('inscriptions_evenement/evX/autre'))) !== null && (await getJ(DBF('partenaire_index/' + uidP))) === null, delR + ' ' + JSON.stringify(lk2).slice(0, 100));

  // Envoi d'image et de PDF (Storage)
  const up = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#0046ad'; g.fillRect(0, 0, 800, 600);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const img = await window.USM.store.uploadImage(new File([blob], 'test.png', { type: 'image/png' }));
    const pdf = await window.USM.store.uploadFile(new File(['%PDF-1.4 test'], 'doc test.pdf', { type: 'application/pdf' }));
    return { img, pdf };
  }).catch((e) => ({ err: e.message }));
  ok('Envoi de photo (2 tailles WebP)', up.img && /9199/.test(up.img.src) && /9199/.test(up.img.sm), JSON.stringify(up).slice(0, 200));
  ok('Envoi de PDF', up.pdf && /9199/.test(up.pdf.url), JSON.stringify(up).slice(0, 200));

  // Formulaire public → message → admin (sans perte d'un message arrivé entre-temps)
  const pub = await ctx.newPage(); await pub.goto(SITE + '/contact.html'); await pub.waitForTimeout(1500);
  await pub.evaluate(async () => { await window.USM.store.addMessage({ type: 'contact', name: 'Visiteur', email: 'v@test.fr', phone: '', subject: 'Essai', message: 'Bonjour', extra: {} }); });
  await go('#/messages');
  ok('Message du formulaire public visible dans l\'admin', /Visiteur/.test(await page.textContent('body')));
  await pub.evaluate(async () => { await window.USM.store.addMessage({ type: 'contact', name: 'Arrivé entre-temps', email: 'w@test.fr', phone: '', subject: 'Essai 2', message: 'Re', extra: {} }); });
  await page.click('[data-read]'); await page.waitForTimeout(1200);
  const msgs = Object.values(await (await fetch(DB('site_v2_messages'), { headers: OWN })).json() || {});
  ok('Message marqué lu', msgs.some((m) => m.name === 'Visiteur' && m.read === true));
  ok("Message arrivé pendant la lecture : PAS effacé", msgs.some((m) => m.name === 'Arrivé entre-temps'), msgs.map((m) => m.name).join(','));

  // Site public en mode Firebase
  await pub.goto(SITE + '/actualites.html'); await pub.waitForTimeout(2000);
  ok('Site public : affiche le contenu Firebase modifié', (await pub.textContent('body')).includes(newTitle));

  // Session conservée au rechargement, puis déconnexion
  await go('#/tableau');
  ok('Session conservée après rechargement', await page.isVisible('nav') && !(await page.isVisible('#lg-email')));
  ok('Aucune erreur JS sur tout le parcours', errors.length === 0, errors.join(' | '));
  await browser.close(); server.close();
  console.log(`\n${R.filter(Boolean).length}/${R.length} contrôles admin (mode Firebase)`); process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
