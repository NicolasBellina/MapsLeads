// Controle d'acces : essai gratuit puis abonnement, via ExtensionPay (Stripe).
//
// ExtensionPay stocke uniquement la date de debut d'essai et le statut de
// paiement. La duree de l'essai est appliquee ici (TRIAL_DAYS).
//
// ExtPay est charge en script classique (src/vendor/ExtPay.js) et expose une
// globale : dans le popup et la page session via une balise <script>, dans le
// service worker via importScripts.

import { EXTENSION_ID, TRIAL_DAYS, MODE, DEMO_EMAILS } from "./config.js";

const DEMO = new Set(DEMO_EMAILS.map((e) => e.trim().toLowerCase()));

const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
const CACHE_TTL = 60 * 1000; // evite un appel reseau a chaque interaction
const LAST_KNOWN_KEY = "accessLastKnown";

let client = null;
let cached = null; // { at, access }

function extpay() {
  if (!client) {
    if (typeof globalThis.ExtPay !== "function") {
      throw new Error("ExtPay non charge : verifiez l'inclusion de vendor/ExtPay.js");
    }
    client = globalThis.ExtPay(EXTENSION_ID);
  }
  return client;
}

// Traduit un objet user ExtensionPay en etat d'acces applicatif.
function toAccess(user) {
  const email = user.email || null;

  // Compte de demonstration : prioritaire sur tout le reste, jamais expire.
  if (email && DEMO.has(email.trim().toLowerCase())) {
    return { allowed: true, status: "demo", msLeft: 0, email };
  }

  if (user.paid) {
    return { allowed: true, status: "paid", msLeft: 0, email: user.email || null };
  }
  const startedAt = user.trialStartedAt ? new Date(user.trialStartedAt).getTime() : null;
  if (startedAt) {
    const msLeft = startedAt + TRIAL_MS - Date.now();
    if (msLeft > 0) {
      return { allowed: true, status: "trial", msLeft, email: user.email || null };
    }
    return { allowed: false, status: "trial_expired", msLeft: 0, email: user.email || null };
  }
  return { allowed: false, status: "none", msLeft: 0, email: null };
}

// Etat d'acces courant. Ne jette jamais : en cas d'echec reseau on retombe sur
// le dernier etat connu, pour ne pas bloquer un abonne hors ligne.
export async function getAccess({ force = false } = {}) {
  if (MODE === "DEV") {
    return { allowed: true, status: "dev", msLeft: 0, email: null };
  }
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.access;
  }
  try {
    const access = toAccess(await extpay().getUser());
    cached = { at: Date.now(), access };
    await chrome.storage.local.set({ [LAST_KNOWN_KEY]: access });
    return access;
  } catch {
    const stored = await chrome.storage.local.get(LAST_KNOWN_KEY);
    return (
      stored[LAST_KNOWN_KEY] || {
        allowed: false,
        status: "offline",
        msLeft: 0,
        email: null,
      }
    );
  }
}

// Ouvre la page ExtensionPay de demarrage d'essai (saisie de l'email).
export async function openTrialPage() {
  await extpay().openTrialPage(`${TRIAL_DAYS} jours`);
}

// Ouvre la page de paiement Stripe.
export async function openPaymentPage() {
  await extpay().openPaymentPage();
}

// Ouvre la page de connexion, pour retrouver un abonnement sur un autre appareil.
export async function openLoginPage() {
  await extpay().openLoginPage();
}

// Libelle court du temps d'essai restant.
export function formatTimeLeft(msLeft) {
  const hours = Math.ceil(msLeft / (60 * 60 * 1000));
  if (hours <= 1) return "moins d'une heure";
  if (hours < 24) return `${hours} h`;
  const days = Math.ceil(hours / 24);
  return `${days} jour${days > 1 ? "s" : ""}`;
}

// Invalide le cache memoire (apres un paiement ou un demarrage d'essai).
export function invalidate() {
  cached = null;
}
