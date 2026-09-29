// Genere les visuels du Chrome Web Store dans store/out/.
//
// Formats (developer.chrome.com/docs/webstore/images) :
//   - 5 captures 1280x800, plein cadre, coins carres
//   - petite tuile promo 440x280
//   - grande tuile promo (marquee) 1400x560
//
// Les captures montrent l'interface reelle : les pages src/popup.html et
// src/session.html sont chargees telles quelles dans une iframe, avec une API
// chrome simulee et des leads reellement extraits de l'API SIRENE. Rien n'est
// redessine a la main, donc les visuels ne peuvent pas diverger du produit.
//
// Usage : node store/build.mjs

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUILD = path.join(ROOT, "store", ".build");
const OUT = path.join(ROOT, "store", "out");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 8731;

// --- 1. Donnees reelles ---------------------------------------------------

async function fetchLeads() {
  const store = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: async (k) => (k in store ? { [k]: store[k] } : {}),
        set: async (o) => Object.assign(store, o),
      },
    },
  };
  const { search } = await import(path.join(ROOT, "src/lib/sirene.js"));
  const { leads } = await search({ query: "restaurant", location: "Tours", limit: 14 });
  return leads;
}

// Statuts d'appel plausibles pour illustrer la session de prospection.
const DEMO_CALLS = [
  { callStatus: "interested", callNote: "Rappeler le gérant lundi, budget validé pour la refonte du site." },
  { callStatus: "callback", callbackDate: nextWeek(), callNote: "Absent, rappeler après le service du midi." },
  { callStatus: "pending" },
  { callStatus: "no_answer", callNote: "Messagerie saturée, retenter jeudi." },
  { callStatus: "interested", callNote: "Demande un devis par mail, très intéressé." },
  { callStatus: "not_interested", callNote: "Déjà sous contrat jusqu'en 2027." },
  { callStatus: "pending" },
  { callStatus: "callback", callbackDate: nextWeek(3), callNote: "Ouvre en octobre, recontacter à ce moment-là." },
  { callStatus: "interested" },
  { callStatus: "pending" },
  { callStatus: "no_answer" },
  { callStatus: "pending" },
  { callStatus: "pending" },
  { callStatus: "pending" },
];

function nextWeek(days = 7) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

// --- 2. Pages de previsualisation -----------------------------------------

// Injecte le bouchon chrome dans la vraie page, sans la modifier sur disque.
async function makePreview(srcName, outName, mockFile) {
  const html = await readFile(path.join(ROOT, "src", srcName), "utf8");
  const patched = html.replace(
    /<script/,
    `<script src="/${mockFile}"></script>\n    <script`
  );
  await writeFile(path.join(BUILD, outName), patched);
}

function mockScript(state, after = "", css = "") {
  return `// Bouchon chrome pour la generation des visuels (jamais embarque).
const STYLE = ${JSON.stringify(css)};
const DATA = ${JSON.stringify(state)};
globalThis.chrome = {
  storage: { local: {
    get: async (k) => (k in DATA ? { [k]: DATA[k] } : {}),
    set: async () => {},
    remove: async () => {},
  }},
  tabs: { create: () => {} },
  runtime: { getURL: (p) => p },
};
if (STYLE) document.head.insertAdjacentHTML("beforeend", "<style>" + STYLE + "</style>");
window.addEventListener("load", () => setTimeout(() => { ${after} }, 120));
`;
}

// --- 3. Cadres 1280x800 ---------------------------------------------------

