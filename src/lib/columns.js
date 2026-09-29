// Referentiel des colonnes exportables.
//
// Libelle d'entete par cle de donnee. Chaque preset (lib/presets.js) choisit
// et ordonne un sous-ensemble de ces cles. Partage avec lib/xlsx.js.
export const ALL_COLUMNS = {
  name: "Nom",
  siret: "SIRET",
  category: "Activité",
  codeNaf: "Code NAF",
  address: "Adresse",
  city: "Ville",
  trancheEffectif: "Effectif",
  dateCreation: "Création",
  phone: "Téléphone",
  website: "Site web",
  score: "Opportunité",
  callStatus: "Statut",
  callNote: "Note appel",
  callbackDate: "Date rappel",
};
