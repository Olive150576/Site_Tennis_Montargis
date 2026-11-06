// Parcours de membres simulés (Monique, Karim, Léa) pour les tests d'utilisabilité par profils.
// Émulateurs + copie du contenu public réel (site_v2.json) + comptes fictifs. Voir LISEZMOI.md.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const V2 = process.env.V2, OUT = process.env.OUT, LIVE = JSON.parse(fs.readFileSync(process.env.LIVE, 'utf8'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const serve = () => new Promise((ok) => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(V2, p); if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); s.listen(8080, '127.0.0.1', () => ok(s)); });
const H = '127.0.0.1', NS = 'demo-usm-default-rtdb', SITE = 'http://127.0.0.1:8080';
const DB = (p) => `http://${H}:9000/${p}.json?ns=${NS}`, OWN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OVERRIDE = `;(function(c){c.mode='firebase';c.firebase=Object.assign({},c.firebase,{apiKey:'fake',projectId:'demo-usm',databaseURL:'https://${NS}.firebaseio.com',storageBucket:'demo-usm.appspot.com'});c.emulators={host:'${H}',auth:9099,database:9000,storage:9199,functions:5001,ns:'${NS}'};c.clarity=Object.assign({},c.clarity,{hosts:[]});})(window.USM_CONFIG);`;
const signUp = async (email, pw) => (await (await fetch(`http://${H}:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw, returnSecureToken: true }) })).json()).localId;
const PW = 'Membre-Test-123', now = Date.now(), at = (y, m, d) => new Date(y, m - 1, d).getTime();
const D = (o) => { const r = {}; Object.entries(o).forEach(([j, s]) => { r[j] = {}; s.split(',').forEach((x) => { r[j][x] = true; }); }); return r; };
const P = {
  monique: { prenom: 'Monique', nom: 'Lefèvre', email: 'monique@test.fr', classement: 'NC', style: 'loisir', dispo: D({ mardi: 'matin', jeudi: 'matin', samedi: 'matin' }), tel: '06 70 11 22 33', share: false, cat: 'Adulte F', since: at(2012, 9, 1) },
  karim: { prenom: 'Karim', nom: 'Benali', email: 'karim@test.fr', classement: '15/5', style: 'competitif', dispo: D({ lundi: 'soir', mercredi: 'soir', samedi: 'matin,midi' }), tel: '06 45 67 89 10', share: true, cat: 'Adulte H', since: at(2021, 9, 1) },
  lea: { prenom: 'Léa', nom: 'Moreau', email: 'lea@test.fr', classement: '30/1', style: 'competitif', dispo: D({ lundi: 'soir', mardi: 'soir', jeudi: 'soir', dimanche: 'matin' }), tel: '07 81 23 45 67', share: true, cat: 'Adulte F', since: at(2024, 9, 1) },
};
const AUTRES = [
  ['Jean-Pierre', 'Roux', '30', 'loisir', D({ mardi: 'matin', jeudi: 'matin' }), true],
  ['Sophie', 'Garnier', '30/2', 'competitif', D({ lundi: 'soir', jeudi: 'soir' }), true],
  ['Thomas', 'Lemoine', '15/4', 'competitif', D({ mercredi: 'soir', samedi: 'matin' }), false],
  ['Nadia', 'Petit', '40', 'loisir', D({ samedi: 'matin', dimanche: 'matin' }), false],
  ['Marc', 'Fontaine', '30/4', 'loisir', D({ lundi: 'matin', mardi: 'matin' }), true],
];
const part = (p) => ({ public_profile: true, updatedAt: now - 864e5 * 20, style_jeu: p.style, dispo: p.dispo, partager_telephone: p.share, partager_email: false, message: '' });
const idx = (p) => ({ prenom: p.prenom, nom: p.nom, classement: p.classement, style_jeu: p.style, dispo: p.dispo, partager_telephone: p.share, telephone: p.share ? p.tel : '', partager_email: false, email: '', message: p.msg || '' });

(async () => {
  const server = await serve(); const uids = {};
  for (const k of Object.keys(P)) uids[k] = await signUp(P[k].email, PW);
  const members = {}, pindex = {};
  for (const [k, p] of Object.entries(P)) {
    members[uids[k]] = { prenom: p.prenom, nom: p.nom, email: p.email, telephone: p.tel, licence: '98765' + k.length + ' A', categorie: p.cat, statut: 'Membre', actif: true, classement: p.classement, classementAt: at(2026, 9, 3), createdAt: p.since, partenaire: part(p) };
    pindex[uids[k]] = idx(p);
  }
  AUTRES.forEach(([prenom, nom, classement, style, dispo, share], i) => { pindex['x' + i] = idx({ prenom, nom, classement, style, dispo, share, tel: '06 00 00 00 0' + i, msg: i === 1 ? 'Je cherche une partenaire pour préparer les matchs par équipes.' : '' }); });
  const fast = Object.keys(LIVE.events).find((k) => LIVE.events[k].title === 'Fast4' && LIVE.events[k].dateStart === '2026-12-20');
  const site_v2 = Object.assign({}, LIVE); delete site_v2.texts;
  const club_messages = { cm1: { titre: 'Courts couverts fermés jeudi matin', contenu: 'Entretien de l\'éclairage de 8 h à 12 h. Les courts extérieurs restent accessibles.', type: 'warning', actif: true, createdAt: now - 5 * 36e5 },
    cm2: { titre: 'Nouveau site du club', contenu: 'Bienvenue sur le nouvel espace membre ! Pensez à compléter votre profil joueur.', type: 'info', actif: true, createdAt: now - 2 * 864e5 } };
  await fetch(DB(''), { method: 'PUT', headers: OWN, body: JSON.stringify({ members, site_v2, club_messages, partenaire_index: pindex,
    inscriptions_evenement: { [fast]: { x0: { prenom: 'Jean-Pierre', nom: 'Roux', at: now - 3 * 864e5 }, x2: { prenom: 'Thomas', nom: 'Lemoine', at: now - 2 * 864e5 } } } }) });

  const browser = await chromium.launch(); const who = process.env.PERSONA;
  const dev = who === 'monique' ? { viewport: { width: 360, height: 740 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true } : who === 'lea' ? devices['iPhone 13'] : { viewport: { width: 393, height: 851 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true };
  const ctx = await browser.newContext(Object.assign({}, dev, { locale: 'fr-FR', timezoneId: 'Europe/Paris' }));
  await ctx.route('**/assets/js/config.js', async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()) + OVERRIDE }); });
  const page = await ctx.newPage(); const dir = path.join(OUT, who); fs.mkdirSync(dir, { recursive: true });
  const log = []; let n = 0; const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { log.push({ step: 'dialogue navigateur', text: d.message() }); d.dismiss(); });
  const clean = () => page.evaluate(() => document.querySelectorAll('.firebase-emulator-warning').forEach((x) => x.remove())).catch(() => {});
  const shot = async (name, action, full = true) => {
    n++; const f = String(n).padStart(2, '0') + '-' + name; let note = 'ok';
    try { await clean(); } catch (e) {}
    await page.waitForTimeout(700); await clean();
    await page.screenshot({ path: path.join(dir, f + '.png'), fullPage: full }).catch((e) => { note = 'capture impossible : ' + e.message; });
    log.push({ n, capture: f + '.png', etape: name, action, url: page.url().replace(SITE, ''), resultat: note });
  };
  const tryDo = async (desc, fn) => { try { await fn(); return true; } catch (e) { log.push({ step: desc, echec: e.message.split('\n')[0] }); return false; } };
  const login = async (p) => { await page.fill('#lg-email', p.email); await page.fill('#lg-pw', PW); await page.click('#login-form [type=submit]'); await page.waitForSelector('#app:not([hidden])', { timeout: 20000 }); await page.waitForTimeout(1500); };
  const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(1200); };
  const p = P[who];

  if (who === 'monique') {
    await page.goto(SITE + '/index.html'); await page.waitForTimeout(2500);
    await shot('site-accueil', 'Arrive sur tennismontargis.fr depuis un lien Facebook');
    await tryDo('cherche l\'espace membre', async () => { const l = page.getByRole('link', { name: /^espace membre$/i }).first(); if (!(await l.isVisible().catch(() => false))) { await page.getByRole('button', { name: /menu/i }).first().click(); await page.waitForTimeout(500); } await shot('menu-ouvert', 'Cherche où se connecter (ouvre le menu si besoin)'); await page.getByRole('link', { name: /^espace membre$/i }).filter({ visible: true }).first().click(); await page.waitForTimeout(2000); });
    await shot('page-connexion', 'Page de connexion', false);
    await tryDo('mot de passe oublié', async () => { await page.fill('#lg-email', p.email); await page.click('#forgot'); await page.waitForTimeout(1500); });
    await shot('mot-de-passe-oublie', 'A oublié son mot de passe : saisit son e-mail et clique « Mot de passe oublié ? »', false);
    await page.goto(SITE + '/espace-membre.html'); await page.waitForTimeout(1500); await login(p);
    await shot('accueil-membre', 'Connectée (après avoir choisi un nouveau mot de passe)');
    await go('agenda'); await shot('agenda', 'Ouvre l\'agenda pour voir s\'il y a une animation pour Noël');
    await tryDo('mois suivant', async () => { await page.click('[data-agm="1"]'); await page.waitForTimeout(800); });
    await shot('agenda-decembre', 'Passe au mois de décembre');
    await tryDo('ouvre le Fast4', async () => { await page.locator('.ev-more:visible', { hasText: /inscription/i }).first().click(); await page.waitForTimeout(1000); });
    await shot('fiche-evenement', 'Ouvre la fiche du Fast4 du 20 décembre (inscriptions ouvertes)', false);
    await tryDo('s\'inscrire', async () => { await page.click('#ei-toggle'); await page.waitForTimeout(1500); });
    await shot('apres-inscription', 'Clique « Je m\'inscris »', false);
    await page.keyboard.press('Escape'); await go('carte'); await shot('ma-carte', 'Veut montrer sa carte de membre');
    await go('profil'); await shot('mon-profil', 'Va voir son profil');
  }
  if (who === 'karim') {
    await page.goto(SITE + '/espace-membre.html'); await page.waitForTimeout(1500); await login(p);
    await shot('accueil-membre', 'Se connecte le soir après le travail');
    await go('jouer'); await shot('jouer-annuaire', 'Cherche un partenaire de son niveau pour un match lundi soir');
    await tryDo('filtre soir', async () => { await page.click('#v-jouer [data-f="slot"][data-v="soir"]'); await page.waitForTimeout(700); });
    await shot('jouer-filtre-soir', 'Filtre sur « Soir »');
    await tryDo('niveau proche', async () => { await page.click('#v-jouer [data-f="near"]'); await page.waitForTimeout(700); });
    await shot('jouer-niveau-proche', 'Active « Niveau proche »');
    await tryDo('contact SMS', async () => { await page.locator('#v-jouer [data-contact="sms"]').first().click(); await page.waitForTimeout(1000); });
    await shot('apres-clic-sms', 'Clique « SMS » sur le premier joueur proposé', false);
    await page.keyboard.press('Escape'); await go('equipes'); await shot('equipes', 'Cherche la composition de son équipe pour dimanche');
    await go('agenda'); await tryDo('messages', async () => { const d = page.locator('details.msgs'); if (!(await d.getAttribute('open'))) await d.locator('summary').click(); await page.waitForTimeout(500); });
    await shot('agenda-messages', 'Lit les messages du bureau');
    await go('profil'); await shot('profil', 'Veut changer ses disponibilités (il ne peut plus le mercredi)');
    await tryDo('décocher mercredi soir', async () => { const c = page.locator('[data-dispo="mer-soir"], [data-dispo="mercredi-soir"], [data-cell*="mer"]').first(); await c.click(); await page.waitForTimeout(800); });
    await shot('profil-dispos-modifiees', 'Décoche mercredi soir');
  }
  if (who === 'lea') {
    await page.goto(SITE + '/agenda.html'); await page.waitForTimeout(2500);
    await shot('agenda-public', 'Voit passer le Fast4 sur Facebook, ouvre l\'agenda du site');
    await tryDo('bouton s\'inscrire public', async () => { await page.locator('[data-signup]').first().click(); await page.waitForTimeout(2500); });
    await shot('redirection-connexion', 'Clique « S\'inscrire (membres) »');
    await tryDo('connexion', async () => { await login(p); });
    await shot('confirmation-inscription', 'Se connecte : demande de confirmation', false);
    await tryDo('confirme', async () => { await page.click('#su-confirm'); await page.waitForTimeout(1500); });
    await shot('inscrite', 'Confirme son inscription', false);
    await page.keyboard.press('Escape'); await go('accueil'); await shot('accueil-membre', 'Retour à l\'accueil');
    await tryDo('classement', async () => { await page.getByRole('button', { name: /mettre à jour/i }).first().click(); await page.waitForTimeout(1000); });
    await shot('mise-a-jour-classement', 'Elle est passée 15/5 : clique « Mettre à jour »', false);
    await page.keyboard.press('Escape'); await go('accueil');
    await tryDo('boîte à idées', async () => { const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }), page.locator('[data-ideas]').click()]); log.push({ step: 'boîte à idées', ouvre: pop.url() }); await pop.close(); });
    await go('jouer'); await shot('jouer', 'Cherche une partenaire pour s\'entraîner');
    await go('carte'); await shot('ma-carte', 'Affiche sa carte');
  }
  fs.writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ persona: who, viewport: dev.viewport, etapes: log, erreursJS: errs }, null, 1));
  await browser.close(); server.close(); console.log('PARCOURS OK ' + who + ' ' + n + ' captures');
})().catch((e) => { console.error(e); process.exit(1); });
