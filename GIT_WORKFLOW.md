# Workflow Git - Maison & Travail

## IMPORTANT : À FAIRE À CHAQUE SESSION

### Au début de chaque session de travail
```bash
# 1. Récupérer les dernières modifications
git fetch origin

# 2. Vérifier s'il y a des changements distants
git status

# 3. Si nécessaire, récupérer et fusionner
git pull origin main
```

### À la fin de chaque session de travail
```bash
# 1. Vérifier les fichiers modifiés
git status

# 2. Ajouter tous les fichiers modifiés
git add .

# 3. Créer un commit avec un message descriptif
git commit -m "Description des modifications"

# 4. Pousser vers le dépôt distant
git push origin main

# 5. ⚠️ IMPORTANT : Pour les changements majeurs, déployer sur Firebase
firebase deploy
```

### ⚠️ Quand déployer sur Firebase ?
Déployez après un commit/push contenant :
- Nouvelles fonctionnalités
- Corrections de bugs importantes
- Modifications du design/UI
- Mises à jour de contenu importantes
- Changements de configuration

## Scripts rapides

### Script de début de session (sync-start.sh)
```bash
#!/bin/bash
echo "=== Synchronisation Git - DÉBUT ==="
git fetch origin
git status
echo ""
echo "Voulez-vous récupérer les dernières modifications ? (git pull origin main)"
```

### Script de fin de session (sync-end.sh)
```bash
#!/bin/bash
echo "=== Synchronisation Git - FIN ==="
git status
echo ""
read -p "Message de commit : " message
git add .
git commit -m "$message"
git push origin main
echo "=== Synchronisation terminée ==="
```

## Commandes utiles

- `git log --oneline -5` : Voir les 5 derniers commits
- `git diff` : Voir les modifications non commitées
- `git stash` : Mettre de côté temporairement les modifications
- `git stash pop` : Récupérer les modifications mises de côté

## Configuration SSH

**Vos clés SSH sont stockées à :**
- Clé privée : `C:\Users\olivi\OneDrive\Documents\clegit`
- Clé publique : `C:\Users\olivi\OneDrive\Documents\clegit.pub`

### Configurer Git pour utiliser votre clé SSH :

1. Ajouter la clé à l'agent SSH (Windows PowerShell) :
   ```powershell
   # Démarrer l'agent SSH
   Start-Service ssh-agent

   # Ajouter votre clé
   ssh-add "C:\Users\olivi\OneDrive\Documents\clegit"
   ```

2. Configurer Git pour utiliser cette clé (créer/modifier `~/.ssh/config`) :
   ```
   Host github.com
     HostName github.com
     User git
     IdentityFile C:\Users\olivi\OneDrive\Documents\clegit
   ```

3. Si la clé publique n'est pas encore sur GitHub :
   - Copiez le contenu de `C:\Users\olivi\OneDrive\Documents\clegit.pub`
   - Allez sur GitHub → Settings → SSH and GPG keys → New SSH key
   - Collez la clé publique

## Firebase CLI

Firebase CLI est installé globalement. Commandes principales :

- `firebase login` : Se connecter à Firebase
- `firebase init` : Initialiser un projet Firebase
- `firebase deploy` : Déployer le projet
- `firebase serve` : Tester localement
