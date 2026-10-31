#!/usr/bin/env python3
"""Assemble le site final à la racine du dépôt : nouveau site (v2/) + ce qu'on garde de l'ancien.

Même script pour la répétition générale et pour le jour J (étape C du README).
À lancer depuis la racine du dépôt, sur la branche « bascule » :   python v2/tools/assembler_bascule.py

Copié depuis v2/ (remplace l'ancien quand le nom existe déjà) :
  pages publiques *.html, espace-membre.html (nouvel espace membre), admin/ (nouvel admin),
  assets/, favicon.ico, manifest.webmanifest, robots.txt, sitemap.xml, sw.js
Gardé de l'ancien site (non touché) :
  admin-panel.html + admin*.min.js (gestion des comptes membres), verify.html (/v/{uid}),
  qr-accueil.html, manifest-membre.json / manifest-admin.json + icônes, style.css, etc.
firebase.json : partie « hosting » de v2/ (adresses courtes, 404, en-têtes), SANS « site » ni noindex,
  + le build de l'ancien panneau (predeploy) et les exclusions de la racine. Le reste (database,
  storage, functions, emulators) est conservé tel quel.
"""
import json, os, shutil, sys

ROOT = os.getcwd()
V2 = os.path.join(ROOT, 'v2')
if not os.path.isfile(os.path.join(V2, 'firebase.json')) or not os.path.isfile(os.path.join(ROOT, 'firebase.json')):
    sys.exit('À lancer depuis la racine du dépôt (dossier qui contient firebase.json et v2/).')

def read(p):
    return open(p, 'rb').read().decode('utf-8')

def write(p, s, like=None):
    crlf = like is not None and '\r\n' in like
    open(p, 'wb').write((s.replace('\r\n', '\n').replace('\n', '\r\n') if crlf else s).encode('utf-8'))

# 1. Fichiers du nouveau site
pages = sorted(f for f in os.listdir(V2) if f.endswith('.html'))
files = pages + ['favicon.ico', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml', 'sw.js']
for f in files:
    shutil.copy2(os.path.join(V2, f), os.path.join(ROOT, f))
for d in ['assets', 'admin']:
    dst = os.path.join(ROOT, d)
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(os.path.join(V2, d), dst)
print('Copié depuis v2/ :', ', '.join(files + ['assets/', 'admin/']))

# 2. Espace membre : rester l'application installable des membres (manifest-membre.json existant)
em = os.path.join(ROOT, 'espace-membre.html')
html = read(em)
if 'manifest-membre.json' not in html:
    tag = '<link rel="manifest" href="/manifest-membre.json">\n<link rel="apple-touch-icon" href="/apple-touch-icon-membre.png">\n'
    i = html.find('</head>')
    html = html[:i] + tag + html[i:]
    write(em, html, like=read(em))
    print('espace-membre.html : manifeste de l\'application membre ajouté')

# 3. firebase.json : hosting du nouveau site, adapté au site principal
root_cfg_raw = read(os.path.join(ROOT, 'firebase.json'))
root_cfg = json.loads(root_cfg_raw)
old_hosting = root_cfg['hosting']
h = json.loads(read(os.path.join(V2, 'firebase.json')))['hosting']
h.pop('site', None)                                   # site principal (tennismontargis.fr)
h['headers'] = [x for x in h.get('headers', []) if not any(k.get('key') == 'X-Robots-Tag' for k in x.get('headers', []))]
ignore = list(h.get('ignore', []))
for x in old_hosting.get('ignore', []) + ['v2/**', 'tools/**', 'src/**', 'docs/**', '.git/**', '**/.git/**', '.claude/**', '**/.*/**']:
    if x not in ignore:
        ignore.append(x)
h['ignore'] = ignore
if old_hosting.get('predeploy'):
    h = {'predeploy': old_hosting['predeploy'], **h}   # .min.js de l'ancien panneau admin
root_cfg['hosting'] = h
write(os.path.join(ROOT, 'firebase.json'), json.dumps(root_cfg, indent=2, ensure_ascii=False) + '\n', like=root_cfg_raw)
print('firebase.json : hosting du nouveau site (sans « site », sans noindex), build de l\'ancien panneau conservé')

# 4. Contrôles
missing = [f for f in ['verify.html', 'qr-accueil.html', 'admin-panel.html', 'admin.min.js', 'admin-auth.min.js',
                       'firebase-init.min.js', 'notifications.min.js', 'manifest-membre.json', 'style.css'] if not os.path.exists(os.path.join(ROOT, f))]
if missing:
    sys.exit('ATTENTION, fichiers de l\'ancien site manquants : ' + ', '.join(missing))
cfg = json.loads(read(os.path.join(ROOT, 'firebase.json')))
assert 'site' not in cfg['hosting'] and 'noindex' not in json.dumps(cfg['hosting'])
assert '.git/**' in cfg['hosting']['ignore'] and '**/.*/**' in cfg['hosting']['ignore']
assert any(r['source'] == '/v/**' for r in cfg['hosting']['rewrites'])
assert all(k in cfg for k in ('database', 'storage', 'functions'))
print('OK : assemblage prêt. Répétition :  firebase hosting:channel:deploy bascule --expires 7d')
