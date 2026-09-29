// Resolution de la localisation saisie en filtre API.
//
// Pourquoi ce module : l'API Recherche d'entreprises n'a AUCUN parametre "ville".
// Mettre "tours" dans la recherche plein texte revient a chercher les societes
// dont le nom contient "tours" (d'ou des resultats parisiens). Il faut convertir
// le nom de commune en code INSEE via l'API Geo, puis filtrer dessus.
//
// On filtre sur `code_commune`, exact au perimetre de la ville. Exception :
// Paris, Lyon et Marseille portent un code commune global (75056, 69123, 13055)
// que la base SIRENE n'utilise pas, leurs etablissements etant rattaches aux
// arrondissements. Pour ces trois villes on retombe sur la liste des codes
// postaux, qui les couvre correctement.

const GEO_BASE = "https://geo.api.gouv.fr/communes";
const CACHE_KEY = "geoCacheV2";

// Paris, Lyon, Marseille : codes communes globaux inconnus de la base SIRENE.
const PLM = new Set(["75056", "69123", "13055"]);

const POSTAL = /^\d{5}$/;
const DEPARTMENT = /^(\d{1,3}|2[ab])$/i;

let cache = null;

async function loadCache() {
  if (!cache) {
    const d = await chrome.storage.local.get(CACHE_KEY);
    cache = d[CACHE_KEY] || {};
  }
  return cache;
}

async function saveCache() {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

// Nom de commune -> { nom, codesPostaux }. `boost=population` fait gagner la
// commune la plus peuplee en cas d'homonymie ("Tours" plutot que "Tours-sur-Marne").
async function lookupCommune(name, signal) {
  const store = await loadCache();
  const key = name.toLowerCase();
  if (key in store) return store[key];

  const url = `${GEO_BASE}?nom=${encodeURIComponent(name)}&fields=nom,code,codesPostaux&boost=population&limit=1`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`GEO ${r.status}`);
  const [commune] = await r.json();

  const result = commune?.code
    ? { nom: commune.nom, code: commune.code, codesPostaux: commune.codesPostaux || [] }
    : null;
  store[key] = result;
  await saveCache();
  return result;
}

// Traduit la saisie en parametres API. Retourne { params, label, warning }.
// `params` est vide si la saisie est vide ou introuvable : la recherche reste
// alors nationale plutot que de renvoyer n'importe quoi.
export async function resolveLocation(input, signal) {
  const loc = input.trim();
  if (!loc) return { params: {}, label: "France entière" };

  if (POSTAL.test(loc)) {
    return { params: { code_postal: loc }, label: `code postal ${loc}` };
  }

  if (DEPARTMENT.test(loc)) {
    const dep = loc.length === 1 ? `0${loc}` : loc.toUpperCase();
    return { params: { departement: dep }, label: `département ${dep}` };
  }

  const commune = await lookupCommune(loc, signal);
  if (!commune) {
    return {
      params: {},
      label: "France entière",
      warning: `Commune « ${loc} » introuvable : recherche étendue à toute la France.`,
    };
  }
  const params = PLM.has(commune.code)
    ? { code_postal: commune.codesPostaux.join(",") }
    : { code_commune: commune.code };
  return { params, label: commune.nom };
}