const SHELL_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 1280px; height: 800px; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: linear-gradient(150deg, #eff4ff 0%, #f8fafc 45%, #e8effc 100%);
    display: flex; flex-direction: column; align-items: center;
  }
  body::before {
    content: ""; position: absolute; inset: 0;
    background:
      radial-gradient(700px 380px at 12% -8%, rgba(37,99,235,.16), transparent 70%),
      radial-gradient(620px 340px at 105% 108%, rgba(5,150,105,.14), transparent 70%);
  }
  .cap { position: relative; text-align: center; padding: 52px 60px 0; }
  .cap h1 {
    margin: 0; font-size: 42px; line-height: 1.12; letter-spacing: -1.1px;
    font-weight: 700; color: #0f172a;
  }
  .cap h1 em { font-style: normal; color: #2563eb; }
  .cap p {
    margin: 14px auto 0; font-size: 19px; line-height: 1.45; color: #475569;
    max-width: 760px; font-weight: 450;
  }

  /* Mise en page horizontale : un popup de 380 px de large gagne a etre place
     a cote du texte plutot qu'en dessous, sinon il faut trop le reduire. */
  body.split { flex-direction: row; align-items: center; padding: 0 76px; gap: 56px; }
  body.split .cap { text-align: left; padding: 0; flex: 1; }
  body.split .cap h1 { font-size: 47px; letter-spacing: -1.4px; }
  body.split .cap p { margin: 20px 0 0; font-size: 20px; max-width: 500px; }
  body.split .badge-src {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 26px;
    padding: 8px 14px; border-radius: 999px; background: rgba(37,99,235,.1);
    color: #1d4ed8; font-size: 14.5px; font-weight: 600;
  }
  body.split .badge-src::before {
    content: ""; width: 8px; height: 8px; border-radius: 50%; background: #059669;
  }
  body.split .stage { flex: 0 0 auto; width: auto; height: 720px; align-items: center; }
  /* min-height:0 est indispensable : sans lui un enfant plus haut que la zone
     restante fait grandir le conteneur flex, et la mise a l'echelle se calcule
     alors sur une hauteur disponible fausse. */
  .stage { position: relative; flex: 1; min-height: 0; width: 100%; display: flex;
           justify-content: center; align-items: flex-start; }
  .device {
    /* flex:none est indispensable : sans lui .stage retrecit le cadre a sa
       propre largeur et overflow:hidden rogne les dernieres colonnes. */
    flex: none;
    position: relative; border-radius: 18px; overflow: hidden; background: #fff;
    box-shadow: 0 2px 4px rgba(15,23,42,.06), 0 18px 44px rgba(15,23,42,.16),
                0 48px 90px rgba(15,23,42,.13);
    transform-origin: top center;
  }
  .device iframe { display: block; border: 0; }
`;

function frameHtml({ title, subtitle, src, w, h, scale, autofit = false, split = false, note = "" }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>${SHELL_CSS}
  .device { width: ${w}px; height: ${h}px; }
  .device iframe { width: ${w}px; height: ${h}px; }
</style></head><body class="${split ? "split" : ""}">
  <div class="cap"><h1>${title}</h1><p>${subtitle}</p>${
    note ? `<div class="badge-src">${note}</div>` : ""
  }</div>
  <div class="stage"><div class="device"><iframe src="${src}" scrolling="no"></iframe></div></div>
<script>
  // Ajuste le cadre au contenu reel puis met a l'echelle pour qu'il tienne dans
  // les 800 px, sans jamais couper une ligne en bas de capture.
  const AUTOFIT = ${autofit}, MAX = ${scale}, SPLIT = ${split};
  const iframe = document.querySelector("iframe");
  const device = document.querySelector(".device");
  const stage = document.querySelector(".stage");
  function fit() {
    if (!iframe.contentDocument || !iframe.contentDocument.body) return;
    let h = ${h};
    if (AUTOFIT) {
      // On deplie l'iframe avant de mesurer : sinon body.scrollHeight rend la
      // hauteur qu'on vient d'imposer, et la mesure se fige sur sa propre valeur.
      iframe.style.height = "2400px";
      h = Math.ceil(iframe.contentDocument.body.scrollHeight);
      iframe.style.height = device.style.height = h + "px";
    }
    // On borne aussi par la largeur, sauf en mise en page horizontale ou la
    // zone est dimensionnee par le cadre lui-meme (la borne serait circulaire).
    const maxByWidth = SPLIT ? Infinity : (stage.clientWidth - 84) / ${w};
    const scale = Math.min(MAX, (stage.clientHeight - 18) / h, maxByWidth);
    device.style.transform = "scale(" + scale + ")";
  }
  // Le contenu de l'iframe arrive apres un aller-retour chrome.storage : on
  // remesure pendant deux secondes plutot que de parier sur un seul delai.
  // On ne s'accroche pas a l'evenement load : sous temps virtuel l'iframe est
  // souvent deja chargee quand ce script s'execute, et l'evenement ne vient plus.
  for (let t = 50; t <= 2500; t += 50) setTimeout(fit, t);
</script>
</body></html>`;
}

