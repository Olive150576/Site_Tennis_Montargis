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
- **État au 17/11/2026** : la bascule est faite, `main` = `bascule` (site en ligne). Les correctifs des 16-17/11 ont été faits directement sur `bascule` (modification dans `v2/`, puis `assembler_bascule.py`) : **`refonte` est en retard** sur ces commits. À décider avec Olivier : la réaligner (`git checkout refonte` puis `git merge bascule`) ou ne plus l'utiliser.
- Le dossier `Site_Tennis_Montargis` est un ancien checkout de `main` (peut être très en retard) : ne pas y développer.

## Structure du nouveau site (`v2/`)
- Pages générées depuis `src/pages/` + `src/partials/` : `python3 tools/build_pages.py` (régénère aussi `admin/index.html`, `sitemap.xml` et le registre des textes).
- `assets/css/site.css` (thème clair/sombre par variables), `assets/js/app.js` (site), `admin.js` (admin), `member.js` (espace membre), `store.js` (données), `config.js` (`mode: 'firebase'`, données publiques sous `site_v2`).
- L'espace membre utilise `members/{uid}`, `club_messages`, `inscriptions_evenement`, `partenaire_index`. La démo n'est accessible qu'avec `espace-membre.html?demo`.
- **Médias** (depuis le 17/11) : actualités et agenda ont un champ `videos` (`[{ provider: 'youtube'|'vimeo'|'facebook', id, url, title, thumb, start?, h? }]`). Reconnaissance des liens : `parseVideo()` dans `app.js` (exposé dans `USM.util`). Affichage : miniature copiée dans Storage + bouton, lecteur (`youtube-nocookie`, Vimeo `dnt`) inséré **au clic seulement** (aucune requête tierce avant). Images : bouton « Depuis une adresse (URL) » et collage Ctrl+V dans l'admin ; l'URL passe par la Cloud Function `fetchRemoteImage` (`functions/media-import.js` : admins seulement, adresses internes refusées même après redirection, type vérifié sur les octets, 6 Mo / 12 s max), puis même circuit que `uploadImage` (webp 1600/640 px).
- Icônes : `src/partials/sprite.svg` ; après modification, relancer `build_pages.py` (toutes les pages embarquent le sprite).
- Pages gardées de l'ancien site mais passées à la nouvelle charte (16/11) : `verify.html` (`/v/{uid}`, scan du QR membre), `qr-accueil.html`, icônes PWA membre/admin et leurs manifestes, habillage de l'ancien panneau par `admin-panel-theme.css`.

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
- En-têtes Hosting : ils suivent l'**adresse demandée**, pas la page cible d'une réécriture. Une règle sur `/verify.html` ne couvre pas `/v/**` (incident du 16/11 : la page du QR restait en cache 1 h sur les téléphones). Toujours écrire la règle sur l'adresse publique, dans `v2/firebase.json` (l'assembleur recopie sa partie `hosting`) ; `verifier_bascule.sh` contrôle le `no-store` de `/v/`.
- La preview (`hosting:channel`) écrit dans la **vraie base** : tester avec un contenu en brouillon, puis le supprimer.

## Livraison d'une modification (depuis `bascule`, procédure du jour J réutilisée)
1. Modifier dans `v2/` (relancer `build_pages.py` si pages, partials ou sprite ont changé), puis `python v2/tools/assembler_bascule.py` à la racine. L'assembleur réécrit les pages en LF : committer seulement les fichiers réellement modifiés (`git diff --stat -w --ignore-cr-at-eol`) et restaurer les autres (`git checkout -- <fichiers>`).
2. Commit, puis `git push origin bascule`. Si une Cloud Function a changé : `firebase deploy --only functions:<nom>` avant la preview.
3. Depuis `Site_Tennis_Refonte` (vérifier `git branch --show-current` = `bascule`, jamais depuis `Site_Tennis_Montargis` qui est sur `main`) : `firebase hosting:channel:deploy bascule --expires 30d` (pas d'option `--site`, le site par défaut du projet est `usm-tennis`), puis `verifier_bascule.sh` sur l'URL de preview.
4. `firebase deploy --only hosting`, puis `verifier_bascule.sh https://tennismontargis.fr`.
5. `git push origin bascule:main`.

## Feuille de route après la bascule
- **Priorité 1** : places limitées + liste d'attente sur les événements (statut déduit de l'ordre d'inscription `at`, e-mails via le Gmail du club, e-mails des responsables stockés hors de `site_v2` dans un nœud réservé aux admins). Spécification complète dans `docs/claude-passation/passation-nouveau-site.md`.
- **Sécurité du retrait d'un administrateur : FAIT le 15/11/2026.** Cloud Function `onAdminRemoved` (`functions/index.js`, v1, déclencheur `ref.delete` sur `admins/{uid}`) : retire le claim `admin` (autres claims conservés) et révoque les sessions ; couvre le nouveau panneau, l'ancien et la console Firebase. Déployée (`firebase deploy --only functions:onAdminRemoved`) et vérifiée en réel (nomination puis retrait d'un compte : journal « claim admin retiré, sessions révoquées »). Recette : `v2/tools/admin-e2e/retrait-admin-e2e.js` (8/8). **Reste** : un admin retiré AVANT le 15/11 garde peut-être son claim (la fonction n'agit qu'à la suppression) ; à contrôler une fois en comparant les comptes Auth portant `customClaims.admin` à la liste `admins/`.
- V2 espace membre : annonces « cherche un double », préférences de notification, push.
- V3 : Équipes dans le site (remplace WhatsApp), puis la Boutique.
- Technique : supprimer `functions.config()` avant mars 2027 ; Functions en 2e génération avant octobre 2027.
- **Médias, phase 1 : FAIT le 17/11/2026** (vidéos par lien, images par URL et par collage, voir « Structure »). **Phase 2** : médiathèque (réutiliser une image déjà envoyée, liste de `site_v2/images` dans Storage) ; « coller le lien d'un article » → récupérer son `og:image` (même Cloud Function). **Phase 3, seulement si le besoin se confirme** : petits clips MP4 (30 Mo max, H.264, sans transcodage) ; ne jamais héberger de longues vidéos (poids, HEVC, bande passante payante). **Restes de la phase 1** : vidéos absentes de l'agenda de l'espace membre (`member.js`, `eventInfoHtml`) ; champ `videos` non couvert par les recettes e2e. Google Photos/Drive et Facebook/Instagram écartés (validation d'application chez Google/Meta).
- **Recettes du 10/11 : corrigées le 16/11/2026** (fond flou des affiches en adresse absolue, débordement de `contact.html` à 320 px, annonce de démo qui pointait vers la soirée raclette passée, bouton clair/sombre du robot cliqué dans le menu mobile, attentes fixes remplacées par une attente de l'effet dans `admin-e2e.js` et `invitations-e2e.js`, total affiché avant la fermeture du navigateur, `LISEZMOI.md` à 69/69 et 56/56). Vérifié en production : contact sans débordement, fond flou en 200. **Reste** : relancer les recettes e2e et `test_site.py` sur ce PC pour confirmer 69/69, 56/56 et le bouton de thème.
- **Outillage** : Chromium de Playwright 1.47 bloqué à l'extraction sur ce PC → recettes lancées avec Microsoft Edge (préchargement `NODE_OPTIONS=--require` forçant `channel: 'msedge'`, enveloppe Python équivalente, hors dépôt). Java 21 installé. `test_site.py` réécrit `v2/tools/rapport-tests.html` (suivi par Git) : le restaurer après un lancement (`git checkout -- v2/tools/rapport-tests.html`).
