import { buildXlsx, downloadXlsx } from "./lib/xlsx.js";
import { validate } from "./lib/license.js";

const STORAGE_KEY = "callSession";

const STATUSES = [
  { value: "pending",        label: "À appeler",       color: "#94a3b8" },
  { value: "no_answer",      label: "Pas de réponse",  color: "#d97706" },
  { value: "interested",     label: "Intéressé",       color: "#059669" },
  { value: "not_interested", label: "Pas intéressé",   color: "#dc2626" },
  { value: "callback",       label: "Rappeler",       color: "#2563eb" },
];

// Colonnes exportees en XLSX (callStatus/callNote/callbackDate declares dans columns.js)
const SESSION_COLS = [
  "name", "callStatus", "category", "address", "city", "siret",
  "trancheEffectif", "dateCreation", "phone", "website",
  "score", "callNote", "callbackDate",
];

let leads = [];
let currentFilter = "all";
let viewMode = "list";
const noteTimers = {};

// --- Helpers ---

const statusOf = (l) => l.callStatus || "pending";
const labelOf = (v) => STATUSES.find((s) => s.value === v)?.label ?? v;
const colorOf = (v) => STATUSES.find((s) => s.value === v)?.color ?? "#94a3b8";
const todayStr = () => new Date().toISOString().slice(0, 10);

// --- Storage ---

async function loadLeads() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  leads = (data[STORAGE_KEY] || []).map((l) => ({
    callStatus: "pending",
    callNote: "",
    callbackDate: "",
    ...l,
  }));
}

function persistLeads() {
  chrome.storage.local.set({ [STORAGE_KEY]: leads });
}

// --- Mutations ---

function changeStatus(index, newStatus) {
  leads[index].callStatus = newStatus;
  persistLeads();
  renderStats();
  renderFilterCounts();
}

function changeNote(index, value) {
  clearTimeout(noteTimers[index]);
  noteTimers[index] = setTimeout(() => {
    leads[index].callNote = value;
    persistLeads();
  }, 500);
}

function changeCallbackDate(index, value) {
  leads[index].callbackDate = value;
  persistLeads();
}

// --- Stats ---

function getCounts() {
  const c = Object.fromEntries(STATUSES.map((s) => [s.value, 0]));
  for (const l of leads) c[statusOf(l)]++;
  return c;
}

function renderStats() {
  const c = getCounts();
  const called = leads.length - c.pending;
  const pctCalled = leads.length ? Math.round((called / leads.length) * 100) : 0;
  const conversion = called ? Math.round((c.interested / called) * 100) : 0;

  document.getElementById("statTotal").textContent = leads.length;
  document.getElementById("statCalled").textContent = `${called} (${pctCalled}%)`;
  document.getElementById("statInterested").textContent = c.interested;
  document.getElementById("statConversion").textContent = `${conversion}%`;

  const bar = document.getElementById("distBar");
  bar.replaceChildren();
  for (const s of STATUSES) {
    const pct = leads.length ? (c[s.value] / leads.length) * 100 : 0;
    if (pct === 0) continue;
    const seg = document.createElement("div");
    seg.className = "dist-seg";
    seg.style.width = `${pct}%`;
    seg.style.background = s.color;
    seg.title = `${s.label}: ${c[s.value]}`;
    bar.append(seg);
  }
}

function renderFilterCounts() {
  const c = getCounts();
  for (const btn of document.querySelectorAll(".filter-btn")) {
    const s = btn.dataset.status;
    const n = s === "all" ? leads.length : (c[s] ?? 0);
    btn.textContent = `${s === "all" ? "Tous" : labelOf(s)} (${n})`;
  }
}

// --- Badges ---

function makeScoreBadge(score) {
  if (score == null) return null;
  const badge = document.createElement("span");
  badge.className = "score-badge";
  if (score >= 70) {
    badge.style.background = "#ecfdf5";
    badge.style.color = "#065f46";
  } else if (score >= 40) {
    badge.style.background = "#fffbeb";
    badge.style.color = "#92400e";
  } else {
    badge.style.background = "#f1f5f9";
    badge.style.color = "#475569";
  }
  badge.textContent = `Opp. ${score}`;
  return badge;
}

function makeCallbackBadge(lead) {
  if (statusOf(lead) !== "callback" || !lead.callbackDate) return null;
  const overdue = lead.callbackDate <= todayStr();
  const [y, m, d] = lead.callbackDate.split("-");
  const badge = document.createElement("span");
  badge.className = "callback-badge";
  badge.style.background = overdue ? "#fef2f2" : "#eff6ff";
  badge.style.color = overdue ? "#991b1b" : "#1e40af";
  badge.style.borderColor = overdue ? "#fecaca" : "#bfdbfe";
  badge.textContent = overdue ? `À rappeler ! ${d}/${m}` : `Rappeler le ${d}/${m}`;
  return badge;
}

