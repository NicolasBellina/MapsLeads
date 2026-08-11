# Plan de test — accès et paiement

Cases à cocher avant chaque publication touchant `src/lib/access.js`, `src/lib/config.js` ou le paywall du popup.

Les états d'accès possibles sont définis dans `src/lib/access.js` : `dev`, `demo`, `paid`, `trial`, `trial_expired`, `none`, `offline`. Chaque test ci-dessous couvre au moins un de ces états ou une transition entre deux d'entre eux.

## Préparation

Trois identités de test, à basculer via **Restaurer mon abonnement** dans le popup :

| Persona | Email | État attendu |
|---|---|---|
| Démo | celui listé dans `DEMO_EMAILS` | `demo` |
| Abonné | un email ayant payé | `paid` |
| Essai | un email n'ayant jamais servi | `trial` puis `trial_expired` |

Pour repartir d'une identité vierge : sur la page ExtensionPay en mode test, cliquer "réinitialiser cette extension à un état non payé", puis recharger l'extension.

Rappel : le cache de `getAccess()` dure 60 secondes. Après chaque changement d'état, fermer et rouvrir le popup avant de conclure.

---

## 1. États d'accès

### 1.1 Aucun compte (`none`)
Identité vierge, popup ouvert.
- Pied de page : "Essai non demarre"
- Paywall visible, titre "Essai gratuit 2 jours"
- Les deux boutons présents : "Demarrer l'essai gratuit 2 jours" et "S'abonner — 15 €/mois"

### 1.2 Essai actif (`trial`)
Démarrer un essai avec un email neuf.
- Pied de page : "Essai : 2 jours restant", barre pleine
- Paywall masqué
- Extraction, export et session d'appels fonctionnent

### 1.3 Essai expiré (`trial_expired`)
Passer `TRIAL_DAYS` à `0` dans `src/lib/config.js`, recharger.
- Pied de page : "Essai termine"
- Paywall visible, titre "Essai termine"
- Bouton "S'abonner" seul, bouton d'essai masqué
- Les trois actions sont refusées avec un message explicite

Remettre `TRIAL_DAYS = 2` ensuite.

### 1.4 Abonné (`paid`)
Se connecter avec l'email de l'abonné.
- Pied de page : "Abonnement actif"
- Paywall masqué, toutes les actions disponibles

### 1.5 Compte démo (`demo`)
Se connecter avec un email de `DEMO_EMAILS`.
- Pied de page : "Compte demo - acces illimite"
- Priorité vérifiée : même si ce compte a un essai expiré, l'accès reste ouvert

### 1.6 Mode développeur (`dev`)
`MODE = "DEV"` dans `src/lib/config.js`.
- Pied de page : "Mode DEV - acces illimite"
- Aucun appel réseau : le test doit passer avec le wifi coupé

Remettre `MODE = "PROD"` ensuite.

---

## 2. Actions protégées

À rejouer dans un état bloqué (`none` ou `trial_expired`). Chaque action doit être refusée **et** afficher le paywall.

- **Extraire les résultats** → message "Demarrez l'essai gratuit pour extraire des leads."
- **Exporter** → message "Abonnez-vous pour exporter vos leads."
- **Ouvrir la session d'appels** → message "Demarrez l'essai gratuit pour ouvrir la session d'appels."

### 2.1 Accès direct à la session d'appels
Le contrôle de `session.html` est indépendant de celui du popup. Ouvrir l'URL directement dans un onglet :

```
chrome-extension://<ID_DE_L_EXTENSION>/src/session.html
```

Dans un état bloqué, la page doit afficher le message d'accès refusé et ne charger aucun lead. C'est le contournement le plus évident pour un utilisateur qui aurait mis la page en favori pendant son essai.

---

## 3. Transitions

### 3.1 Démarrage d'essai
Depuis `none`, cliquer "Demarrer l'essai gratuit", saisir un email, cliquer le lien reçu.
- Le lien doit être ouvert dans le profil Chrome où l'extension est installée
- Au retour sur le popup, l'état passe à `trial`

### 3.2 Souscription depuis l'état initial
Depuis `none`, cliquer "S'abonner" sans passer par l'essai. Payer avec `4242 4242 4242 4242`.
- L'état passe directement à `paid`, sans jamais passer par `trial`

### 3.3 Souscription pendant l'essai
Depuis `trial`, forcer l'affichage du paywall (via une action bloquée ou l'expiration), puis payer.
- L'état passe de `trial` à `paid`

### 3.4 Rafraîchissement au retour d'onglet
Laisser le popup ouvert, payer dans l'autre onglet, revenir sur le popup sans le fermer.
- L'écouteur `focus` de `src/popup.js` doit rafraîchir l'état sans intervention

### 3.5 Changement de compte
Utiliser "Restaurer mon abonnement" pour passer d'une identité à une autre.
- Chaque bascule doit produire le bon état, sans reliquat du compte précédent

---

## 4. Cas dégradés

### 4.1 Perte de réseau, utilisateur autorisé
En état `paid` ou `trial`, couper le wifi, fermer et rouvrir le popup.
- L'accès doit être **maintenu** : `getAccess()` retombe sur `accessLastKnown`
- Un abonné en déplacement ne doit jamais être bloqué

### 4.2 Perte de réseau, aucun état connu
Identité vierge, wifi coupé, popup ouvert.
- État `offline`, titre "Statut indisponible", accès refusé

### 4.3 ExtensionPay injoignable
Simulable en mettant un `EXTENSION_ID` inexistant dans `src/lib/config.js`.
- L'extension ne doit pas planter : elle bascule sur le dernier état connu ou sur `offline`

### 4.4 Perte d'accès
Annuler l'abonnement immédiatement, ou attendre la fin de période.
- L'état repasse à `trial_expired` ou `none` et le paywall réapparaît
- Ces trois scénarios (annulation immédiate, fin de période, impayé) convergent tous vers `user.paid === false`

---

## 5. Avant publication

- `MODE = "PROD"` dans `src/lib/config.js`
- `TRIAL_DAYS = 2` dans `src/lib/config.js`
- `DEMO_EMAILS` ne contient que les emails voulus
- Portail client Stripe activé en mode live
- Nom de l'extension correct dans le dashboard ExtensionPay : c'est le libellé vu par le client sur son relevé bancaire
- Aucune erreur dans la console du service worker (`chrome://extensions` → "Inspecter les vues : service worker")

Après publication, refaire au minimum les tests 1.1, 3.1 et 3.2 depuis l'extension **installée depuis le Chrome Web Store**, avec un vrai moyen de paiement. Le mode est figé dans la clé d'API à sa création, donc aucun compte de test ne migre en production.