// Capture 5 : le contenu reel du fichier .xlsx, rendu comme une feuille de calcul.
function sheetHtml(rows, cols, headers) {
  const th = cols.map((c) => `<th>${headers[c]}</th>`).join("");
  const tr = rows
    .map((l, i) => {
      const tds = cols
        .map((c) => {
          const v = l[c] ?? "";
          const cls = c === "score" ? ' class="num"' : c === "name" ? ' class="strong"' : "";
          return `<td${cls}>${String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`;
        })
        .join("");
      return `<tr><td class="rownum">${i + 2}</td>${tds}</tr>`;
    })
    .join("");
  const letters = cols.map((_, i) => `<th class="col">${String.fromCharCode(65 + i)}</th>`).join("");
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #fff; color: #0f172a; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; }
    th, td { border: 1px solid #dfe3e8; padding: 7px 9px; text-align: left;
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    thead tr:first-child th { background: #f1f3f5; color: #6b7280; font-weight: 500;
             font-size: 11px; text-align: center; padding: 4px; height: 22px; }
    thead tr:last-child th { background: #1f6f43; color: #fff; font-weight: 600;
             font-size: 12.5px; position: sticky; top: 0; }
    td.rownum, th.rownum { background: #f1f3f5; color: #6b7280; text-align: center;
             width: 42px; font-size: 11px; padding: 4px; }
    td.strong { font-weight: 600; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody tr:nth-child(even) td:not(.rownum) { background: #f9fbfd; }
    col.w-name { width: 200px; } col.w-cat { width: 210px; } col.w-addr { width: 300px; }
  </style></head><body>
  <table>
    <colgroup><col style="width:3%">${cols
      .map((c) => `<col style="width:${{ name: 15, category: 15.5, address: 22.5, city: 7.5, siret: 10.5, trancheEffectif: 10, dateCreation: 8, score: 8 }[c] || 8}%">`)
      .join("")}</colgroup>
    <thead>
      <tr><th class="rownum"></th>${letters}</tr>
      <tr><th class="rownum">1</th>${th}</tr>
    </thead>
    <tbody>${tr}</tbody>
  </table></body></html>`;
}

// --- 4. Tuiles promo ------------------------------------------------------

const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="currentColor"/>
  <circle cx="12" cy="9" r="2.5" fill="#fff"/></svg>`;

function tileHtml({ w, h, logo, title, tagline, gap, pad }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      width: ${w}px; height: ${h}px; overflow: hidden; position: relative;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 52%, #1d4ed8 100%);
      display: flex; align-items: center; justify-content: center;
      color: #fff; text-align: center;
    }
    /* Halos et trame legere : donne de la profondeur sans ajouter de texte. */
    body::before {
      content: ""; position: absolute; inset: 0;
      background:
        radial-gradient(${w * 0.6}px ${h * 0.9}px at 78% -18%, rgba(255,255,255,.22), transparent 65%),
        radial-gradient(${w * 0.5}px ${h * 0.8}px at 6% 118%, rgba(5,150,105,.38), transparent 62%);
    }
    body::after {
      content: ""; position: absolute; inset: 0; opacity: .1;
      background-image:
        linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px);
      background-size: 44px 44px;
      mask-image: radial-gradient(120% 120% at 50% 50%, #000 25%, transparent 78%);
    }
    .inner { position: relative; padding: ${pad}px; }
    /* Pastille blanche avec la punaise bleue : sur fond blanc le disque interne
       du logo disparaitrait, et cette forme reprend celle de l'icone du store. */
    .logo {
      width: ${logo}px; height: ${logo}px; margin: 0 auto;
      display: grid; place-items: center;
      background: #fff; border-radius: ${logo * 0.24}px;
      box-shadow: 0 ${logo * 0.05}px ${logo * 0.16}px rgba(8,20,55,.4);
    }
    .logo svg { width: ${logo * 0.62}px; height: ${logo * 0.62}px; color: #2563eb; }
    h1 {
      margin: ${gap}px 0 0; font-size: ${title}px; font-weight: 700;
      letter-spacing: ${-title * 0.028}px; line-height: 1;
      text-shadow: 0 2px 14px rgba(8,20,55,.35);
    }
    p {
      margin: ${gap * 0.55}px 0 0; font-size: ${tagline}px; font-weight: 500;
      color: rgba(255,255,255,.9); letter-spacing: .2px;
    }
    .rule {
      width: ${title * 1.9}px; height: 3px; border-radius: 2px; margin: ${gap * 0.7}px auto 0;
      background: linear-gradient(90deg, transparent, #6ee7b7, transparent);
    }
  </style></head><body><div class="inner">
    <div class="logo">${LOGO}</div>
    <h1>MapsLeads</h1>
    <div class="rule"></div>
    <p>Leads entreprises &middot; base SIRENE</p>
  </div></body></html>`;
}

// --- 5. Pipeline ----------------------------------------------------------

function serve() {
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]);
    // Les pages de previsualisation vivent dans .build mais referencent
    // popup.css / popup.js en relatif : on resout donc aussi dans src/.
    for (const base of [BUILD, path.join(ROOT, "src"), ROOT]) {
      const file = path.join(base, rel);
      if (!file.startsWith(base)) continue;
      try {
        const body = await readFile(file);
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
        return res.end(body);
      } catch {}
    }
    res.writeHead(404).end("404");
  });
  return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

function shot(url, out, w, h) {
  return new Promise((ok, fail) => {
    const p = spawn(CHROME, [
      "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      "--default-background-color=00000000", "--virtual-time-budget=4000",
      `--window-size=${w},${h}`, `--screenshot=${out}`, url,
    ]);
    p.on("close", (c) => (c === 0 ? ok() : fail(new Error(`chrome ${c} sur ${out}`))));
  });
}

async function main() {
  await rm(BUILD, { recursive: true, force: true });
  await mkdir(BUILD, { recursive: true });
  await mkdir(OUT, { recursive: true });

  console.log("Extraction de leads reels (SIRENE, Tours)...");
  const leads = await fetchLeads();
  const session = leads.map((l, i) => ({ ...l, ...DEMO_CALLS[i % DEMO_CALLS.length] }));

  const { ALL_COLUMNS } = await import(path.join(ROOT, "src/lib/columns.js"));
  const { getPreset } = await import(path.join(ROOT, "src/lib/presets.js"));

  // Bouchons chrome : un par scenario.
  await writeFile(
    path.join(BUILD, "mock-results.js"),
    mockScript(
      { popupLeadsCache: leads.slice(0, 4), license: { licenseKey: "BETA-ML-2026", valid: true } },
      `const s = document.getElementById("status");
       s.className = "status status--ok";
       s.textContent = "4 leads — Tours, sur 914 au total.";
       document.getElementById("searchQuery").value = "restaurant";
       document.getElementById("locationInput").value = "Tours";
       document.querySelector(".filters").open = false;`,
      ".preview { max-height: none; overflow: visible; }"
    )
  );
  await writeFile(
    path.join(BUILD, "mock-search.js"),
    mockScript(
      { license: { licenseKey: "BETA-ML-2026", valid: true } },
      `document.getElementById("searchQuery").value = "plombier";
       document.getElementById("locationInput").value = "Bordeaux";
       document.getElementById("limitInput").value = "50";
       const s = document.getElementById("status");
       s.className = "status status--muted";
       s.textContent = "Entrez un métier et une ville pour rechercher.";`
    )
  );
  await writeFile(
    path.join(BUILD, "mock-session.js"),
    mockScript({ callSession: session, license: { licenseKey: "BETA-ML-2026", valid: true } })
  );
  await writeFile(
    path.join(BUILD, "mock-kanban.js"),
    mockScript(
      { callSession: session, license: { licenseKey: "BETA-ML-2026", valid: true } },
      `document.getElementById("viewToggle").click();`
    )
  );

  await makePreview("popup.html", "popup-results.html", "mock-results.js");
  await makePreview("popup.html", "popup-search.html", "mock-search.js");
  await makePreview("session.html", "session-list.html", "mock-session.js");
  await makePreview("session.html", "session-kanban.html", "mock-kanban.js");

  const cols = getPreset("generic").columns.filter((c) => c !== "phone" && c !== "website");
  await writeFile(path.join(BUILD, "sheet.html"), sheetHtml(leads.slice(0, 12), cols, ALL_COLUMNS));

  const frames = [
    ["01-recherche", {
      title: "Trouvez vos prospects<br>en <em>10 secondes</em>",
      subtitle: "Un métier, une ville. MapsLeads interroge la base SIRENE de l'INSEE et remonte les entreprises réellement implantées à cette adresse.",
      note: "Données officielles INSEE, mises à jour en continu",
      src: "/popup-results.html", w: 380, h: 620, scale: 1.15, autofit: true, split: true,
    }],
    ["02-filtres", {
      title: "Ciblez par <em>métier</em><br>et par <em>territoire</em>",
      subtitle: "Ville, département ou code postal. Le métier est traduit en code d'activité officiel : un plombier reste un plombier, pas une société qui porte ce mot dans son nom.",
      note: "Toutes les communes de France · 730 activités",
      src: "/popup-search.html", w: 380, h: 560, scale: 1.15, autofit: true, split: true,
    }],
    ["03-session", {
      title: "Menez vos appels <em>sans quitter l'onglet</em>",
      subtitle: "Statut, note et date de rappel pour chaque prospect. Tout reste enregistré en local, sur votre machine.",
      src: "/session-list.html", w: 1180, h: 700, scale: 0.78,
    }],
    ["04-kanban", {
      title: "Suivez votre pipeline <em>d'un coup d'œil</em>",
      subtitle: "Vue Kanban avec glisser-déposer, taux de conversion et compteurs par statut, mis à jour en temps réel.",
      // 5 colonnes de 240 px + gouttieres + marges : il faut 1304 px pour que
      // la derniere colonne ne soit pas coupee.
      src: "/session-kanban.html", w: 1340, h: 660, scale: 0.72,
    }],
    ["05-export", {
      title: "Export Excel <em>prêt à l'emploi</em>",
      subtitle: "Un vrai fichier .xlsx : en-tête figée, filtres automatiques et largeurs de colonnes calibrées. Aucune mise en forme à refaire.",
      src: "/sheet.html", w: 1420, h: 420, scale: 0.90, autofit: true,
    }],
  ];

  for (const [name, f] of frames) {
    await writeFile(path.join(BUILD, `frame-${name}.html`), frameHtml(f));
  }

  await writeFile(path.join(BUILD, "tile-small.html"),
    tileHtml({ w: 440, h: 280, logo: 62, title: 40, tagline: 15, gap: 16, pad: 20 }));
  await writeFile(path.join(BUILD, "tile-marquee.html"),
    tileHtml({ w: 1400, h: 560, logo: 132, title: 92, tagline: 30, gap: 30, pad: 40 }));

  const server = await serve();
  const base = `http://127.0.0.1:${PORT}`;
  const jobs = [
    ...frames.map(([n]) => [`${base}/frame-${n}.html`, `screenshot-${n}.png`, 1280, 800]),
    [`${base}/tile-small.html`, "promo-small-440x280.png", 440, 280],
    [`${base}/tile-marquee.html`, "promo-marquee-1400x560.png", 1400, 560],
  ];

  for (const [url, file, w, h] of jobs) {
    await shot(url, path.join(OUT, file), w, h);
    console.log("  ", file);
  }
  server.close();
  console.log(`\n${jobs.length} visuels dans store/out/`);
}

main();
