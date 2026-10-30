# Tests des règles Firebase

Vérifient, dans l'émulateur officiel de Firebase, que les règles de `firebase/database.rules.json` et `firebase/storage.rules` font exactement ce qui est prévu. Cela couvre le site actuel, le nouveau site et la boutique : 50 contrôles pour la base, 6 pour le Storage.

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

Résultat attendu : `50/50 règles vérifiées` puis `6/6 règles Storage`.
