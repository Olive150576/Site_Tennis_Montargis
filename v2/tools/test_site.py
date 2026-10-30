#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Robot de test du site USM Tennis Montargis
==========================================
Parcourt toutes les pages comme un visiteur (téléphone puis ordinateur) et vérifie :
  • erreurs JavaScript et fichiers manquants (404) ;
  • liens internes (page + ancre #… existantes), liens tel:/mailto:, liens externes (option --externes) ;
  • chaque bouton : un clic doit produire un effet (sinon « clic mort », comme dans Clarity) ;
  • parcours clés : barre d'action mobile, menu, thème, galerie photo, quiz, formulaires,
    bandeau cookies, bouton haut/bas ;
  • images cassées ;
  • admin : connexion (mode aperçu) et ouverture de chaque rubrique ;
  • boutique (espace membre + admin) : onglet « Plus », fiche produit, réservation et compteur,
    modification, annulation, blocage après la date limite, 360 px avec texte agrandi,
    création d'un produit dans l'admin, export CSV, passage en « Commandée », annulation.

Utilisation (dans le dossier du site) :
    pip install playwright && python -m playwright install chromium   (une seule fois)
    python tools/test_site.py                 → rapport dans tools/rapport-tests.html
    python tools/test_site.py --externes      → vérifie aussi les liens vers d'autres sites
    python tools/test_site.py --boutique      → seulement les parcours de la boutique (1 min)
"""
import asyncio, json, os, re, sys, threading, time, html, argparse, urllib.request, ssl
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from urllib.parse import urlparse, urljoin, unquote

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = 8799
BASE = f'http://127.0.0.1:{PORT}/'
PAGES = ['index.html', 'le-club.html', 'ecole-de-tennis.html', 'competition.html', 'agenda.html', 'tarifs.html',
         'actualites.html', 'actualite.html', 'partenaires.html', 'contact.html', 'mentions-legales.html',
         'confidentialite.html', '404.html']
# Animations coupées (reduced_motion) : défilements instantanés, mesures fiables
VIEWPORTS = {'téléphone': dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2, reduced_motion='reduce'),
             'ordinateur': dict(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')}

RESULTS = []          # (section, statut 'ok'|'ko'|'info', titre, détail)
def res(section, ok, titre, detail=''):
    RESULTS.append((section, ok if isinstance(ok, str) else ('ok' if ok else 'ko'), titre, detail))

# ------------------------------------------------------------------ serveur local
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def start_server():
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

# Script injecté dans chaque page : compte les changements de la page (pour détecter les clics morts)
WATCH = """
window.__chg = 0;
document.addEventListener('DOMContentLoaded', () => {
  new MutationObserver((m) => { window.__chg += m.length; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
});
try { localStorage.setItem('usm_consent', JSON.stringify({ a: 'denied', t: Date.now() })); } catch (e) {}
"""

async def new_ctx(browser, vp, consent=True):
    ctx = await browser.new_context(**VIEWPORTS[vp])
    await ctx.add_init_script(WATCH if consent else WATCH.split('try {')[0])
    # Pas d'accès Internet nécessaire : on bloque les services externes (polices, météo, Clarity…)
    await ctx.route(re.compile(r'^https?://(?!127\.0\.0\.1)'), lambda r: r.fulfill(status=204, body=''))
    return ctx

async def open_page(ctx, path, errors):
    pg = await ctx.new_page()
    here = lambda: (pg.url.replace(BASE, '').split('#')[0] or path)
    def add(msg):
        if msg not in errors: errors.append(msg)
    pg.on('pageerror', lambda e: add(f'{here()} : erreur JavaScript « {e} »'))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and add(f'{here()} : console « {m.text[:160]} »'))
    pg.on('response', lambda r: r.status >= 400 and r.url.startswith(BASE) and add(f'{here()} : fichier manquant {r.status} {r.url[len(BASE):]}'))
    await pg.goto(BASE + path, wait_until='networkidle')
    await pg.wait_for_timeout(250)
    return pg

# ------------------------------------------------------------------ 1. pages, liens, images
async def check_pages(browser, vp, ext_links, anchors_cache):
    ctx = await new_ctx(browser, vp)
    links = {}
    for path in PAGES:
        errors = []
        pg = await open_page(ctx, path, errors)
        await pg.evaluate("async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); }")
        await pg.wait_for_timeout(400)
        broken = await pg.evaluate("[...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map(i => i.getAttribute('src'))")
        for a in await pg.evaluate("[...document.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), abs: a.href, txt: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 40) }))"):
            links.setdefault(a['href'], (a, path))
        res(f'Pages ({vp})', not errors and not broken, path, '<br>'.join(errors + [f'image cassée : {b}' for b in broken]))
        await pg.close()
    # Liens internes : page cible et ancre existantes (après rendu JavaScript)
    bad, tel = [], []
    for href, (a, src) in sorted(links.items()):
        if href.startswith('tel:'):
            if not re.fullmatch(r'tel:\+?\d{9,13}', href): bad.append(f'{src} : numéro invalide {href}')
            tel.append(href); continue
        if href.startswith('mailto:'):
            if not re.fullmatch(r'mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}(\?.*)?', href): bad.append(f'{src} : e-mail invalide {href}')
            continue
        u = urlparse(a['abs'])
        if not a['abs'].startswith(BASE):
            if u.scheme in ('http', 'https'): ext_links.setdefault(a['abs'], set()).add(src)
            continue
        target = unquote(u.path[1:]) or 'index.html'
        if target.endswith('/'): target += 'index.html'
        if not os.path.exists(os.path.join(ROOT, target)):
            bad.append(f'{src} : lien « {a["txt"]} » → {target} n\'existe pas'); continue
        frag = u.fragment
        if frag and target == 'actualite.html':
            # Lien vers un article : l'article doit exister (sinon page « Actualité introuvable »)
            if frag not in anchors_cache.setdefault('__articles', {}):
                p2 = await ctx.new_page(); await p2.goto(a['abs'], wait_until='networkidle'); await p2.wait_for_timeout(300)
                anchors_cache['__articles'][frag] = 'introuvable' not in (await p2.inner_text('main')).lower(); await p2.close()
            if not anchors_cache['__articles'][frag]: bad.append(f'{src} : lien « {a["txt"]} » → article introuvable ({frag})')
            continue
        if frag and ((target == 'actualites.html' and frag.startswith('cat-')) or (target == 'tarifs.html' and frag.startswith('tarifs-'))):
            # Filtre / onglet choisi par le lien (géré en JavaScript) : il doit être sélectionné à l'arrivée
            key = target + '#' + frag
            if key not in anchors_cache:
                p2 = await ctx.new_page(); await p2.goto(a['abs'], wait_until='networkidle'); await p2.wait_for_timeout(400)
                if target == 'actualites.html':
                    anchors_cache[key] = await p2.locator(f'.filter[data-cat="{frag[4:]}"][aria-pressed="true"]').count() == 1
                else:
                    sel = await p2.locator(f'.tab[data-tab="{frag[7:]}"][aria-selected="true"]').count() == 1
                    top = await p2.evaluate("Math.round(document.querySelector('#tarifs').getBoundingClientRect().top)")
                    anchors_cache[key] = sel and top < 200
                await p2.close()
            if not anchors_cache[key]: bad.append(f'{src} : lien « {a["txt"]} » → {target}#{frag} (le bon onglet/filtre ne s\'affiche pas)')
            continue
        if frag and target.endswith('.html') and not frag.startswith('formule-') and frag not in ('essai', 'inscription', 'partenariat', 'renseignement'):
            if target not in anchors_cache:
                p2 = await ctx.new_page(); await p2.goto(BASE + target, wait_until='networkidle'); await p2.wait_for_timeout(300)
                anchors_cache[target] = set(await p2.evaluate("[...document.querySelectorAll('[id]')].map(e => e.id)")); await p2.close()
            if frag not in anchors_cache[target]:
                bad.append(f'{src} : lien « {a["txt"]} » → {target}#{frag} (ancre introuvable)')
    res(f'Liens internes ({vp})', not bad, f'{len(links)} liens contrôlés', '<br>'.join(bad))
    await ctx.close()

# ------------------------------------------------------------------ 2. clics morts sur tous les boutons
SKIP_BTN = ('consent', 'data-consent')  # testés à part
async def check_buttons(browser, vp):
    ctx = await new_ctx(browser, vp)
    total, dead, errs = 0, [], []
    for path in PAGES:
        errors = []
        pg = await open_page(ctx, path, errors)
        n = await pg.evaluate("document.querySelectorAll('button').length")
        for i in range(n):
            info = await pg.evaluate("""(i) => { const b = document.querySelectorAll('button')[i]; if (!b) return null;
              const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
              const vis = !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length) && cs.visibility !== 'hidden' && !b.closest('[hidden]') && !b.disabled;
              return { vis, label: (b.getAttribute('aria-label') || b.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50), cls: b.className, type: b.type, inForm: !!b.closest('form') }; }""", i)
            if not info or not info['vis'] or any(s in (info['cls'] or '') for s in SKIP_BTN): continue
            if info['type'] == 'submit' and info['inForm']: continue  # formulaires testés à part
            total += 1
            before = await pg.evaluate("({ c: window.__chg, y: Math.round(scrollY), u: location.href })")
            try:
                h = (await pg.query_selector_all('button'))[i]
                await h.scroll_into_view_if_needed(timeout=1500); await pg.wait_for_timeout(250)
                before = await pg.evaluate("({ c: window.__chg, y: Math.round(scrollY), u: location.href })")
                await h.click(timeout=2500)
            except Exception as e:
                dead.append(f'{path} : « {info["label"]} » impossible à cliquer ({str(e).splitlines()[0][:90]})')
                continue
            await pg.wait_for_timeout(450)
            after = await pg.evaluate("({ c: window.__chg, y: Math.round(scrollY), u: location.href })")
            if after == before:
                dead.append(f'{path} : « {info["label"] or info["cls"]} » ne produit aucun effet')
            # On repart d'une page propre pour le bouton suivant
            await pg.goto(BASE + path, wait_until='domcontentloaded'); await pg.wait_for_timeout(350)
        errs += errors
        await pg.close()
    res(f'Boutons ({vp})', not dead and not errs, f'{total} boutons cliqués', '<br>'.join(dead + errs))
    await ctx.close()

# ------------------------------------------------------------------ 3. parcours clés
async def step(section, title, fn):
    """Exécute un contrôle ; une erreur ne bloque pas les suivants."""
    try:
        r = await fn()
        ok, detail = (r if isinstance(r, tuple) else (r, ''))
        res(section, ok, title, detail)
    except Exception as e:
        res(section, False, title, 'échec : ' + html.escape(str(e).splitlines()[0][:200]))

async def check_flows(browser):
    errors = []
    ctx = await new_ctx(browser, 'téléphone')
    await ctx.route('**/tenup.fft.fr/**', lambda r: r.fulfill(status=200, body="Ten'Up"))
    pg = await open_page(ctx, 'index.html', errors)
    S = "Barre d'action (téléphone)"

    async def bar_links():
        bar = await pg.evaluate("[...document.querySelectorAll('.action-bar a')].map(a => ({ k: a.dataset.bar, href: a.href, vis: a.getBoundingClientRect().height > 40 }))")
        d = {b['k']: b for b in bar}
        ok = len(bar) == 4 and all(b['vis'] for b in bar) and 'tenup.fft.fr' in d['reserver']['href'] and d['appeler']['href'].startswith('tel:') \
            and d['tarifs']['href'].endswith('tarifs.html') and d['contact']['href'].endswith('contact.html')
        return ok, ' · '.join(f"{b['k']} → {b['href'].replace(BASE, '')}" for b in bar)
    await step(S, 'Les 4 boutons sont visibles et pointent au bon endroit', bar_links)

    async def reserver():
        async with ctx.expect_page(timeout=5000) as pop:
            await pg.click('.action-bar [data-bar=reserver]')
        p2 = await pop.value; await p2.wait_for_load_state(); u = p2.url; await p2.close()
        return 'tenup.fft.fr' in u, u
    await step(S, "Réserver ouvre Ten'Up dans un nouvel onglet", reserver)

    async def tarifs():
        await pg.click('.action-bar [data-bar=tarifs]'); await pg.wait_for_load_state('networkidle')
        return pg.url.endswith('tarifs.html'), pg.url.replace(BASE, '')
    await step(S, 'Tarifs ouvre la page Tarifs', tarifs)

    async def tarifs_again():
        await pg.evaluate('scrollTo(0,0)'); await pg.click('.action-bar [data-bar=tarifs]'); await pg.wait_for_timeout(1000)
        top = await pg.evaluate("Math.round(document.querySelector('#tarifs').getBoundingClientRect().top)")
        return abs(top) < 140, f'position de la liste après le clic : {top} px'
    await step(S, 'Sur la page Tarifs, « Tarifs » descend aux formules', tarifs_again)

    async def contact():
        await pg.click('.action-bar [data-bar=contact]'); await pg.wait_for_load_state('networkidle')
        return pg.url.endswith('contact.html'), pg.url.replace(BASE, '')
    await step(S, 'Contact ouvre la page Contact', contact)

    async def contact_again():
        await pg.evaluate('scrollTo(0,0)'); await pg.click('.action-bar [data-bar=contact]'); await pg.wait_for_timeout(1000)
        top = await pg.evaluate("Math.round(document.querySelector('#contact-form').getBoundingClientRect().top)")
        return abs(top) < 140, f'position du formulaire après le clic : {top} px'
    await step(S, 'Sur la page Contact, « Contact » descend au formulaire', contact_again)

    async def appeler():
        tel = await pg.evaluate("document.querySelector('.action-bar [data-bar=appeler]').getAttribute('href')")
        return bool(re.fullmatch(r'tel:0\d{9}', tel)), tel
    await step(S, 'Appeler compose le numéro du club', appeler)

    async def typing():
        await pg.focus('#cf-name'); await pg.wait_for_timeout(300)
        hidden = await pg.evaluate("getComputedStyle(document.querySelector('.action-bar')).transform !== 'none'")
        await pg.evaluate('document.activeElement.blur()'); await pg.wait_for_timeout(800)
        back = await pg.evaluate("getComputedStyle(document.querySelector('.action-bar')).transform === 'none'")
        return hidden and back, f'cachée pendant la saisie : {hidden}, réapparaît ensuite : {back}'
    await step(S, "La barre se cache pendant la saisie et revient après", typing)

    # Menu, thème
    await pg.goto(BASE + 'index.html', wait_until='networkidle')
    async def menu():
        await pg.click('.menu-toggle'); await pg.wait_for_timeout(300)
        opened = await pg.evaluate("document.querySelector('#mobile-panel').classList.contains('is-open')")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        closed = not await pg.evaluate("document.querySelector('#mobile-panel').classList.contains('is-open')")
        return opened and closed
    await step('Menu et thème', "Le menu mobile s'ouvre et se ferme", menu)
    async def theme():
        t0 = await pg.evaluate("document.documentElement.getAttribute('data-theme')")
        await pg.click('.theme-toggle'); t1 = await pg.evaluate("document.documentElement.getAttribute('data-theme')")
        await pg.click('.theme-toggle')
        return t0 != t1, f'{t0 or "auto"} → {t1}'
    await step('Menu et thème', 'Le bouton clair/sombre change le thème', theme)

    async def quiz():
        await pg.click('[data-open-finder]'); await pg.wait_for_timeout(300)
        for _ in range(4):
            if await pg.locator('.finder-result').count(): break
            await pg.locator('.finder-opt').first.click(); await pg.wait_for_timeout(200)
        return await pg.locator('.finder-result').count() == 1
    await step('Accueil', 'Le quiz « Trouver ma formule » mène à un résultat', quiz)
    async def write():
        await pg.click('[data-open-form]'); await pg.wait_for_timeout(300)
        ok = await pg.locator('#home-form').is_visible()
        await pg.evaluate('document.activeElement && document.activeElement.blur()')
        return ok
    await step('Accueil', '« Écrire un message » ouvre le formulaire', write)
    async def edge():
        await pg.evaluate('scrollTo(0, 0)'); await pg.wait_for_timeout(300)
        await pg.click('.to-edge'); await pg.wait_for_timeout(1500)
        down = await pg.evaluate('scrollY')
        await pg.click('.to-edge'); await pg.wait_for_timeout(1500)
        up = await pg.evaluate('scrollY')
        return down > 1000 and up < 50, f'après le 1er clic : {down} px, après le 2e : {up} px'
    await step('Accueil', 'Le bouton rond descend en bas puis remonte en haut', edge)

    async def lightbox():
        await pg.goto(BASE + 'le-club.html', wait_until='networkidle')
        await pg.locator('.lb-trigger').first.click(); await pg.wait_for_timeout(300)
        c1 = await pg.locator('.lightbox .lb-count').inner_text()
        await pg.locator('.lightbox .lb-next').click(); c2 = await pg.locator('.lightbox .lb-count').inner_text()
        await pg.locator('.lightbox .lb-close').click(); await pg.wait_for_timeout(200)
        return c1 != c2 and not await pg.locator('.lightbox').is_visible(), f'{c1} → {c2}'
    await step('Galerie', "La photo s'agrandit, « suivante » et « fermer » fonctionnent", lightbox)

    for path, form in [('index.html', '#home-form'), ('contact.html', '#contact-form'), ('tarifs.html', '#question-form'), ('partenaires.html', '#partner-form')]:
        async def f(path=path, form=form):
            await pg.goto(BASE + path, wait_until='networkidle')
            if path == 'index.html': await pg.click('[data-open-form]')
            await pg.locator(f'{form} [type=submit]').click(); await pg.wait_for_timeout(300)
            refused = await pg.locator(form).count() == 1
            await pg.evaluate("""(f) => { const F = document.querySelector(f);
              F.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), textarea').forEach((i) => { if (i.closest('.hp')) return;
                i.value = i.type === 'email' ? 'robot@example.com' : i.type === 'tel' ? '0600000000' : 'Test du robot'; });
              F.querySelectorAll('input[type=checkbox][required]').forEach((c) => { c.checked = true; });
              F.querySelectorAll('select[required]').forEach((s) => { if (!s.value) s.selectedIndex = 1; }); }""", form)
            await pg.locator(f'{form} [type=submit]').click(); await pg.wait_for_timeout(700)
            sent = await pg.locator('.form-ok').count() > 0
            return refused and sent, f'vide refusé : {refused}, rempli envoyé : {sent}'
        await step('Formulaires', f'{path} : refuse un formulaire vide, accepte un formulaire rempli', f)
    await ctx.close()

    ctx = await new_ctx(browser, 'téléphone', consent=False)
    pg = await open_page(ctx, 'index.html', errors)
    async def consent():
        shown = await pg.locator('.consent').is_visible()
        await pg.click('.consent [data-consent=granted]'); gone = await pg.locator('.consent').count() == 0
        await pg.click('[data-consent-open]'); back = await pg.locator('.consent').is_visible()
        return shown and gone and back
    await step('Bandeau cookies', "Le bandeau s'affiche, se ferme au choix, et revient via « Cookies »", consent)
    await ctx.close()
    res('Parcours clés', not errors, 'Aucune erreur JavaScript pendant les parcours', '<br>'.join(errors))

# ------------------------------------------------------------------ 4. admin (mode aperçu)
async def check_admin(browser):
    errors = []
    ctx = await new_ctx(browser, 'ordinateur')
    pg = await open_page(ctx, 'admin/index.html', errors)
    cfg = open(os.path.join(ROOT, 'assets/js/config.js'), encoding='utf-8').read()
    if "mode: 'firebase'" in cfg:
        res('Admin', 'info', 'Admin non testé : le site est en mode Firebase (connexion réelle)'); await ctx.close(); return
    pw = re.search(r"localAdminPassword:\s*'([^']*)'", cfg).group(1)
    await pg.fill('#lg-pass', pw); await pg.locator('#login [type=submit]').click(); await pg.wait_for_timeout(800)
    logged = await pg.evaluate("location.hash.startsWith('#/tableau')")
    res('Admin', logged, 'Connexion à l\'admin (mot de passe de l\'aperçu)')
    routes = re.findall(r"\{ r: '([a-z]+)', l: '([^']+)'", open(os.path.join(ROOT, 'assets/js/admin.js'), encoding='utf-8').read())
    bad = []
    for r, label in routes:
        n = len(errors)
        await pg.evaluate(f"location.hash = '#/{r}'"); await pg.wait_for_timeout(350)
        txt = await pg.evaluate("document.querySelector('main, #app') ? (document.querySelector('main, #app').innerText || '').length : 0")
        if len(errors) > n or txt < 40: bad.append(f'{label} (#/{r})')
    res('Admin', not bad and not errors, f'{len(routes)} rubriques de l\'admin s\'ouvrent sans erreur', '<br>'.join(bad + errors))
    await ctx.close()

# ------------------------------------------------------------------ 5. boutique (commandes groupées)
async def check_boutique(browser):
    """Parcours complet membre + admin, dans le même navigateur (le mode aperçu partage les données)."""
    cfg = open(os.path.join(ROOT, 'assets/js/config.js'), encoding='utf-8').read()
    if "mode: 'firebase'" in cfg:
        res('Boutique', 'info', 'Boutique non testée : le site est en mode Firebase (données réelles)'); return
    errors = []
    ctx = await browser.new_context(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True, device_scale_factor=2, reduced_motion='reduce', accept_downloads=True)
    ctx.set_default_timeout(6000)
    await ctx.add_init_script(WATCH)
    await ctx.route(re.compile(r'^https?://(?!127\.0\.0\.1)'), lambda r: r.fulfill(status=204, body=''))
    mp = await open_page(ctx, 'espace-membre.html', errors)
    M, A = 'Boutique · espace membre', 'Boutique · admin'
    await mp.click('#demo-btn'); await mp.wait_for_timeout(600)

    async def to_shop(tab=None):
        await mp.evaluate("location.hash = '#accueil'"); await mp.wait_for_timeout(150)
        await mp.click('[data-more]'); await mp.wait_for_timeout(200)
        await mp.click('#more a[href="#boutique"]'); await mp.wait_for_timeout(400)
        if tab: await mp.click(f'#v-boutique [data-stab="{tab}"]'); await mp.wait_for_timeout(250)
    async def open_product(pid):
        await mp.click(f'#v-boutique [data-product="{pid}"]'); await mp.wait_for_timeout(350)
    async def missing():
        return await mp.evaluate("(() => { const b = document.querySelector('.drawer:not([hidden]) .ps-board'); if (!b) return null; if (b.querySelector('.pb-miss.ok')) return 0; const n = b.querySelector('.pb-miss b'); return n ? +n.textContent : null; })()")
    async def close_drawer():
        if await mp.locator('#drawer').is_visible(): await mp.keyboard.press('Escape'); await mp.wait_for_timeout(200)
    async def pick(name, value):
        await mp.locator(f'input[name="{name}"][value="{value}"] + label').click()
    async def reserve(pid, size=None, color=None, plus=0):
        await open_product(pid)
        if size: await pick('ps-size', size)
        if color: await pick('ps-color', color)
        for _ in range(plus): await mp.click('[data-qty="1"]')
        await mp.click('[data-reserve]'); await mp.wait_for_timeout(250)
        await mp.click('[data-confirm]'); await mp.wait_for_timeout(600)
        return await mp.locator('.ps-done').is_visible()

    async def via_plus():
        await to_shop()
        vis = await mp.locator('#v-boutique').is_visible(); n = await mp.locator('#v-boutique .shop-card').count()
        tabs = await mp.evaluate("[...document.querySelectorAll('.m-tabbar > *')].map(e => e.textContent.trim().replace(/\\d+$/, ''))")
        return vis and n >= 3 and mp.url.endswith('#boutique'), f"{n} produits · barre d'onglets : {' · '.join(tabs)}"
    await step(M, "La Boutique s'ouvre depuis l'onglet « Plus » de la barre mobile", via_plus)

    async def no_overflow():
        bad = []
        for label, width, scale in [('360 px', 360, 100), ('360 px, texte agrandi 130 %', 360, 130), ('zoom Android 130 % (277 px)', 277, 100)]:
            await mp.set_viewport_size({'width': width, 'height': 780})
            await mp.evaluate(f"document.documentElement.style.fontSize = '{scale}%'")
            for what in ('accueil', 'boutique', 'mine', 'fiche'):
                await close_drawer()
                if what == 'accueil': await mp.evaluate("location.hash = '#accueil'")
                elif what == 'boutique': await to_shop('produits')
                elif what == 'mine': await to_shop('mine')
                else: await to_shop('produits'); await open_product('sp-veste')
                await mp.wait_for_timeout(250)
                o = await mp.evaluate("""(() => { const W = document.documentElement.clientWidth, out = [];
                  if (document.documentElement.scrollWidth > W + 1) out.push('page ' + document.documentElement.scrollWidth + ' px');
                  document.querySelectorAll('.m-tabbar > *, .drawer:not([hidden]) .drawer-panel, .shop-card, .shop-banner, .res').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || e.scrollWidth > e.clientWidth + 2)) out.push((e.className || e.tagName).toString().split(' ')[0]); });
                  return out; })()""")
                if o: bad.append(f"{label} · {what} : {', '.join(sorted(set(o)))}")
        await close_drawer()
        await mp.evaluate("document.documentElement.style.fontSize = ''"); await mp.set_viewport_size({'width': 360, 'height': 780})
        return not bad, '<br>'.join(bad) or 'accueil, boutique, mes réservations et fiche produit vérifiés'
    await step(M, 'Aucun débordement à droite à 360 px, texte agrandi et zoom compris', no_overflow)

    X = {}
    async def sheet():
        await to_shop('produits'); await open_product('sp-veste')
        txt = await mp.locator('.ps-board').inner_text(); X['v'] = await missing()
        return ('il en manque' in txt.lower() and X['v'] and X['v'] > 2), f"compteur : {' '.join(txt.split())[:120]}"
    await step(M, 'La fiche produit affiche le compteur « il en manque X »', sheet)

    async def book():
        await close_drawer(); await to_shop('produits')
        done = await reserve('sp-veste', size='M', plus=1)
        m = await missing(); X['after'] = m
        return done and m == X['v'] - 2, f"il en manquait {X['v']}, réservé 2 → il en manque {m}"
    await step(M, 'Je réserve 2 pièces : le compteur baisse de 2', book)

    async def edit():
        await close_drawer(); await to_shop('mine')
        await mp.click('#v-boutique [data-editres][data-pid="sp-veste"]'); await mp.wait_for_timeout(350)
        await mp.click('[data-qty="-1"]'); await mp.click('[data-reserve]'); await mp.wait_for_timeout(200); await mp.click('[data-confirm]'); await mp.wait_for_timeout(600)
        m = await missing()
        return m == X['v'] - 1, f"2 → 1 pièce : il en manque {m} (attendu {X['v'] - 1})"
    await step(M, 'Je modifie ma réservation (2 → 1 pièce) : le compteur remonte', edit)

    async def cancel():
        await close_drawer(); await to_shop('mine')
        await mp.click('#v-boutique [data-cancelres][data-pid="sp-veste"]'); await mp.wait_for_timeout(350)
        await mp.click('[data-cancelyes]'); await mp.wait_for_timeout(600)
        m = await missing(); left = await mp.evaluate("USM.store.shop.state([{id:'sp-veste'}], 'me').then(s => s.mine['sp-veste'].length)")
        return m == X['v'] and left == 0, f"il en manque {m} (attendu {X['v']}), réservations restantes : {left}"
    await step(M, "J'annule : le compteur revient à sa valeur de départ", cancel)

    async def again():
        await close_drawer(); await to_shop('produits')
        a = await reserve('sp-veste', size='L')
        await close_drawer(); await to_shop('produits')
        b = await reserve('sp-tshirt', size='M', color='Blanc')
        await close_drawer()
        return a and b, 'veste L ×1 et t-shirt M blanc ×1 réservés pour la suite'
    await step(M, 'Deux nouvelles réservations (veste, t-shirt avec couleur)', again)

    async def deadline():
        y = await mp.evaluate("""(async () => { const st = USM.store, c = await st.load(), d = new Date(); d.setDate(d.getDate() - 1);
          const iso = d.toISOString().slice(0, 10);
          await st.save('shopProducts', c.shopProducts.map(p => { if (p.id !== 'sp-veste') return p; const q = Object.assign({}, p, { deadline: iso }); delete q.deadlineTs; delete q._demo; return q; }));
          return iso; })()""")
        await mp.reload(); await mp.wait_for_timeout(700)
        await to_shop('produits'); await open_product('sp-veste')
        lock = await mp.locator('.ps-note.is-lock').count(); form = await mp.locator('[data-reserve]').count()
        await close_drawer(); await to_shop('mine')
        rl = await mp.locator('#v-boutique .res-lock').count(); ed = await mp.locator('#v-boutique [data-editres][data-pid="sp-veste"]').count()
        api = await mp.evaluate("""(async () => { const c = await USM.store.load(), p = c.shopProducts.find(x => x.id === 'sp-veste');
          try { await USM.store.shop.reserve(p, { size: 'M', qty: 1 }, { uid: 'me' }); return 'accepté'; } catch (e) { return e.message; } })()""")
        ok = lock == 1 and form == 0 and rl >= 1 and ed == 0 and 'date limite' in api.lower()
        return ok, f"date limite mise au {y} · fiche verrouillée : {lock == 1} · bouton « Je réserve » : {form} · « contactez le bureau » : {rl} · nouvelle réservation : « {api} »"
    await step(M, 'Après la date limite : réserver, modifier et annuler sont bloqués', deadline)

    # ---- admin, dans un autre onglet du même navigateur
    ap = await open_page(ctx, 'admin/index.html', errors)
    await ap.set_viewport_size({'width': 1280, 'height': 900})
    pw = re.search(r"localAdminPassword:\s*'([^']*)'", cfg).group(1)
    await ap.fill('#lg-pass', pw); await ap.locator('#login [type=submit]').click(); await ap.wait_for_timeout(800)

    async def dashboard():
        t = await ap.locator('#kpi-boutique').inner_text()
        return 'commande' in t and 'reste à encaisser' in t, ' '.join(t.split())
    await step(A, 'Le tableau de bord affiche la tuile Boutique', dashboard)

    async def create():
        await ap.evaluate("location.hash = '#/boutique/nouveau'"); await ap.wait_for_timeout(500)
        await ap.fill('[data-f="name"] input', 'Short du club (test robot)')
        await ap.fill('[data-f="priceMember"] input', '20')
        await ap.fill('[data-f="minQty"] input', '10')
        await ap.select_option('[data-f="status"] select', 'ouverte')
        await ap.click('#sv-save'); await ap.wait_for_timeout(700)
        saved = await ap.evaluate("location.hash.startsWith('#/boutique/sp-')")
        await mp.reload(); await mp.wait_for_timeout(700); await to_shop('produits')
        card = mp.locator('#v-boutique .shop-card', has_text='Short du club (test robot)')
        n = await card.count(); txt = ' '.join((await card.first.inner_text()).split()) if n else ''
        return saved and n == 1 and 'il en manque 10' in txt, f"côté membre : {txt[:140]}"
    await step(A, "Création d'un produit (minimum 10) : il apparaît côté membre", create)

    async def csv():
        await ap.evaluate("location.hash = '#/boutique/sp-tshirt/suivi'"); await ap.wait_for_timeout(600)
        async with ap.expect_download() as d: await ap.click('#sh-csv')
        f = await (await d.value).path(); data = open(f, encoding='utf-8-sig').read()
        rows = [l for l in data.splitlines() if l.startswith('"M";')]
        ok = 'Récapitulatif fournisseur' in data and '"Taille";"Couleur";"Quantité"' in data and 'Détail des réservations' in data and 'Julien Mercier' in data and rows
        return bool(ok), f"{len(data.splitlines())} lignes · taille M : {' | '.join(rows)[:160]}"
    await step(A, 'Export CSV : récap par taille et couleur + détail des réservations', csv)

    async def order():
        await ap.evaluate("location.hash = '#/boutique/sp-veste/suivi'"); await ap.wait_for_timeout(600)
        await ap.click('[data-ph="commandee"]'); await ap.wait_for_timeout(250); await ap.click('.modal [data-a="1"]'); await ap.wait_for_timeout(900)
        st = await ap.locator('.shop-phase').inner_text()
        await mp.reload(); await mp.wait_for_timeout(700); await to_shop('produits'); await open_product('sp-veste')
        chip = await mp.locator('.ps-head .shop-st').inner_text(); pay = await mp.locator('.drawer a[href*="helloasso"]').count(); form = await mp.locator('[data-reserve]').count()
        await close_drawer(); await mp.evaluate("location.hash = '#accueil'"); await mp.wait_for_timeout(300)
        note = await mp.locator('#v-accueil .todo', has_text='Commande lancée').count()
        ok = 'Commandée' in st and chip.strip() == 'Commandée' and pay == 1 and form == 0 and note == 1
        return ok, f"statut membre : {chip.strip()} · lien de paiement : {pay} · bouton réserver : {form} · message « Commande lancée » à l'accueil : {note}"
    await step(A, 'Passer en « Commandée » verrouille côté membre et affiche le lien de paiement', order)

    async def cancel_all():
        await ap.evaluate("location.hash = '#/boutique/sp-tshirt/suivi'"); await ap.wait_for_timeout(600)
        await ap.click('[data-ph="annulee"]'); await ap.wait_for_timeout(250); await ap.click('.modal [data-a="1"]'); await ap.wait_for_timeout(900)
        await mp.reload(); await mp.wait_for_timeout(700); await to_shop('mine')
        c = await mp.locator('#v-boutique .res.is-cancel').count()
        await mp.evaluate("location.hash = '#agenda'"); await mp.wait_for_timeout(300)
        msg = await mp.locator('#v-agenda .msg', has_text='Commande annulée').count()
        return c >= 1 and msg == 1, f"réservation marquée annulée : {c} · message du bureau : {msg}"
    await step(A, 'Annuler la commande groupée prévient les membres concernés', cancel_all)

    async def dark():
        await mp.evaluate("document.documentElement.setAttribute('data-theme', 'dark')"); await to_shop('produits'); await open_product('sp-casquette')
        bg = await mp.evaluate("getComputedStyle(document.body).backgroundColor"); w = await mp.locator('[data-wait]').count()
        await close_drawer(); await mp.evaluate("document.documentElement.removeAttribute('data-theme')")
        return w >= 1 and bg != 'rgb(243, 245, 250)', f"fond sombre : {bg} · bouton « Prévenez-moi » sur un produit terminé : {w}"
    await step(M, 'Thème sombre et liste d\'attente sur un produit terminé', dark)

    await ctx.close()
    res('Boutique', not errors, 'Aucune erreur JavaScript pendant les parcours boutique', '<br>'.join(errors))

# ------------------------------------------------------------------ 6. liens externes
def check_external(ext_links):
    ctx = ssl.create_default_context()
    ca = os.environ.get('SSL_CERT_FILE') or os.environ.get('REQUESTS_CA_BUNDLE')
    if ca and os.path.exists(ca): ctx.load_verify_locations(ca)
    for url, pages in sorted(ext_links.items()):
        code, note = None, ''
        for method in ('HEAD', 'GET'):
            try:
                req = urllib.request.Request(url, method=method, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'fr-FR,fr;q=0.9', 'Accept': 'text/html,*/*'})
                with urllib.request.urlopen(req, timeout=12, context=ctx) as r: code = r.status
                break
            except urllib.error.HTTPError as e:
                code = e.code
                if method == 'GET': break
            except Exception as e:
                note = str(e)[:80]
        if code and code < 400: status, why = 'ok', ''
        elif code in (401, 403, 405, 429, 503, 999) or (code == 400 and re.search(r'facebook\.com|instagram\.com', url)): status, why = 'info', ' (le site refuse souvent les robots : à vérifier à la main)'
        elif not code: status, why = 'info', ' (site injoignable depuis la machine de test : à vérifier à la main)'
        else: status, why = 'ko', ' (page introuvable ou en erreur)'
        res('Liens externes', status, url, f"réponse {code or '—'} {html.escape(note)} · utilisé sur : {', '.join(sorted(pages))}{why}")

# ------------------------------------------------------------------ rapport
def write_report(path, duration):
    ko = sum(1 for r in RESULTS if r[1] == 'ko'); okc = sum(1 for r in RESULTS if r[1] == 'ok'); info = sum(1 for r in RESULTS if r[1] == 'info')
    sections = []
    for s in dict.fromkeys(r[0] for r in RESULTS):
        rows = ''.join(f"<tr class='{st}'><td>{'✅' if st == 'ok' else '❌' if st == 'ko' else 'ℹ️'}</td><td>{html.escape(t)}</td><td>{d}</td></tr>" for (sec, st, t, d) in RESULTS if sec == s)
        sections.append(f"<h2>{html.escape(s)}</h2><table>{rows}</table>")
    doc = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport de tests — USM Tennis</title><style>
body{{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f4f6fb;color:#121a33}} main{{max-width:980px;margin:0 auto;padding:24px 16px 60px}}
h1{{font-size:1.6rem;margin:0 0 4px}} .sum{{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 8px}} .sum b{{padding:10px 14px;border-radius:12px;background:#fff;border:1px solid #dde3f0}}
.sum .k{{background:{'#fde8e8' if ko else '#e7f6ec'}}} h2{{font-size:1.1rem;margin:28px 0 8px}} table{{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #dde3f0}}
td{{padding:8px 10px;border-top:1px solid #eef1f7;vertical-align:top}} td:first-child{{width:28px}} td:last-child{{color:#4a5578;font-size:.88rem;word-break:break-word}}
tr.ko td{{background:#fff5f5}} @media(prefers-color-scheme:dark){{body{{background:#0d1324;color:#e8ecf7}} table,.sum b{{background:#141c33;border-color:#26304d}} td{{border-color:#1d2640}} td:last-child{{color:#a8b3d1}} tr.ko td{{background:#2a1620}}}}
</style></head><body><main><h1>Rapport de tests du site</h1><p>{time.strftime('%d/%m/%Y à %H:%M')} · durée {duration:.0f} s · téléphone (390 px) et ordinateur (1440 px)</p>
<div class="sum"><b class="k">{'❌ ' + str(ko) + ' problème(s)' if ko else '✅ Aucun problème'}</b><b>✅ {okc} contrôles réussis</b>{f'<b>ℹ️ {info} à vérifier à la main</b>' if info else ''}</div>
{''.join(sections)}</main></body></html>"""
    open(path, 'w', encoding='utf-8').write(doc)
    return ko, okc, info

