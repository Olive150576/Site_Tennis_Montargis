"""Assemble les pages du site à partir de src/partials et src/pages.
Usage : python3 tools/build_pages.py   (depuis la racine du site)
Chaque page commence par un commentaire JSON :
<!--{"title": "...", "description": "...", "nav": "club", "crumb": "Le club"}-->
"""
import json, os, re, glob, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_URL = 'https://tennismontargis.fr'
P = lambda *a: os.path.join(ROOT, *a)
read = lambda p: open(p, encoding='utf-8').read()

head, sprite, header, footer, court = (read(P('src/partials', f)) for f in ('head.html', 'sprite.svg', 'header.html', 'footer.html', 'court.html'))
# Retire d'éventuelles métadonnées ajoutées aux SVG par un outil de copie (ex. manifeste C2PA)
_clean = lambda t: re.sub(r'\s*xmlns:c2pa="[^"]*"', '', re.sub(r'<metadata>.*?</metadata>', '', t, flags=re.S))
sprite, court = _clean(sprite), _clean(court)
NAVS = ['home', 'club', 'cours', 'competition', 'agenda', 'tarifs', 'actus', 'partenaires', 'contact']

ORG = {
  "@context": "https://schema.org", "@type": "SportsClub", "@id": SITE_URL + "/#club",
  "name": "USM Tennis Montargis", "alternateName": "Tennis Club USM Montargis", "sport": "Tennis",
  "url": SITE_URL + "/", "logo": SITE_URL + "/assets/img/brand/icon-512.png", "image": SITE_URL + "/assets/img/club/og-image.jpg",
  "description": "Club de tennis affilié FFT à Montargis (Loiret) : 7 courts dont 2 couverts, terre battue, école de tennis, cours adultes, compétitions et Open USM.",
  "telephone": "+33238854430", "email": "usmmtennis@orange.fr",
  "address": {"@type": "PostalAddress", "streetAddress": "43 avenue Louis Maurice Chautemps", "postalCode": "45200", "addressLocality": "Montargis", "addressRegion": "Centre-Val de Loire", "addressCountry": "FR"},
  "geo": {"@type": "GeoCoordinates", "latitude": 48.0093981, "longitude": 2.7498615},
  "amenityFeature": [{"@type": "LocationFeatureSpecification", "name": n, "value": True} for n in ["Courts couverts", "Terre battue", "Béton poreux", "Club house", "Mur d'entraînement"]],
  "memberOf": {"@type": "SportsOrganization", "name": "Fédération Française de Tennis", "url": "https://www.fft.fr"},
  "sameAs": ["https://www.facebook.com/TennisClubUSMMontargis"]
}

def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False) + '</script>'

def build(src, base=''):
    raw = read(src)
    m = re.match(r'\s*<!--(\{.*?\})-->\s*', raw, re.S)
    meta = json.loads(m.group(1)) if m else {}
    body = raw[m.end():] if m else raw
    name = os.path.basename(src)
    canon = '' if name == 'index.html' else name.replace('.html', '')
    jsonld = []
    if meta.get('org'): jsonld.append(ld(ORG))
    if meta.get('crumb'):
        jsonld.append(ld({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Accueil", "item": SITE_URL + "/"},
            {"@type": "ListItem", "position": 2, "name": meta['crumb'], "item": SITE_URL + "/" + canon}]}))
    vals = {
        'base': base, 'title': meta.get('title', 'USM Tennis Montargis'), 'description': meta.get('description', ''),
        'ogTitle': meta.get('ogTitle', meta.get('title', '')), 'ogType': meta.get('ogType', 'website'),
        'siteUrl': SITE_URL, 'canon': canon, 'robots': meta.get('robots', 'index, follow'),
        'bodyClass': meta.get('bodyClass', ''), 'htmlattrs': meta.get('htmlattrs', ''),
        'preload': meta.get('preload', ''), 'jsonld': '\n'.join(jsonld),
    }
    for n in NAVS: vals['nav_' + n] = ' aria-current="page"' if meta.get('nav') == n else ''
    html = head + sprite + header + body.replace('{{court}}', court) + footer
    html = re.sub(r'\{\{(\w+)\}\}', lambda mm: str(vals.get(mm.group(1), mm.group(0))), html)
    open(P(name), 'w', encoding='utf-8').write(html)
    return name, meta

pages = []
for src in sorted(glob.glob(P('src/pages', '*.html'))):
    pages.append(build(src, '/' if src.endswith('404.html') else ''))

# Page d'administration
open(P('admin', 'index.html'), 'w', encoding='utf-8').write(read(P('src', 'admin.html')).replace('{{sprite}}', sprite))

# Registre des textes modifiables (data-text) pour l'admin
PAGE_NAMES = {'index.html': 'Accueil', 'le-club.html': 'Le club', 'ecole-de-tennis.html': 'Cours & école', 'competition.html': 'Compétition',
              'agenda.html': 'Agenda', 'tarifs.html': 'Tarifs', 'actualites.html': 'Actualités', 'partenaires.html': 'Partenaires', 'contact.html': 'Contact'}
reg, seen = [], set()
for src in sorted(glob.glob(P('src/pages', '*.html')), key=lambda f: list(PAGE_NAMES).index(os.path.basename(f)) if os.path.basename(f) in PAGE_NAMES else 99):
    name = os.path.basename(src)
    for m in re.finditer(r'<(h1|h2|p)\b[^>]*data-text="([^"]+)"[^>]*>(.*?)</\1>', read(src), re.S):
        tag, key, inner = m.groups()
        if key in seen: continue
        seen.add(key)
        txt = re.sub(r'<em>(.*?)</em>', r'*\1*', inner)
        txt = re.sub(r'<[^>]+>', '', txt).replace('&amp;', '&').replace('&#39;', "'").strip()
        sec = {'hero': 'En-tête de page', 'paths': 'Section « Pour qui ? »', 'facilities': 'Section Installations', 'cta': 'Bandeau d\'appel final', 'spirit': 'Section « Notre esprit »', 'reviews': 'Section Avis', 'ask': 'Section « Une question ? »', 'packs': 'Section Offres'}.get(key.split('.')[1], key.split('.')[1])
        lab = sec + ' — ' + ('titre' if tag != 'p' else 'texte')
        reg.append({'key': key, 'page': PAGE_NAMES.get(name, name), 'label': lab, 'def': txt, 'long': tag == 'p'})
open(P('assets/js/texts-registry.js'), 'w', encoding='utf-8').write('/* Généré par tools/build_pages.py : textes modifiables depuis l\'admin */\nwindow.USM_TEXTS = ' + json.dumps(reg, ensure_ascii=False, indent=1) + ';\n')

today = datetime.date.today().isoformat()
urls = [(n, m) for n, m in pages if 'noindex' not in m.get('robots', '') and n != '404.html']
prio = {'index.html': '1.0', 'tarifs.html': '0.9', 'ecole-de-tennis.html': '0.9', 'le-club.html': '0.8', 'contact.html': '0.8'}
sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for n, m in urls:
    loc = SITE_URL + '/' + ('' if n == 'index.html' else n.replace('.html', ''))
    sm.append(f'  <url><loc>{loc}</loc><lastmod>{today}</lastmod><priority>{prio.get(n, "0.6")}</priority></url>')
sm.append('</urlset>')
open(P('sitemap.xml'), 'w').write('\n'.join(sm) + '\n')
print('Pages :', ', '.join(n for n, _ in pages))
