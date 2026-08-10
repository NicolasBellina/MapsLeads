// Orchestration du popup : detecte l'onglet Maps, injecte le scraper a la
// demande, gere le quota, genere et telecharge le CSV.
import { getState, canExport, recordExport, rowCap } from "./lib/quota.js";
import { buildXlsx, downloadXlsx } from "./lib/xlsx.js";
import { getPreset } from "./lib/presets.js";

const MAPS_URL_RE = /^https:\/\/www\.google\.[^/]+\/maps/;
// Plafond de collecte en premium : l'enrichissement ouvre chaque fiche (~1,5 s),
// on borne pour eviter des extractions interminables.
const PREMIUM_CAP = 120;

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

async function renderQuota() {
  const s = await getState();
  if (s.testMode) {
    ui.quotaFill.style.width = "100%";
    ui.quotaText.textContent = "Mode test - exports illimites";
    return;
  }
  if (s.isPremium) {
    ui.quotaFill.style.width = "100%";
    ui.quotaText.textContent = "Premium - illimite";
    return;
  }
  const remaining = Math.max(0, s.freeLimit - s.exportsUsed);
  ui.quotaFill.style.width = `${(s.exportsUsed / s.freeLimit) * 100}%`;
  ui.quotaText.textContent = `${remaining}/${s.freeLimit} exports gratuits`;
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

  ui.extractBtn.classList.add("is-loading");
  ui.extractBtn.disabled = true;
  ui.paywall.classList.add("hidden");

  // Nombre de leads a collecter/enrichir. En gratuit on borne au plafond de
  // lignes ; sinon on respecte le champ "Nombre a extraire" (defaut 20), lui
  // meme borne a PREMIUM_CAP pour eviter les extractions interminables.
  const cap = await rowCap();
  const requested = Math.max(1, Math.min(parseInt(ui.limitInput.value, 10) || 20, PREMIUM_CAP));
  const count = cap === Infinity ? requested : Math.min(requested, cap);
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

  if (!(await canExport())) {
    ui.paywall.classList.remove("hidden");
    return;
  }

  const cap = await rowCap();
  const rows = leads.slice(0, cap);
  const preset = getPreset(ui.activityType.value);
  const xlsx = buildXlsx(rows, preset.columns);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadXlsx(xlsx, `mapsleads-${ui.activityType.value}-${stamp}.xlsx`);

  await recordExport();
  await renderQuota();

  const s = await getState();
  if (!s.isPremium && leads.length > cap) {
    setStatus(
      `Export gratuit limite a ${cap} lignes (${leads.length} trouves). Passez en premium pour tout exporter.`,
      "warn"
    );
  } else {
    setStatus(`${rows.length} leads exportes en Excel.`, "ok");
  }
}

async function init() {
  const tab = await getActiveTab();
  if (isMapsTab(tab)) {
    setStatus("Recherche Google Maps detectee.", "ok");
    ui.extractBtn.disabled = false;
  } else {
    setStatus("Ouvrez une recherche Google Maps pour commencer.", "warn");
    ui.extractBtn.disabled = true;
  }
  await renderQuota();
}

ui.extractBtn.addEventListener("click", handleExtract);
ui.exportBtn.addEventListener("click", handleExport);
ui.activityType.addEventListener("change", applyPreset);
applyPreset();
init();
