# Visuels Chrome Web Store

Fichiers prêts à téléverser, dans `out/`. Regénérer avec :

```bash
npm run store
```

## Où déposer chaque fichier

Dans la console développeur Chrome Web Store, onglet **Fiche du store** :

| Fichier | Champ | Format attendu |
|---|---|---|
| `screenshot-01-recherche.png` … `screenshot-05-export.png` | Captures d'écran | 1280 × 800, de 1 à 5 |
| `promo-small-440x280.png` | Petite vignette promotionnelle | 440 × 280 |
| `promo-marquee-1400x560.png` | Vignette Marquee | 1400 × 560, requise pour être mis en avant |
| `../icons/icon128.png` | Icône de l'extension | 128 × 128 |

Ordre conseillé des captures : 01 → 02 → 03 → 04 → 05. La première est celle
qui apparaît en vignette dans les résultats de recherche du store.

## Comment les captures sont produites

`build.mjs` ne redessine pas l'interface. Il :

1. interroge l'API SIRENE en direct et récupère de vrais établissements ;
2. charge `src/popup.html` et `src/session.html` telles quelles dans une iframe,
   avec une API `chrome` simulée qui rend ces données ;
3. photographie le résultat avec Chrome en mode headless, aux dimensions exactes.

Conséquence : si l'interface change, les visuels changent aussi. Ils ne peuvent
pas devenir mensongers par oubli de mise à jour, ce que Google vérifie
(« les captures doivent montrer l'expérience réelle »).

Les données affichées sont des restaurants réellement immatriculés à Tours. Les
statuts d'appel et les notes de la session sont, eux, fictifs : ils illustrent
la fonctionnalité sans exposer de prospection réelle.

La capture 05 n'affiche pas les colonnes Téléphone et Site web, que la base
SIRENE ne fournit pas et qui sortiraient vides de l'export.

## Dossiers

- `out/` — les PNG à téléverser.
- `.build/` — fichiers intermédiaires, regénérés à chaque exécution, non versionnés.
