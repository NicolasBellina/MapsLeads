// Orchestration du popup : recherche SIRENE, quota, export XLSX, licence.
import { getState, canExport, recordExport, rowCap } from "./lib/quota.js";
import { buildXlsx, downloadXlsx } from "./lib/xlsx.js";
import { getPreset } from "./lib/presets.js";
import { activate } from "./lib/license.js";
import { search } from "./lib/sirene.js";
import { CHECKOUT_URL } from "./lib/config.js";

const CACHE_KEY = "popupLeadsCache";
const MAX_LIMIT = 200;

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
  searchQuery: el("searchQuery"),
  locationInput: el("locationInput"),
  limitInput: el("limitInput"),
  sortBy: el("sortBy"),
  sessionBtn: el("sessionBtn"),
  trialBtn: el("trialBtn"),
  activateBtn: el("activateBtn"),
  licenseInput: el("licenseInput"),
  licenseStatus: el("licenseStatus"),
};

let leads = [];
let inFlight = null;

function setStatus(text, kind) {
  ui.status.textContent = text;
  ui.status.className = `status status--${kind}`;
}

function sortLeads(list) {
  const by = ui.sortBy.value;
  if (by === "name") {
    return list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
  }
  if (by === "creation") {
    return list.sort((a, b) => (b.dateCreation || "").localeCompare(a.dateCreation || ""));
  }
  return list.sort((a, b) => (b.score || 0) - (a.score || 0));
}

function ageInYears(dateCreation) {
  if (!dateCreation) return null;
  const t = new Date(dateCreation).getTime();
  return Number.isNaN(t) ? null : (Date.now() - t) / (365.25 * 86400000);
}

function renderPreview() {
  ui.preview.replaceChildren();
  for (const lead of leads.slice(0, 25)) {
    const li = document.createElement("li");

    const nameEl = document.createElement("div");
    nameEl.className = "p-name";
    nameEl.textContent = lead.name;

    const age = ageInYears(lead.dateCreation);
    if (age !== null && age < 2) {
      const badge = document.createElement("span");
      badge.className = "badge badge--opp";
      badge.textContent = age < 1 ? "< 1 an" : `${Math.floor(age)} an`;
      nameEl.append(" ", badge);
    }

    const meta = document.createElement("div");
    meta.className = "p-meta";
    meta.textContent = [
      lead.category,
      lead.trancheEffectif || null,
      lead.dateCreation ? `Créée ${lead.dateCreation.slice(0, 4)}` : null,
      `Opp. ${lead.score}`,
    ]
      .filter(Boolean)
      .join(" · ");

    li.append(nameEl, meta);

    const address = [lead.address, lead.city && !lead.address?.includes(lead.city) ? lead.city : null]
      .filter(Boolean)
      .join(" ");
    if (address) {
      const addr = document.createElement("div");
      addr.className = "p-meta";
      addr.textContent = address;
      li.append(addr);
    }

    ui.preview.append(li);
  }

  const plural = leads.length > 1 ? "s" : "";
  ui.resultCount.textContent = `${leads.length} lead${plural} trouvé${plural}`;
  ui.results.classList.toggle("hidden", leads.length === 0);
  ui.exportBtn.classList.toggle("hidden", leads.length === 0);
}

async function renderQuota() {
  const s = await getState();
  if (s.mode === "DEV" || s.isPremium) {
    ui.quotaFill.style.width = "100%";
    ui.quotaText.textContent = s.mode === "DEV" ? "Mode DEV — exports illimités" : "Premium — illimité";
    return;
  }
  const remaining = Math.max(0, s.freeLimit - s.exportsUsed);
  ui.quotaFill.style.width = `${Math.min(100, (s.exportsUsed / s.freeLimit) * 100)}%`;
  ui.quotaText.textContent = `${remaining}/${s.freeLimit} exports gratuits`;
}

