# Recettes de l'admin et de l'espace membre en mode Firebase

Vérifie, **sans toucher aux vraies données**, que l'admin du nouveau site fonctionne branché sur Firebase. Le test tourne contre les émulateurs officiels (Auth, base, Storage, fonctions), avec les vraies règles et les vraies fonctions du dépôt.

65 contrôles :
- connexion : pas de mot de passe d'aperçu, mauvais mot de passe refusé, compte non admin refusé, admin accepté ;
- droit admin Storage posé automatiquement ;
- première publication du contenu de départ (bouton « Publier ») ;
- import du contenu dans `site_v2`, sans empreinte de mot de passe ni produit d'exemple ;
- 18 rubriques ouvertes sans erreur ;
- modification d'une actualité ;
- envoi de photo et de PDF ;
- **membres** : liste, création par la fonction `createMember` (e-mail en minuscules, fiche au format actuel), e-mail « choisir son mot de passe » envoyé, fiche modifiée, téléphone invalide refusé, renvoi de l'e-mail, désactivation (fiche + compte bloqué) et réactivation ; profil d'annuaire d'un compte supprimé repéré et retiré ; export CSV ; import CSV sans doublon (e-mail et nom comparés aux membres et au reste du fichier, cas douteux jamais créés, relance sans effet) ; « Créer ma fiche membre » pour un admin (même identifiant pour l'admin et l'espace membre) ; retrait d'un inscrit à un événement ; suppression d'un compte (`deleteMember`) sans trace dans les inscriptions ni l'annuaire ;
- message du formulaire public reçu dans l'admin, marqué lu, et un message arrivé entre-temps n'est pas effacé ;
- site public à jour ;
- reprise des actualités de l'ancien site sans doublon ;
- session conservée.

## Espace membre (`membre-e2e.js`) — 52 contrôles

- connexion : mauvais mot de passe, adhésion inactive, compte sans fiche refusés ; bouton démo masqué ;
- accueil réel, aucune donnée fictive, visite comptée ;
- carte : nom, licence, classement, QR vers `/v/{uid}` ;
- profil : téléphone enregistré, téléphone invalide refusé, classement + historique au format actuel ;
- profil joueur et annuaire au format de l'espace actuel (`style_jeu`, `dispo.lundi…`, `partenaire_index`) ;
- agenda unique (événements à venir, inscription / désinscription), messages du bureau ;
- annuaire des joueurs (contacts seulement si partagés, filtres) ; niveau : « Mon niveau » ±3 échelons, plage De/À, NC toujours affichés, tri par proximité, repères « Niveau proche » et « créneaux communs », avantages partenaires réels ;
- agenda mois par mois : grille (pastilles, aujourd'hui, clic sur un jour), choix du mois, liste du mois, « Prévu en … · date à venir » (mois concernés), « Autres rendez-vous » (sans mois), jamais « 0 h » ; admin : champ « Mois concernés » enregistré ;
- agenda public : bouton « S'inscrire (membres) » (événements ouverts à venir seulement) → connexion avec rappel → confirmation d'un clic (rien n'est enregistré avant), « déjà inscrit » géré ; pas de bandeau « en test » ni de badge « Démo » en mode réel ;
- photo envoyée dans Storage ; session conservée ; déconnexion.

## Une seule fois

- Java 11 ou plus, et l'outil Firebase (`npm install -g firebase-tools`).
- Dans `functions/` à la racine du dépôt : `npm install`.
- Dans ce dossier : `npm install`, puis `npx playwright install chromium`.

## Lancer

Dans ce dossier : `npm test`. Résultat attendu : `65/65 contrôles admin (mode Firebase)` puis `52/52 contrôles espace membre (mode Firebase)`.

À lancer avant la bascule, et après toute modification de `store.js`, `admin.js`, des règles ou des fonctions.

## Textes qui débordent sur téléphone

`node audit-debordements.js` (dans ce dossier, sans émulateurs) : ouvre chaque page publique en 320, 360, 390 et 430 px et liste les textes qui sortent de leur carte et les grands titres coupés. Résultat attendu : `TOTAL 0`. À relancer après une modification du CSS ou d'un titre de page.

## Parcours de membres simulés (`parcours-membres.js`)
Trois profils (Monique 68 ans sur petit Android, Karim compétiteur pressé, Léa sur iPhone) jouent leur parcours dans l'espace membre et produisent des captures + `journal.json`, ensuite relues « dans le rôle » par des agents Claude.
1. `curl -s "https://usm-tennis-default-rtdb.europe-west1.firebasedatabase.app/site_v2.json" -o site_v2.json` (contenu public uniquement)
2. Depuis la racine du dépôt : `V2=$PWD/v2 OUT=<dossier de sortie> LIVE=<chemin>/site_v2.json PERSONA=monique firebase emulators:exec --only auth,database,storage,functions --project demo-usm "node v2/tools/admin-e2e/parcours-membres.js"` (puis `karim`, `lea`).
Attention : certaines actions du script sont approximatives (ex. il ne valide pas la fenêtre du classement) ; vérifier chaque remarque des agents avant de corriger.
