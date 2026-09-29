// Generation d'un vrai fichier Excel (.xlsx) sans aucune dependance.
//
// Pourquoi pas un CSV : un CSV est du texte brut, il ne porte aucune largeur de
// colonne. Excel ouvre donc toutes les colonnes a la largeur par defaut et le
// Nom / Site web / Adresse debordent. Un .xlsx permet de fixer des largeurs
// larges pour les colonnes de contact, un entete en gras fige et un filtre auto.
//
// Un .xlsx est une archive ZIP de fichiers XML (format OOXML). On ecrit ici un
// writer ZIP minimal (methode "store", sans compression) et le XML des parts.
// Les cellules texte sont de type inlineStr : Excel ne les interprete jamais
// comme une formule, donc l'injection de formule (=,+,-,@) est neutralisee par
// construction, sans traitement particulier.

import { ALL_COLUMNS } from "./columns.js";

// Largeur des colonnes en "caracteres" Excel. Genereuse pour les champs de
// contact qui debordent le plus (nom, site web, adresse, lien).
const WIDTHS = {
  name: 34,
  siret: 18,
  category: 36,
  codeNaf: 12,
  address: 46,
  city: 22,
  trancheEffectif: 20,
  dateCreation: 14,
  phone: 16,
  website: 42,
  score: 12,
  callStatus: 16,
  callNote: 44,
  callbackDate: 16,
};
const DEFAULT_WIDTH = 18;

// Colonnes a ecrire en cellule numerique (tri/filtre corrects dans Excel).
const NUMERIC_KEYS = new Set(["score"]);

// --- CRC32 (requis par l'entete ZIP) -------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// --- Writer ZIP (methode store, pas de compression) ----------------------
function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const size = data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature entete local
    lv.setUint16(4, 20, true); // version requise
    lv.setUint16(8, 0, true); // methode : store
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // taille compressee
    lv.setUint32(22, size, true); // taille reelle
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    parts.push(local, data);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature central directory
    cv.setUint16(4, 20, true); // version qui a cree
    cv.setUint16(6, 20, true); // version requise
    cv.setUint16(10, 0, true); // methode : store
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // offset de l'entete local
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // signature End Of Central Directory
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // offset du central directory
  parts.push(...central, eocd);

  const total = parts.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of parts) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// --- Helpers XML ---------------------------------------------------------
// Retire les caracteres de controle interdits par XML puis echappe.
function xmlText(value) {
  const s = String(value == null ? "" : value).replace(
    /[\x00-\x08\x0B\x0C\x0E-\x1F]/g,
    ""
  );
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function colLetter(i) {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function numericValue(key, value) {
  if (value == null || value === "") return null;
  // "4,7" -> 4.7 (note FR), retire tout sauf chiffres et separateur decimal.
  const norm = String(value).replace(",", ".").replace(/[^\d.]/g, "");
  if (norm === "" || norm === ".") return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function cellXml(ref, key, value, style) {
  const sAttr = style ? ` s="${style}"` : "";
  if (NUMERIC_KEYS.has(key)) {
    const n = numericValue(key, value);
    if (n !== null) return `<c r="${ref}"${sAttr}><v>${n}</v></c>`;
  }
  const t = xmlText(value);
  if (t === "" && !style) return ""; // cellule vide non stylee : on l'omet
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${t}</t></is></c>`;
}

// --- Parts statiques du classeur -----------------------------------------
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const CONTENT_TYPES =
  XML_DECL +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WORKBOOK =
  XML_DECL +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets>' +
  "</workbook>";

const WORKBOOK_RELS =
  XML_DECL +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

// Style 0 : normal. Style 1 : entete en gras.
const STYLES =
  XML_DECL +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

function buildSheet(leads, cols) {
  const lastCol = colLetter(cols.length - 1);
  const lastRow = leads.length + 1;
  const range = `A1:${lastCol}${lastRow}`;

  const colsXml = cols
    .map((k, i) => {
      const w = WIDTHS[k] || DEFAULT_WIDTH;
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    })
    .join("");

  const header =
    `<row r="1">` +
    cols
      .map((k, i) => cellXml(`${colLetter(i)}1`, "header", ALL_COLUMNS[k], 1))
      .join("") +
    `</row>`;

  const body = leads
    .map((lead, r) => {
      const rowNum = r + 2;
      const cells = cols
        .map((k, i) => cellXml(`${colLetter(i)}${rowNum}`, k, lead[k]))
        .join("");
      return `<row r="${rowNum}">${cells}</row>`;
    })
    .join("");

  return (
    XML_DECL +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="${range}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="${range}"/>` +
    "</worksheet>"
  );
}

// Construit les octets .xlsx pour un ensemble ordonne de colonnes (`keys`).
export function buildXlsx(leads, keys = Object.keys(ALL_COLUMNS)) {
  const cols = keys.filter((k) => k in ALL_COLUMNS);
  const enc = new TextEncoder();
  const files = [
    { name: "[Content_Types].xml", data: enc.encode(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc.encode(ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc.encode(WORKBOOK) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: enc.encode(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(buildSheet(leads, cols)) },
  ];
  return zipStore(files);
}

export function downloadXlsx(bytes, filename) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
