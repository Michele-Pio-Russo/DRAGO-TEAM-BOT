// src/marketApi.js — Accesso in SOLA LETTURA alle API pubbliche di Warframe Market.
// Usato dal comando /market per leggere i profili e controllare se un utente
// ha lasciato una recensione positiva a un altro.
//
// Endpoint usati (tutti pubblici, nessun login):
//   v2  GET /v2/user/{slug}                         -> dati profilo (nome, avatar, reputazione...)
//   v1  GET /v1/profile/{slug}/reviews/             -> recensioni, pagina 1 (15 per pagina, dalla più recente)
//   v1  GET /v1/profile/{slug}/reviews/{pagina}     -> pagine successive
const API_V1 = 'https://api.warframe.market/v1';
const API_V2 = 'https://api.warframe.market/v2';
const ASSETS = 'https://warframe.market/static/assets/';
const PAGE_SIZE = 15;
const MAX_PAGES = 200;                      // paracadute: 3000 recensioni
const PROFILE_CACHE_MS = 10 * 60 * 1000;
const REVIEW_CACHE_MS = 10 * 60 * 1000;

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'DragoBot/1.0 (bot Discord del clan DragoTeam ITA; sola lettura)',
  Platform: 'pc',
  Language: 'en',
  Crossplay: 'true',
};

class MarketError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // NOT_FOUND | RATE_LIMIT | NETWORK | HTTP
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Il sito limita a circa 3 richieste al secondo: le mettiamo in fila con una pausa.
function minGap() {
  const v = Number(process.env.MARKET_MIN_GAP_MS);
  return Number.isFinite(v) && v >= 0 ? v : 400;
}
let queue = Promise.resolve();
let lastAt = 0;
function throttled(task) {
  const job = queue.then(async () => {
    const wait = lastAt + minGap() - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return task();
  });
  queue = job.catch(() => {});
  return job;
}

async function getJson(url) {
  return throttled(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let res;
    try {
      res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    } catch (e) {
      throw new MarketError('NETWORK', `Rete o timeout: ${e.message}`);
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 404) throw new MarketError('NOT_FOUND', 'Profilo non trovato');
    if (res.status === 429) throw new MarketError('RATE_LIMIT', 'Troppe richieste a Warframe Market');
    if (!res.ok) throw new MarketError('HTTP', `HTTP ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new MarketError('HTTP', 'Risposta non valida');
    }
  });
}

// ─── Nomi e link ───────────────────────────────────────────────────────────

// Rende confrontabili nomi scritti in modo diverso: toglie emoji, spazi,
// trattini, underscore e maiuscole; riporta i caratteri "decorati" a quelli normali.
function normalizeName(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// Accetta un link al profilo (anche con prefisso lingua) oppure lo slug nudo.
function slugFromInput(input) {
  const text = String(input ?? '').trim();
  const m = text.match(/warframe\.market\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?profile\/([^/?#\s]+)/i);
  if (m) {
    try { return decodeURIComponent(m[1]).toLowerCase(); } catch { return m[1].toLowerCase(); }
  }
  if (/^[A-Za-z0-9._-]{2,40}$/.test(text)) return text.toLowerCase();
  return null;
}

function profileUrl(slug) { return `https://warframe.market/profile/${encodeURIComponent(slug)}`; }
function avatarUrl(path) { return path ? ASSETS + path : null; }

function stripHtml(html, max = 220) {
  const text = String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{2,}/g, '\n').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// ─── Profilo ───────────────────────────────────────────────────────────────

const profileCache = new Map(); // slug -> { at, value }

async function fetchProfile(slug) {
  const hit = profileCache.get(slug);
  if (hit && Date.now() - hit.at < PROFILE_CACHE_MS) return hit.value;

  const json = await getJson(`${API_V2}/user/${encodeURIComponent(slug)}`);
  const d = json?.data;
  if (!d) throw new MarketError('NOT_FOUND', 'Profilo non trovato');
  const value = {
    slug: d.slug || slug,
    name: d.ingameName || slug,
    avatar: avatarUrl(d.avatar),
    reputation: d.reputation ?? 0,
    status: d.status || 'offline',
    tier: d.tier || null,
    platform: d.platform || 'pc',
    about: stripHtml(d.about),
  };
  profileCache.set(slug, { at: Date.now(), value });
  return value;
}

// ─── Recensioni ────────────────────────────────────────────────────────────

const reviewCache = new Map(); // slug -> { at, byName: Map<nomeNormalizzato, review_type> }

function indexReviews(map, reviews) {
  for (const r of reviews || []) {
    if (r.hidden) continue;
    const u = r.user_from || {};
    for (const key of [u.ingame_name, u.slug]) {
      const n = normalizeName(key);
      if (n && !map.has(n)) map.set(n, r.review_type); // la più recente vince
    }
  }
}

// 'positive' se c'è una recensione positiva, 'not_positive' se c'è ma non lo è, null se assente
function lookup(map, candidates) {
  let found = null;
  for (const c of candidates) {
    if (!map.has(c)) continue;
    if (map.get(c) === 1) return 'positive';
    found = 'not_positive';
  }
  return found;
}

/**
 * Controlla se uno degli autori possibili (nomi già normalizzati) ha lasciato
 * una recensione al profilo targetSlug.
 * @returns {Promise<{status: 'positive'|'not_positive'|'none'}>}
 */
async function checkReview(targetSlug, candidates) {
  const slug = encodeURIComponent(targetSlug);
  const wanted = candidates.filter(Boolean);
  if (!wanted.length) return { status: 'none' };

  // 1) Pagina 1 sempre "fresca": una recensione appena lasciata compare qui.
  const first = await getJson(`${API_V1}/profile/${slug}/reviews/`);
  const payload = first?.payload || {};
  const total = payload.total_review_count ?? 0;
  const firstMap = new Map();
  indexReviews(firstMap, payload.reviews);
  const onFirst = lookup(firstMap, wanted);
  if (onFirst === 'positive') return { status: 'positive' };

  // 2) Se ho una scansione completa recente, uso quella (più la pagina 1 appena letta).
  const cached = reviewCache.get(targetSlug);
  if (cached && Date.now() - cached.at < REVIEW_CACHE_MS) {
    const fromCache = lookup(cached.byName, wanted);
    const res = fromCache === 'positive' ? 'positive' : (onFirst || fromCache);
    return { status: res || 'none' };
  }

  // 3) Scansione completa delle pagine successive, con uscita anticipata se trovo una positiva.
  const all = new Map(firstMap);
  const pages = Math.min(MAX_PAGES, Math.ceil(total / PAGE_SIZE));
  for (let page = 2; page <= pages; page++) {
    const json = await getJson(`${API_V1}/profile/${slug}/reviews/${page}`);
    const reviews = json?.payload?.reviews || [];
    if (!reviews.length) break;
    const pageMap = new Map();
    indexReviews(pageMap, reviews);
    for (const [k, v] of pageMap) if (!all.has(k)) all.set(k, v);
    if (lookup(pageMap, wanted) === 'positive') return { status: 'positive' };
  }

  reviewCache.set(targetSlug, { at: Date.now(), byName: all });
  return { status: lookup(all, wanted) || 'none' };
}

function clearCaches() { profileCache.clear(); reviewCache.clear(); }

module.exports = {
  MarketError, normalizeName, slugFromInput, profileUrl, avatarUrl, stripHtml,
  fetchProfile, checkReview, clearCaches,
};
