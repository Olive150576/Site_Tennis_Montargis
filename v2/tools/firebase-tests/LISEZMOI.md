# Tests des règles Firebase

Vérifient, dans l'émulateur officiel de Firebase, que les règles du dépôt, `database.rules.json` et `storage.rules`, à la racine font exactement ce qui est prévu. Cela couvre le site actuel, le nouveau site et la boutique : 50 contrôles pour la base et 9 pour le Storage, plus les 20 contrôles de l'audit sécurité du 30/10/2026 (8 attaques bloquées, 12 usages qui doivent marcher).

**À relancer avant chaque déploiement de règles.**

## Une seule fois

- Installer Java (version 11 ou plus).
- Installer l'outil Firebase : `npm install -g firebase-tools`.

## Lancer les tests

Dans ce dossier :

```
npm install
npm test
```

Résultat attendu : `50/50 règles vérifiées`, `9/9 règles Storage`, `20/20 contrôles d'audit`.