// --- List card ---

function makeListCard(lead, index) {
  const status = statusOf(lead);
  const color = colorOf(status);

  const card = document.createElement("div");
  card.className = "lead-card";
  card.dataset.index = index;
  card.style.borderLeftColor = color;

  // Ligne 1 : nom + score + statut
  const top = document.createElement("div");
  top.className = "lead-top";

  const nameEl = document.createElement("div");
  nameEl.className = "lead-name";
  nameEl.textContent = lead.name || "Sans nom";

  const topRight = document.createElement("div");
  topRight.className = "lead-top-right";

  const scoreBadge = makeScoreBadge(lead.score);
  if (scoreBadge) topRight.append(scoreBadge);

  const sel = document.createElement("select");
  sel.className = "status-select";
  sel.style.borderColor = color;
  sel.style.color = color;
  for (const s of STATUSES) {
    const opt = document.createElement("option");
    opt.value = s.value;
    opt.textContent = s.label;
    if (s.value === status) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener("change", () => {
    const c = colorOf(sel.value);
    sel.style.borderColor = c;
    sel.style.color = c;
    card.style.borderLeftColor = c;
    dateField.classList.toggle("hidden", sel.value !== "callback");
    changeStatus(index, sel.value);
    if (currentFilter !== "all" && sel.value !== currentFilter) {
      card.classList.add("hidden");
    }
  });
  topRight.append(sel);
  top.append(nameEl, topRight);
  card.append(top);

  // Meta : categorie · effectif · SIRET
  const metaParts = [
    lead.category,
    lead.trancheEffectif || null,
    lead.siret ? `SIRET ${lead.siret}` : null,
  ].filter(Boolean);
  if (metaParts.length) {
    const meta = document.createElement("div");
    meta.className = "lead-meta";
    meta.textContent = metaParts.join(" · ");
    card.append(meta);
  }

  // Adresse
  if (lead.address) {
    const addr = document.createElement("div");
    addr.className = "lead-meta";
    addr.textContent = lead.address;
    card.append(addr);
  }

  // Liens telephone + site web
  if (lead.phone || lead.website) {
    const links = document.createElement("div");
    links.className = "lead-links";
    if (lead.phone) {
      const a = document.createElement("a");
      a.className = "lead-link lead-link--phone";
      a.href = `tel:${lead.phone}`;
      a.textContent = lead.phone;
      links.append(a);
    }
    if (lead.website) {
      const a = document.createElement("a");
      a.className = "lead-link lead-link--web";
      a.href = lead.website;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
      links.append(a);
    }
    card.append(links);
  }

  // Date de rappel (visible si statut = callback)
  const dateField = document.createElement("div");
  dateField.className = `date-field${status !== "callback" ? " hidden" : ""}`;
  const dateLabel = document.createElement("span");
  dateLabel.className = "date-label";
  dateLabel.textContent = "Date de rappel :";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "date-input";
  dateInput.value = lead.callbackDate || "";
  dateInput.addEventListener("change", () => changeCallbackDate(index, dateInput.value));
  const cbBadge = makeCallbackBadge(lead);
  dateField.append(dateLabel, dateInput);
  if (cbBadge) dateField.append(cbBadge);
  card.append(dateField);

  // Note libre
  const noteWrap = document.createElement("div");
  noteWrap.className = "note-wrap";
  const noteArea = document.createElement("textarea");
  noteArea.className = "note-area";
  noteArea.placeholder = "Note : budget, interlocuteur, détails...";
  noteArea.rows = 2;
  noteArea.value = lead.callNote || "";
  noteArea.addEventListener("input", () => changeNote(index, noteArea.value));
  noteWrap.append(noteArea);
  card.append(noteWrap);

  return card;
}

// --- Kanban ---

function makeKanbanCard(lead, index) {
  const status = statusOf(lead);
  const color = colorOf(status);

  const card = document.createElement("div");
  card.className = "k-card";
  card.draggable = true;
  card.dataset.index = index;
  card.style.borderTopColor = color;

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  const nameEl = document.createElement("div");
  nameEl.className = "k-name";
  nameEl.textContent = lead.name || "Sans nom";
  card.append(nameEl);

  const badges = document.createElement("div");
  badges.className = "k-badges";
  const scoreBadge = makeScoreBadge(lead.score);
  if (scoreBadge) badges.append(scoreBadge);
  const cbBadge = makeCallbackBadge(lead);
  if (cbBadge) badges.append(cbBadge);
  if (badges.children.length) card.append(badges);

  if (lead.phone) {
    const tel = document.createElement("a");
    tel.className = "lead-link lead-link--phone k-phone";
    tel.href = `tel:${lead.phone}`;
    tel.textContent = lead.phone;
    card.append(tel);
  }

  if (lead.callNote) {
    const note = document.createElement("div");
    note.className = "k-note";
    note.textContent =
      lead.callNote.length > 80 ? lead.callNote.slice(0, 80) + "…" : lead.callNote;
    card.append(note);
  }

  return card;
}

function makeKanbanColumn(statusObj) {
  const col = document.createElement("div");
  col.className = "k-col";
  col.dataset.status = statusObj.value;

  const head = document.createElement("div");
  head.className = "k-head";
  head.style.borderTopColor = statusObj.color;

  const labelSpan = document.createElement("span");
  labelSpan.textContent = statusObj.label;

  const countSpan = document.createElement("span");
  countSpan.className = "k-count";

  head.append(labelSpan, countSpan);

  const cards = document.createElement("div");
  cards.className = "k-cards";

  let count = 0;
  for (let i = 0; i < leads.length; i++) {
    if (statusOf(leads[i]) === statusObj.value) {
      cards.append(makeKanbanCard(leads[i], i));
      count++;
    }
  }
  countSpan.textContent = `(${count})`;

  col.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    col.classList.add("drag-over");
  });
  col.addEventListener("dragleave", (e) => {
    if (!col.contains(e.relatedTarget)) col.classList.remove("drag-over");
  });
  col.addEventListener("drop", (e) => {
    e.preventDefault();
    col.classList.remove("drag-over");
    const idx = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (isNaN(idx)) return;
    leads[idx].callStatus = statusObj.value;
    persistLeads();
    renderKanban();
    renderStats();
    renderFilterCounts();
  });

  col.append(head, cards);
  return col;
}

