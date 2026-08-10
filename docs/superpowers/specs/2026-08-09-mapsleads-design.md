# MapsLeads — Design du MVP

Date : 2026-08-09
Statut : validé, en implémentation

## Objectif

Extension Chrome freemium qui extrait les résultats d'une recherche Google Maps
(nom, catégorie, adresse, note, avis, site web, téléphone) et les exporte en CSV.
Cible : commerciaux, agences, prospection B2B.

Modèle : gratuit avec quota (3 exports, 20 lignes max/export), puis abonnement.

## Contraintes

- Budget ~0 € : aucune API payante, aucun backend pour le MVP.
- Vendu à des professionnels → design soigné + sécurité soignée.
- Dev confirmé, JS vanilla, zéro dépendance runtime, Manifest V3.

## Architecture

Injection à la demande (pas de content script permanent) pour minimiser les
permissions. Quand l'utilisateur clique sur l'icône, le popup :

1. récupère l'onglet actif (`activeTab`),
2. vérifie que c'est une URL Google Maps,
3. injecte `content.js` via `chrome.scripting.executeScript`,
4. lui envoie un message "extract" et reçoit le tableau de leads,
5. gère quota + génère le CSV + télécharge (Blob + ancre, sans permission `downloads`).

### Permissions (moindre privilège)

`["activeTab", "scripting", "storage"]`. Aucune `host_permissions`, aucun accès
permanent aux sites. L'extension ne peut lire une page que lorsque l'utilisateur
clique explicitement sur son icône.

### Fichiers

```
manifest.json              MV3, service_worker string, permissions minimales
src/popup.html             UI du popup
src/popup.css              styles (design soigné, sobre, pro)
src/popup.js               orchestration (module) : inject, message, quota, export
src/content.js             scraper autonome injecté dans l'onglet Maps
src/lib/quota.js           logique de quota (isolée, remplaçable par un backend)
src/lib/csv.js             génération CSV + protection anti-injection
icons/icon16|48|128.png    icônes générées par scripts/generate-icons.js
scripts/generate-icons.js  génère les PNG (aucune dépendance)
```

## Extraction (content.js)

- Cible le conteneur `[role="feed"]`, itère sur les cartes (`.Nv2PK` avec fallback
  `[role="feed"] > div`).
- Auto-scroll du feed jusqu'à stabilisation du nombre de résultats (avec plafond
  de sécurité pour éviter les boucles infinies).
- Sélecteurs sémantiques centralisés en tête de fichier (`SELECTORS`) pour
  correction facile quand Google change son DOM.
- Champs : nom (`fontHeadlineSmall`), note + avis (`aria-label` du `[role="img"]`),
  catégorie + adresse (lignes `.W4Efsd`), site web (lien "site web" de la carte si
  présent), téléphone (best effort depuis la carte). Champs manquants = vide.
- Enrichissement téléphone/site via ouverture de la fiche détail : hors périmètre
  MVP (v2), plus lent et plus fragile.
- Limite : sélecteurs optimisés pour Maps en anglais ; les autres langues ont un
  DOM différent (noté comme limitation connue).

## Quota (src/lib/quota.js)

État dans `chrome.storage.local` :
`{ exportsUsed: number, freeLimit: 3, freeRowCap: 20, isPremium: boolean }`.

API : `getState()`, `canExport()`, `recordExport()`, `rowCap()`.
`isPremium` est un flag manuel pour le MVP. Module isolé pour brancher plus tard
un contrôle côté serveur (Stripe/LemonSqueezy) sans toucher au reste.

## Sécurité (exigence pro)

- **Confidentialité** : aucune donnée ne quitte le navigateur, aucune requête
  réseau sortante, aucune télémétrie. Argument de vente.
- **Permissions minimales** : voir ci-dessus.
- **Anti-injection CSV** : tout champ commençant par `= + - @` (ou tab/CR) est
  préfixé d'une apostrophe avant export, pour empêcher l'exécution de formules
  dans Excel/Sheets.
- **Anti-XSS popup** : le rendu de l'aperçu utilise `textContent`, jamais
  `innerHTML` avec des données scrapées.
- **Pas de code distant** : conforme MV3, aucun `eval`, aucun script externe.

## Design (exigence pro)

Popup sobre et crédible : en-tête avec logo, état (URL Maps détectée ou non),
bouton d'action principal, jauge de quota, aperçu compact des résultats, CTA
premium quand le quota est épuisé. Palette neutre + une couleur d'accent.

## Hors périmètre MVP (v2)

- Backend serverless + paiement réel (Stripe/LemonSqueezy) et vraie licence.
- Enrichissement téléphone/site via fiches détail.
- Support multilingue robuste du DOM Maps.
- Déduplication et filtres avancés.

## Risque connu

Le scraping automatisé de Google Maps est en zone grise vis-à-vis des CGU de
Google. Acceptable pour un MVP de validation ; à réévaluer avant publication.
