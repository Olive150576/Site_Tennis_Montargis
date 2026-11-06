// Parcours de visiteurs simulés sur le SITE PUBLIC (preview en lecture seule : aucun formulaire envoyé)
const { chromium, devices } = require('playwright'); const fs = require('fs'), path = require('path');
const BASE = process.env.BASE, OUT = process.env.OUT, who = process.env.PERSONA;
(async () => {
  const browser = await chromium.launch();
  const dev = who === 'sandrine' ? { viewport: { width: 393, height: 851 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true } : who === 'julien' ? devices['iPhone 13'] : { viewport: { width: 1366, height: 800 } };
  const ctx = await browser.newContext(Object.assign({}, dev, { locale: 'fr-FR', timezoneId: 'Europe/Paris' }));
  const page = await ctx.newPage(); const dir = path.join(OUT, who); fs.mkdirSync(dir, { recursive: true });
  const log = [], errs = []; let n = 0;
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => { log.push({ dialogue: d.message() }); d.dismiss(); });
  const shot = async (name, action, full = true) => { n++; await page.waitForTimeout(900); const f = String(n).padStart(2, '0') + '-' + name + '.png'; await page.screenshot({ path: path.join(dir, f), fullPage: full }).catch(() => {}); log.push({ n, capture: f, action, url: page.url().replace(BASE, '') }); };
  const tryDo = async (d, fn) => { try { await fn(); } catch (e) { log.push({ etape: d, echec: e.message.split('\n')[0] }); } };
  const open = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(1500); };
  const nav = async (label) => { const l = page.getByRole('link', { name: new RegExp('^' + label, 'i') }).filter({ visible: true }).first(); if (!(await l.count())) { await page.locator('.menu-toggle').click(); await page.waitForTimeout(500); } await page.getByRole('link', { name: new RegExp('^' + label, 'i') }).filter({ visible: true }).first().click(); await page.waitForTimeout(2000); };
  await open('/');
  await shot('arrivee', who === 'gerard' ? 'Arrive sur le site après un appel du club lui proposant d\'être partenaire' : 'Arrive sur le site depuis Google', false);
  await tryDo('cookies', async () => { await page.getByRole('button', { name: /refuser/i }).click(); });
  if (who === 'sandrine') {
    await shot('accueil-complet', 'Fait défiler l\'accueil');
    await tryDo('menu école', () => nav('Cours'));
    await shot('ecole', 'Cherche les cours pour ses enfants (7 et 11 ans) : jours, horaires, prix');
    await tryDo('tarifs', () => nav('Tarifs'));
    await tryDo('onglet jeunes', async () => { await page.locator('[data-tab="jeunes"]').click(); await page.waitForTimeout(800); });
    await shot('tarifs-jeunes', 'Regarde les tarifs jeunes (onglet Jeunes)');
    await tryDo('intéressée', async () => { await page.getByRole('link', { name: /intéressé/i }).filter({ visible: true }).first().click(); await page.waitForTimeout(2500); });
    await shot('contact-apres-interesse', 'Clique « Je suis intéressé(e) » sur la première formule jeunes', false);
    await tryDo('remplit', async () => { await page.fill('form[data-form="contact"] [name="name"]', 'Sandrine Martin'); await page.fill('form[data-form="contact"] [name="email"]', 'sandrine.m@exemple.fr'); await page.fill('form[data-form="contact"] [name="phone"]', '06 11 22 33 44'); await page.fill('form[data-form="contact"] [name="message"]', 'Bonjour, mes enfants ont 7 et 11 ans, ils n\'ont jamais joué. Peuvent-ils faire un essai ?'); });
    await shot('formulaire-rempli', 'Remplit le formulaire (pas envoyé dans ce test)', false);
  }
  if (who === 'julien') {
    await shot('accueil-complet', 'Fait défiler l\'accueil');
    await tryDo('tarifs', () => nav('Tarifs'));
    await shot('tarifs', 'Compare les formules adultes (il veut jouer l\'hiver en couvert et faire les matchs par équipes)');
    await tryDo('compétition', () => nav('Compétition'));
    await shot('competition', 'Regarde la compétition : équipes, championnats, tournoi');
    await tryDo('le club', () => nav('Le club'));
    await shot('le-club', 'Regarde les installations');
    await tryDo('contact', () => nav('Contact'));
    await shot('contact', 'Cherche comment venir faire un essai et où est le club');
  }
  if (who === 'gerard') {
    await shot('accueil-complet', 'Fait défiler l\'accueil sur son ordinateur de bureau');
    await tryDo('partenaires', () => nav('Partenaires'));
    await shot('partenaires', 'Lit la page Partenaires : qui est déjà partenaire, combien ça coûte, ce qu\'il gagne');
    await tryDo('cta pack', async () => { await page.locator('[data-render="packs"] a, [data-render="packs"] button').filter({ visible: true }).first().click(); await page.waitForTimeout(2500); });
    await shot('apres-clic-pack', 'Clique sur le bouton du premier pack');
    await tryDo('contact', () => nav('Contact'));
    await shot('contact', 'Va sur Contact pour demander un rendez-vous');
  }
  fs.writeFileSync(path.join(dir, 'journal.json'), JSON.stringify({ persona: who, viewport: dev.viewport, etapes: log, erreursJS: errs }, null, 1));
  await browser.close(); console.log('OK ' + who + ' ' + n);
})().catch((e) => { console.error(e); process.exit(1); });
