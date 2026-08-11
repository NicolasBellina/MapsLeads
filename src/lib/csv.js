// Generation du CSV avec protection anti-injection de formules.
// Un fichier CSV ouvert dans Excel/Sheets execute les cellules commencant par
// = + - @ (ou une tabulation / retour chariot). Pour un fichier de leads ouvert
// par un professionnel, c'est une vraie faille : on neutralise chaque cellule.
//
// Separateur point-virgule : c'est le separateur de liste attendu par Excel en
// locale francaise. Avec une virgule, Excel FR met toute la ligne dans la
// premiere colonne (fichier illisible).

const DELIMITER = ";";

// Libelle d'entete par cle de donnee. Chaque preset (lib/presets.js) choisit
// et ordonne un sous-ensemble de ces cles. Partage avec lib/xlsx.js.
export const ALL_COLUMNS = {
  name: "Nom",
  category: "Catégorie",
  price: "Prix",
  phone: "Téléphone",
  website: "Site web",
  address: "Adresse",
  rating: "Note",
  reviews: "Avis",
  services: "Services",
  score: "Opportunité",
  mapsUrl: "Lien Maps",
  callStatus: "Statut",
  callNote: "Note appel",
  callbackDate: "Date rappel",
};

// Jeu complet par defaut (contact d'abord), utilise si aucun preset n'est passe.
const DEFAULT_KEYS = Object.keys(ALL_COLUMNS);

const INJECTION_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTING = /[";\n\r]/;

function sanitizeCell(value) {
  let s = value == null ? "" : String(value);
  // Neutralise l'injection de formule en prefixant d'une apostrophe.
  if (INJECTION_PREFIX.test(s)) s = "'" + s;
  // Echappe pour le format CSV (guillemets doubles).
  if (NEEDS_QUOTING.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toRow(lead, keys) {
  return keys.map((k) => sanitizeCell(lead[k])).join(DELIMITER);
}

// Construit le contenu CSV pour un ensemble ordonne de colonnes (`keys`).
// Prefixe BOM UTF-8 pour que Excel affiche correctement les accents, et utilise
// des fins de ligne CRLF (standard CSV).
export function buildCsv(leads, keys = DEFAULT_KEYS) {
  const cols = keys.filter((k) => k in ALL_COLUMNS);
  const BOM = "﻿";
  const header = cols.map((k) => sanitizeCell(ALL_COLUMNS[k])).join(DELIMITER);
  const lines = [header, ...leads.map((l) => toRow(l, cols))];
  return BOM + lines.join("\r\n");
}

export function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
