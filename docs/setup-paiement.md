# Guide de mise en place du paiement — MapsLeads

Stack : **ExtensionPay** (gestion des utilisateurs et du gating) + **Stripe** (encaissement).

Durée estimée : 1 heure. Coût de mise en place : 0 €.

Modèle vendu : essai gratuit de **2 jours sans carte bancaire**, puis abonnement **15 €/mois**. Passé l'essai, l'extraction, l'export et la session d'appels sont bloqués tant que l'abonnement n'est pas souscrit.

---

## Étape 1 — Créer votre compte Stripe

1. Aller sur [stripe.com](https://stripe.com) → "Démarrer maintenant"
2. Créer le compte (pays : France, devise EUR)
3. Compléter la vérification d'identité et ajouter votre IBAN pour les virements
4. Dans [Paramètres > Moyens de paiement](https://dashboard.stripe.com/settings/payment_methods), activer un maximum de moyens de paiement (cartes, Link, Apple Pay, Google Pay)

Vous n'avez **pas** besoin de créer un produit ou un lien de paiement dans Stripe : ExtensionPay s'en charge.

---

## Étape 2 — Créer votre compte ExtensionPay

1. Aller sur [extensionpay.com](https://extensionpay.com) → créer un compte
2. Connecter votre compte Stripe quand l'assistant le propose
3. Créer une nouvelle extension :
   - **Extension ID** : `mapsleads`
     C'est le slug utilisé dans le code, pas l'ID du Chrome Web Store. S'il est déjà pris, choisissez-en un autre et reportez-le à l'étape 4.
   - **Nom** : MapsLeads
4. Créer le plan tarifaire :
   - Type : **Subscription** (récurrent)
   - Montant : **15 €**
   - Intervalle : **mensuel**

L'essai gratuit n'a rien à configurer côté ExtensionPay : sa durée (2 jours) est appliquée par l'extension, via `TRIAL_DAYS` dans `src/lib/config.js`.

---

## Étape 3 — Régler la gestion des échecs de paiement dans Stripe

Dans [Paramètres > Facturation > Abonnements](https://dashboard.stripe.com/settings/billing/automatic) :

- Activer les relances automatiques (emails de rappel en cas de carte refusée)
- Choisir **Annuler l'abonnement** à l'issue des relances

Sans ce réglage, un abonnement impayé peut rester bloqué en `past_due` indéfiniment. L'extension considère un utilisateur `past_due` comme non payant, donc il perd l'accès dès le premier échec.

---

## Étape 4 — Configurer l'extension

Ouvrir `src/lib/config.js` :

```js
export const EXTENSION_ID = "mapsleads"; // doit correspondre à l'ID ExtensionPay
export const TRIAL_DAYS = 2;
export const MODE = "PROD"; // "DEV" = accès complet sans paiement, pour développer
```

Reporter la même valeur dans `src/background.js` :

```js
const extpay = ExtPay("mapsleads");
```

Les deux doivent être identiques, sinon le statut de paiement ne remonte jamais.

---

## Étape 5 — Tester en mode test

ExtensionPay démarre en **mode test**, branché sur Stripe en test. Rien à changer.

1. Chrome → `chrome://extensions` → "Mode développeur" → "Charger l'extension non empaquetée"
2. Ouvrir le popup : le panneau "Essai gratuit 2 jours" s'affiche
3. Cliquer **Démarrer l'essai gratuit 2 jours** → un onglet ExtensionPay s'ouvre et demande un email
4. Saisir un email, ouvrir le lien reçu par email → l'essai démarre
5. Revenir sur le popup : le pied de page affiche "Essai : 2 jours restant", extraction et export fonctionnent
6. Tester le paiement : cliquer **S'abonner**, puis utiliser une [carte de test Stripe](https://docs.stripe.com/testing) (`4242 4242 4242 4242`, date future, CVC quelconque)
   En mode test, ExtensionPay demande le mot de passe de votre compte avant d'accéder au Checkout : c'est normal, c'est une protection anti-fraude
7. Revenir sur le popup : "Abonnement actif"

### Tester la fin de l'essai sans attendre 2 jours

Passer temporairement `TRIAL_DAYS` à `0` dans `src/lib/config.js`, recharger l'extension : le paywall "Essai terminé" doit apparaître et bloquer extraction, export et session d'appels. Remettre `2` ensuite.

---

## Étape 6 — Passer en production

1. Dans le dashboard ExtensionPay, basculer l'extension en **mode live**
2. Vérifier que `MODE = "PROD"` dans `src/lib/config.js`
3. Publier l'extension sur le Chrome Web Store

---

## Ce qui se passe automatiquement ensuite

| Événement | Conséquence |
|---|---|
| Essai démarré | `user.trialStartedAt` est daté ; l'extension accorde 2 jours |
| Essai écoulé | Paywall "Essai terminé", toutes les fonctions bloquées |
| Abonnement souscrit | `user.paid = true`, accès illimité |
| Paiement échoué | Statut `past_due` → accès coupé, Stripe relance le client |
| Abonnement annulé | Accès maintenu jusqu'à la fin de la période payée, puis coupé |
| Utilisateur hors ligne | Dernier statut connu conservé, pour ne pas bloquer un abonné sans connexion |

L'extension revérifie le statut au maximum une fois par minute (cache mémoire dans `src/lib/access.js`), et systématiquement au retour sur le popup.

---

## Revenus et commissions

- ExtensionPay : **5%** par transaction
- Stripe : environ **1,5% + 0,25 €** pour une carte européenne
- Sur 15 €/mois : vous recevez environ **13,5 €** net par client

### TVA — à votre charge

ExtensionPay n'est **pas** merchant of record. Vous êtes le vendeur, donc la TVA vous incombe :

- Clients en France : TVA française classique (ou franchise en base si vous êtes sous les seuils)
- Clients particuliers dans un autre pays de l'UE : le régime **OSS** s'applique dès le premier euro sur les services numériques, avec déclaration trimestrielle

Si vous vendez largement hors de France, envisagez [Stripe Tax](https://dashboard.stripe.com/settings/tax) pour le calcul, ou un merchant of record qui prend la déclaration en charge.

---

## Architecture technique

| Fichier | Rôle |
|---|---|
| `src/vendor/ExtPay.js` | Librairie ExtensionPay (v3.1.2), copiée depuis npm, AGPLv3 |
| `src/background.js` | Service worker, appelle `extpay.startBackground()` (obligatoire) |
| `src/lib/config.js` | `EXTENSION_ID`, `TRIAL_DAYS`, `MODE` |
| `src/lib/access.js` | Traduit le statut ExtensionPay en état d'accès applicatif |
| `manifest.json` | Content script sur `https://extensionpay.com/*` (obligatoire) |

Aucun backend, aucune base de données, aucune clé de licence à gérer.

### Mettre à jour la librairie

```bash
npm pack extpay
tar xzf extpay-*.tgz
cp package/dist/ExtPay.js src/vendor/ExtPay.js
```

---

## Dépannage fréquent

**Le popup affiche "Statut indisponible"**
→ ExtensionPay est injoignable. Vérifier la connexion, et que le content script sur `https://extensionpay.com/*` est bien déclaré dans `manifest.json`.

**Le statut reste "Essai non démarré" après paiement**
→ `EXTENSION_ID` dans `config.js` et l'ID dans `background.js` ne correspondent pas à celui du dashboard ExtensionPay.

**"ExtPay non charge"**
→ La balise `<script src="vendor/ExtPay.js">` manque dans `popup.html` ou `session.html`. Elle doit précéder le `<script type="module">`.

**Le service worker ne démarre pas**
→ Vérifier dans `chrome://extensions` → "Inspecter les vues : service worker". Le chemin `importScripts("/src/vendor/ExtPay.js")` est absolu depuis la racine de l'extension.