async function handleSearch() {
  const query = ui.searchQuery.value.trim();
  if (!query) {
    setStatus("Entrez un métier ou une activité.", "warn");
    ui.searchQuery.focus();
    return;
  }

  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;

  ui.extractBtn.classList.add("is-loading");
  ui.extractBtn.disabled = true;
  ui.paywall.classList.add("hidden");

  const location = ui.locationInput.value.trim();
  const limit = Math.max(1, Math.min(parseInt(ui.limitInput.value, 10) || 20, MAX_LIMIT));
  setStatus("Recherche en cours...", "muted");

  try {
    const res = await search({ query, location, limit, signal: controller.signal });
    leads = sortLeads(res.leads);

    if (leads.length === 0) {
      setStatus(
        `Aucun résultat pour "${query}" (${res.locationLabel}). Essayez un autre métier ou élargissez au département.`,
        "warn"
      );
    } else if (res.warning) {
      setStatus(res.warning, "warn");
    } else {
      const more = res.total > leads.length ? ` sur ${res.total} au total` : "";
      setStatus(`${leads.length} leads — ${res.locationLabel}${more}.`, "ok");
    }

    renderPreview();
    await chrome.storage.local.set({ [CACHE_KEY]: leads });
    // Une recherche vide ne doit pas ecraser une session d'appels en cours.
    if (leads.length > 0 && (await getState()).isPremium) {
      await chrome.storage.local.set({ callSession: leads });
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    setStatus(
      err.message === "RATE_LIMIT"
        ? "API surchargée. Patientez quelques secondes puis relancez."
        : "Erreur de recherche. Vérifiez votre connexion.",
      "warn"
    );
  } finally {
    if (inFlight === controller) inFlight = null;
    ui.extractBtn.classList.remove("is-loading");
    ui.extractBtn.disabled = false;
  }
}

async function handleExport() {
  if (leads.length === 0) return;

  if (!(await canExport())) {
    ui.paywall.classList.remove("hidden");
    setStatus("Quota gratuit atteint.", "warn");
    return;
  }

  const cap = await rowCap();
  const rows = cap === Infinity ? leads : leads.slice(0, cap);
  const xlsx = buildXlsx(rows, getPreset("generic").columns);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadXlsx(xlsx, `mapsleads-${stamp}.xlsx`);

  await recordExport();
  await renderQuota();

  if (rows.length < leads.length) {
    setStatus(
      `Export gratuit limité à ${cap} lignes (${leads.length} trouvés). Passez en premium pour tout exporter.`,
      "warn"
    );
  } else {
    setStatus(`${rows.length} leads exportés en Excel.`, "ok");
  }
}

async function handleActivate() {
  const key = ui.licenseInput.value.trim();
  if (!key) return;

  ui.activateBtn.disabled = true;
  ui.activateBtn.textContent = "...";
  ui.licenseStatus.className = "license-status hidden";

  const { ok, error } = await activate(key);

  ui.activateBtn.disabled = false;
  ui.activateBtn.textContent = "Activer";
  ui.licenseStatus.classList.remove("hidden");
  ui.licenseStatus.className = `license-status license-status--${ok ? "ok" : "err"}`;

  if (ok) {
    ui.licenseStatus.textContent = "Licence activée. Relancez une recherche.";
    ui.paywall.classList.add("hidden");
    await renderQuota();
  } else {
    ui.licenseStatus.textContent = error || "Activation échouée.";
  }
}

async function init() {
  const cache = await chrome.storage.local.get(CACHE_KEY);
  if (cache[CACHE_KEY]?.length > 0) {
    leads = cache[CACHE_KEY];
    renderPreview();
    setStatus(`${leads.length} leads en mémoire. Relancez une recherche pour actualiser.`, "muted");
  } else {
    setStatus("Entrez un métier et une ville pour rechercher.", "muted");
  }
  await renderQuota();
}

ui.extractBtn.addEventListener("click", handleSearch);
ui.exportBtn.addEventListener("click", handleExport);
for (const input of [ui.searchQuery, ui.locationInput, ui.limitInput]) {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
}
ui.sortBy.addEventListener("change", () => {
  if (leads.length) {
    sortLeads(leads);
    renderPreview();
  }
});
ui.sessionBtn.addEventListener("click", async () => {
  const s = await getState();
  if (!s.isPremium) {
    setStatus("Session d'appels réservée aux membres Premium.", "warn");
    ui.paywall.classList.remove("hidden");
    return;
  }
  chrome.tabs.create({ url: chrome.runtime.getURL("src/session.html") });
});
ui.trialBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: CHECKOUT_URL });
});
ui.activateBtn.addEventListener("click", handleActivate);
init();