function renderKanban() {
  const kanban = document.getElementById("kanbanView");
  kanban.replaceChildren();
  for (const s of STATUSES) kanban.append(makeKanbanColumn(s));
}

// --- Liste ---

function renderList() {
  const list = document.getElementById("listView");
  list.replaceChildren();
  for (let i = 0; i < leads.length; i++) {
    const card = makeListCard(leads[i], i);
    if (currentFilter !== "all" && statusOf(leads[i]) !== currentFilter) {
      card.classList.add("hidden");
    }
    list.append(card);
  }
}

function applyFilter() {
  for (const card of document.querySelectorAll(".lead-card")) {
    const idx = parseInt(card.dataset.index, 10);
    const match = currentFilter === "all" || statusOf(leads[idx]) === currentFilter;
    card.classList.toggle("hidden", !match);
  }
}

// --- Export XLSX ---

function exportXlsx() {
  const rows =
    currentFilter === "all"
      ? leads
      : leads.filter((l) => statusOf(l) === currentFilter);
  if (rows.length === 0) return;

  // Convertit la valeur interne du statut en label lisible
  const prepared = rows.map((l) => ({ ...l, callStatus: labelOf(statusOf(l)) }));
  const stamp = new Date().toISOString().slice(0, 10);
  downloadXlsx(buildXlsx(prepared, SESSION_COLS), `mapsleads-session-${stamp}.xlsx`);
}

// --- Toggle vue ---

function setView(mode) {
  viewMode = mode;
  const listView = document.getElementById("listView");
  const kanbanView = document.getElementById("kanbanView");
  const filters = document.getElementById("sFilters");
  const toggleBtn = document.getElementById("viewToggle");

  if (mode === "kanban") {
    listView.hidden = true;
    kanbanView.hidden = false;
    filters.hidden = true;
    toggleBtn.textContent = "Vue liste";
    renderKanban();
  } else {
    listView.hidden = false;
    kanbanView.hidden = true;
    filters.hidden = false;
    toggleBtn.textContent = "Vue Kanban";
    renderList();
  }
}

// --- Init ---

async function init() {
  const { valid } = await validate();
  if (!valid) {
    const blocked = document.getElementById("emptyState");
    blocked.classList.remove("hidden");
    blocked.replaceChildren(
      Object.assign(document.createElement("p"), {
        textContent: "Session d'appels réservée aux membres Premium.",
      }),
      Object.assign(document.createElement("p"), {
        textContent: "Activez votre licence depuis le popup MapsLeads.",
      })
    );
    return;
  }

  await loadLeads();

  const empty = document.getElementById("emptyState");
  if (leads.length === 0) {
    empty.classList.remove("hidden");
    return;
  }

  renderStats();
  renderFilterCounts();
  renderList();

  for (const btn of document.querySelectorAll(".filter-btn")) {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.status;
      for (const b of document.querySelectorAll(".filter-btn")) {
        b.classList.toggle("active", b.dataset.status === currentFilter);
      }
      applyFilter();
    });
  }

  document.getElementById("viewToggle").addEventListener("click", () => {
    setView(viewMode === "list" ? "kanban" : "list");
  });

  document.getElementById("exportBtn").addEventListener("click", exportXlsx);
}

init();
