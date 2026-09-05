# MapsLeads — correction recherche + preparation Chrome Web Store (2026-09-05)

## Bug signale
"restaurants" a "tours" renvoyait des entreprises parisiennes.

## Causes (les deux confirmees contre l'API en production)
1. Aucun filtre geographique. Le nom de ville etait concatene dans le parametre
   plein texte `q`. L'API Recherche d'entreprises fait du plein texte sur la
   RAISON SOCIALE : `q=restaurant tours` remonte "RESTAURANT GREGOIRE TOURS",
   dont le siege est a Paris 6.
2. Mauvais etablissement affiche. Le mapping lisait `item.siege`. Quand le
   filtre matche un etablissement secondaire, le siege est ailleurs
   (BUFFALO GRILL : etablissement a Tours, siege a Montrouge).

## Corrections
- [x] `src/lib/geo.js` : nom de commune -> code INSEE via geo.api.gouv.fr, filtre
      `code_commune`. Repli `code_postal` pour Paris/Lyon/Marseille (codes 75056,
      69123, 13055 absents de SIRENE). Cache dans chrome.storage.
- [x] `src/lib/sirene.js` : lecture de `matching_etablissements` (premier
      etablissement ouvert) au lieu de `siege`.
- [x] `src/lib/trades.js` + `naf-labels.js` : metier -> codes NAF
      (`activite_principale`) au lieu du plein texte. Repli plein texte si le
      metier est inconnu.
- [x] `etat_administratif=A` : les entreprises cessees ne sortent plus.
- [x] Colonne "Activite" : l'API ne renvoie jamais de libelle, seulement un code.
      Table NAF locale (732 sous-classes).
- [x] Colonne "Effectif" : decodage des codes INSEE (NN, 01, 02...) qui
      sortaient bruts, et score d'opportunite recalcule dessus.
- [x] Colonne "Ville" ajoutee a l'export.
- [x] Casse des raisons sociales, deduplication SIRET, sur-echantillonnage x3
      avant tri par score (l'API ne sait pas trier).
- [x] `AbortController` + timeout 15 s, throttle 200 ms, message dedie sur 429.
- [x] Styles manquants `.license-row` / `.license-input`.
- [x] Tri, touche Entree, annulation de la recherche precedente.

## Nettoyage avant publication
- [x] Supprime : `src/vendor/ExtPay.js` (52 ko), `src/lib/access.js`,
      `src/background.js`, `src/content.js` — tous morts. `access.js` importait
      quatre exports inexistants de `config.js`. `background.js` n'etait pas
      declare dans le manifeste.
- [x] `src/lib/csv.js` -> `src/lib/columns.js` (le code CSV n'etait plus appele).
- [x] `manifest.json` : version 2.1.0, ajout de geo.api.gouv.fr.
- [x] `scripts/package.sh` : archive limitee a manifest/src/icons.

## Reste a arbitrer (decision produit, non traite)
- `BETA_KEYS` dans `src/lib/config.js` : cles en dur qui donnent le premium.
- `SIGNED_SECRET` en clair : n'importe qui peut generer une cle ML-XXXXXXXX-XXXX.
- Le lien de paiement est un Payment Link Stripe, mais `license.js` valide contre
  l'API LemonSqueezy : un acheteur Stripe ne recoit aucune cle exploitable.
- Colonnes Telephone / Site web : SIRENE ne les fournit pas, toujours vides.

---

# Visuels Chrome Web Store (2026-09-05)

## Livrable
`store/out/` : 5 captures 1280x800, une vignette 440x280, une marquee 1400x560.
Regeneration : `npm run store`. Details dans `store/README.md`.

## Methode
`store/build.mjs` charge `src/popup.html` et `src/session.html` telles quelles
dans une iframe avec une API chrome simulee, alimentee par de vrais resultats
SIRENE (restaurants a Tours), puis photographie avec Chrome headless. Aucune
interface redessinee : les visuels suivent le produit.

## Bugs produits trouves en generant les visuels
- [x] `src/session.css` : `.s-list`, `.s-filters` et `.s-kanban` declarent
      `display:flex`, ce qui l'emportait sur l'attribut `hidden`. Basculer en vue
      Kanban ne masquait ni la liste ni les filtres, et les deux vues etaient
      empilees. Ajout de `[hidden] { display: none !important; }`.
- [x] Accents manquants dans des textes vus par l'utilisateur :
      tranches d'effectif (`sirene.js`), libelles de statut et placeholder de
      note (`session.js`, `session.html`), messages de licence (`license.js`),
      libelles de localisation (`geo.js`).

## Choix assume
La capture de l'export masque les colonnes Telephone et Site web : SIRENE ne les
fournit pas, les montrer vides sur le store serait trompeur. Le sort de ces deux
colonnes dans le produit reste a arbitrer (voir plus haut).
