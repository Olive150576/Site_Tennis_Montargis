# Nouveau site USM Tennis Montargis

Site vitrine complet + panneau d'administration, construit en parallèle du site actuel (rien n'est publié, le site en ligne n'est pas touché).

## 1. Voir le site tout de suite

- **Site public** : double-cliquez sur `index.html` (Chrome ou Edge).
- **Administration** : ouvrez `admin/index.html` — mot de passe de l'aperçu : `usm2026` (à changer dans *Paramètres*).

En mode aperçu, tout ce que vous modifiez dans l'admin est enregistré **dans votre navigateur** et apparaît immédiatement sur le site public du même navigateur. Pensez à *Sauvegarde › Télécharger la sauvegarde* avant de changer d'ordinateur ou de vider le cache.

Le contenu de départ (49 actualités, tarifs 2026-2027, événements, partenaires, documents, photos) a été repris du site actuel le 23/09/2026. Les images ont été rapatriées et converties en WebP (2 tailles) pour la vitesse.

## 2. Les pages

| Page | Contenu |
|---|---|
| `index.html` | Accueil : héro « court », tableau de score, parcours par profil, quiz « Trouver ma formule », installations, agenda, actualités, enseignant, partenaires |
| `le-club.html` | Esprit du club, installations détaillées, fonctionnement (Ten'Up, carte d'accès, invitations), équipe, galerie |
| `ecole-de-tennis.html` | Baby tennis, école 5-18 ans, adultes, cours individuels, stages, **planning hebdomadaire** |
| `competition.html` | Open USM, équipes, tournois du club, derniers résultats |
| `agenda.html` | Événements datés (compte à rebours) + rendez-vous annuels |
| `tarifs.html` | Formules par onglet, quiz, inscription en 3 étapes, documents, FAQ |
| `actualites.html` / `actualite.html` | Liste filtrable + recherche, page article avec galerie et partage |
| `partenaires.html` | Partenaires, arguments, packs de sponsoring, formulaire « Devenir partenaire » |
| `contact.html` | Formulaire (sujet pré-rempli : `contact.html#essai`), horaires, contacts directs, accès |

