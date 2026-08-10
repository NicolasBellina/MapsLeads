// Logique de quota freemium, isolee du reste de l'app.
// Etat stocke localement (chrome.storage.local). Module concu pour etre
// remplace plus tard par un controle cote serveur (Stripe/LemonSqueezy)
// sans toucher au popup ni au scraper.

const KEY = "quota";

// MODE TEST : a true, le quota et le paywall sont desactives (premium force,
// exports illimites). IMPORTANT : repasser a false avant publication.
const TEST_MODE = true;

const DEFAULTS = {
  exportsUsed: 0, // nombre d'exports deja consommes
  freeLimit: 3, // exports gratuits autorises
  freeRowCap: 20, // lignes max par export en gratuit
  isPremium: false, // flag manuel pour le MVP
};

export async function getState() {
  const stored = await chrome.storage.local.get(KEY);
  const state = { ...DEFAULTS, ...(stored[KEY] || {}) };
  state.testMode = TEST_MODE;
  if (TEST_MODE) state.isPremium = true; // desactive quota + plafond de lignes
  return state;
}

async function patch(changes) {
  const next = { ...(await getState()), ...changes };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function canExport() {
  const s = await getState();
  return s.isPremium || s.exportsUsed < s.freeLimit;
}

export async function recordExport() {
  const s = await getState();
  if (s.isPremium) return s;
  return patch({ exportsUsed: s.exportsUsed + 1 });
}

// Nombre de lignes exportables : illimite en premium, plafonne en gratuit.
export async function rowCap() {
  const s = await getState();
  return s.isPremium ? Infinity : s.freeRowCap;
}

export async function setPremium(value) {
  return patch({ isPremium: !!value });
}
