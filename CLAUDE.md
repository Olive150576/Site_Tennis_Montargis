# CLAUDE.md — Site USM Tennis Montargis (tennismontargis.fr)

Contexte lu automatiquement par Claude Code. Historique détaillé : `docs/claude-passation/` (passation du 06/11/2026, brief de mise en ligne, README de la maquette).

## Façon de travailler avec Olivier
- Être direct, challenger mes idées, dire franchement si une idée est irréaliste, ne pas valider par défaut.
- Toujours donner les commandes PowerShell une par une, chacune précédée de `cd "C:\Users\olivi\OneDrive\Documents\Site_Tennis_Refonte"`, avec ce que je dois voir pour valider.
- Avancer étape par étape, en attendant mon résultat avant la suivante.
- Je lance moi-même `firebase deploy` et `git push` ; Claude fait les vérifications (statut Git, `verifier_bascule.sh`, tests).
- Ne jamais supposer qu'une commande n'a pas été lancée : me demander le résultat.
- Avant un déploiement : tester sur la preview, puis la production.

## Qui et comment
- Olivier Decamp, bureau de l'USM Tennis Montargis (communication et numérique). Répondre en français.
- Être direct, challenger les idées, appliquer les bonnes pratiques (Git, tests, déploiement Firebase).
- **Push et `firebase deploy` : c'est Olivier qui les lance.** Claude prépare les commits et donne les commandes exactes.
- **Ne jamais** : manipuler la clé SSH, saisir un mot de passe, lire ou committer `functions/.env`.
- Ne pas travailler sur le même dépôt depuis deux PC sans `git fetch` / `git pull` avant de commencer.

## Dépôt et branches (GitHub `Olive150576/Site_Tennis_Montargis`, projet Firebase `usm-tennis`)
- `main` : site en ligne (Hosting `usm-tennis`, tennismontargis.fr).
- `refonte` : nouveau site dans `v2/` ; aperçu sur usm-tennis-v2.web.app (`noindex`). **On développe ici.**
- `bascule` : site final assemblé (contenu de `v2/` copié à la racine + ancien espace membre et ancien panneau admin conservés) par `v2/tools/assembler_bascule.py`. Après chaque changement sur `refonte`, réassembler `bascule`.
- `core.autocrlf=true` ; `.gitattributes` force les `*.sh` en LF.

## Structure du nouveau site (`v2/`)
- Pages générées depuis `src/pages/` + `src/partials/` : `python3 tools/build_pages.py` (régénère aussi `admin/index.html`, `sitemap.xml` et le registre des textes).
- `assets/css/site.css` (thème clair/sombre par variables), `assets/js/app.js` (site), `admin.js` (admin), `member.js` (espace membre), `store.js` (données), `config.js` (`mode: 'firebase'`, données publiques sous `site_v2`).
- L'espace membre utilise `members/{uid}`, `club_messages`, `inscriptions_evenement`, `partenaire_index`. La démo n'est accessible qu'avec `espace-membre.html?demo`.

## Tests (à lancer avant toute livraison)
- E2E Playwright : `v2/tools/admin-e2e/` (voir `LISEZMOI.md`) : admin, membre, parcours par profils, `audit-debordements.js` (13 pages × 320/360/390/430 px, attendu **TOTAL 0** après toute modif CSS).
- Règles Firebase : `v2/tools/firebase-tests/` (émulateurs), avant tout déploiement de règles.
- Robot du site : `v2/tools/test_site.py --externes`.
- Contrôle d'un déploiement : `v2/tools/verifier_bascule.sh <url>`.

## Règles de prudence
- Avant tout import JSON dans la Realtime Database : **exporter le nœud**, relire la base juste avant et refuser si elle a changé depuis la préparation du fichier (incident du 03/11).
- Les modifications de Cloud Functions sont partagées avec le site en ligne : déployer de façon ciblée (`firebase deploy --only functions:<nom>`).
- Retour arrière du hosting : Console Firebase › Hosting › historique des versions.
- E-mails Firebase Auth envoyés par SMTP Gmail du club : si le mot de passe Gmail change, le mot de passe d'application est révoqué et les e-mails de réinitialisation s'arrêtent sans alerte.

