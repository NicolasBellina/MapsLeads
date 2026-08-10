// Presets par type d'activite. Ajouter un metier = une entree ici, rien
// d'autre a toucher : le popup lit `filters` pour afficher les bons champs et
// `columns` pour ordonner le CSV. Les cles de `columns` doivent exister dans
// ALL_COLUMNS (voir lib/csv.js) ; les cles de `filters` dans FILTER_KEYS.
//
// filters possibles : "price", "rating", "reviews", "services".

export const DEFAULT_PRESET = "restaurant";

export const PRESETS = {
  // Contact d'abord (Nom, Telephone, Site web, Adresse) : ce sont les colonnes
  // utiles pour prospecter, on les met en tete pour un CSV lisible ; le reste
  // (categorie, prix, note...) suit.
  restaurant: {
    label: "Restaurant",
    filters: ["price", "rating", "reviews", "services"],
    columns: [
      "name", "phone", "website", "address",
      "category", "price", "rating", "reviews", "services", "score", "mapsUrl",
    ],
  },
  hotel: {
    // Un hotel ne fait ni "a emporter" ni "livraison" : on masque les services.
    label: "Hôtel",
    filters: ["price", "rating", "reviews"],
    columns: [
      "name", "phone", "website", "address",
      "category", "price", "rating", "reviews", "score", "mapsUrl",
    ],
  },
  generic: {
    // Prospection large (artisans, commerces...) : on garde le contact + la
    // reputation, sans prix ni services souvent absents pour ces metiers.
    label: "Générique",
    filters: ["rating", "reviews"],
    columns: [
      "name", "phone", "website", "address",
      "category", "rating", "reviews", "score", "mapsUrl",
    ],
  },
};

export function getPreset(key) {
  return PRESETS[key] || PRESETS[DEFAULT_PRESET];
}
