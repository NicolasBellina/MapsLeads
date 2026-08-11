// Orchestration du popup : detecte l'onglet Maps, injecte le scraper a la
// demande, gere le quota, genere et telecharge le CSV.
import {
  getAccess,
  openTrialPage,
  openPaymentPage,
  openLoginPage,
  formatTimeLeft,
  invalidate,
} from "./lib/access.js";
import { buildXlsx, downloadXlsx } from "./lib/xlsx.js";
import { getPreset } from "./lib/presets.js";
import { TRIAL_DAYS } from "./lib/config.js";

const MAPS_URL_RE = /^https:\/\/www\.google\.[^/]+\/maps/;
// Plafond de collecte : l'enrichissement ouvre chaque fiche (~1,5 s),
// on borne pour eviter des extractions interminables.
const PREMIUM_CAP = 120;
const TRIAL_TOTAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

const el = (id) => document.getElementById(id);
const ui = {
  status: el("status"),
  extractBtn: el("extractBtn"),
  exportBtn: el("exportBtn"),
  results: el("results"),
  resultCount: el("resultCount"),
  preview: el("preview"),
  paywall: el("paywall"),
  quotaFill: el("quotaFill"),
  quotaText: el("quotaText"),
  activityType: el("activityType"),
  limitInput: el("limitInput"),
  maxPrice: el("maxPrice"),
  minRating: el("minRating"),
  minReviews: el("minReviews"),
  takeaway: el("takeaway"),
  delivery: el("delivery"),
  noWebsite: el("noWebsite"),
  sortBy: el("sortBy"),
  sessionBtn: el("sessionBtn"),
  paywallTitle: el("paywallTitle"),
  paywallText: el("paywallText"),
  trialBtn: el("trialBtn"),
  subscribeBtn: el("subscribeBtn"),
  loginBtn: el("loginBtn"),
  accessStatus: el("accessStatus"),
};

// Affiche uniquement les filtres pertinents pour le type d'activite choisi.
function applyPreset() {
  const on = new Set(getPreset(ui.activityType.value).filters);
  for (const node of document.querySelectorAll("[data-filter]")) {
    node.classList.toggle("hidden", !on.has(node.dataset.filter));
  }
}

// Lit le panneau de filtres. Un critere masque par le preset est neutralise
// (on n'applique jamais un filtre invisible, ex : "livraison" pour un hotel).
function readFilters() {
  const on = new Set(getPreset(ui.activityType.value).filters);
  return {
    maxPrice: on.has("price") ? parseInt(ui.maxPrice.value, 10) || 0 : 0,
    minRating: on.has("rating") ? parseFloat(ui.minRating.value) || 0 : 0,
    minReviews: on.has("reviews") ? parseInt(ui.minReviews.value, 10) || 0 : 0,
    takeaway: on.has("services") && ui.takeaway.checked,
    delivery: on.has("services") && ui.delivery.checked,
    noWebsite: ui.noWebsite.checked, // filtre contact (applique apres la fiche)
  };
}

const reviewsNum = (lead) => parseInt(lead.reviews || "0", 10) || 0;
const ratingNum = (lead) => parseFloat((lead.rating || "").replace(",", ".")) || 0;

// Score d'opportunite digitale (0-100) : un lieu populaire et bien note MAIS
// sans site web est le prospect ideal pour un service digital.
//   popularite (avis)  -> 0..50   |  reputation (note) -> 0..20
//   absence de site web -> +30 (signal fort)
function opportunityScore(lead) {
  const pop = Math.min(50, Math.round((reviewsNum(lead) / 500) * 50));
  const r = ratingNum(lead);
  const rep = r >= 3.5 ? Math.round(((r - 3.5) / 1.5) * 20) : 0;
  const gap = lead.website ? 0 : 30;
  return Math.min(100, pop + rep + gap);
}

function sortLeads(list) {
  const by = ui.sortBy.value;
  if (by === "none") return list;
  const keyFn =
    by === "score" ? (l) => l.score
    : by === "rating" ? ratingNum
    : reviewsNum; // "reviews" par defaut
  return list.sort((a, b) => keyFn(b) - keyFn(a));
}

let leads = [];

