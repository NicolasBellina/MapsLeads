// Recherche d'entreprises via l'API publique Recherche d'entreprises (INSEE).
// Doc : https://recherche-entreprises.api.gouv.fr/docs/

import { resolveLocation } from "./geo.js";
import { resolveNaf, nafLabel } from "./trades.js";

const BASE = "https://recherche-entreprises.api.gouv.fr/search";
const PER_PAGE = 25; // maximum accepte par l'API (100 renvoie 400)
const MAX_PAGES = 8;
// L'API ne sait pas trier. Pour que le score d'opportunite classe autre chose
// que la premiere page (saturee de grandes enseignes), on ramene plusieurs fois
// le nombre demande, on score tout, et on ne garde que le meilleur.
const OVERFETCH = 3;
const REQUEST_TIMEOUT = 15000;
const THROTTLE_MS = 200; // l'API limite le debit : on espace les pages

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// L'API renvoie le siege social ET les etablissements qui ont matche le filtre
// geographique. Une chaine dont le siege est a Paris peut avoir un etablissement
// a Tours : c'est CET etablissement qu'il faut afficher, sinon on annonce une
// adresse parisienne pour une recherche a Tours.
function pickEstablishment(item, filtered) {
  const matches = item.matching_etablissements || [];
  if (filtered) {
    const open = matches.find((e) => e.etat_administratif === "A");
    if (open) return open;
  }
  return matches[0] || item.siege || {};
}

// Formes juridiques et sigles courants a laisser en capitales.
const KEEP_UPPER = new Set([
  "SARL", "EURL", "SAS", "SASU", "SA", "SNC", "SCI", "SCP", "SCM", "SCOP",
  "SEM", "GIE", "GAEC", "EARL", "SELARL", "SELAS", "SCEA", "SCS", "SCA",
  "ETS", "SPRL", "BTP", "TP", "CIC", "RH", "TV", "PC", "ADMR",
]);