SEO intégré : titres et descriptions uniques, données structurées (SportsClub, fil d'Ariane, FAQ, événements, articles), `sitemap.xml`, `robots.txt`, URL propres, images légères avec texte alternatif, carte chargée au clic (RGPD).

## 3. L'administration

Tableau de bord (points à vérifier, raccourcis, tuile Boutique), Actualités, Agenda, Tarifs, Planning des cours, Équipe, Installations, Galerie, Documents, FAQ, Partenaires (avec l'avantage membre : détail, code, date de fin), Offres de sponsoring, **Boutique** (commandes groupées), Messages (formulaires du site, export CSV), Textes des pages, Paramètres (bandeau d'annonce, chiffres clés, coordonnées, horaires, liens, SEO), Sauvegarde.

Astuces : `Ctrl + S` enregistre, glisser-déposer pour réordonner les tarifs/partenaires/équipe, étoile pour choisir la photo de couverture, `*mot*` dans un titre = mise en valeur jaune.

### Boutique du club (commandes groupées)

Vêtements et accessoires du club vendus en **commande groupée**, dans l'espace membre (`espace-membre.html#boutique`).

- **Le membre** voit la liste des produits avec un compteur (« 18 / 25 pièces — il en manque 7 »). Il choisit taille, couleur, quantité et marquage, puis réserve. Il peut modifier ou annuler jusqu'à la date limite, ensuite c'est verrouillé (« contactez le bureau »). Un suivi par étapes accompagne chaque réservation : Réservée → Commande passée → Disponible au club → Retirée, avec « À régler » / « Réglé ».
- **Règle d'or, affichée partout :** personne ne paie tant que le minimum n'est pas atteint. Si le minimum n'est pas atteint à la date limite, la commande est annulée et chacun est prévenu.
- **Pour aider à atteindre le minimum :**
  - bouton Partager (WhatsApp, SMS, copier) après chaque réservation ;
  - bandeau « Commande groupée en cours » sur l'accueil ;
  - pastille sur la Boutique ;
  - compteur jaune « Presque ! » quand il manque 5 pièces ou moins.
- **Le bureau** (Admin › Boutique) :
  1. Crée le produit (photos, prix, tailles, couleurs, minimum au total ou par taille, date limite, marquage, guide des tailles, partenaire floqué, lien de paiement) et le passe en « Ouverte ».
  2. Dans **Suivi**, suit les réservations : récap par taille et couleur, **Exporter en CSV**, **Copier le récap fournisseur**, cases Réglé / Retiré.
  3. Fait avancer la commande avec les boutons, et les membres concernés sont prévenus dans leur espace : **Passer en « Commandée »** (verrouille, affiche le lien de paiement), **Disponible au club**, **Terminer**, ou **Annuler la commande groupée** (message modifiable).
  4. Pour un produit terminé, voit la liste d'attente (« Prévenez-moi à la prochaine commande »), puis **Relance ce produit** en un clic.
- **Mobile :** la barre du bas garde 5 onglets : Accueil · Ma carte · Jouer · Équipes · **Plus**. « Plus » ouvre Agenda, Boutique, Mon profil, mode d'emploi et thème. Raison : à 360 px avec un texte agrandi (ou le zoom Android), 6 libellés débordent. La pastille de « Plus » additionne celles d'Agenda et de Boutique. Sur ordinateur, « Boutique » est dans le menu de gauche.
- **Aperçu :** 3 produits d'exemple (veste, t-shirt, casquette) avec des réservations fictives, dont les dates suivent la date du jour. Ils ne sont jamais lus en mode Firebase et sont exclus de l'export Firebase. Dans l'admin, ils portent l'étiquette « Exemple ». Admin et espace membre partagent les données du navigateur, et un changement dans l'admin apparaît aussitôt dans l'autre onglet.
- **Textes des 3 emails** (confirmation, commande lancée, disponible) : `firebase/textes-emails-boutique.md`.
- **Mesure :** événements `boutique_vue_produit`, `boutique_reservation`, `boutique_modif_reservation`, `boutique_annulation`, `boutique_partage`, `boutique_liste_attente`. Ils passent par la fonction de suivi du site si elle est chargée ; Clarity n'est pas chargé sur l'espace membre pour l'instant.

## 4. Montrer le site au bureau sans toucher au site actuel

Le nouveau site est publié sur un **site Firebase séparé**, `usm-tennis-v2` (`firebase.json` › `"site"`). Un `firebase deploy` lancé depuis `v2/` ne peut donc **pas** remplacer tennismontargis.fr.

Une seule fois, depuis `v2/` : `firebase hosting:sites:create usm-tennis-v2`

Ensuite, depuis `v2/` :

```
firebase deploy --only hosting
```

Adresse : `https://usm-tennis-v2.web.app`. Pour une adresse temporaire : `firebase hosting:channel:deploy apercu --expires 30d`.

## 5. Mise en production

Le site actuel vit dans le dépôt GitHub `Olive150576/Site_Tennis_Montargis` (projet Firebase `usm-tennis`). Le nouveau site s'appuie sur le même projet : mêmes comptes, mêmes admins (`admins/`), mêmes membres (`members/`, champ `actif`), même envoi d'e-mails (fonctions Cloud + Gmail).

### Étape A — serveur (règles + fonctions)

Ce dépôt est organisé ainsi depuis le 30/10/2026 :

- branche `main` = site en ligne ;
- branche `refonte` = `main` + le nouveau site dans `v2/` + le serveur déjà branché pour le nouveau site.

Le patch `brancher-site-v2.patch` est **appliqué** dans la branche `refonte`, rejoué par-dessus les correctifs de sécurité du 30/10. Les règles et les fonctions n'existent plus qu'à un seul endroit, à la racine du dépôt (`database.rules.json`, `storage.rules`, `functions/`). Il n'y a plus de copie dans `v2/firebase/`.

Ajouts côté serveur :

- règles `site_v2`, `site_v2_messages` et boutique ;
- dossier Storage `site_v2/` ;
- `functions/site-v2.js` : formulaires, e-mails boutique, recopie des actus Metricool/Make ;
- `verify.html` : affiche les partenaires du nouvel admin.

Ces ajouts sont sans effet sur le site actuel. Pour les mettre en service, depuis la **racine** du dépôt, branche `refonte` :

```
firebase deploy --only functions,database,storage
```

Avant tout déploiement de règles, lancer `v2/tools/firebase-tests` (voir son `LISEZMOI.md`). Résultat attendu : 50/50, 9/9 et 20/20.

### Étape B — contenu

1. **Admin › Sauvegarde › Format d'import Firebase** → importer le fichier dans la Realtime Database, au nœud `site_v2`. Les produits d'exemple de la boutique sont exclus d'office.
2. Dans `assets/js/config.js`, passer `mode: 'local'` à `mode: 'firebase'`.
3. **Actualités publiées depuis la reprise** : Admin › Sauvegarde › **Récupérer les actualités manquantes**. Le bouton lit les actualités publiques de l'ancien site, ajoute celles qui manquent (photos, texte nettoyé, catégorie) et ignore les doublons. On peut le relancer sans risque : à refaire **le jour de la bascule**, juste avant l'étape C. Relire ensuite les titres ajoutés.
   Attention : l'ancien site range ses actualités dans une liste dont la purge (> 13 mois) décale les numéros. La reconnaissance se fait donc par date de création et par texte, jamais par numéro.
   Les **événements** ne sont pas concernés : ceux de l'ancien site sont tous repris (au 30/10/2026). Un événement créé dans l'ancien panneau d'ici la bascule est à recréer dans le nouvel admin.

### Étape C — bascule de l'hébergement

> **Mise à jour du 31/10/2026 — l'espace membre bascule aussi.** Le nouvel espace membre est branché sur Firebase : connexion, profil, carte, avantages, agenda + inscriptions, messages du bureau et annuaire, testés en réel. Les équipes passent par WhatsApp (championnat terminé) : interrupteur **Équipes désactivé** et lien de la Communauté WhatsApp renseigné dans Admin › Paramètres. Le **nouvel** `espace-membre.html` remplace donc l'ancien, à la même adresse : les applications déjà installées sur les téléphones (`manifest-membre.json`, `start_url` = `/espace-membre.html`) ouvrent directement le nouvel espace. La liste « garder » ci-dessous ne vaut plus que pour l'ancien **panneau admin** (gestion des comptes membres), `verify.html` et `qr-accueil.html`. À vérifier pendant la bascule : la feuille de style de l'ancien espace membre ne doit plus être chargée, et les fichiers `member*.min.js` de l'ancien espace peuvent rester (inutilisés).

Copier les fichiers du nouveau site à la racine du dépôt. **Garder** ceux de l'ancien espace membre et de l'ancien panneau. Ils gèrent les comptes membres, les équipes, les championnats, les convocations et les notifications, et le nouvel espace membre est encore une démonstration :

- `espace-membre.html` (l'ancien, pas celui de la démo), `member.min.js`, `member-auth.min.js`, `member-dashboard.html` ;
- `admin-panel.html`, `admin.min.js`, `admin-auth.min.js`, `notifications.min.js`, `firebase-init.min.js`, `style.css` ;
- `verify.html` (QR des cartes, adresse `/v/{uid}`) et `qr-accueil.html` ;
- `manifest-membre.json`, `manifest-admin.json`, `logo_usm_new.png`, `favicon.png`, les `icon-*.png` et `apple-touch-icon-*.png`.

**Remplacer** :

- `index.html`, `sitemap.xml`, `robots.txt` ;
- `sw.js` : la nouvelle version efface les anciens caches mais garde les notifications push des membres ;
- la partie `hosting` de `firebase.json`, en gardant `database`, `storage`, `functions` et `firestore`.
  **Retirer la ligne `"site": "usm-tennis-v2"` et l'en-tête `X-Robots-Tag: noindex`** en recopiant cette partie : à la racine, l'hébergement doit viser le site principal et être indexé par Google.

La nouvelle partie `hosting` garde, comme aujourd'hui :

- `/v/**` → `verify.html` ;
- `/qr-accueil` ;
- `/inscription`, vers le même PDF que le site actuel ;
- `/espace-membre.html` à la même adresse.

Elle ajoute les adresses courtes (`/tarifs`, `/le-club`…) et une page 404. Ensuite : `firebase deploy --only hosting`.

Le nouvel espace membre, avec la boutique, remplacera l'ancien quand sa connexion et ses données seront branchées sur Firebase. La boutique est déjà prête côté serveur : son code Firebase a été testé dans l'émulateur avec de vraies connexions de membres. Avant cette étape, le nouvel espace membre se teste sous un autre nom (par exemple `espace-membre-v2.html`).

**Pendant la transition**, l'ancien espace membre lit encore les partenaires dans l'ancien nœud `sponsors`. Le nouvel admin les gère dans `site_v2` : pensez à reporter les avantages dans l'ancien panneau tant que l'ancien espace membre est en service.

### Mesure d'audience (Microsoft Clarity)

- Même projet Clarity que le site actuel (`vfrevzz9j6`, dans `assets/js/config.js` › `clarity`), chargé **uniquement** sur tennismontargis.fr / usm-tennis.web.app : rien dans l'aperçu, l'admin ou l'espace membre. Un appareil qui s'est connecté à l'admin n'est plus mesuré (clé `usm_no_clarity`, la même que l'ancien site).
- Bandeau « Cookies de mesure d'audience » Accepter / Refuser (lien « Cookies » en pied de page, choix gardé 6 mois). Le bandeau ne nomme pas l'outil ; la page Confidentialité (lien « En savoir plus ») cite Microsoft Clarity. **Aucune visite perdue** : sans choix ou refus, mesure sans cookie comme aujourd'hui ; accepté : visites complètes (pages reliées, visiteurs qui reviennent). `banner: false` retire le bandeau ; `waitForConsent: true` ne mesure rien avant « Accepter ».
- Événements conservés : `appel_telephone`, `email_club`, `reserver_tenup`, `contact_offer`, `modal_gallery`, `lightbox_open`, `contact_form_submit`, `menu_mobile_ouvert`, `modal_all_rates` (page Tarifs), `archives_actus` (page Actualités), `modal_gallery_key` (page d'une actu). Nouveaux : `barre_mobile` (+ bouton), `clic_sponsor_<nom>`, `partenariat_form_submit`, `quiz_formule`. `rate_viewer_open` n'a plus d'équivalent (tous les tarifs sont visibles sur la page).
- Liens Facebook tracés : `https://tennismontargis.fr/?utm_source=facebook&utm_medium=social&utm_campaign=<nom_du_post>` (filtres « Source / Campagne » dans Clarity).

## 6. Modifier le code

Les pages sont générées à partir de `src/pages/` + `src/partials/` (en-tête, pied de page, icônes) :

```
python3 tools/build_pages.py
```

Le script régénère les pages, `admin/index.html`, `sitemap.xml` et la liste des textes modifiables de l'admin. Styles : `assets/css/site.css` (thème clair/sombre par variables). Logique : `assets/js/app.js` (site), `admin.js` (admin), `store.js` (données locales ou Firebase).

## 7. Tests automatiques (robot)

`tools/test_site.py` parcourt tout le site comme un visiteur, sur téléphone (390 px) et sur ordinateur (1440 px), et produit `tools/rapport-tests.html` :

- erreurs JavaScript, fichiers manquants, images cassées sur les 13 pages ;
- tous les liens internes (page et ancre), numéros de téléphone et e-mails ; avec `--externes`, les liens vers d'autres sites (Ten'Up, partenaires, Facebook…) ;
- **chaque bouton** : un clic doit produire un effet, sinon il est signalé comme « clic mort » (comme dans Clarity) ;
- parcours clés : barre d'action mobile (Réserver, Tarifs, Appeler, Contact), menu, thème, galerie photo, quiz, formulaires (vide refusé / rempli envoyé), bandeau cookies, bouton haut/bas ;
- admin : connexion (aperçu) et ouverture de chaque rubrique ;
- **boutique**, dans un même navigateur, membre puis admin :
  - ouverture par l'onglet « Plus » ;
  - pas de débordement à 360 px, avec un texte agrandi à 130 % et avec le zoom Android (277 px) ;
  - fiche produit et compteur « il en manque X » ;
  - réservation de 2 pièces puis compteur −2 ; modification 2 → 1, puis compteur +1 ; annulation et retour au départ ;
  - blocage après la date limite ;
  - tuile du tableau de bord ;
  - création d'un produit (minimum 10), visible côté membre ;
  - export CSV avec le récap par taille ;
  - « Passer en Commandée » : verrouillage, lien de paiement et message ;
  - « Annuler la commande groupée » : message reçu ;
  - thème sombre et liste d'attente.

`python tools/test_site.py --boutique` ne lance que les parcours de la boutique (environ 1 minute).

**Règles de sécurité Firebase** : `tools/firebase-tests` (50 contrôles Realtime Database, 6 Storage, dans l'émulateur officiel). À lancer avant chaque déploiement de règles.

```
pip install playwright
python -m playwright install chromium
python tools/test_site.py --externes
```

Durée : 6 à 7 minutes. Le robot est aussi lancé par Claude avant chaque livraison importante. À lancer avant la mise en ligne et après chaque grosse modification.

## 8. À vérifier avant la mise en ligne

- **Courts** : 7 courts — 2 terre battue et 3 béton poreux en extérieur, 2 couverts (confirmé). Corrigé partout, y compris dans les descriptions de l'Open et du tournoi de doubles ; seule l'ancienne actualité du 44e Open (mai 2026) garde son texte d'origine.
- **Tarifs jeunes** (codes confirmés, JTC = Jeune Terrain Cours) : JTC1 = 1 h/semaine (160 €), JTC2 = 1 h 30 (205 €), JTC3 = 3 h (310 €). Le code « JT1 » de l'ancien site n'existe plus. Pensez à corriger aussi l'ancien site, qui affiche deux « JTC1 ».
- **Bureau** : Patricia Bille (présidente), Arnaud Legrand (secrétaire), Patrice Manetti (trésorier), Sophie Duval (trésorière adjointe), Olivier Decamp (communication et réseaux) — photos à ajouter dans *Équipe*.
- **Packs de sponsoring** : prix « Sur devis » et contreparties proposées, à ajuster.
- **Avantages partenaires** : « Offres à venir » repris tel quel.
- **Instagram / WhatsApp** : liens vides (icônes masquées) — à renseigner dans *Paramètres* si besoin.
- **Règles Firebase** : la regex email (`[^@\\s]`, refusée par l'émulateur) est corrigée en `[^@ ]` dans le dépôt (30/10).
- **Boutique** :
  - supprimer les 3 produits « Exemple » (ils ne partent de toute façon pas en ligne) et créer les vrais ;
  - choisir le prestataire de paiement (HelloAsso conseillé) ;
  - « Fournisseur » et « Référence » ne sont pas affichés aux membres, mais restent lisibles dans les données publiques `site_v2` : n'y mettez rien de confidentiel (prix d'achat, etc.).
