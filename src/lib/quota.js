// Quota gratuit (3 exports / 20 lignes en PROD) et etat premium via license.js.

import { validate } from "./license.js";

const MODE = "PROD"; // "DEV" ou "PROD"
const KEY = "quota";
const DEFAULTS = { exportsUsed: 0, freeLimit: 3, rowFreeLimit: 20 };

async function load() {
  const d = await chrome.storage.local.get(KEY);
  return { ...DEFAULTS, ...(d[KEY] || {}) };
}

async function store(state) {
  await chrome.storage.local.set({ [KEY]: state });
}

export async function getState() {
  const q = await load();
  const isPremium = MODE === "DEV" ? true : (await validate()).valid;
  return { ...q, mode: MODE, isPremium };
}

export async function canExport() {
  const s = await getState();
  return s.isPremium || s.exportsUsed < s.freeLimit;
}

export async function recordExport() {
  const s = await getState();
  if (s.isPremium) return;
  const q = await load();
  if (q.exportsUsed < q.freeLimit) {
    await store({ ...q, exportsUsed: q.exportsUsed + 1 });
  }
}

export async function rowCap() {
  const s = await getState();
  return s.isPremium ? Infinity : s.rowFreeLimit;
}
