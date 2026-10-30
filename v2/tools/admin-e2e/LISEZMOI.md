# Recette de l'admin en mode Firebase

Vérifie, **sans toucher aux vraies données**, que l'admin du nouveau site fonctionne branché sur Firebase. Le test tourne contre les émulateurs officiels (Auth, base, Storage, fonctions), avec les vraies règles et les vraies fonctions du dépôt.

25 contrôles :
- connexion : pas de mot de passe d'aperçu, mauvais mot de passe refusé, compte non admin refusé, admin accepté ;
- droit admin Storage posé automatiquement ;
- première publication du contenu de départ (bouton « Publier ») ;
- import du contenu dans `site_v2`, sans empreinte de mot de passe ni produit d'exemple ;
- 18 rubriques ouvertes sans erreur ;
- modification d'une actualité ;
- envoi de photo et de PDF ;
- message du formulaire public reçu dans l'admin, marqué lu, et un message arrivé entre-temps n'est pas effacé ;
- site public à jour ;
- reprise des actualités de l'ancien site sans doublon ;
- session conservée.

## Une seule fois

- Java 11 ou plus, et l'outil Firebase (`npm install -g firebase-tools`).
- Dans `functions/` à la racine du dépôt : `npm install`.
- Dans ce dossier : `npm install`, puis `npx playwright install chromium`.

## Lancer

Dans ce dossier : `npm test`. Résultat attendu : `25/25 contrôles admin (mode Firebase)`.

À lancer avant la bascule, et après toute modification de `store.js`, `admin.js`, des règles ou des fonctions.
