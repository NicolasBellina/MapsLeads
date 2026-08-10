// Genere les icones PNG de l'extension sans aucune dependance externe.
// Dessine un pin de carte blanc sur fond bleu arrondi, avec supersampling x3
// pour des bords propres. Encode le PNG a la main (IHDR/IDAT/IEND + CRC32),
// la compression zlib etant fournie par le module natif de Node.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ACCENT = [37, 99, 235]; // #2563eb
const WHITE = [255, 255, 255];

// Table CRC32.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Geometrie en coordonnees unitaires (0..1).
const CORNER = 0.22;
const HEAD = { x: 0.5, y: 0.4, r: 0.26 };
const HOLE_R = 0.11;
const TIP = { x: 0.5, y: 0.86 };

function dist(x, y, cx, cy) {
  return Math.hypot(x - cx, y - cy);
}

function inRoundedSquare(x, y) {
  const cx = Math.min(x, 1 - x);
  const cy = Math.min(y, 1 - y);
  if (cx > CORNER || cy > CORNER) return true;
  return dist(cx, cy, CORNER, CORNER) <= CORNER;
}

function inTriangle(x, y) {
  const ax = HEAD.x - HEAD.r * 0.72, ay = 0.5;
  const bx = HEAD.x + HEAD.r * 0.72, by = 0.5;
  const cxp = TIP.x, cyp = TIP.y;
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cxp) * (by - cyp) - (bx - cxp) * (y - cyp);
  const d3 = (x - ax) * (cyp - ay) - (cxp - ax) * (y - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function inPin(x, y) {
  return dist(x, y, HEAD.x, HEAD.y) <= HEAD.r || inTriangle(x, y);
}

function colorAt(x, y) {
  if (!inRoundedSquare(x, y)) return null; // transparent
  if (inPin(x, y) && dist(x, y, HEAD.x, HEAD.y) > HOLE_R) return WHITE;
  return ACCENT;
}

function render(size) {
  const ss = 3;
  const S = size * ss;
  const raw = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const ux = (px * ss + sx + 0.5) / S;
          const uy = (py * ss + sy + 0.5) / S;
          const c = colorAt(ux, uy);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      const cov = a / (n * 255);
      // Pre-multiplie non necessaire : on ecrit la couleur moyenne des pixels couverts.
      raw[i] = cov ? Math.round(r / (a / 255)) : 0;
      raw[i + 1] = cov ? Math.round(g / (a / 255)) : 0;
      raw[i + 2] = cov ? Math.round(b / (a / 255)) : 0;
      raw[i + 3] = Math.round(a / n);
    }
  }
  return raw;
}

function encodePng(size, raw) {
  // Ajoute l'octet de filtre (0) au debut de chaque ligne.
  const stride = size * 4;
  const filtered = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    filtered[y * (stride + 1)] = 0;
    raw.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const idat = zlib.deflateSync(filtered);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  const png = encodePng(size, render(size));
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png (${png.length} octets)`);
}