// L'INSEE stocke les raisons sociales en capitales : "SARL LE CHIEN FOU" est
// illisible dans une liste. On repasse en casse de titre, sauf pour les formes
// juridiques et les sigles sans voyelle (BTP, SNC...).
function titleCase(raw) {
  return raw
    .split(/(\s+)/)
    .map((word) => {
      const letters = word.replace(/[^A-Za-zÀ-ÿ]/g, "");
      const upper = letters.toUpperCase();
      if (KEEP_UPPER.has(upper)) return word;
      if (letters.length >= 2 && letters.length <= 4 && !/[AEIOUY]/.test(upper)) {
        return word;
      }
      return word.replace(
        /[A-Za-zÀ-ÿ]+/g,
        (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      );
    })
    .join("");
}

function toLead(item, filtered) {
  const etab = pickEstablishment(item, filtered);
  // Le filtre `activite_principale` porte sur l'entreprise, pas sur
  // l'etablissement : afficher le NAF de l'etablissement donnerait "Activites des
  // sieges sociaux" sur une recherche de restaurants. On prend donc le NAF de
  // l'entreprise, et celui de l'etablissement seulement s'il n'est pas exploitable.
  const naf = nafLabel(item.activite_principale)
    ? item.activite_principale
    : etab.activite_principale || item.activite_principale || "";
  const raw = item.nom_complet || item.nom_raison_sociale || "";
  const enseigne = etab.liste_enseignes?.[0] || etab.nom_commercial || "";

  return {
    name: titleCase(enseigne || raw),
    siret: etab.siret || item.siege?.siret || "",
    category: nafLabel(naf) || naf,
    codeNaf: naf,
    address: etab.adresse || item.siege?.adresse || "",
    city: etab.libelle_commune || item.siege?.libelle_commune || "",
    trancheEffectif: effectifLabel(
      etab.tranche_effectif_salarie ?? item.tranche_effectif_salarie
    ),
    dateCreation: etab.date_creation || item.date_creation || "",
    phone: "",
    website: "",
    score: 0,
    callStatus: "",
    callNote: "",
    callbackDate: "",
  };
}

// Codes INSEE de tranche d'effectif salarie. "NN" = non renseigne.
const EFFECTIFS = {
  NN: "",
  "00": "0 salarié",
  "01": "1 à 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  11: "10 à 19 salariés",
  12: "20 à 49 salariés",
  21: "50 à 99 salariés",
  22: "100 à 199 salariés",
  31: "200 à 249 salariés",
  32: "250 à 499 salariés",
  41: "500 à 999 salariés",
  42: "1 000 à 1 999 salariés",
  51: "2 000 à 4 999 salariés",
  52: "5 000 à 9 999 salariés",
  53: "10 000 salariés et plus",
};

// Bornes basses de chaque tranche : sert au score d'opportunite.
const EFFECTIF_MIN = {
  "00": 0, "01": 1, "02": 3, "03": 6, 11: 10, 12: 20, 21: 50, 22: 100,
  31: 200, 32: 250, 41: 500, 42: 1000, 51: 2000, 52: 5000, 53: 10000,
};

function effectifLabel(code) {
  return EFFECTIFS[String(code ?? "").trim()] ?? "";
}

// Un petit etablissement recent est le prospect le plus accessible : il n'a pas
// encore de prestataire installe et decide vite.
export function opportunityScore(lead, effectifCode) {
  const min = EFFECTIF_MIN[String(effectifCode ?? "").trim()];
  let s;
  if (min === undefined) s = 20; // effectif inconnu : tres majoritairement des TPE
  else if (min <= 2) s = 35;
  else if (min <= 9) s = 25;
  else if (min <= 49) s = 15;
  else s = 5;

  if (lead.dateCreation) {
    const age = (Date.now() - new Date(lead.dateCreation)) / (365.25 * 86400000);
    if (age < 1) s += 55;
    else if (age < 3) s += 40;
    else if (age < 7) s += 25;
    else s += 10;
  } else {
    s += 15;
  }

  return Math.min(100, s);
}

// Recherche paginee. Retourne { leads, total, locationLabel, nafCodes, warning }.
export async function search({ query, location, limit, signal }) {
  const { params: geoParams, label: locationLabel, warning } =
    await resolveLocation(location, signal);
  const nafCodes = resolveNaf(query);
  const filtered = Object.keys(geoParams).length > 0;

  const base = {
    ...geoParams,
    etat_administratif: "A", // exclut les entreprises cessees
    per_page: String(PER_PAGE),
  };
  if (nafCodes.length) base.activite_principale = nafCodes.join(",");
  // Sans code NAF fiable, on retombe sur le plein texte (nom + enseigne).
  else base.q = query;

  const target = Math.min(limit * OVERFETCH, MAX_PAGES * PER_PAGE);
  const seen = new Set();
  const leads = [];
  let total = 0;

  for (let page = 1; page <= MAX_PAGES && leads.length < target; page++) {
    if (page > 1) await sleep(THROTTLE_MS);
    const data = await fetchPage({ ...base, page: String(page) }, signal);
    total = data.total_results ?? 0;

    for (const item of data.results || []) {
      const lead = toLead(item, filtered);
      if (!lead.siret || seen.has(lead.siret)) continue;
      seen.add(lead.siret);
      const code =
        pickEstablishment(item, filtered).tranche_effectif_salarie ??
        item.tranche_effectif_salarie;
      lead.score = opportunityScore(lead, code);
      leads.push(lead);
      if (leads.length >= target) break;
    }

    if ((data.results || []).length < PER_PAGE || page >= (data.total_pages || 1)) {
      break;
    }
  }

  leads.sort((a, b) => b.score - a.score);
  return { leads: leads.slice(0, limit), total, locationLabel, nafCodes, warning };
}

async function fetchPage(params, signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const r = await fetch(`${BASE}?${new URLSearchParams(params)}`, { signal: merged });
  if (r.status === 429) throw new Error("RATE_LIMIT");
  if (!r.ok) throw new Error(`SIRENE ${r.status}`);
  return r.json();
}
