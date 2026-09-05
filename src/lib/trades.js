// Traduction d'un metier saisi en langage courant vers des codes NAF.
//
// Pourquoi : l'API Recherche d'entreprises fait de la recherche plein texte sur
// la raison sociale. "restaurant" ne ramene donc que les societes dont le NOM
// contient "restaurant", pas les restaurants. Le filtre fiable est
// `activite_principale` (code NAF). On resout donc le metier en codes NAF, et on
// ne retombe sur le plein texte que si aucun code n'est trouve.

import { NAF_LABELS } from "./naf-labels.js";

// Metiers dont le nom courant n'apparait pas dans le libelle NAF officiel
// (un "plombier" est classe "Travaux d'installation d'eau et de gaz").
// Le premier mot de chaque cle est la forme normalisee (sans accent, minuscule).
const TRADES = {
  restaurant: ["56.10A", "56.10C"],
  restauration: ["56.10A", "56.10B", "56.10C"],
  pizzeria: ["56.10C"],
  "fast food": ["56.10C"],
  traiteur: ["56.21Z", "56.29B"],
  bar: ["56.30Z"],
  cafe: ["56.30Z"],
  brasserie: ["56.10A", "56.30Z"],
  hotel: ["55.10Z", "55.20Z"],
  "chambre d hotes": ["55.20Z"],

  plombier: ["43.22A"],
  plomberie: ["43.22A"],
  chauffagiste: ["43.22B"],
  climatisation: ["43.22B"],
  electricien: ["43.21A"],
  electricite: ["43.21A"],
  menuisier: ["43.32A", "16.23Z"],
  menuiserie: ["43.32A", "16.23Z"],
  macon: ["43.99C"],
  maconnerie: ["43.99C"],
  couvreur: ["43.91B"],
  couverture: ["43.91B"],
  charpentier: ["43.91A"],
  charpente: ["43.91A"],
  carreleur: ["43.33Z"],
  carrelage: ["43.33Z"],
  peintre: ["43.34Z"],
  peinture: ["43.34Z"],
  vitrier: ["43.34Z"],
  platrier: ["43.31Z"],
  isolation: ["43.29A"],
  etancheite: ["43.99A"],
  serrurier: ["43.29B", "43.32B"],
  terrassement: ["43.12A"],
  "constructeur maison": ["41.20A"],
  batiment: ["41.20A", "41.20B"],
  paysagiste: ["81.30Z"],
  jardinier: ["81.30Z"],
  "espaces verts": ["81.30Z"],
  nettoyage: ["81.21Z", "81.22Z"],
  demenagement: ["49.42Z"],

  coiffeur: ["96.02A"],
  coiffure: ["96.02A"],
  esthetique: ["96.02B"],
  estheticienne: ["96.02B"],
  institut: ["96.02B"],
  ongles: ["96.02B"],
  tatoueur: ["96.09Z"],
  spa: ["96.04Z"],
  "salle de sport": ["93.13Z"],
  "coach sportif": ["85.51Z", "93.13Z"],
  pressing: ["96.01B"],
  "pompes funebres": ["96.03Z"],

  boulanger: ["10.71C", "47.24Z"],
  boulangerie: ["10.71C", "47.24Z"],
  patissier: ["10.71D", "47.24Z"],
  patisserie: ["10.71D", "47.24Z"],
  boucher: ["47.22Z", "10.13A"],
  boucherie: ["47.22Z"],
  primeur: ["47.21Z"],
  epicerie: ["47.11B"],
  supermarche: ["47.11D"],
  fleuriste: ["47.76Z"],
  opticien: ["47.78A"],
  bijoutier: ["47.77Z", "32.12Z"],
  librairie: ["47.61Z"],
  tabac: ["47.26Z"],
  pharmacie: ["47.73Z"],
  pharmacien: ["47.73Z"],
  vetement: ["47.71Z"],
  "magasin de sport": ["47.64Z"],

  garage: ["45.20A"],
  garagiste: ["45.20A"],
  carrosserie: ["45.20A"],
  "concessionnaire auto": ["45.11Z"],
  "auto ecole": ["85.53Z"],
  taxi: ["49.32Z"],
  vtc: ["49.32Z"],
  transporteur: ["49.41A", "49.41B"],
  "station service": ["47.30Z"],

  medecin: ["86.21Z", "86.22C"],
  dentiste: ["86.23Z"],
  infirmier: ["86.90D"],
  "sage femme": ["86.90D"],
  kinesitherapeute: ["86.90E"],
  kine: ["86.90E"],
  osteopathe: ["86.90E"],
  podologue: ["86.90E"],
  ambulance: ["86.90A"],
  veterinaire: ["75.00Z"],
  psychologue: ["86.90F"],

  avocat: ["69.10Z"],
  notaire: ["69.10Z"],
  juriste: ["69.10Z"],
  "expert comptable": ["69.20Z"],
  comptable: ["69.20Z"],
  comptabilite: ["69.20Z"],
  architecte: ["71.11Z"],
  "bureau d etudes": ["71.12B"],
  geometre: ["71.12A"],
  diagnostic: ["71.20B"],
  "agence immobiliere": ["68.31Z"],
  immobilier: ["68.31Z"],
  syndic: ["68.32A"],
  assurance: ["66.22Z"],
  courtier: ["66.19B", "66.22Z"],
  banque: ["64.19Z"],
  consultant: ["70.22Z"],
  conseil: ["70.22Z"],
  formation: ["85.59A", "85.59B"],
  "agence de voyage": ["79.11Z"],
  "agence de communication": ["73.11Z"],
  publicite: ["73.11Z"],
  marketing: ["73.11Z", "70.22Z"],
  "graphiste": ["74.10Z"],
  designer: ["74.10Z"],
  photographe: ["74.20Z"],
  imprimerie: ["18.12Z"],
  traducteur: ["74.30Z"],
  securite: ["80.10Z", "80.20Z"],

  informatique: ["62.01Z", "62.02A"],
  developpeur: ["62.01Z"],
  "agence web": ["62.01Z", "73.11Z"],
  "depannage informatique": ["95.11Z", "62.09Z"],
  hebergement: ["63.11Z"],
  telecom: ["61.20Z", "61.90Z"],

  menage: ["81.21Z", "97.00Z"],
  "aide a domicile": ["88.10A"],
  creche: ["88.91A"],
  "agence interim": ["78.20Z"],
  recrutement: ["78.10Z"],
};

