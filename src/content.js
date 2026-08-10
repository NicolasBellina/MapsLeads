// Scraper injecte a la demande dans l'onglet Google Maps.
// Injecte via chrome.scripting.executeScript quand l'utilisateur clique sur
// l'icone. Le garde ci-dessous evite d'enregistrer le listener en double si le
// fichier est reinjecte lors de clics successifs.

if (!window.__MAPSLEADS_LOADED__) {
  window.__MAPSLEADS_LOADED__ = true;

  // Selecteurs centralises : Google change regulierement son DOM, les corriger
  // ici suffit. Optimises pour Maps en anglais et en francais.
  const SELECTORS = {
    feed: '[role="feed"]',
    card: ".Nv2PK",
    cardFallback: '[role="feed"] > div',
    link: "a.hfpxzc",
    name: ".qBF1Pd, .fontHeadlineSmall",
    ratingImg: '[role="img"][aria-label]',
    ratingText: ".MW4etd",
    reviewsText: ".UY7F9",
    infoRows: ".W4Efsd",
    // Panneau de fiche detail (donnees fiables via data-item-id).
    detailTitle: "h1.DUwDvf",
    detailPhone: 'button[data-item-id^="phone:tel:"]',
    detailWebsite: 'a[data-item-id="authority"]',
    detailAddress: 'button[data-item-id="address"]',
    backButton:
      'button[aria-label="Retour"], button[aria-label="Back"], button[jsaction*="back"]',
  };

  // Numeros francais : "04 78 12 34 56", "+33 4 78...", "01.23.45.67.89".
  const PHONE_RE = /(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/;
  const RATING_RE = /([\d]+[.,]?[\d]*)\s*(?:star|étoile)/i;
  // \s couvre l'espace insecable etroit (U+202F) que Maps FR utilise comme
  // separateur de milliers dans "2 804 avis" : sans lui on ne captait que "804".
  const REVIEWS_RE = /([\d.,\s]+)\s*(?:review|avis)/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (el) => (el ? el.textContent.trim() : "");

  // Attend qu'un predicat soit vrai (element charge, panneau ouvert...).
  async function waitFor(fn, timeout = 3000, interval = 150) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  // Niveau de prix : Maps l'affiche avec 1 a 4 symboles monetaires (€, €€...).
  // On accepte aussi une fourchette chiffree ("10-20 €", "€10-20") pour ne pas
  // laisser la colonne vide quand Maps ne montre pas le niveau symbolique.
  function parsePrice(card) {
    for (const row of card.querySelectorAll(SELECTORS.infoRows)) {
      for (const part of row.textContent.split("·")) {
        const s = part.trim();
        const level = s.match(/^([€$£]{1,4})$/);
        if (level) return { price: level[1], priceLevel: level[1].length };
        // Fourchette chiffree avec un symbole monetaire : on garde le texte tel
        // quel (priceLevel 0 => n'entre pas dans le filtre "prix max").
        if (/[€$£]/.test(s) && /\d/.test(s) && s.length <= 24) {
          return { price: s, priceLevel: 0 };
        }
      }
    }
    return { price: "", priceLevel: 0 };
  }

  // Options de service (sur place / a emporter / livraison), detectees par
  // mots-cles FR + EN. On decoupe le texte en segments (· ou saut de ligne) et
  // on ignore les segments negatifs ("Pas de livraison", "No delivery") : sans
  // ce garde-fou, "Pas de livraison" ajoutait "Livraison" a tort.
  function parseServices(card) {
    const out = new Set();
    for (const chunk of card.textContent.split(/[·\n]/)) {
      const s = chunk.trim().toLowerCase();
      if (!s || /\b(pas de|sans|no|non)\b/.test(s)) continue;
      if (/sur place|dine[- ]?in/.test(s)) out.add("Sur place");
      if (/emporter|takeaway|take[- ]?out|drive|retrait|pickup|curbside/.test(s))
        out.add("À emporter");
      if (/livraison|delivery/.test(s)) out.add("Livraison");
    }
    return [...out].join(" · ");
  }

  // Applique les filtres commerciaux sur les donnees niveau liste (avant
  // d'ouvrir la fiche). Un critere non renseigne est ignore ; un prix ou des
  // services inconnus ne disqualifient pas (evite les faux negatifs).
  function matchesFilters(lead, f) {
    if (!f) return true;
    const reviews = parseInt(lead.reviews || "0", 10) || 0;
    const rating = parseFloat((lead.rating || "").replace(",", ".")) || 0;
    if (f.minReviews && reviews < f.minReviews) return false;
    if (f.minRating && rating < f.minRating) return false;
    if (f.maxPrice && lead.priceLevel && lead.priceLevel > f.maxPrice) return false;
    if (f.takeaway && !/emporter/i.test(lead.services)) return false;
    if (f.delivery && !/livraison/i.test(lead.services)) return false;
    return true;
  }

  // Filtres sur les donnees de contact : connues seulement APRES ouverture de la
  // fiche (site web, telephone). Cible les prospects "sans presence digitale".
  function matchesContact(lead, f) {
    if (!f) return true;
    if (f.noWebsite && lead.website) return false;
    if (f.noPhone && lead.phone) return false;
    return true;
  }

  function parseRatingReviews(card) {
    let rating = "";
    let reviews = "";
    const img = card.querySelector(SELECTORS.ratingImg);
    const label = img ? img.getAttribute("aria-label") || "" : "";
    const rm = label.match(RATING_RE);
    if (rm) rating = rm[1]; // garde la virgule FR (Excel FR la lit comme nombre)
    const vm = label.match(REVIEWS_RE);
    if (vm) reviews = vm[1].replace(/[^\d]/g, "");
    if (!rating) rating = text(card.querySelector(SELECTORS.ratingText));
    if (!reviews) {
      reviews = text(card.querySelector(SELECTORS.reviewsText)).replace(/[^\d]/g, "");
    }
    return { rating, reviews };
  }

  // Categorie et adresse : Google melange note, prix, horaires et adresse dans
  // les memes blocs .W4Efsd. On decoupe en segments et on ecarte le bruit par
  // son CONTENU (pas par sa position, trop fragile).
  function parseInfo(card, rating) {
    const segments = [];
    for (const row of card.querySelectorAll(SELECTORS.infoRows)) {
      const clean = row.textContent.replace(/\s+/g, " ").trim();
      for (const part of clean.split("·")) {
        const s = part.trim();
        if (s) segments.push(s);
      }
    }

    const isNoise = (s) =>
      /\(\s*\d[\d\s.,]*\)/.test(s) || // "(39 510)" nombre d'avis
      /^\d+[.,]\d+$/.test(s) || // "4,8" note seule
      (rating && s.startsWith(rating)) || // note + avis colles
      /[€$£]/.test(s) || // prix
      /(ouvert|ferm|open|closed|24\s?\/\s?24|\b\d{1,2}\s?[:h]\s?\d{2}\b)/i.test(s); // horaires

    const clean = segments.filter((s) => !isNoise(s));
    const category = clean[0] || "";
    const looksAddress = (s) =>
      /\d/.test(s) ||
      /\b(rue|avenue|av\.|bd|boulevard|place|chemin|route|quai|impasse|all[ée]e|cours)\b/i.test(s);
    const address = clean.slice(1).find(looksAddress) || clean[1] || "";
    return { category, address };
  }

  // Donnees niveau liste (rapide, sans ouvrir la fiche).
  function extractCard(card) {
    try {
      const linkEl = card.querySelector(SELECTORS.link);
      const name =
        text(card.querySelector(SELECTORS.name)) ||
        (linkEl ? (linkEl.getAttribute("aria-label") || "").trim() : "");
      if (!name) return null;

      const { rating, reviews } = parseRatingReviews(card);
      const { category, address } = parseInfo(card, rating);
      const { price, priceLevel } = parsePrice(card);
      const services = parseServices(card);
      const mapsUrl = linkEl ? linkEl.href.split("/data=")[0] : "";

      return {
        name, category, address, rating, reviews, price, priceLevel, services,
        phone: "", website: "", mapsUrl,
      };
    } catch (e) {
      return null;
    }
  }

  // Ouvre la fiche detail du lieu et recupere telephone + site + adresse via
  // les attributs data-item-id (les selecteurs les plus stables de Maps).
  function scrapeDetail() {
    const out = {};
    const phoneBtn = document.querySelector(SELECTORS.detailPhone);
    if (phoneBtn) {
      const al = phoneBtn.getAttribute("aria-label") || "";
      const parts = al.split(":");
      out.phone =
        parts.length > 1
          ? parts.slice(1).join(":").trim()
          : (phoneBtn.getAttribute("data-item-id") || "").replace("phone:tel:", "").trim();
    }
    const siteEl = document.querySelector(SELECTORS.detailWebsite);
    if (siteEl && siteEl.href && !/google\.[^/]+\//.test(siteEl.href)) {
      out.website = siteEl.href;
    }
    const addrBtn = document.querySelector(SELECTORS.detailAddress);
    if (addrBtn) {
      const al = addrBtn.getAttribute("aria-label") || "";
      const idx = al.indexOf(":");
      if (idx !== -1) out.address = al.slice(idx + 1).trim();
    }

    // Prix : chip compose UNIQUEMENT de symboles monetaires sur la fiche
    // (present alors qu'il manque souvent dans la carte de liste).
    for (const chip of document.querySelectorAll("span, button")) {
      const t = chip.textContent.trim();
      if (/^[€$£]{1,4}$/.test(t)) {
        out.price = t;
        out.priceLevel = t.length;
        break;
      }
    }

    // Services : la fiche liste les options via des aria-label courts et fiables
    // ("Sur place", "Vente a emporter", "Livraison"). On evite le texte des avis
    // en ne lisant que les aria-label, et on ignore les mentions negatives.
    const services = new Set();
    for (const node of document.querySelectorAll("[aria-label]")) {
      const s = (node.getAttribute("aria-label") || "").toLowerCase();
      if (!s || s.length > 40 || /\b(pas de|sans|no|non)\b/.test(s)) continue;
      if (/^sur place\b/.test(s)) services.add("Sur place");
      if (/\bemporter\b|takeaway|take[- ]?out|\bdrive\b|retrait|pickup|curbside/.test(s))
        services.add("À emporter");
      if (/^livraison\b|^delivery\b/.test(s)) services.add("Livraison");
    }
    if (services.size) out.services = [...services].join(" · ");

    return out;
  }

  async function goBack() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, which: 27, bubbles: true })
    );
    const back = document.querySelector(SELECTORS.backButton);
    if (back) back.click();
    await waitFor(() => document.querySelector(SELECTORS.feed), 3000, 150);
  }

  async function enrich(card, name) {
    const link = card.querySelector(SELECTORS.link);
    if (!link) return {};
    card.scrollIntoView({ block: "center" });
    link.click();
    // Attend que le panneau detail corresponde bien au lieu clique.
    await waitFor(() => {
      const t = text(document.querySelector(SELECTORS.detailTitle));
      return t && (t === name || name.startsWith(t) || t.startsWith(name));
    }, 3500, 150);
    await sleep(300); // laisse les boutons tel/site finir de charger
    return scrapeDetail();
  }

  function getCards(feed) {
    let cards = feed.querySelectorAll(SELECTORS.card);
    if (!cards.length) cards = feed.querySelectorAll(SELECTORS.cardFallback);
    return [...cards];
  }

  // Parcourt la liste, dedoublonne par lien de lieu (la liste est virtualisee :
  // les cartes hors ecran sont retirees du DOM). Enrichit les `enrichLimit`
  // premiers leads via leur fiche detail.
  async function extractAll(maxRows, enrichLimit, filters) {
    const first = document.querySelector(SELECTORS.feed);
    if (!first) return { ok: false, error: "no-feed", leads: [] };

    const done = new Set();
    const leads = [];
    let idle = 0;
    let scanned = 0; // cartes parcourues (retenues ou non) : garde-fou anti-boucle.

    while (leads.length < maxRows && idle < 4 && scanned < 400) {
      const feed = document.querySelector(SELECTORS.feed);
      const cards = feed ? getCards(feed) : [];
      const card = cards.find((c) => {
        const href = c.querySelector(SELECTORS.link)?.href || "";
        return href && !done.has(href);
      });

      if (!card) {
        // Rien de nouveau a l'ecran : on scrolle pour charger la suite.
        if (feed) feed.scrollTo(0, feed.scrollHeight);
        await sleep(800);
        idle++;
        continue;
      }

      idle = 0;
      scanned++;
      done.add(card.querySelector(SELECTORS.link).href);
      const base = extractCard(card);
      if (!base) continue;

      // Filtrage AVANT enrichissement : on n'ouvre pas la fiche d'un lieu ecarte
      // (gain de temps majeur, l'enrichissement coute ~1,5 s par fiche).
      if (!matchesFilters(base, filters)) continue;

      if (leads.length < enrichLimit) {
        try {
          Object.assign(base, await enrich(card, base.name));
          await goBack();
        } catch (e) {
          // On garde au moins les donnees niveau liste.
        }
      }

      // Filtres contact (site/tel) : appliques apres enrichissement. Un lieu qui
      // ne passe pas est ignore et on continue a scanner pour completer le quota.
      if (!matchesContact(base, filters)) continue;

      leads.push(base);
    }

    return { ok: true, leads };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "extract") {
      extractAll(msg.maxRows || 20, msg.enrichLimit || 20, msg.filters || null)
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: String(e), leads: [] }));
      return true; // reponse asynchrone
    }
  });
}
