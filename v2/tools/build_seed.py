# Convertit les données publiques du site actuel (Firebase) en contenu "seed" du nouveau site.
import json, re, unicodedata, hashlib, datetime, sys
S = sys.argv[1]
OUT = sys.argv[2]
imgmap = json.load(open(f'{S}/img_local.json'))

def load(p):
    d = json.load(open(f'{S}/db_{p}.json'))
    items = d.items() if isinstance(d, dict) else enumerate(d)
    return [(str(k), v) for k, v in items if v]

def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s[:70].strip('-')

def iso(d):
    try:
        dd, mm, yy = d.split('/')
        return f'{yy}-{mm}-{dd}'
    except Exception:
        return None

def clean_body(t):
    t = t or ''
    t = re.sub(r'<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', lambda m: f'[{re.sub("[<>]","",m.group(2)).strip() or "lien"}]({m.group(1)})', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = t.replace('​', '')
    t = re.sub(r'\n{3,}', '\n\n', t).strip()
    return t

EMOJI = re.compile('[\U0001F000-\U0001FFFF☀-➿️‍]+')
def excerpt(t, n=170):
    t = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', t)
    t = EMOJI.sub('', t)
    t = re.sub(r'\s+', ' ', t).strip()
    if len(t) <= n: return t
    return t[:n].rsplit(' ', 1)[0].rstrip(',;:—-') + '…'

def imgs(v, alt):
    out = []
    for u in (v.get('images') or []):
        if u in imgmap:
            i = imgmap[u]
            out.append({'src': i['src'], 'sm': i['sm'], 'alt': alt, 'w': i['w'], 'h': i['h']})
    return out

TITLES = {
 '56': "30 octobre : soirée raclette au club house",
 '48': "10 octobre : après-midi test Dunlop et découverte du pickleball",
 '47': "Championnat +35 : deux équipes sur le pont",
 '45': "Saison 2026-2027 : les permanences d'inscription",
 '43': "Fête des associations : retrouvez-nous au stand n°8",
 '44': "Portes ouvertes du 1er au 12 septembre : venez essayer gratuitement",
 '42': "Canicule : stages annulés lundi et mercredi",
 '41': "Retour en images sur la grande fête du club",
 '46': "Inscriptions 2026-2027 : c'est parti",
 '40': "Stages multisports des vacances de juillet",
 '39': "La grande fête de l'école de tennis, c'est bientôt",
 '35': "Rendez-vous à la Fête du Lac des Closiers",
 '37': "Initiation tennis au Lac des Closiers",
 '34': "Championnat d'été : les résultats de la 3e journée",
 '33': "Championnat d'été : les résultats de la 2e journée",
 '38': "44e Open USM Tennis Montargis : du 3 au 21 juin",
 '32': "Championnat d'été : les résultats de la 1re journée",
 '31': "C'est parti pour le championnat d'été par équipes 2026",
 '30': "Les courts en terre battue sont ouverts",
 '29': "Finale du tournoi du Tennis Club de Châlette",
 '28': "TMC 13/14 ans : une belle bataille sur les courts",
 '27': "Nos Dames 60+ championnes !",
 '26': "Nos jeunes à l'honneur pendant les vacances",
 '25': "TMC Vert 12/13 ans à Montargis",
 '24': "TMC 30/4 à 30/1 : le palmarès",
 '23': "Les courts de terre battue se refont une beauté",
 '36': "Le Pass Été est de retour : jouez de mai à août",
 '22': "Retour sur le TMC 15/3 – 15/1",
 '21': "TMC 30/4 à 30/1 messieurs les 11 et 12 avril",
 '20': "Championnat Dames 60+ : la 5e journée",
 '19': "TMC 15/3 – 15/1 à Montargis",
 '18': "Championnat 13/14 ans garçons : 3e journée",
 '17': "Championnat +60 ans Dames : victoire de l'Entente en 4e journée",
 '16': "Championnat +60 ans Dames : l'Entente prend la tête",
 '15': "Championnat +60 ans Dames : victoire en 2e journée",
 '14': "Coup d'envoi du championnat par équipes +60 ans Dames",
 '13': "Tournoi Fast4 du 27 février : résultats et photos",
 '12': "Le radar de service est opérationnel",
 '11': "TMC 11/12 et 13/14 ans",
 '9':  "Championnat d'hiver : résultats de la 5e journée",
 '10': "Tournoi Fast4 le vendredi 27 février dès 18 h",
 '7':  "Championnat d'hiver : résultats de la 4e journée",
 '5':  "Championnat d'hiver : résultats de la 2e journée",
 '6':  "Championnat d'hiver : résultats de la 3e journée",
 '8':  "Le tournoi interne est lancé",
 '4':  "Championnat d'hiver : résultats de la 1re journée",
 '3':  "Championnat départemental d'hiver seniors messieurs 2026",
 '2':  "Résultats du tournoi J3 de Tennis Amilly",
 '1':  "Trophées des sports : deux licenciés récompensés",
 '0':  "Le Père Noël à l'école de tennis",
}
CATS = {
 'competition': ['championnat','tmc','tournoi','open','résultat','finale','fast4','champ','60','+35','j3','radar'],
 'ecole': ['stage','école','jeunes','initiation','père noël','fête de l'],
 'partenaires': ['dunlop'],
}
def cat(title, body):
    t = (title).lower()
    if 'dunlop' in t: return 'evenement'
    if any(w in t for w in ['stage', 'école', 'jeunes', 'initiation', 'père noël']): return 'ecole'
    if any(w in t for w in ['championnat','tmc','tournoi','open','résultat','finale','fast4','champion','radar','trophées']): return 'competition'
    return 'vie-du-club'

news = []
for k, v in load('news'):
    title = TITLES.get(k, EMOJI.sub('', v.get('title', '')).strip())
    body = clean_body(v.get('desc'))
    news.append({
        'id': 'n' + k, 'slug': slugify(title), 'title': title,
        'date': iso(v.get('date')) or '2026-01-01',
        'category': cat(title, body),
        'excerpt': excerpt(body), 'body': body,
        'images': imgs(v, title),
        'featured': bool(v.get('featured')), 'draft': bool(v.get('draft')),
        'createdAt': v.get('createdAt') or 0,
    })
news.sort(key=lambda n: (n['date'], n['createdAt']), reverse=True)
# une seule "à la une" : la plus récente marquée
seen = False
for n in news:
    if n['featured'] and not seen: seen = True
    elif n['featured']: n['featured'] = False

ev_raw = {k: v for k, v in load('event')}
def evimgs(k, alt): return imgs(ev_raw[k], alt)
events = [
 {'id':'e-raclette-2026','slug':'soiree-raclette-2026','title':"Soirée raclette",'category':'animation',
  'dateStart':'2026-10-30','dateEnd':'','time':'19 h 30','location':'Club house','recurring':False,
  'summary':"Repas convivial entre membres, parents et amis : 10 € par personne, boissons incluses. Billard et fléchettes. Inscription avant le 28 octobre.",
  'body':clean_body(dict(load('news'))['56']['desc']),'images':imgs(dict(load('news'))['56'],'Soirée raclette au club house'),'link':'','featured':True,'draft':False},
 {'id':'e-dunlop-2026','slug':'apres-midi-dunlop-pickleball','title':"Après-midi test Dunlop & découverte pickleball",'category':'animation',
  'dateStart':'2026-10-10','dateEnd':'','time':'14 h – 17 h','location':'Au club','recurring':False,
  'summary':"Essayez raquettes et balles Dunlop avec des experts (réservé aux membres) et découvrez le pickleball, ouvert à toutes et tous.",
  'body':clean_body(dict(load('news'))['48']['desc']),'images':imgs(dict(load('news'))['48'],'Après-midi Dunlop'),'link':'','featured':False,'draft':False},
 {'id':'e-plus35-2026','slug':'championnat-plus-35-2026','title':"Championnat +35 par équipes",'category':'competition',
  'dateStart':'2026-09-27','dateEnd':'2026-10-31','time':'Week-ends','location':'Domicile & extérieur','recurring':False,
  'summary':"Deux équipes USM engagées. Venez encourager l'Équipe 1 et l'Équipe 2 lors des rencontres à domicile.",
  'body':clean_body(dict(load('news'))['47']['desc']),'images':imgs(dict(load('news'))['47'],'Championnat +35'),'link':'https://tenup.fft.fr/club/53450084/competitions','featured':False,'draft':False},
 {'id':'e-open','slug':'open-usm-montargis','title':"Open USM Montargis",'category':'tournoi',
  'dateStart':'','dateEnd':'','when':'Chaque année en juin','time':'','location':'Finales sur terre battue','recurring':True,
  'summary':"Le grand tournoi de l'agglomération depuis plus de 40 ans : 1 500 € de dotation, simples messieurs et dames, +35, +45, +55.",
  'body':clean_body(ev_raw['3']['desc']),'images':evimgs('3',"Open USM Montargis"),'link':'','featured':True,'draft':False},
 {'id':'e-doubles','slug':'tournoi-de-doubles','title':"Tournoi de doubles",'category':'tournoi',
  'dateStart':'','dateEnd':'','when':"Chaque été, après l'Open",'time':'','location':'Bouquet final sur terre battue','recurring':True,
  'summary':"Tactique, complicité et plaisir de gagner à deux : le rendez-vous d'été des amateurs de volées.",
  'body':clean_body(ev_raw['1']['desc']),'images':evimgs('1',"Tournoi de doubles"),'link':'','featured':False,'draft':False},
 {'id':'e-interne','slug':'tournoi-interne','title':"Tournoi interne",'category':'tournoi',
  'dateStart':'','dateEnd':'','when':'De janvier à juillet','time':'','location':'Au club','recurring':True,
  'summary':"Deux tableaux (Club NC à 30/1, Élite 30 à N1), des matchs programmés librement entre membres : l'âme du club.",
  'body':clean_body(ev_raw['2']['desc']),'images':evimgs('2',"Tournoi interne"),'link':'','featured':False,'draft':False},
 {'id':'e-fast4','slug':'tournoi-fast4','title':"Tournoi Fast4",'category':'tournoi',
  'dateStart':'','dateEnd':'','when':'En soirée, en cours de saison','time':'','location':'Au club','recurring':True,
  'summary':"Sets en 4 jeux, point décisif à 40-40 : un format court, intense et spectaculaire, avec concours de service au radar.",
  'body':clean_body(ev_raw['0']['desc']),'images':evimgs('0',"Tournoi Fast4"),'link':'','featured':False,'draft':False},
 {'id':'e-tmc','slug':'tmc-jeunes-et-adultes','title':"TMC jeunes et adultes",'category':'tournoi',
  'dateStart':'','dateEnd':'','when':'Pendant les vacances scolaires','time':'','location':'Au club','recurring':True,
  'summary':"Tournois multi-chances homologués : plusieurs matchs garantis sur un week-end, pour jeunes et adultes classés.",
  'body':"Les tournois multi-chances (TMC) garantissent plusieurs matchs à chaque joueur sur un ou deux jours. L'USM en organise régulièrement pour les jeunes (Orange, Vert, 11/12, 13/14 ans) et pour les adultes classés (15/3 à 15/1, 30/4 à 30/1). Inscriptions via Ten'Up.",
  'images':[],'link':'https://tenup.fft.fr/club/53450084/competitions','featured':False,'draft':False},
 {'id':'e-fete','slug':'fete-de-l-ecole-de-tennis','title':"Fête de l'école de tennis",'category':'animation',
  'dateStart':'','dateEnd':'','when':'Fin de saison, début juillet','time':'','location':'Au club','recurring':True,
  'summary':"Tennis, jeux, multisports et grand goûter partagé pour clôturer la saison de l'école de tennis.",
  'body':"L'école de tennis clôture chaque saison par un après-midi festif : tennis, foot, badminton, baby-foot et grand goûter partagé. Les copains et copines sont les bienvenus pour découvrir le tennis !",
  'images':[],'link':'','featured':False,'draft':False},
]
# fill images for TMC & fête from news
nd = dict(load('news'))
EV = {e['id']: e for e in events}
EV['e-tmc']['images'] = imgs(nd['26'], 'TMC jeunes')[:2]
for e in events:  # le club compte 7 courts (2 terre battue, 3 béton poreux, 2 couverts)
    e['body'] = e['body'].replace('nos 9 courts', 'nos 7 courts')
EV['e-fete']['images'] = imgs(nd['41'], "Fête de l'école de tennis")[:3]

def price_num(p):
    m = re.search(r'(\d+)', p or ''); return int(m.group(1)) if m else None
def feats(desc):
    return [re.sub(r'^\[✔\]\s*', '', l).strip() for l in (desc or '').split('\n') if l.strip().startswith('[✔]')]
R = {k: v for k, v in load('rates')}
def rate(k, cat, code, title, order, featured=False, licence=None, note='', features=None):
    v = R[k]
    f = features or feats(v['desc'])
    desc = '' if f else v['desc'].strip()
    return {'id': 'r-' + code.lower(), 'code': code, 'title': title, 'category': cat, 'price': price_num(v['price']),
            'unit': '/ saison' if cat in ('adultes','jeunes') else ('/ heure' if cat=='cours' else ''),
            'licence': licence, 'features': f, 'desc': desc, 'featured': featured, 'order': order, 'note': note, 'draft': False}
JF = lambda h: ['Licence incluse', 'Accès aux courts extérieurs et couverts', f'{h} de cours collectif par semaine', '3 invitations offertes', 'De 5 à 18 ans']
rates = [
 rate('6','adultes','ATEX','Extérieur',1,licence='Licence adulte incluse (33 €)'),
 rate('0','adultes','AT1','Jeu libre toutes saisons',2,featured=True,licence='Licence adulte incluse (33 €)'),
 rate('7','adultes','ATC1','Jeu libre + 1 h 30 de cours',3,licence='Licence adulte incluse (33 €)'),
 rate('8','adultes','ATC2','Jeu libre + 3 h de cours',4,licence='Licence adulte incluse (33 €)'),
 rate('2','jeunes','B45','Baby tennis',1,licence='Licence incluse (4 €)'),
 # Codes jeunes (confirmés par le club) : JTC = Jeune Terrain Cours — JTC1 = 1 h, JTC2 = 1 h 30, JTC3 = 3 h de cours / semaine
 rate('9','jeunes','JTC1','Jeunes 1 h de cours',2,featured=True,licence='Licence jeune incluse (23 €)',features=JF('1 h')),
 rate('10','jeunes','JTC2','Jeunes 1 h 30 de cours',3,licence='Licence jeune incluse (23 €)',features=JF('1 h 30')),
 rate('11','jeunes','JTC3','Jeunes 3 h de cours',4,licence='Licence jeune incluse (23 €)',features=JF('3 h')),
 rate('3','licences','LIC-A','Licence adulte',1),
 rate('4','licences','LIC-J','Licence jeune',2),
 rate('5','licences','LIC-D','Licence découverte',3),
 rate('12','cours','COURS-IND','Cours individuel',1),
]
rates[9-1]['desc'] = R['3']['desc'].strip()
rates[4]['features'] = ['Licence incluse', 'Découverte ludique du tennis', '45 min de cours collectif par semaine']
pass_ete = [(1,30),(2,50),(3,60),(4,80)]
rates.append({'id':'r-pass-ete','code':'PASS-ETE','title':'Pass Été','category':'ete','price':30,'unit':'/ mois',
  'licence':None,'features':['1 mois : 30 €','2 mois : 50 €','3 mois : 60 €','4 mois : 80 €'],
  'desc':"De mai à août, jouez à votre rythme sans vous engager sur l'année : idéal pour les vacanciers, étudiants et curieux.",'featured':False,'order':1,'note':'De mai à août','draft':False})
rates.append({'id':'r-stage','code':'STAGE','title':'Stages vacances','category':'ete','price':10,'unit':'/ demi-journée',
  'licence':None,'features':['10 € la demi-journée','15 € la journée','Tennis le matin, multisports l\'après-midi'],
  'desc':"Pendant les vacances scolaires, stages ouverts aux jeunes, à la demi-journée ou à la journée.",'featured':False,'order':2,'note':'Vacances scolaires','draft':False})
for r in rates:
    if r['category']=='licences': r['features']=[]

C = {k: v for k, v in load('coach')}
team = [
 {'id':'t-cedric','name':'Cédric Chenot','role':'Enseignant, responsable de l\'école de tennis','group':'coach','ranking':'4/6',
  'bio':"Diplômé, classé 4/6, Cédric encadre l'école de tennis, les groupes adultes et les stages. Il vous oriente vers le groupe adapté à votre niveau et à vos disponibilités.",
  'quote':"Le club le plus accessible et polyvalent, idéal pour les familles, joueurs loisirs et pratiquants souhaitant progresser à leur rythme.",
  'photo':(imgs(C['0'],'Cédric Chenot') or [None])[0],'phone':'06 77 40 26 52','email':'cedric45tennis@hotmail.fr','order':1},
 {'id':'t-patricia','name':'Patricia Bille','role':'Présidente','group':'bureau','ranking':'','bio':'','quote':'','photo':None,'phone':'06 76 88 23 33','email':'','order':1},
 {'id':'t-arnaud','name':'Arnaud Legrand','role':'Secrétaire','group':'bureau','ranking':'','bio':'','quote':'','photo':None,'phone':'','email':'','order':2},
 {'id':'t-patrice','name':'Patrice Manetti','role':'Trésorier','group':'bureau','ranking':'','bio':'','quote':'','photo':None,'phone':'','email':'','order':3},
 {'id':'t-sophie','name':'Sophie Duval','role':'Trésorière adjointe','group':'bureau','ranking':'','bio':'','quote':'','photo':None,'phone':'','email':'','order':4},
 {'id':'t-olivier','name':'Olivier Decamp','role':'Communication et réseaux','group':'bureau','ranking':'','bio':'','quote':'','photo':None,'phone':'','email':'','order':5},
]
slots = []
def slot(aud, day, s, e, label=''):
    slots.append({'id': f's-{aud}-{day}-{s.replace(":","")}', 'audience': aud, 'day': day, 'start': s, 'end': e, 'label': label})
slot('jeunes',3,'10:00','11:00','École de tennis'); slot('jeunes',3,'13:30','18:00','École de tennis')
for d,s,e in [(1,'15:30','21:00'),(2,'17:45','20:15'),(3,'18:00','19:30'),(4,'17:30','20:30'),(5,'16:30','19:30'),(6,'08:30','11:00')]:
    slot('adultes',d,s,e,'Cours collectifs adultes')

I = {k: v for k, v in load('inst')}
def CLUB(name, alt):
    from PIL import Image as _Img
    import os as _os
    b = 'assets/img/club/' + name
    w, h = _Img.open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', b + '.webp')).size
    return {'src': b + '.webp', 'md': b + '-md.webp', 'sm': b + '-sm.webp', 'alt': alt, 'w': w, 'h': h}
facilities = [
 {'id':'f-terre','title':'Terre battue','surface':'terre-battue','count':'2 courts','desc':"Nos deux courts en terre battue, remis en état chaque printemps, accueillent les phases finales de l'Open. Ouverts d'avril à l'automne selon la météo.",
  'images':[CLUB('terre-battue',"Les deux courts en terre battue du club, au pied des sapins"),
            CLUB('terre-battue-drone',"Vue du ciel d'un court en terre battue du club, bordé de grands arbres")] + [x for x in imgs(I['0'],'Court en terre battue') if 'b73cf30e71' in x['src']],'order':1},
 {'id':'f-couverts','title':'Courts couverts','surface':'couvert','count':'2 courts','desc':"Deux courts en intérieur, éclairés, pour jouer toute l'année quelle que soit la météo.",
  'images':[{'src':'assets/img/club/court-couvert.webp','sm':'assets/img/club/court-couvert-sm.webp','alt':'Court couvert éclairé du club','w':1200,'h':900}] + imgs(I['1'],'Courts couverts')[:2],'order':2},
 {'id':'f-exterieurs','title':'Béton poreux','surface':'beton-poreux','count':'3 courts','desc':"Trois courts extérieurs en béton poreux au milieu des arbres, praticables rapidement après la pluie.",
  'images':[CLUB('beton-poreux',"Deux courts en béton poreux vus du ciel"),
            CLUB('courts-dunlop',"Courts en béton poreux bordés des bâches Dunlop"),
            CLUB('vue-ensemble',"Vue aérienne de l'ensemble des courts extérieurs du club, en pleine forêt")],'order':3},
 {'id':'f-clubhouse','title':'Club house','surface':'club-house','count':'Terrasse ombragée','desc':"Un club house convivial avec terrasse fleurie face aux courts : le point de rendez-vous avant et après les matchs.",
  'images':[CLUB('clubhouse',"Le club house et sa terrasse fleurie"),
            CLUB('clubhouse-terrasse',"Le club house, sa terrasse et les courts vus du ciel"),
            CLUB('clubhouse-arbres',"Bancs à l'ombre des grands arbres, devant un court")],'order':4},
 {'id':'f-mur','title':"Mur d'entraînement",'surface':'mur','count':'Accès libre membres','desc':"Peint avec la hauteur du filet et des cibles de précision : idéal pour s'échauffer, travailler sa régularité ou jouer seul.",
  'images':[CLUB('mur-entrainement',"Le mur d'entraînement, avec la hauteur du filet et des cibles peintes, devant un petit terrain"),
            CLUB('mur-entrainement-2',"Le mur d'entraînement et son aire de jeu, à l'ombre des grands arbres")],'order':5},
]

SP = {k: v for k, v in load('sponsors')}
def logo(k):
    x = imgs(SP[k], SP[k]['title'].strip())
    return x[0] if x else None
sponsors = [
 {'id':'p-leclerc','name':'E.Leclerc Montargis','desc':'Hypermarché','url':'https://www.e.leclerc/mag/e-leclerc-montargis','logo':logo('2'),'tier':'officiel','perk':'Offres à venir','order':1},
 {'id':'p-intersport','name':'Intersport Amilly','desc':'Magasin de sport','url':'https://www.intersport.fr/Loiret-45/AMILLY-45200/INTERSPORT-AMILLY/00554_000/','logo':logo('1'),'tier':'officiel','perk':'Offres à venir','order':2},
 {'id':'p-moure','name':'Moure Immobilier','desc':'Agence immobilière','url':'https://www.moure.fr/','logo':logo('0'),'tier':'officiel','perk':'Offres à venir','order':3},
 {'id':'p-dunlop','name':'Dunlop','desc':"Balles officielles de l'Open USM",'url':'','logo':{'src':'assets/img/content/sponsors_dunlop.webp','sm':'assets/img/content/sponsors_dunlop.webp','alt':'Dunlop Sport','w':416,'h':277},'tier':'equipement','perk':'','order':4},
 {'id':'p-usm','name':'USM Montargis','desc':'Union Sportive Montargoise, club omnisports','url':'https://usmmontargis.fr/wp/','logo':logo('3'),'tier':'institution','perk':'','order':5},
]
packs = [
 {'id':'k-club','name':'Partenaire Club','price':'200 €','period':'par saison','highlight':False,'features':["Logo sur la page Partenaires et le bandeau du site","Une publication de bienvenue sur Facebook","Affiche au club house","Vos offres relayées aux membres"]},
 {'id':'k-court','name':'Partenaire Court','price':'500 €','period':'par saison','highlight':True,'features':["Tout le pack Club","Bâche à vos couleurs sur un court","Publication de début d'année présentant votre commerce","Publication de remerciements en fin d'année","Visibilité sur le tournoi interne et les TMC"]},
 {'id':'k-open','name':'Partenaire Open USM','price':'800 €','period':'par saison','highlight':False,'features':["Tout le pack Court","Logo sur les affiches et supports de l'Open","Présence à la remise des prix","Stand ou animation pendant le tournoi"]},
]
D = {k: v for k, v in load('documents')}
documents = [
 {'id':'d-inscription','name':"Formulaire d'inscription 2026-2027",'url':D['2']['url'],'size':D['2']['size'],'category':'inscription'},
 {'id':'d-sante-adulte','name':'Questionnaire santé adulte','url':D['0']['url'],'size':D['0']['size'],'category':'sante'},
 {'id':'d-sante-mineur','name':'Questionnaire santé mineur','url':D['1']['url'],'size':D['1']['size'],'category':'sante'},
]
gallery = []
for n, alt in [('vue-ensemble', "Vue aérienne de l'ensemble des courts extérieurs du club"), ('terre-battue', "Les deux courts en terre battue"),
               ('clubhouse', "Le club house et sa terrasse fleurie"), ('courts-dunlop', "Courts en béton poreux bordés des bâches Dunlop"),
               ('plan-club', "Le club vu du ciel : courts, halle couverte et club house au milieu des arbres"), ('terre-battue-drone', "Court en terre battue vu du ciel"),
               ('clubhouse-arbres', "Bancs à l'ombre des grands arbres"), ('beton-poreux', "Deux courts en béton poreux vus du ciel"),
               ('mur-entrainement', "Le mur d'entraînement, avec la hauteur du filet et des cibles peintes")]:
    im = CLUB(n, alt); gallery.append({'id': 'g-' + n, **im})
for nid in ['41','26','23','13','20','32','24','30','34']:
    for im in imgs(nd[nid], TITLES[nid])[:3]:
        gallery.append({'id':'g'+hashlib.md5(im['src'].encode()).hexdigest()[:8], **im})
faq = [
 ("Puis-je essayer avant de m'inscrire ?", "Oui. Contactez-nous pour réserver une séance d'essai avec notre enseignant. La licence Découverte (4 €) permet aussi de goûter à la pratique en club avec l'assurance fédérale, sans engagement sur la saison."),
 ("Comment réserver un court ?", "Les membres réservent en ligne sur Ten'Up, le site et l'application de la Fédération Française de Tennis, avec leurs identifiants de licencié. Depuis le 13 septembre, une carte d'accès est nécessaire pour entrer sur le site."),
 ("Quels documents faut-il pour s'inscrire ?", "Le formulaire d'inscription de la saison et le questionnaire de santé (adulte ou mineur), à télécharger sur la page Tarifs. Rapportez-les au club ou envoyez-les par e-mail."),
 ("À partir de quel âge peut-on jouer ?", "Le baby tennis accueille les plus petits avec 45 minutes de découverte ludique par semaine. Les formules Jeunes s'adressent ensuite aux 5-18 ans, avec 1 h à 3 h de cours collectif par semaine."),
 ("Peut-on jouer l'hiver ?", "Oui : le club dispose de 2 courts couverts et éclairés. Si vous ne jouez qu'aux beaux jours, la formule Extérieur (ATEX) est la plus économique."),
 ("Puis-je inviter un ami à jouer ?", "Chaque formule adhérent comprend 3 invitations offertes pour partager un match avec un proche non licencié."),
 ("La licence FFT, à quoi sert-elle ?", "Elle vous assure pendant la pratique et vous permet de participer aux compétitions, tournois et animations fédérales. Elle est incluse dans toutes nos formules. La saison sportive court du 1er septembre au 31 août."),
]
faq = [{'id': f'q{i+1}', 'q': q, 'a': a, 'order': i+1} for i, (q, a) in enumerate(faq)]

# Avis Google réels (fiche « Tennis Club Montargis », relevés le 23/09/2026, tri « les plus favorables »).
# Texte d'origine, seules l'orthographe et la ponctuation ont été retouchées.
reviews = [
 ('Ruby N.', 5, "Mon fils fait du tennis là-bas depuis un an. Il l'adore. L'air est frais puisque c'est en face de la forêt.", 'ecole', '2023', False),
 ('Michel E.', 5, "Le seul club à avoir des terres battues véritables sur l'agglomération.", 'club', '2018', False),
 ('Sandrine F.', 5, "Très bon accueil, et endroit très sympathique !", 'club', '2021', False),
 ('Josué R.', 5, "Ma fille fait du tennis là-bas, ils sont cool.", 'ecole', '2019', False),
 ('Christophe B.', 5, "Accueillant, propre, verdoyant.", 'club', '2021', False),
 ('Barry A.', 5, "Super, je le recommande.", 'club', '2020', False),
 ('Sylvia M.', 5, "Agréable et en forêt.", 'club', '2022', True),
 ('Davdav', 5, "Beau complexe.", 'club', '2026', True),
 ('Moustapha S.', 5, "Très bonne équipe U16.", 'competition', '2018', True),
]
reviews = [{'id': f'r{i+1}', 'author': a, 'rating': str(r), 'text': t, 'topic': tp, 'when': w, 'source': 'Google', 'draft': d, 'order': i+1}
           for i, (a, r, t, tp, w, d) in enumerate(reviews)]
GMAPS_REVIEWS = 'https://www.google.com/maps/place/Tennis+Club+Montargis/@48.0093945,2.7524364,17z/data=!4m8!3m7!1s0x47ef8063cddb324d:0x605c082e82fa2f2e!8m2!3d48.0093945!4d2.7524364!9m1!1b1!16s%2Fg%2F11ddxv6y1l'

settings = {
 'clubName':'USM Tennis Montargis','shortName':'USM Tennis','season':'2026-2027','fftNumber':'53450084',
 'address':'43 avenue Louis Maurice Chautemps','zip':'45200','city':'Montargis','region':'Centre-Val de Loire',
 'phone':'02 38 85 44 30','email':'usmmtennis@orange.fr','geo':{'lat':48.0093981,'lng':2.7498615},
 'hours':[{'days':'Lundi – vendredi','open':'17:00','close':'20:00'}],
 'links':{'tenup':'https://tenup.fft.fr/club/53450084','competitions':'https://tenup.fft.fr/club/53450084/competitions','espaceMembre':'espace-membre.html',
          'facebook':'https://www.facebook.com/TennisClubUSMMontargis','instagram':'','whatsapp':'','whatsappContact':'','fft':'https://www.fft.fr','ligue':'https://www.lfrm-tennis.fr/ligue/centre-val-de-Loire'},
 'sticker':{'enabled':True,'top':'Saison','text':'Inscriptions ouvertes','link':'tarifs.html'},
 'announcement':{'enabled':True,'text':"30 octobre : soirée raclette au club house, inscription avant le 28",'link':'agenda.html#e-raclette-2026'},
 'stats':[{'value':'150+','label':'licenciés'},{'value':'7','label':'courts dont 2 couverts'},{'value':'44','label':"éditions de l'Open USM"},{'value':'7j/7','label':"ouvert toute l'année"}],
 'seo':{'title':'USM Tennis Montargis – Club de tennis à Montargis (45)','description':"Club de tennis affilié FFT à Montargis : 7 courts dont 2 couverts et de la terre battue, école de tennis dès le baby tennis, cours adultes, compétitions et l'Open USM."},
 'weather':True,
 'showTeams':True, 'showShop':False,
 'reviews':{'rating':'4,3','count':'35','url':GMAPS_REVIEWS,'writeUrl':'https://g.page/r/CS4v-oIuCFxgEAE/review'},
}

# Boutique : 3 produits d'EXEMPLE (demo=True). En mode aperçu, leurs dates sont recalées
# sur la date du jour (_demo) pour que la démo reste vivante ; ils ne sont jamais lus en
# mode Firebase et sont exclus de l'export « Format d'import Firebase ».
def day(n): return (datetime.date.today() + datetime.timedelta(days=n)).isoformat()
def SHOPIMG(name, alt): return {'src': f'assets/img/boutique/{name}.svg', 'alt': alt, 'w': 800, 'h': 800}
shop = [
 {'id':'sp-veste','demo':True,'name':'Veste de survêtement USM',
  'desc':"Veste zippée bleu royal, bandes jaune balle sur les manches, logo du club brodé sur le cœur.\nMatière : polyester recyclé léger et respirant, deux poches zippées.\nCoupe : ajustée. Prenez votre taille habituelle, une taille au-dessus pour porter un sweat dessous.\nEntretien : lavage à 30 °C, pas de sèche-linge.",
  'images':[SHOPIMG('veste-face','Veste USM bleu royal, vue de face'), SHOPIMG('veste-dos','Veste USM vue de dos, avec un prénom floqué')],
  'priceMember':39,'pricePublic':55,'sizes':['10 ans','12 ans','14 ans','XS','S','M','L','XL','XXL','3XL'],'colors':['Bleu royal'],
  'minQty':25,'minMode':'total','maxPerMember':3,'deadline':day(5),'deliveryDate':day(40),'marking':True,'markingPrice':5,
  'sizeGuide':None,'sizeGuideText':"Taille | Tour de poitrine | Longueur dos\n10 ans | 70-74 cm | 54 cm\n12 ans | 74-80 cm | 58 cm\n14 ans | 80-86 cm | 62 cm\nXS | 84-88 cm | 66 cm\nS | 88-96 cm | 68 cm\nM | 96-104 cm | 71 cm\nL | 104-112 cm | 73 cm\nXL | 112-120 cm | 75 cm\nXXL | 120-128 cm | 77 cm\n3XL | 128-136 cm | 79 cm",
  'partner':'p-intersport','payUrl':'https://www.helloasso.com/','supplier':'Fournisseur (exemple)','supplierRef':'VST-USM-26',
  'status':'ouverte','draft':False,'order':1,'_demo':{'deadline':5,'delivery':40}},
 {'id':'sp-tshirt','demo':True,'name':'T-shirt technique USM',
  'desc':"Le t-shirt des matchs par équipes et des tournois, en trois couleurs.\nMatière : maille technique qui sèche vite, coutures plates.\nCoupe : droite, tailles enfant du 6 au 14 ans.\nEntretien : lavage à 30 °C sur l'envers.",
  'images':[SHOPIMG('tshirt-bleu','T-shirt USM bleu royal'), SHOPIMG('tshirt-blanc','T-shirt USM blanc'), SHOPIMG('tshirt-jaune','T-shirt USM jaune balle')],
  'priceMember':15,'pricePublic':22,'sizes':['6 ans','8 ans','10 ans','12 ans','14 ans','XS','S','M','L','XL','XXL'],'colors':['Bleu royal','Blanc','Jaune balle'],
  'minQty':30,'minMode':'total','maxPerMember':5,'deadline':day(18),'deliveryDate':day(45),'marking':True,'markingPrice':3,
  'sizeGuide':None,'sizeGuideText':"Taille | Tour de poitrine\n6 ans | 60-64 cm\n8 ans | 64-68 cm\n10 ans | 68-74 cm\n12 ans | 74-80 cm\n14 ans | 80-86 cm\nXS | 84-88 cm\nS | 88-96 cm\nM | 96-104 cm\nL | 104-112 cm\nXL | 112-120 cm\nXXL | 120-128 cm",
  'partner':'','payUrl':'','supplier':'Fournisseur (exemple)','supplierRef':'TS-TECH-USM',
  'status':'ouverte','draft':False,'order':2,'_demo':{'deadline':18,'delivery':45}},
 {'id':'sp-casquette','demo':True,'name':'Casquette USM',
  'desc':"Casquette en coton, balle brodée en relief, réglable à l'arrière.\nDeux coloris : bleu marine ou blanc.",
  'images':[SHOPIMG('casquette-marine','Casquette USM bleu marine'), SHOPIMG('casquette-blanche','Casquette USM blanche')],
  'priceMember':12,'pricePublic':16,'sizes':['Taille unique'],'colors':['Bleu marine','Blanc'],
  'minQty':20,'minMode':'total','maxPerMember':4,'deadline':day(-75),'deliveryDate':day(-40),'marking':False,'markingPrice':0,
  'sizeGuide':None,'sizeGuideText':'','partner':'','payUrl':'','supplier':'Fournisseur (exemple)','supplierRef':'CAP-USM',
  'status':'terminee','draft':False,'order':3,'_demo':{'deadline':-75,'delivery':-40}},
]

content = {'version': 1, 'updatedAt': datetime.datetime.now().isoformat(timespec='seconds'),
  'settings': settings, 'texts': {}, 'news': news, 'events': events, 'rates': rates, 'team': team, 'slots': slots,
  'facilities': facilities, 'sponsors': sponsors, 'sponsorPacks': packs, 'documents': documents, 'gallery': gallery, 'faq': faq, 'reviews': reviews, 'shopProducts': shop, 'messages': []}
js = '/* Contenu initial du site (repris du site actuel le ' + datetime.date.today().isoformat() + '). Généré par tools/build_seed.py */\nwindow.USM_SEED = ' + json.dumps(content, ensure_ascii=False, indent=1) + ';\n'
open(OUT, 'w').write(js)
print('news', len(news), 'events', len(events), 'rates', len(rates), 'gallery', len(gallery), 'bytes', len(js))