## Mise en ligne (jour J, depuis `bascule`)
1. Récupérer les actualités manquantes de l'ancien site.
2. Si `refonte` a bougé : relancer `assembler_bascule.py`.
3. Depuis `Site_Tennis_Refonte` (vérifier `git branch --show-current` = `bascule`, jamais depuis `Site_Tennis_Montargis` qui est sur `main`) : `firebase hosting:channel:deploy bascule --expires 30d` (pas d'option `--site`, le site par défaut du projet est `usm-tennis`), puis `verifier_bascule.sh` sur l'URL de preview.
4. `firebase deploy --only hosting`, puis `verifier_bascule.sh https://tennismontargis.fr`.
5. `git push origin bascule:main`.

## Feuille de route après la bascule
- **Priorité 1** : places limitées + liste d'attente sur les événements (statut déduit de l'ordre d'inscription `at`, e-mails via le Gmail du club, e-mails des responsables stockés hors de `site_v2` dans un nœud réservé aux admins). Spécification complète dans `docs/claude-passation/passation-nouveau-site.md`.
- **Priorité 1 (avec la liste d'attente) : sécurité du retrait d'un administrateur.** Retirer `admins/{uid}` ne retire pas le claim `admin: true` posé par `grantAdminClaim`, et les règles Storage (`images/`, `documents/`, `site_v2/`, photos de membres) se fient à ce claim : un ex-admin connecté à l'admin garde l'écriture et la suppression dans Storage. À faire : Cloud Function déclenchée sur la suppression de `admins/{uid}` (`onDelete`) qui retire le claim (`setCustomUserClaims(uid, null)`) **et** révoque les sessions (`revokeRefreshTokens(uid)`) ; déploiement ciblé (`firebase deploy --only functions:<nom>`). Même trou dans l'ancien panneau (`admin-panel.html`, `admin-auth.js` pose le claim à la connexion, rien ne le retire) ; le correctif serveur couvre les deux, quel que soit l'outil qui supprime `admins/{uid}` (nouvel admin, console Firebase).
- V2 espace membre : annonces « cherche un double », préférences de notification, push.
- V3 : Équipes dans le site (remplace WhatsApp), puis la Boutique.
- Technique : supprimer `functions.config()` avant mars 2027 ; Functions en 2e génération avant octobre 2027.
- **Issus des recettes du 10/11 (à traiter après la bascule)** :
  - **Fond flou des affiches en 404** : `--pf:url('assets/img/…')` (relatif) est résolu depuis `assets/css/` → requête vers `assets/css/assets/img/…` (13 fichiers, cosmétique : seul le flou derrière l'image manque). Deux endroits à corriger : `v2/assets/js/app.js` (~l.56, `pic()`) et `v2/assets/js/member.js` (~l.821, `eiImg()`). Piste : chemin absolu ou `new URL(…, location.href).href` ; vérifier le cas des pages en sous-dossier (`base`). Relancer `test_site.py` (attendu : plus de « fichier manquant »).
  - **Débordements** : `contact.html` en 320 px, `scrollWidth` 329 > 320 (TOTAL 1, mesuré avec Edge) ; à confirmer sur Chromium, puis corriger (attendu TOTAL 0).
  - **Robot du site** : bandeau/lien « 30 octobre : soirée raclette » → `agenda.html#e-raclette-2026` introuvable (vient de `data-seed.js` ; vérifier le bandeau réel et les liens vers des événements passés) ; clic sur le bouton clair/sombre en timeout (30 s) avec Edge, à vérifier.
  - **Recettes instables sur ce PC** (4 échecs, serveur correct, hypothèse : démarrage à froid des Functions plus lent que les `waitForTimeout` fixes) : `admin-e2e.js` « Membres : désactivation » (68/69) et `invitations-e2e.js` groupe « Suppression » (44/47). Remplacer les attentes fixes par une attente de l'effet (sonder la base). `admin-e2e.js` plante aussi en fin de script (`TargetClosedError`, Node 26) avant d'afficher son total.
  - **Outillage** : Chromium de Playwright 1.47 bloqué à l'extraction sur ce PC → recettes lancées avec Microsoft Edge (préchargement `NODE_OPTIONS=--require` forçant `channel: 'msedge'`, enveloppe Python équivalente, hors dépôt). Java 21 installé. `LISEZMOI.md` : compteurs attendus incohérents (« 65/69 », « 52/56 » alors que les recettes comptent 69 et 56 contrôles) à mettre à jour. `test_site.py` réécrit `v2/tools/rapport-tests.html` (suivi par Git) : le restaurer après un lancement (`git checkout -- v2/tools/rapport-tests.html`).
