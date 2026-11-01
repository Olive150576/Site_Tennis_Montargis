# Recettes de l'admin et de l'espace membre en mode Firebase

Vérifie, **sans toucher aux vraies données**, que l'admin du nouveau site fonctionne branché sur Firebase. Le test tourne contre les émulateurs officiels (Auth, base, Storage, fonctions), avec les vraies règles et les vraies fonctions du dépôt.

53 contrôles :
- connexion : pas de mot de passe d'aperçu, mauvais mot de passe refusé, compte non admin refusé, admin accepté ;
- droit admin Storage posé automatiquement ;
- première publication du contenu de départ (bouton « Publier ») ;
- import du contenu dans `site_v2`, sans empreinte de mot de passe ni produit d'exemple ;
- 18 rubriques ouvertes sans erreur ;
- modification d'une actualité ;
- envoi de photo et de PDF ;
- **membres** : liste, création par la fonction `createMember` (e-mail en minuscules, fiche au format actuel), e-mail « choisir son mot de passe » envoyé, fiche modifiée, téléphone invalide refusé, renvoi de l'e-mail, désactivation (fiche + compte bloqué) et réactivation ; profil d'annuaire d'un compte supprimé repéré et retiré ; « Créer ma fiche membre » pour un admin (même identifiant pour l'admin et l'espace membre) ; retrait d'un inscrit à un événement ; suppression d'un compte (`deleteMember`) sans trace dans les inscriptions ni l'annuaire ;
- message du formulaire public reçu dans l'admin, marqué lu, et un message arrivé entre-temps n'est pas effacé ;
- site public à jour ;
- reprise des actualités de l'ancien site sans doublon ;
- session conservée.

## Espace membre (`membre-e2e.js`) — 33 contrôles

- connexion : mauvais mot de passe, adhésion inactive, compte sans fiche refusés ; bouton démo masqué ;
- accueil réel, aucune donnée fictive, visite comptée ;
- carte : nom, licence, classement, QR vers `/v/{uid}` ;
- profil : téléphone enregistré, téléphone invalide refusé, classement + historique au format actuel ;
- profil joueur et annuaire au format de l'espace actuel (`style_jeu`, `dispo.lundi…`, `partenaire_index`) ;
- agenda unique (événements à venir, inscription / désinscription), messages du bureau ;
- annuaire des joueurs (contacts seulement si partagés, filtres), avantages partenaires réels ;
- photo envoyée dans Storage ; session conservée ; déconnexion.

## Une seule fois

- Java 11 ou plus, et l'outil Firebase (`npm install -g firebase-tools`).
- Dans `functions/` à la racine du dépôt : `npm install`.
- Dans ce dossier : `npm install`, puis `npx playwright install chromium`.

## Lancer

Dans ce dossier : `npm test`. Résultat attendu : `53/53 contrôles admin (mode Firebase)` puis `33/33 contrôles espace membre (mode Firebase)`.

À lancer avant la bascule, et après toute modification de `store.js`, `admin.js`, des règles ou des fonctions.
