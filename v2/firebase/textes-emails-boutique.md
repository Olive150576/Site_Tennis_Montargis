# Boutique du club — textes des emails

Ces trois emails accompagnent une commande groupée. Ils sont prêts à brancher : l'envoi automatique viendra avec Firebase (extension « Trigger Email » ou fonction Cloud). D'ici là, le bureau peut les copier-coller.

En attendant l'email, le membre reçoit déjà le même message dans son espace (Accueil et Agenda › Messages du bureau) quand le bureau clique sur « Passer en Commandée » ou « Disponible au club ».

**Les mots entre accolades sont remplacés automatiquement :**

| Variable | Exemple |
|---|---|
| `{prenom}` | Julien |
| `{produit}` | Veste de survêtement USM |
| `{detail}` | Taille M · Bleu royal · × 2 · marquage « JULIEN » |
| `{total}` | 88 € |
| `{date_limite}` | mardi 6 octobre |
| `{compteur}` | 20 / 25 pièces |
| `{manque}` | 5 |
| `{date_livraison}` | mardi 10 novembre |
| `{lien_boutique}` | https://tennismontargis.fr/espace-membre.html#boutique |
| `{lien_paiement}` | lien HelloAsso du produit, sinon le paragraphe « au club » |

**Expéditeur :** USM Tennis Montargis <usmmtennis@orange.fr>

**Règle d'or, rappelée dans chaque email :** personne ne paie tant que le minimum n'est pas atteint.

---

## 1. Confirmation de réservation

**Quand :** juste après « Je confirme » dans l'espace membre.

**Objet :** C'est réservé : {produit}

**Aperçu :** Rien à payer pour l'instant. Il manque {manque} pièces pour lancer la commande.

> Bonjour {prenom},
>
> Votre réservation est bien enregistrée :
>
> **{produit}**
> {detail}
> Total : **{total}**, à régler seulement si la commande part.
>
> **Où en est la commande ?** {compteur}. Il manque encore **{manque} pièces** pour atteindre le minimum demandé par le fournisseur.
>
> Vous ne payez rien aujourd'hui : personne ne paie tant que le minimum n'est pas atteint. S'il ne l'est pas le {date_limite}, la commande est annulée et vous êtes prévenu(e).
>
> **Envie d'accélérer ?** Partagez le lien à vos partenaires de jeu, chaque pièce compte : {lien_boutique}
>
> Vous pouvez modifier ou annuler votre réservation jusqu'au {date_limite} inclus, depuis la Boutique de votre espace membre.
>
> Sportivement,
> L'équipe de l'USM Tennis Montargis

---

## 2. Minimum atteint, la commande part

**Quand :** le bureau clique sur « Passer en Commandée » dans Admin › Boutique › Suivi.

**Objet :** Objectif atteint : la commande {produit} est lancée

**Aperçu :** Merci à tous ! Voici comment régler votre part.

> Bonjour {prenom},
>
> Bonne nouvelle : le minimum est atteint et le club vient de passer la commande au fournisseur.
>
> **Votre réservation**
> {produit}
> {detail}
> À régler : **{total}**
>
> **Pour régler :**
> - en ligne, en 2 minutes : {lien_paiement}
> - ou au club, auprès d'un membre du bureau.
>
> Merci de régler avant la livraison. Les réservations sont maintenant verrouillées ; pour tout changement, répondez simplement à cet email.
>
> **Livraison estimée :** {date_livraison}. On vous prévient dès que c'est arrivé.
>
> Merci à toutes celles et ceux qui ont réservé et partagé !
>
> L'équipe de l'USM Tennis Montargis

*Si le produit n'a pas de lien de paiement, retirer la ligne « en ligne ».*

---

## 3. Disponible au club

**Quand :** le bureau clique sur « Marquer Disponible au club ».

**Objet :** Votre {produit} vous attend au club

**Aperçu :** À retirer au club house, avec votre carte de membre.

> Bonjour {prenom},
>
> Votre commande est arrivée !
>
> **{produit}**
> {detail}
>
> Elle vous attend au club house, 43 avenue Louis Maurice Chautemps à Montargis, aux heures d'ouverture du club. Montrez votre carte de membre (QR code dans votre espace) à la personne du bureau présente.
>
> Vous n'avez pas encore réglé ? Prévoyez **{total}** pour régler sur place, ou réglez en ligne avant de passer : {lien_paiement}
>
> Vous ne pouvez pas venir ? Répondez à cet email : un coéquipier peut la récupérer pour vous.
>
> À très vite sur les courts,
> L'équipe de l'USM Tennis Montargis

---

## Bonus : annulation (minimum non atteint)

Le texte est proposé, et modifiable, dans la fenêtre « Annuler la commande groupée » de l'admin. Il est envoyé dans l'espace des membres concernés :

> Le minimum de {minimum} pièces n'a pas été atteint pour « {produit} ». La commande groupée est annulée : vous n'avez rien à payer. Merci à toutes celles et ceux qui avaient réservé !

**Objet conseillé pour l'email :** Commande {produit} annulée : rien à payer

---

## Branchement Firebase (prêt)

Les 3 emails sont envoyés par les fonctions Cloud du dépôt du site, avec le compte Gmail déjà utilisé pour le formulaire de contact. Le code est dans `firebase/functions/site-v2.js`, à brancher avec `brancher-site-v2.patch` (voir README, étape A).

- **Email 1** : à la création de `boutique_reservations/{produit}/{uid}/{id}`.
- **Emails 2 et 3** : quand le bureau clique sur « Passer en Commandée » ou « Disponible au club ». L'admin dépose alors un message dans `boutique_avis/{uid}`, qui déclenche l'email.
- **Annulation** : même mécanisme ; l'email reprend le texte saisi dans l'admin.
- **Destinataire :** `members/{uid}/email`. Un membre sans email reçoit seulement le message dans son espace.
- **Réponse :** un membre qui répond à l'email écrit à l'adresse du club (`info/email`).