async def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--externes', action='store_true'); ap.add_argument('--boutique', action='store_true'); ap.add_argument('--rapport', default=os.path.join(ROOT, 'tools', 'rapport-tests.html'))
    args = ap.parse_args()
    from playwright.async_api import async_playwright
    t0 = time.time(); srv = start_server(); ext, anchors = {}, {}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        if args.boutique:
            print('• Boutique…'); await check_boutique(browser); await browser.close(); srv.shutdown()
            ko, okc, info = write_report(args.rapport, time.time() - t0)
            print(f"\n{'❌ ' + str(ko) + ' problème(s)' if ko else '✅ Aucun problème'} · {okc} contrôles réussis")
            for r in RESULTS: print(f"  {'✅' if r[1] == 'ok' else '❌' if r[1] == 'ko' else 'ℹ️'} [{r[0]}] {r[2]} — {re.sub('<br>', ' | ', r[3])[:300]}")
            return 1 if ko else 0
        for vp in VIEWPORTS: print(f'• Pages et liens ({vp})…'); await check_pages(browser, vp, ext, anchors)
        for vp in VIEWPORTS: print(f'• Boutons ({vp})…'); await check_buttons(browser, vp)
        print('• Parcours clés…'); await check_flows(browser)
        print('• Admin…')
        try: await check_admin(browser)
        except Exception as e: res('Admin', False, 'Test de l\'admin interrompu', html.escape(str(e).splitlines()[0][:200]))
        print('• Boutique…')
        try: await check_boutique(browser)
        except Exception as e: res('Boutique', False, 'Test de la boutique interrompu', html.escape(str(e).splitlines()[0][:200]))
        await browser.close()
    if args.externes: print(f'• Liens externes ({len(ext)})…'); check_external(ext)
    else: res('Liens externes', 'info', f'{len(ext)} liens vers d\'autres sites non vérifiés', 'relancer avec --externes')
    srv.shutdown()
    ko, okc, info = write_report(args.rapport, time.time() - t0)
    print(f"\n{'❌ ' + str(ko) + ' problème(s)' if ko else '✅ Aucun problème'} · {okc} contrôles réussis · {info} à vérifier · rapport : {args.rapport}")
    for r in RESULTS:
        if r[1] == 'ko': print(f"  ❌ [{r[0]}] {r[2]} — {re.sub('<br>', ' | ', r[3])[:400]}")
    return 1 if ko else 0

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
