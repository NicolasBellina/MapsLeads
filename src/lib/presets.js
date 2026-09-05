// Preset d'export : colonnes ordonnees pour le fichier XLSX.
// Les cles doivent exister dans ALL_COLUMNS (voir lib/columns.js).

export const DEFAULT_PRESET = "generic";

export const PRESETS = {
  generic: {
    label: "Générique",
    columns: [
      "name", "category", "address", "city", "siret", "trancheEffectif",
      "dateCreation", "phone", "website", "score",
    ],
  },
};

export function getPreset(key) {
  return PRESETS[key] || PRESETS[DEFAULT_PRESET];
}