function setStatus(text, kind) {
  ui.status.textContent = text;
  ui.status.className = `status status--${kind}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isMapsTab(tab) {
  return !!(tab && tab.url && MAPS_URL_RE.test(tab.url));
}

// Contenu du panneau paywall selon l'etat d'acces. Le panneau n'est affiche
// que lorsqu'une action est bloquee, ou quand l'essai n'a pas encore demarre.
const PAYWALL_COPY = {
  none: {
    title: "Essai gratuit 2 jours",
    text: "Exports illimites et session d'appels complete pendant 2 jours, sans carte bancaire. Vous pouvez aussi vous abonner directement.",
    trial: true,
    subscribe: true,
  },
  trial_expired: {
    title: "Essai termine",
    text: "Votre essai de 2 jours est ecoule. Abonnez-vous pour continuer a extraire et exporter vos leads.",
    trial: false,
    subscribe: true,
  },
  offline: {
    title: "Statut indisponible",
    text: "Impossible de verifier votre abonnement. Verifiez votre connexion puis rouvrez le popup.",
    trial: false,
    subscribe: true,
  },
};

function renderPaywall(access) {
  const copy = PAYWALL_COPY[access.status] || PAYWALL_COPY.trial_expired;
  ui.paywallTitle.textContent = copy.title;
  ui.paywallText.textContent = copy.text;
  ui.trialBtn.classList.toggle("hidden", !copy.trial);
  ui.subscribeBtn.classList.toggle("hidden", !copy.subscribe);
}

async function renderAccess() {
  const access = await getAccess();
  renderPaywall(access);

  if (access.status === "dev") {
    ui.quotaFill.style.width = "100%";
    ui.quotaText.textContent = "Mode DEV - acces illimite";
  } else if (access.status === "demo") {
    ui.quotaFill.style.width = "100%";
    ui.quotaText.textContent = "Compte demo - acces illimite";
  } else if (access.status === "paid") {
    ui.quotaFill.style.width = "100%";
    ui.quotaText.textContent = "Abonnement actif";
  } else if (access.status === "trial") {
    const total = TRIAL_TOTAL_MS;
    ui.quotaFill.style.width = `${Math.max(0, Math.min(100, (access.msLeft / total) * 100))}%`;
    ui.quotaText.textContent = `Essai : ${formatTimeLeft(access.msLeft)} restant`;
  } else {
    ui.quotaFill.style.width = "0%";
    ui.quotaText.textContent =
      access.status === "none" ? "Essai non demarre" : "Essai termine";
  }

  // Sans acces, l'essai n'a pas encore demarre : on met le paywall en avant.
  ui.paywall.classList.toggle("hidden", access.allowed);
  return access;
}

// Refuse l'action et affiche le paywall. Retourne true si l'acces est ouvert.
async function requireAccess(message) {
  const access = await getAccess();
  if (access.allowed) return true;
  renderPaywall(access);
  ui.paywall.classList.remove("hidden");
  setStatus(message, "warn");
  return false;
}

// Rendu de l'apercu : textContent uniquement (jamais innerHTML) pour eviter
// toute injection XSS depuis des donnees scrapees.
function renderPreview() {
  ui.preview.replaceChildren();
  for (const lead of leads.slice(0, 25)) {
    const li = document.createElement("li");
    const name = document.createElement("div");
    name.className = "p-name";
    name.textContent = lead.name;
    if (!lead.website) {
      const badge = document.createElement("span");
      badge.className = "badge badge--opp";
      badge.textContent = "sans site";
      name.append(" ", badge);
    }
    const meta = document.createElement("div");
    meta.className = "p-meta";
    const stars = lead.rating ? `${lead.rating}★` : "";
    const avis = reviewsNum(lead) ? `${reviewsNum(lead)} avis` : "";
    const score = `Opp. ${lead.score}`;
    meta.textContent = [lead.category, lead.price, stars, avis, lead.services, score]
      .filter(Boolean)
      .join(" · ");
    li.append(name, meta);
    ui.preview.append(li);
  }
  ui.resultCount.textContent = `${leads.length} lead${leads.length > 1 ? "s" : ""} trouve${leads.length > 1 ? "s" : ""}`;
  ui.results.classList.toggle("hidden", leads.length === 0);
  ui.exportBtn.classList.toggle("hidden", leads.length === 0);
}

async function handleExtract() {
  const tab = await getActiveTab();
  if (!isMapsTab(tab)) {
    setStatus("Ouvrez une recherche Google Maps d'abord.", "warn");
    return;
  }

  if (!(await requireAccess("Demarrez l'essai gratuit pour extraire des leads."))) {
    return;
  }

  ui.extractBtn.classList.add("is-loading");
  ui.extractBtn.disabled = true;
  ui.paywall.classList.add("hidden");

  // Nombre de leads a collecter/enrichir : le champ "Nombre a extraire"
  // (defaut 20), borne a PREMIUM_CAP pour eviter les extractions interminables.
  const count = Math.max(1, Math.min(parseInt(ui.limitInput.value, 10) || 20, PREMIUM_CAP));
  const filters = readFilters();
  setStatus(
    `Extraction en cours (jusqu'a ${count} fiches, ~${Math.ceil((count * 1.5) / 5) * 5}s). Gardez ce popup ouvert.`,
    "muted"
  );

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content.js"],
    });
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: "extract",
      maxRows: count,
      enrichLimit: count,
      filters,
    });

    if (!res || !res.ok) {
      setStatus(
        "Aucune liste de resultats detectee. Lancez une recherche sur Maps.",
        "warn"
      );
      leads = [];
      renderPreview();
      return;
    }

    leads = res.leads;
    for (const lead of leads) lead.score = opportunityScore(lead);
    sortLeads(leads);
    if (leads.length === 0) {
      setStatus("Aucun lead extrait sur cette page.", "warn");
    } else {
      setStatus(`${leads.length} leads prets a exporter.`, "ok");
      await chrome.storage.local.set({ popupLeadsCache: leads, callSession: leads });
    }
    renderPreview();
  } catch (e) {
    setStatus("Erreur pendant l'extraction. Rechargez la page Maps.", "warn");
  } finally {
    ui.extractBtn.classList.remove("is-loading");
    ui.extractBtn.disabled = false;
  }
}

