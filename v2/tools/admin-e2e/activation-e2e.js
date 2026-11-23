// Recette « activation de compte » : page activer-compte.html (lien de l'e-mail Firebase → choix du mot de passe → retour vers la connexion).
// Émulateur Auth uniquement, aucune donnée réelle. Lancement : voir LISEZMOI.md (npm run test:activation).
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const V2 = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ico': 'image/x-icon' };
function serve() {
  return new Promise((ok) => { const s = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(V2, p); if (!f.startsWith(V2) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }); s.listen(8080, '127.0.0.1', () => ok(s)); });
}
const H = '127.0.0.1', SITE = 'http://127.0.0.1:8080', AUTH = `http://${H}:9099/identitytoolkit.googleapis.com/v1/accounts`;
const R = []; const ok = (n, c, extra) => { R.push(!!c); console.log((c ? '✅ ' : '❌ ') + n + (extra && !c ? ' — ' + extra : '')); };
const post = async (u, b) => (await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
const OVERRIDE = `;(function(c){c.mode='firebase';c.firebase=Object.assign({},c.firebase,{apiKey:'fake',projectId:'demo-usm'});c.emulators={host:'${H}',auth:9099,database:9000,storage:9199,functions:5001,ns:'demo-usm-default-rtdb'};})(window.USM_CONFIG);`;
const oobs = async (email) => ((await (await fetch(`http://${H}:9099/emulator/v1/projects/demo-usm/oobCodes`)).json()).oobCodes || []).filter((c) => c.email === email && c.requestType === 'PASSWORD_RESET');
const link = (code) => `${SITE}/activer-compte.html?mode=resetPassword&oobCode=${encodeURIComponent(code)}&apiKey=fake&lang=fr`;

(async () => {
  const server = await serve();
  const EMAIL = 'nouveau.membre@test.fr', OLD = 'Provisoire-Aleatoire-1', NEW = 'Choisi-Par-Moi-1';
  await post(`${AUTH}:signUp?key=fake`, { email: EMAIL, password: OLD, returnSecureToken: true });
  await post(`${AUTH}:sendOobCode?key=fake`, { requestType: 'PASSWORD_RESET', email: EMAIL });
  const code = (await oobs(EMAIL))[0].oobCode;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/assets/js/config.js', async (route) => { const res = await route.fetch(); route.fulfill({ response: res, body: (await res.text()) + OVERRIDE }); });
  const errors = []; const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|clarity|Failed to load resource|fonts/i.test(m.text())) errors.push(m.text()); });
  const vis = (id) => page.isVisible('#' + id);

  // 1. Lien sans paramètres
  await page.goto(SITE + '/activer-compte.html'); await page.waitForTimeout(600);
  ok('Lien incomplet : message clair, pas de formulaire', (await vis('act-bad')) && !(await vis('act-form')) && /incomplet/i.test(await page.innerText('#act-bad-title')));

  // 2. Code invalide
  await page.goto(link('code-bidon')); await page.waitForSelector('#act-bad:not([hidden])', { timeout: 20000 });
  ok('Code invalide : « ce lien ne fonctionne plus » + bouton vers l\'espace membre', /ne fonctionne plus/i.test(await page.innerText('#act-bad-title')) && (await page.getAttribute('#act-bad a.btn', 'href')) === 'espace-membre.html');

  // 3. Bon lien : formulaire avec l'adresse du compte
  await page.goto(link(code)); await page.waitForSelector('#act-form:not([hidden])', { timeout: 20000 });
  ok('Bon lien : le formulaire affiche l\'adresse du compte', (await page.innerText('#act-email')) === EMAIL);
  ok('Pas de débordement horizontal à 390 px', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 320, height: 640 });
  ok('Pas de débordement horizontal à 320 px', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // 4. Contrôles du formulaire
  await page.fill('#act-pw', 'court'); await page.fill('#act-pw2', 'court'); await page.click('#act-submit');
  ok('Mot de passe trop court refusé (8 caractères)', /8 caractères/.test(await page.innerText('#act-err')) && (await vis('act-form')));
  await page.fill('#act-pw', NEW); await page.fill('#act-pw2', NEW + 'x'); await page.click('#act-submit');
  ok('Deux mots de passe différents refusés', /pas identiques/.test(await page.innerText('#act-err')));
  await page.click('#act-eye'); ok('Œil : le mot de passe devient visible', (await page.getAttribute('#act-pw', 'type')) === 'text');
  await page.click('#act-eye'); ok('Œil : le mot de passe est de nouveau masqué', (await page.getAttribute('#act-pw', 'type')) === 'password');

  // 5. Validation
  await page.fill('#act-pw2', NEW); await page.click('#act-submit'); await page.waitForSelector('#act-done:not([hidden])', { timeout: 20000 });
  ok('Confirmation « Mot de passe enregistré » avec l\'adresse du compte', /enregistré/i.test(await page.innerText('#act-done h2')) && (await page.innerText('#act-email2')) === EMAIL);
  ok('Bouton « Me connecter » vers l\'espace membre', (await page.getAttribute('#act-go', 'href')) === 'espace-membre.html');
  const nouveau = await post(`${AUTH}:signInWithPassword?key=fake`, { email: EMAIL, password: NEW, returnSecureToken: true });
  const ancien = await post(`${AUTH}:signInWithPassword?key=fake`, { email: EMAIL, password: OLD, returnSecureToken: true });
  ok('Le nouveau mot de passe fonctionne', !!nouveau.idToken, JSON.stringify(nouveau));
  ok('L\'ancien mot de passe provisoire ne fonctionne plus', !!ancien.error);

  // 6. Redirection automatique vers la connexion
  let redirige = true; try { await page.waitForURL(/espace-membre\.html/, { timeout: 12000 }); } catch (e) { redirige = false; }
  ok('Redirection automatique vers l\'espace membre', redirige, page.url());

  // 7. Lien déjà utilisé
  await page.goto(link(code)); await page.waitForSelector('#act-bad:not([hidden])', { timeout: 20000 });
  ok('Lien déjà utilisé : refusé avec message clair', /ne fonctionne plus|expiré/i.test(await page.innerText('#act-bad-title')));

  // 8. Autre type de lien
  await page.goto(`${SITE}/activer-compte.html?mode=verifyEmail&oobCode=abc`); await page.waitForTimeout(500);
  ok('Autre type de lien : message « non pris en charge »', /non pris en charge/i.test(await page.innerText('#act-bad-title')));

  ok('Aucune erreur JS sur tout le parcours', errors.length === 0, errors.join(' | '));
  await browser.close(); server.close();
  console.log(`\n${R.filter(Boolean).length}/${R.length} contrôles activation de compte`); process.exit(R.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