const TRADE_KEYS = Object.keys(TRADES);

export function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Racine commune a deux mots : "restaurant" / "restauration" partagent
// "restaurat". Sert au repli sur les libelles NAF officiels.
function sharesStem(a, b) {
  const min = Math.min(a.length, b.length);
  if (min < 5) return a === b;
  let i = 0;
  while (i < min && a[i] === b[i]) i++;
  return i >= 5;
}

// La table est au singulier : "restaurants" doit trouver "restaurant".
const singular = (w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);
const lookup = (w) => TRADES[w] || TRADES[singular(w)];

// Resout un metier en codes NAF. Retourne [] si rien de fiable n'est trouve :
// l'appelant retombe alors sur la recherche plein texte.
export function resolveNaf(input) {
  const q = normalize(input);
  if (!q) return [];

  // 1. Table des metiers : expression exacte, puis expression contenue.
  const exact = lookup(q);
  if (exact) return exact;
  const contained = TRADE_KEYS.filter((k) => k.includes(" ") && q.includes(k));
  if (contained.length) return [...new Set(contained.flatMap((k) => TRADES[k]))];

  // 2. Table des metiers, mot a mot (gere "plombier chauffagiste").
  const words = q.split(" ").filter((w) => w.length >= 3);
  const byWord = [...new Set(words.flatMap((w) => lookup(w) || []))];
  if (byWord.length) return byWord;

  // 3. Repli : libelles NAF officiels, sur racine de mot.
  const hits = [];
  for (const [code, label] of Object.entries(NAF_LABELS)) {
    const labelWords = normalize(label).split(" ");
    if (words.some((w) => labelWords.some((lw) => sharesStem(w, lw)))) {
      hits.push(code);
    }
  }
  // Trop de codes = le mot est trop generique, le filtre n'apporte rien.
  return hits.length > 0 && hits.length <= 12 ? hits : [];
}

// Libelle officiel d'un code NAF, ou "" si le code est inconnu (codes NAF
// rev. 1 encore presents sur de vieux etablissements). L'appelant decide du repli.
export function nafLabel(code) {
  return NAF_LABELS[code] || "";
}