async function handleExport() {
  if (leads.length === 0) return;

  if (!(await requireAccess("Abonnez-vous pour exporter vos leads."))) return;

  const preset = getPreset(ui.activityType.value);
  const xlsx = buildXlsx(leads, preset.columns);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadXlsx(xlsx, `mapsleads-${ui.activityType.value}-${stamp}.xlsx`);

  await renderAccess();
  setStatus(`${leads.length} leads exportes en Excel.`, "ok");
}

async function init() {
  const tab = await getActiveTab();

  // Restaure les leads de la derniere extraction (persiste entre changements d'onglets)
  const cache = await chrome.storage.local.get("popupLeadsCache");
  if (cache.popupLeadsCache?.length > 0) {
    leads = cache.popupLeadsCache;
    renderPreview();
    ui.exportBtn.classList.remove("hidden");
  }

  if (isMapsTab(tab)) {
    setStatus(
      leads.length > 0
        ? `${leads.length} leads en memoire. Cliquez "Extraire" pour actualiser.`
        : "Recherche Google Maps detectee.",
      leads.length > 0 ? "muted" : "ok"
    );
    ui.extractBtn.disabled = false;
  } else {
    setStatus(
      leads.length > 0
        ? `${leads.length} leads en memoire.`
        : "Ouvrez une recherche Google Maps pour commencer.",
      leads.length > 0 ? "muted" : "warn"
    );
    ui.extractBtn.disabled = true;
  }
  await renderAccess();
}

function showAccessMessage(text, kind) {
  ui.accessStatus.className = `license-status license-status--${kind}`;
  ui.accessStatus.textContent = text;
  ui.accessStatus.classList.remove("hidden");
}

// Les pages ExtensionPay (essai, paiement, connexion) s'ouvrent dans un onglet
// separe. Au retour sur le popup on rafraichit le statut.
async function openExtPayPage(open, pendingText) {
  ui.accessStatus.classList.add("hidden");
  try {
    await open();
    showAccessMessage(pendingText, "ok");
    invalidate();
  } catch {
    showAccessMessage("Impossible d'ouvrir la page. Verifiez votre connexion.", "err");
  }
}

ui.extractBtn.addEventListener("click", handleExtract);
ui.exportBtn.addEventListener("click", handleExport);
ui.sessionBtn.addEventListener("click", async () => {
  if (!(await requireAccess("Demarrez l'essai gratuit pour ouvrir la session d'appels."))) {
    return;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL("src/session.html") });
});
ui.trialBtn.addEventListener("click", () =>
  openExtPayPage(
    openTrialPage,
    "Entrez votre email dans l'onglet ouvert, puis cliquez le lien recu pour demarrer l'essai."
  )
);
ui.subscribeBtn.addEventListener("click", () =>
  openExtPayPage(openPaymentPage, "Finalisez le paiement dans l'onglet ouvert.")
);
ui.loginBtn.addEventListener("click", () =>
  openExtPayPage(openLoginPage, "Connectez-vous dans l'onglet ouvert pour restaurer votre abonnement.")
);
ui.activityType.addEventListener("change", applyPreset);

// Le popup reste ouvert pendant que l'utilisateur paie dans un autre onglet :
// on revalide le statut des qu'il revient dessus.
window.addEventListener("focus", () => {
  invalidate();
  renderAccess();
});

applyPreset();
init();
