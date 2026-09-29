// Gestion de la licence.
// Trois types de cles supportes :
//   1. Cles beta    : ensemble BETA_KEYS, validation locale instantanee
//   2. Cles signees : format ML-XXXXXXXX-XXXX, HMAC-SHA256 local, aucun appel reseau
//   3. Cles LemonSqueezy : validation via API publique LS

import { BETA_KEYS } from "./config.js";

const KEY = "license";
const CACHE_TTL = 60 * 60 * 1000;
const LS_BASE = "https://api.lemonsqueezy.com/v1/licenses";
const LS_HEADERS = {
  Accept: "application/vnd.api+json",
  "Content-Type": "application/vnd.api+json",
};

// Secret partage avec tools/keygen.html — ne pas modifier sans regenerer toutes les cles.
const SIGNED_SECRET = "mapsleads-prod-2026";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function get() {
  const d = await chrome.storage.local.get(KEY);
  return d[KEY] || null;
}

async function save(state) {
  await chrome.storage.local.set({ [KEY]: state });
}

// Valide localement une cle signee au format ML-XXXXXXXX-XXXX.
async function isValidSignedKey(licenseKey) {
  const parts = licenseKey.trim().toUpperCase().split("-");
  if (parts.length !== 3 || parts[0] !== "ML" ||
      parts[1].length !== 8 || parts[2].length !== 4) {
    return false;
  }
  if (!/^[0-9A-F]+$/.test(parts[1]) || !/^[0-9A-F]+$/.test(parts[2])) {
    return false;
  }
  try {
    const keyMat = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SIGNED_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      keyMat,
      new TextEncoder().encode(parts[1])
    );
    const expected = Array.from(new Uint8Array(sig))
      .slice(0, 2)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    return parts[2] === expected;
  } catch {
    return false;
  }
}

// Active une cle de licence. Retourne { ok, error? }.
export async function activate(licenseKey) {
  const key = licenseKey.trim().toUpperCase();

  if (BETA_KEYS.has(key)) {
    await save({ licenseKey: key, instanceId: "beta", valid: true, validatedAt: Date.now() });
    return { ok: true };
  }

  if (await isValidSignedKey(key)) {
    await save({ licenseKey: key, instanceId: "prod-signed", valid: true, validatedAt: Date.now() });
    return { ok: true };
  }

  const existing = await get();
  const instanceId = existing?.instanceId || uuid();

  try {
    const r = await fetch(`${LS_BASE}/activate`, {
      method: "POST",
      headers: LS_HEADERS,
      body: JSON.stringify({ license_key: licenseKey.trim(), instance_name: instanceId }),
    });
    const data = await r.json();
    if (!data.activated) {
      return { ok: false, error: "Clé invalide ou déjà utilisée sur un autre appareil." };
    }
    await save({
      licenseKey: licenseKey.trim(),
      instanceId: data.instance?.id || instanceId,
      valid: true,
      validatedAt: Date.now(),
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Erreur réseau. Vérifiez votre connexion." };
  }
}

// Valide la licence stockee. Retourne { valid }.
export async function validate() {
  const state = await get();
  if (!state?.licenseKey) return { valid: false };

  if (BETA_KEYS.has(state.licenseKey)) return { valid: true };

  if (await isValidSignedKey(state.licenseKey)) return { valid: true };

  if (state.validatedAt && Date.now() - state.validatedAt < CACHE_TTL) {
    return { valid: state.valid };
  }

  try {
    const r = await fetch(`${LS_BASE}/validate`, {
      method: "POST",
      headers: LS_HEADERS,
      body: JSON.stringify({ license_key: state.licenseKey, instance_id: state.instanceId }),
    });
    const data = await r.json();
    await save({ ...state, valid: data.valid, validatedAt: Date.now() });
    return { valid: data.valid };
  } catch {
    return { valid: state.valid ?? false };
  }
}

export async function deactivate() {
  await chrome.storage.local.remove(KEY);
}
