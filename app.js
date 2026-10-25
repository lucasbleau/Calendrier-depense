'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY    = 'expense-calendar-data-v1';
const RECURRING_KEY  = 'expense-calendar-recurring-v1';
const GOALS_KEY      = 'expense-calendar-goals-v1';
const AUTH_KEY       = 'expense-calendar-auth-v1';
const USER_KEY       = 'expense-calendar-user-v1';
const CATEGORIES_KEY = 'expense-calendar-categories-v1';
const OVERRIDES_KEY  = 'expense-calendar-recurring-overrides-v1';

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTHS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const DAYS_SHORT = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

let CATEGORIES = [
  { id: 'courses',       label: 'Courses',       color: '#7B9E6B' },
  { id: 'voiture',       label: 'Voiture',       color: '#8B7355' },
  { id: 'essence',       label: 'Essence',       color: '#C17F3C' },
  { id: 'appart',        label: 'Appart',        color: '#8A6F4E' },
  { id: 'abonnements',   label: 'Abonnements',   color: '#7A8FA6' },
  { id: 'loisirs',       label: 'Loisirs',       color: '#A67B8A' },
  { id: 'dijon_loisirs', label: 'Dijon Loisirs', color: '#C4856A' },
  { id: 'dijon_appart',  label: 'Dijon Appart',  color: '#A0917A' },
  { id: 'besac_loisirs', label: 'Besac Loisirs', color: '#8B7BA8' },
  { id: 'epargne',       label: 'Épargne',       color: '#5B8E7D' },
  { id: 'revenus',       label: 'Revenus',       color: '#4A7C59' },
  { id: 'autre',         label: 'Autre',         color: '#9A9888' },
];

// Catégories spéciales (seuls ids hardcodés tolérés, cf. CLAUDE.md)
const DEFAULT_CATEGORY = 'autre';
const INCOME_CATEGORY  = 'revenus';

// Seuil d'alerte des objectifs (réel / plafond)
const GOAL_WARN_RATIO = 0.8;

const CATEGORY_KEYWORDS = {
  courses:     ['carrefour','leclerc','auchan','lidl','intermarché','intermarch','monoprix','casino','franprix','picard','biocbon','bio c bon','naturalia','grand frais','supermarché','supermarche','superette','épicerie','epicerie'],
  essence:     ['total ','total energie','bp ','shell','esso','station service','station-service','station','vinci autoroute','autoroute'],
  appart:      ['loyer','edf','engie','eau ','sfr ','orange ','free ','bouygues','assurance habitation','foncia','nexity','agence immo'],
  voiture:     ['assurance auto','maif','macif','axa','gmf','matmut','carte grise','contrôle technique','controle technique','péage','peage','parking','garage','volkswagen','renault','peugeot'],
  abonnements: ['netflix','spotify','amazon prime','disney','apple ','apple.com','youtube premium','deezer','canal+','free mobile','sfr mobile','bouygues mobile','orange mobile','microsoft','xbox game pass'],
  loisirs:     ['restaurant','brasserie','bistrot','burger','mcdo','mcdonald','kfc','pizza','sushi','bar ','café ','cafe ','cinema','théâtre','theatre','concert','fnac','steam','playstation','amazon','cdiscount','zara','h&m','uniqlo','sport'],
  epargne:     ['boursorama','n26','livret a','livret','assurance vie','pel','cel','pea ','trade republic'],
  revenus:     ['salaire','virement reçu','virement recu','remboursement','allocation','prime','aides','caf ','pole emploi'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Mode de stockage
// Quand l'app tourne en local (file:// ou localhost) → localStorage
// Quand elle est déployée sur Vercel → API /api/expenses
// ─────────────────────────────────────────────────────────────────────────────

const IS_DEPLOYED = (
  window.location.protocol !== 'file:' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1'
);

// Raccourci DOM
const $ = (id) => document.getElementById(id);

function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem(AUTH_KEY);
  if (!token) return fetch(url, options);
  const headers = { ...(options.headers || {}), 'x-auth-token': token };
  return fetch(url, { ...options, headers });
}

// Cache hors-ligne cloisonné par compte en mode déployé : empêche tout accès
// aux données d'un autre utilisateur sur un appareil partagé. En local : clé simple.
function userCacheKey(base) {
  if (!IS_DEPLOYED) return base;
  const u = sessionStorage.getItem(USER_KEY);
  return u ? `${base}:${u}` : base;
}

// Factory de couche de stockage : mutualise le dual-mode (localStorage / API).
// readLocal() lit la collection persistée ; writeLocal() sérialise l'état courant.
function makeStore({ endpoint, readLocal, writeLocal, parseLoad }) {
  return {
    async load() {
      if (!IS_DEPLOYED) return readLocal();
      const res = await apiFetch(endpoint);
      if (!res.ok) { const e = new Error(`Chargement ${endpoint} échoué`); e.status = res.status; throw e; }
      const data = await res.json();
      return parseLoad ? parseLoad(data) : data;
    },
    async send(method, { body, query = '' } = {}) {
      if (!IS_DEPLOYED) { writeLocal(); return; }
      const opts = { method };
      if (body !== undefined) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
      const res = await apiFetch(endpoint + query, opts);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `${method} ${endpoint} échoué`);
      }
    },
  };
}

const expensesStore = makeStore({
  endpoint:   '/api/expenses',
  readLocal:  () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
  writeLocal: () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses)),
});
const DB = {
  load:    ()         => expensesStore.load(),
  add:     (expense)  => expensesStore.send('POST',   { body: expense }),
  addMany: (expenses) => expensesStore.send('POST',   { body: expenses }),
  update:  (expense)  => expensesStore.send('PUT',    { body: expense, query: `?id=${encodeURIComponent(expense.id)}` }),
  remove:  (id)       => expensesStore.send('DELETE', { query: `?id=${encodeURIComponent(id)}` }),
};

const recurringStore = makeStore({
  endpoint:   '/api/recurring',
  readLocal:  () => JSON.parse(localStorage.getItem(RECURRING_KEY) || '[]'),
  writeLocal: () => localStorage.setItem(RECURRING_KEY, JSON.stringify(state.recurring)),
});
const RDB = {
  load:   ()     => recurringStore.load(),
  save:   (task) => recurringStore.send('POST',   { body: task }),
  remove: (id)   => recurringStore.send('DELETE', { query: `?id=${encodeURIComponent(id)}` }),
};

const goalsStore = makeStore({
  endpoint:   '/api/goals',
  readLocal:  () => JSON.parse(localStorage.getItem(GOALS_KEY) || '{}'),
  writeLocal: () => localStorage.setItem(GOALS_KEY, JSON.stringify(state.goals)),
});
const GoalDB = {
  load:   ()                 => goalsStore.load(),
  save:   (category, amount) => goalsStore.send('POST',   { body: { category, amount } }),
  remove: (category)         => goalsStore.send('DELETE', { query: `?category=${encodeURIComponent(category)}` }),
};

// Montants d'une récurrence modifiés pour un mois précis : [{ recurId, yearMonth, amount }]
const overridesStore = makeStore({
  endpoint:   '/api/recurring',
  readLocal:  () => { try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '[]'); } catch { return []; } },
  writeLocal: () => localStorage.setItem(OVERRIDES_KEY, JSON.stringify(state.overrides)),
});
const OverrideDB = {
  async load() {
    if (!IS_DEPLOYED) return overridesStore.load();
    const res = await apiFetch('/api/recurring?overrides=1');
    if (!res.ok) { const e = new Error('Chargement des montants mensuels échoué'); e.status = res.status; throw e; }
    return res.json();
  },
  // amount === null → retire la modification (retour au montant de base)
  save: (recurId, yearMonth, amount) => overridesStore.send('POST', { body: amount === null
    ? { action: 'overrides', remove: [{ recurId, yearMonth }] }
    : { action: 'overrides', set: [{ recurId, yearMonth, amount }] } }),
  importMissing: (items) => overridesStore.send('POST', { body: { action: 'overrides', set: items, onlyMissing: true } }),
};

const categoriesStore = makeStore({
  endpoint:   '/api/categories',
  readLocal:  () => { const raw = localStorage.getItem(CATEGORIES_KEY); return raw ? JSON.parse(raw) : null; },
  writeLocal: () => localStorage.setItem(CATEGORIES_KEY, JSON.stringify(CATEGORIES)),
});
const CatDB = {
  async load() {
    if (!IS_DEPLOYED) return categoriesStore.load();
    const res = await apiFetch('/api/categories');
    if (!res.ok) return null;
    const cats = await res.json();
    return cats.length ? cats : null;
  },
  async upsert(cat) {
    // CATEGORIES est déjà muté par l'appelant : send() sérialise l'état courant en local
    await categoriesStore.send('POST', { body: cat });
    if (IS_DEPLOYED) localStorage.setItem(userCacheKey(CATEGORIES_KEY), JSON.stringify(CATEGORIES));
  },
  // Fusion : en local, l'appelant met à jour et persiste l'état (cf. mergeCategory)
  async merge(from, to) {
    if (!IS_DEPLOYED) return;
    await categoriesStore.send('POST', { body: { action: 'merge', from, to } });
  },
  // En local, la persistance est faite par l'appelant APRÈS le filtrage (cf. deleteCategory)
  async remove(id) {
    if (!IS_DEPLOYED) return;
    await categoriesStore.send('DELETE', { query: `?id=${encodeURIComponent(id)}` });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtEUR(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function fmtCompact(n) {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k€';
  return n.toFixed(2).replace('.', ',') + '€';
}

function parseAmount(str) {
  if (typeof str === 'number') return Math.abs(str);
  const clean = String(str).replace(/\s/g, '').replace(',', '.').replace('€', '').replace('+', '');
  return Math.abs(parseFloat(clean)) || 0;
}

function parseDate(str) {
  if (!str) return null;
  str = String(str).trim();
  if (/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(str)) {
    return str.slice(0, 10).replace(/[/.]/g, '-');
  }
  const m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getOverride(recurId, ym) {
  return state.overrides.find(o => o.recurId === recurId && o.yearMonth === ym);
}

// Mise à jour optimiste : l'appelant rerend tout de suite ; en cas d'échec
// serveur, on restaure l'état précédent et on rerend.
function setRecurOverride(recurId, ym, amount) {
  const snapshot = state.overrides;
  state.overrides = state.overrides.filter(o => !(o.recurId === recurId && o.yearMonth === ym));
  let stored = null;
  if (amount !== null) {
    const task = state.recurring.find(t => t.id === recurId);
    // Stocker même si égal à la base (0 = override explicite "pas ce mois")
    if (task && (amount !== task.amount || amount === 0)) {
      state.overrides.push({ recurId, yearMonth: ym, amount });
      stored = amount;
    }
  }
  OverrideDB.save(recurId, ym, stored)
    .then(cacheOverrides)
    .catch(() => {
      state.overrides = snapshot;
      showToast('Erreur de sauvegarde du montant');
      renderCalendar();
      renderDayPanel();
    });
}

function cacheOverrides() {
  if (IS_DEPLOYED) localStorage.setItem(userCacheKey(OVERRIDES_KEY), JSON.stringify(state.overrides));
}

// Reprise unique des montants autrefois stockés sur l'appareil (clé non suffixée) :
// envoyés au serveur sans écraser l'existant, puis la clé locale est supprimée.
// Les récurrences inconnues de ce compte sont ignorées (serveur et client).
async function migrateLegacyOverrides() {
  if (!IS_DEPLOYED) return;
  let legacy;
  try { legacy = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '[]'); } catch { legacy = []; }
  if (!Array.isArray(legacy) || !legacy.length) return;
  const mine = new Set(state.recurring.map(t => t.id));
  const has  = new Set(state.overrides.map(o => `${o.recurId}|${o.yearMonth}`));
  const items = legacy.filter(o => o && mine.has(o.recurId) && /^\d{4}-\d{2}$/.test(o.yearMonth) &&
    Number.isFinite(o.amount) && o.amount >= 0 && !has.has(`${o.recurId}|${o.yearMonth}`));
  try {
    for (let i = 0; i < items.length; i += 500) await OverrideDB.importMissing(items.slice(i, i + 500));
    state.overrides = state.overrides.concat(items);
    cacheOverrides();
    localStorage.removeItem(OVERRIDES_KEY);
  } catch { /* nouvel essai au prochain chargement */ }
}

// Libellé bancaire normalisé : minuscules sans accents, sans le bruit des relevés
// (CB, PRLV, VIR, dates, n° de carte/référence) → mots significatifs.
const LABEL_NOISE = new Set(['cb', 'carte', 'prlv', 'sepa', 'vir', 'virement', 'inst', 'paiement', 'achat',
  'retrait', 'dab', 'fact', 'facture', 'ref', 'de', 'du', 'des', 'la', 'le', 'les', 'et', 'sas', 'sarl', 'fr', 'www', 'com']);
function labelTokens(label) {
  return String(label).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(w => w.length >= 3 && !/\d/.test(w) && !LABEL_NOISE.has(w));
}

// Index de l'historique (opérations de dépense, la plus récente d'abord) :
// libellé normalisé → catégorie, et mot → catégories. Recalculé quand les
// opérations changent.
let categoryHistoryCache = null;
function categoryHistory() {
  const ex = state.expenses;
  if (categoryHistoryCache && categoryHistoryCache.ref === ex && categoryHistoryCache.len === ex.length) {
    return categoryHistoryCache;
  }
  const exact = new Map();   // 'carrefour market' → catId
  const words = new Map();   // 'carrefour' → Map(catId → nb)
  const active = new Set(CATEGORIES.filter(c => !c.archived && c.id !== DEFAULT_CATEGORY).map(c => c.id));
  for (const e of [...ex].sort((a, b) => b.date.localeCompare(a.date))) {
    if (e.type !== 'depense' || !active.has(e.category)) continue;
    const toks = labelTokens(e.label);
    if (!toks.length) continue;
    const key = toks.join(' ');
    if (!exact.has(key)) exact.set(key, e.category);
    for (const w of new Set(toks)) {
      const m = words.get(w) || words.set(w, new Map()).get(w);
      m.set(e.category, (m.get(e.category) || 0) + 1);
    }
  }
  categoryHistoryCache = { ref: ex, len: ex.length, exact, words };
  return categoryHistoryCache;
}

// Catégorie réelle visée par un mot-clé : l'id s'il existe et est actif, sinon
// une catégorie active dont le libellé donne ce slug (ex. 'essence' → « Essence »
// recréée sous l'id essence_2).
function keywordCategory(id) {
  const slug = l => l.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const direct = CATEGORIES.find(c => c.id === id && !c.archived);
  if (direct) return direct.id;
  const byLabel = CATEGORIES.find(c => !c.archived && slug(c.label) === id);
  return byLabel ? byLabel.id : null;
}

// Catégorie suggérée pour une dépense, par ordre de confiance :
// 1. une opération passée au libellé normalisé identique ;
// 2. une opération passée partageant un mot du libellé (le plus fréquent gagne) ;
// 3. les mots-clés CATEGORY_KEYWORDS, comparés sur des mots entiers ;
// 4. DEFAULT_CATEGORY.
function guessCategory(label) {
  const toks = labelTokens(label);
  const hist = categoryHistory();
  if (toks.length) {
    const exact = hist.exact.get(toks.join(' '));
    if (exact) return exact;
    // Seuls les mots nettement associés à une catégorie (≥ 70 % de leurs
    // occurrences) votent : un mot générique (« paris », « market ») ne décide rien.
    const votes = new Map();
    for (const w of toks) {
      const m = hist.words.get(w);
      if (!m) continue;
      let total = 0, top = null;
      for (const [cat, n] of m) { total += n; if (!top || n > top.n) top = { cat, n }; }
      if (top.n / total >= 0.7) votes.set(top.cat, (votes.get(top.cat) || 0) + top.n);
    }
    let best = null;
    for (const [cat, n] of votes) if (!best || n > best.n) best = { cat, n };
    if (best) return best.cat;
  }
  const text = ` ${toks.join(' ')} `;
  const raw  = ` ${String(label).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+&.]+/g, ' ')} `;
  for (const [id, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const cat = keywordCategory(id);
    if (!cat) continue;
    if (keywords.some(kw => {
      const k = kw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return text.includes(` ${k} `) || raw.includes(` ${k} `);
    })) return cat;
  }
  return DEFAULT_CATEGORY;
}

function getCat(id) {
  return CATEGORIES.find(c => c.id === id)
    ?? CATEGORIES.find(c => c.id === DEFAULT_CATEGORY)
    ?? CATEGORIES[CATEGORIES.length - 1];
}

// ── Hiérarchie de catégories (2 niveaux : parent → sous-catégories) ───────────
// Une catégorie avec des enfants est un « groupe » : pas de config d'objectif
// propre, elle agrège ses sous-catégories (+ ses éventuelles dépenses directes).

function catParent(cat) {
  const c = typeof cat === 'string' ? getCat(cat) : cat;
  return c && c.parent ? c.parent : null;
}

function childrenOf(parentId) {
  return CATEGORIES.filter(c => c.parent === parentId);
}

// Seuls les enfants actifs font d'une catégorie un « groupe » (config) ;
// childrenOf garde les archivés pour l'agrégation des chiffres passés.
function isParent(catId) {
  return CATEGORIES.some(c => c.parent === catId && !c.archived);
}

// Catégorie archivée : masquée des menus et réglages, mais ses opérations
// gardent leur catégorie (nom + couleur) dans l'historique et les stats.
function isArchived(catId) {
  return CATEGORIES.some(c => c.id === catId && c.archived);
}

// Catégories de dépense de premier niveau (sans parent) — l'ordre d'affichage
// des vues récap (Objectifs, Stats).
function topLevelExpenseCats() {
  return CATEGORIES.filter(c => c.id !== INCOME_CATEGORY && !c.parent);
}

// Ids d'une « famille » : la catégorie + ses sous-catégories directes.
// Sert à agréger un parent (ses dépenses propres + celles de ses enfants).
function familyIds(catId) {
  return [catId, ...childrenOf(catId).map(c => c.id)];
}

// Clé année-mois "YYYY-MM" (month 0-indexé)
function ymKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// Clé date "YYYY-MM-DD" (month 0-indexé)
function dateKey(year, month, day) {
  return `${ymKey(year, month)}-${String(day).padStart(2, '0')}`;
}

// Nombre de jours dans le mois (month 0-indexé)
function daysIn(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Classe de colorisation d'un objectif : réel vs plafond
function goalClass(actual, planned) {
  if (!(planned > 0)) return '';
  const p = actual / planned;
  if (p > 1)  return 'over';
  if (p >= 1) return 'ok';
  if (p >= GOAL_WARN_RATIO) return 'warn';
  return 'ok';
}

// Catégories en ordre hiérarchique (parent puis ses sous-catégories indentées).
// cb(cat, isChild) est appelé pour chaque catégorie ; archivées exclues sauf si all.
function forEachCategoryOrdered(cb, all = false) {
  const keep = c => all || !c.archived;
  CATEGORIES.filter(c => !c.parent && keep(c)).forEach(cat => {
    cb(cat, false);
    childrenOf(cat.id).filter(keep).forEach(child => cb(child, true));
  });
}

function populateCategoryDropdowns() {
  ['add-category', 'recur-category'].forEach(selId => {
    const sel = $(selId);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '';
    forEachCategoryOrdered((cat, isChild) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = isChild ? ` ↳ ${cat.label}` : cat.label;
      sel.appendChild(opt);
    });
    if (CATEGORIES.find(c => c.id === current)) sel.value = current;
  });
}

function todayStr() {
  const d = new Date();
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtDays(days) {
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map(d => d + (d === 1 ? 'er' : '')).join(', ') + ' du mois';
}

// Jours d'occurrence d'une récurrence déjà couverts par une opération liée
// (créée via « + », champ recurId) pour un mois donné. Chaque opération liée
// est affectée à l'occurrence la plus proche, pour tolérer une date déplacée.
function realizedRecurDays(task, year, month) {
  const prefix = ymKey(year, month);
  const dim = daysIn(year, month);
  const occDays = task.days.filter(d => d <= dim);
  const realized = new Set();
  for (const e of state.expenses) {
    if (e.recurId !== task.id || !e.date.startsWith(prefix)) continue;
    const eDay = Number(e.date.slice(8));
    let best = null;
    for (const d of occDays) {
      if (realized.has(d)) continue;
      if (best === null || Math.abs(d - eDay) < Math.abs(best - eDay)) best = d;
    }
    if (best !== null) realized.add(best);
  }
  return realized;
}

// Nombre d'occurrences d'une récurrence restant à saisir pour un mois donné
function unrealizedOccurrences(task, year, month) {
  const dim = daysIn(year, month);
  const realized = realizedRecurDays(task, year, month);
  return task.days.filter(d => d <= dim && !realized.has(d)).length;
}

// Retourne les récurrences actives pour un jour donné, avec overrides mensuels appliqués.
// Un jour hors du mois (ex : 31 dans un mois de 30 j) n'est pas affiché — cohérent avec
// les totaux (recurExpected / indicateur mensuel) qui excluent ces jours.
// Une occurrence déjà saisie comme opération liée (recurId) n'est plus rappelée.
function getRecurringForDay(year, month, day) {
  const ym = ymKey(year, month);
  return state.recurring
    .filter(task => task.days.includes(day) && !realizedRecurDays(task, year, month).has(day))
    .map(task => {
      const ov = getOverride(task.id, ym);
      return ov ? { ...task, amount: ov.amount, _overridden: true } : task;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Import CSV
// ─────────────────────────────────────────────────────────────────────────────

function detectAndParseCSV(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.match(/;/g) || []).length > (text.match(/,/g) || []).length ? ';' : ',';
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  function splitLine(line) {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQ = !inQ; continue; }
      if (line[i] === sep && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += line[i];
    }
    cols.push(cur.trim());
    return cols;
  }

  const headers = splitLine(lines[0]).map(h =>
    h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  );

  let dateCol = -1, labelCol = -1, amountCol = -1, debitCol = -1, creditCol = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.includes('date'))                                                          dateCol   = i;
    if (h.includes('libelle') || h.includes('description') || h.includes('intitule') || h.includes('motif')) labelCol  = i;
    if (h.includes('montant') || h === 'amount')                                     amountCol = i;
    if (h.includes('debit'))                                                         debitCol  = i;
    if (h.includes('credit'))                                                        creditCol = i;
  }

  if (dateCol === -1) return [];

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const date = parseDate(cols[dateCol]);
    if (!date) continue;

    const label = (labelCol >= 0 && cols[labelCol]) ? cols[labelCol] : 'Opération';
    let amount = 0, type = 'depense';

    if (amountCol >= 0) {
      const rawStr = cols[amountCol] || '';
      const isNeg  = rawStr.trim().startsWith('-');
      amount = parseAmount(rawStr);
      type   = isNeg ? 'depense' : 'revenu';
    } else if (debitCol >= 0 || creditCol >= 0) {
      const debit  = debitCol  >= 0 ? parseAmount(cols[debitCol]  || '') : 0;
      const credit = creditCol >= 0 ? parseAmount(cols[creditCol] || '') : 0;
      if (debit  > 0) { amount = debit;  type = 'depense'; }
      else if (credit > 0) { amount = credit; type = 'revenu'; }
    }

    if (!amount) continue;

    results.push({
      id: generateId(),
      date,
      label,
      amount,
      type,
      category: type === 'revenu' ? INCOME_CATEGORY : guessCategory(label),
    });
  }

  return results;
}

// Rapproche des opérations importées des récurrences, pour éviter le double
// comptage (opération importée + rappel ↺). Une opération est liée (recurId,
// catégorie de la récurrence) si : même type, montant à ±5 % (min 1 €) du
// montant attendu ce mois-là, date à ±5 jours d'une occurrence du même mois
// pas encore saisie. Plusieurs candidates → la plus proche (montant puis date).
// Renvoie [{ op, task }] ; les opérations sont modifiées en place.
const LINK_DAY_TOLERANCE = 5;
function linkImportToRecurrences(ops) {
  const taken = new Set();   // `${taskId}|${ym}|${day}` déjà couverte
  const realizedCache = {};
  const isTaken = (task, y, m, day) => {
    const ym = ymKey(y, m);
    const k = `${task.id}|${ym}`;
    realizedCache[k] ??= realizedRecurDays(task, y, m);
    return realizedCache[k].has(day) || taken.has(`${k}|${day}`);
  };
  const links = [];
  for (const op of [...ops].sort((a, b) => a.date.localeCompare(b.date))) {
    if (op.recurId) continue;
    const y = +op.date.slice(0, 4), m = +op.date.slice(5, 7) - 1, d = +op.date.slice(8, 10);
    const ym = ymKey(y, m), dim = daysIn(y, m);
    let best = null;
    for (const task of state.recurring) {
      if (task.type !== op.type || !CATEGORIES.some(c => c.id === task.category)) continue;
      const ov = getOverride(task.id, ym);
      const expected = ov ? ov.amount : task.amount;
      if (!(expected > 0)) continue;
      const amountGap = Math.abs(op.amount - expected);
      if (amountGap > Math.max(1, expected * 0.05)) continue;
      for (const day of task.days) {
        if (day > dim || isTaken(task, y, m, day)) continue;
        const dayGap = Math.abs(day - d);
        if (dayGap > LINK_DAY_TOLERANCE) continue;
        const score = amountGap / expected + dayGap / 100;
        if (!best || score < best.score) best = { task, day, score };
      }
    }
    if (best) {
      taken.add(`${best.task.id}|${ym}|${best.day}`);
      op.recurId  = best.task.id;
      op.category = best.task.category;
      links.push({ op, task: best.task });
    }
  }
  return links;
}

// ─────────────────────────────────────────────────────────────────────────────
// État global
// ─────────────────────────────────────────────────────────────────────────────

const today = new Date();

const state = {
  expenses:     [],
  recurring:    [],
  goals:        {},
  overrides:    [],
  view:         'calendar',
  currentYear:  today.getFullYear(),
  currentMonth: today.getMonth(),
  selectedDate: null,
  editingGoal:  null,       // catégorie dont l'objectif est en cours d'édition (vue Objectifs)
  goalsExpanded: new Set(), // lignes dépliées dans la vue Objectifs
  goalsShowOthers: false,   // section « Autres catégories » dépliée (vue Objectifs)
  statsExpanded: new Set(), // ids des catégories parent dépliées (vue Stats)
  catArchivedOpen: false,   // section « Archivées » dépliée (vue Catégories)
};

let modalRecurDays   = [];   // jours sélectionnés dans le modal récurrence
let editingExpenseId = null; // id de l'opération en cours d'édition (null = création)
let pendingRecurId   = null; // id de la récurrence source quand l'opération est créée via « + »

// ─────────────────────────────────────────────────────────────────────────────
// Agrégations
// ─────────────────────────────────────────────────────────────────────────────

// Objectif mensuel « effectif » d'une catégorie (feuille) : valeur manuelle si
// définie (elle remplace tout), sinon somme des récurrences du mois (objectif auto)
function getGoalForMonth(categoryId, year, month) {
  if (isArchived(categoryId)) return null;
  const manual = state.goals[categoryId];
  if (manual > 0) return manual;
  const r = recurExpected(categoryId, year, month);
  return r > 0 ? r : null;
}

// Objectif d'une catégorie de premier niveau. Feuille → getGoalForMonth.
// Groupe (sous-catégories actives) → plafond global manuel s'il est fixé, sinon
// somme : récurrences propres du parent + objectifs des sous-catégories actives.
function topGoalForMonth(catId, year, month) {
  if (!isParent(catId)) return getGoalForMonth(catId, year, month);
  const manual = state.goals[catId];
  if (manual > 0) return manual;
  const sum = recurExpected(catId, year, month) + childrenOf(catId)
    .filter(c => !c.archived)
    .reduce((s, c) => s + (getGoalForMonth(c.id, year, month) || 0), 0);
  return sum > 0 ? sum : null;
}

// Réel d'un mois au sens Objectifs : dépenses saisies + récurrences restantes,
// catégories archivées exclues (y compris comme sous-catégories)
function monthGoalReal(year, month) {
  return topLevelExpenseCats()
    .filter(c => !c.archived)
    .reduce((s, c) => s + (isParent(c.id) ? goalGroupFigures(c.id, year, month) : goalCatFigures(c.id, year, month)).total, 0);
}

// Total prévu d'un mois (catégories archivées exclues)
function monthPlannedTotal(year, month) {
  return topLevelExpenseCats()
    .filter(c => !c.archived)
    .reduce((s, c) => s + (topGoalForMonth(c.id, year, month) || 0), 0);
}

function getMonthData(year, month) {
  const prefix = ymKey(year, month);
  return state.expenses.filter(e => e.date.startsWith(prefix));
}

function getDayData(dateStr) {
  return state.expenses.filter(e => e.date === dateStr);
}

function sumByType(list) {
  let depenses = 0, revenus = 0;
  for (const e of list) {
    if (e.type === 'depense') depenses += e.amount;
    else revenus += e.amount;
  }
  return { depenses, revenus };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu : Calendrier
// ─────────────────────────────────────────────────────────────────────────────

function renderCalendar() {
  const { currentYear, currentMonth, selectedDate } = state;
  const now = todayStr();

  $('select-month').value = currentMonth;
  $('select-year').value  = currentYear;
  $('month-title').textContent = `${MONTHS[currentMonth]} ${currentYear}`;

  const monthData = getMonthData(currentYear, currentMonth);

  // Indicateur : reste à dépenser du mois, mêmes chiffres que la vue Objectifs
  const goalIndicator = $('month-goal-indicator');
  if (goalIndicator) {
    const real    = monthGoalReal(currentYear, currentMonth);
    const planned = monthPlannedTotal(currentYear, currentMonth);
    if (planned > 0) {
      const diff = planned - real;
      goalIndicator.textContent = diff >= 0 ? `Reste ${fmtEUR(diff)}` : `Dépassé de ${fmtEUR(-diff)}`;
      goalIndicator.title = `Objectifs du mois : ${fmtEUR(real)} sur ${fmtEUR(planned)} prévus — ouvrir Objectifs`;
      goalIndicator.className = `month-goal-indicator ${goalClass(real, planned)}`;
    } else {
      goalIndicator.className = 'month-goal-indicator hidden';
    }
  }
  const dayMap = {};
  for (const e of monthData) {
    if (!dayMap[e.date]) dayMap[e.date] = { depenses: 0, revenus: 0, count: 0 };
    if (e.type === 'depense') dayMap[e.date].depenses += e.amount;
    else                      dayMap[e.date].revenus  += e.amount;
    dayMap[e.date].count++;
  }

  const maxDep = Math.max(1, ...Object.values(dayMap).map(d => d.depenses));
  const firstDow   = new Date(currentYear, currentMonth, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = daysIn(currentYear, currentMonth);
  const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

  const grid = $('calendar-grid');
  grid.innerHTML = '';

  for (const d of DAYS_SHORT) {
    const el = document.createElement('div');
    el.className = 'cal-header';
    el.textContent = d;
    grid.appendChild(el);
  }

  for (let i = startOffset - 1; i >= 0; i--) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.innerHTML = `<span class="day-num">${prevMonthDays - i}</span>`;
    grid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = dateKey(currentYear, currentMonth, day);
    const data    = dayMap[dateStr];
    const isToday = dateStr === now;
    const isSel   = dateStr === selectedDate;
    const recurItems = getRecurringForDay(currentYear, currentMonth, day);

    const el = document.createElement('div');
    el.className = ['cal-day', isToday && 'today', isSel && 'selected'].filter(Boolean).join(' ');
    el.dataset.date = dateStr;
    el.setAttribute('role', 'gridcell');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', dateStr);

    if (data?.depenses > 0) el.style.setProperty('--intensity', data.depenses / maxDep);

    let html = `<span class="day-num">${day}</span>`;
    if (data) {
      if (data.depenses > 0) html += `<span class="day-amount depense">-${fmtCompact(data.depenses)}</span>`;
      if (data.revenus  > 0) html += `<span class="day-amount revenu">+${fmtCompact(data.revenus)}</span>`;
      if (data.count    > 1) html += `<span class="day-count">${data.count} op.</span>`;
    }
    if (recurItems.length > 0) {
      const rDep = recurItems.filter(r => r.type === 'depense').reduce((s, r) => s + r.amount, 0);
      const rRev = recurItems.filter(r => r.type === 'revenu').reduce((s, r) => s + r.amount, 0);
      if (rDep > 0) html += `<span class="day-amount day-recur depense" title="${recurItems.filter(r=>r.type==='depense').map(r=>r.label).join(', ')}">↺ ${fmtCompact(rDep)}</span>`;
      if (rRev > 0) html += `<span class="day-amount day-recur revenu" title="${recurItems.filter(r=>r.type==='revenu').map(r=>r.label).join(', ')}">↺ +${fmtCompact(rRev)}</span>`;
    }

    el.innerHTML = html;
    el.addEventListener('click', () => selectDay(dateStr));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectDay(dateStr); } });
    grid.appendChild(el);
  }

  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const trailing   = totalCells - startOffset - daysInMonth;
  for (let i = 1; i <= trailing; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.innerHTML = `<span class="day-num">${i}</span>`;
    grid.appendChild(el);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu : Panneau latéral
// ─────────────────────────────────────────────────────────────────────────────

function selectDay(dateStr) {
  state.selectedDate = dateStr;
  renderCalendar();
  renderDayPanel();
}

function renderDayPanel() {
  const panel = $('day-panel');
  const dateStr = state.selectedDate;

  if (!dateStr) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  const [year, month, day] = dateStr.split('-').map(Number);
  const label = new Date(year, month - 1, day)
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const items = getDayData(dateStr);
  const { depenses, revenus } = sumByType(items);
  const recurItems = getRecurringForDay(year, month - 1, day);

  // Totaux du jour = opérations saisies + récurrences (même règle que le calendrier)
  const recurDep = recurItems.filter(r => r.type === 'depense').reduce((s, r) => s + r.amount, 0);
  const recurRev = recurItems.filter(r => r.type === 'revenu').reduce((s, r) => s + r.amount, 0);
  const totalDep = depenses + recurDep;
  const totalRev = revenus + recurRev;

  let html = `
    <div class="panel-header">
      <h2 class="panel-date">${label}</h2>
      <button class="btn-icon" id="close-panel" aria-label="Fermer">&#10005;</button>
    </div>
    <div class="panel-summary">
      ${totalDep > 0 ? `<span class="summary-depense">Dépenses : ${fmtEUR(totalDep)}</span>` : ''}
      ${totalRev > 0 ? `<span class="summary-revenu">Revenus : ${fmtEUR(totalRev)}</span>`    : ''}
      ${items.length === 0 && recurItems.length === 0 ? '<span class="summary-empty">Aucune opération enregistrée.</span>' : ''}
    </div>
    <ul class="operations-list">
  `;

  for (const item of items) {
    const cat = getCat(item.category);
    html += `
      <li class="operation-item">
        <div class="op-line1">
          <span class="op-dot" style="background:${cat.color}"></span>
          <span class="op-label" title="${item.label}">${item.label}</span>
        </div>
        <div class="op-line2">
          <span class="op-cat">${cat.label}</span>
          <span class="op-amount ${item.type}">${item.type === 'depense' ? '-' : '+'}${fmtEUR(item.amount)}</span>
          <button class="op-edit" data-id="${item.id}" aria-label="Modifier ${item.label}">&#9998;</button>
          <button class="op-delete" data-id="${item.id}" aria-label="Supprimer ${item.label}">&#10005;</button>
        </div>
      </li>
    `;
  }

  html += `</ul>`;

  const ym = dateStr.slice(0, 7);

  if (recurItems.length > 0) {
    html += `<div class="panel-recurring">
      <div class="panel-recurring-title">↺ Récurrences du jour</div>`;
    for (const r of recurItems) {
      const cat = getCat(r.category);
      const baseTask = state.recurring.find(t => t.id === r.id);
      const hasOverride = !!r._overridden;
      html += `
        <div class="panel-recur-item" data-recur-id="${r.id}">
          <div class="op-line1">
            <span class="op-dot" style="background:${cat.color}"></span>
            <span class="op-label" title="${r.label}">${r.label}</span>
          </div>
          <div class="op-line2">
            <span class="op-cat">${cat.label}</span>
            <span class="op-amount ${r.type}${hasOverride ? ' recur-overridden' : ''}" id="recur-amt-${r.id}">${r.type === 'depense' ? '-' : '+'}${fmtEUR(r.amount)}</span>
            ${hasOverride ? `<button class="btn-recur-reset" data-recur-id="${r.id}" data-ym="${ym}" title="Rétablir le montant de base (${fmtEUR(baseTask.amount)})">↺ base</button>` : ''}
            <button class="btn-edit-recur-amount" data-recur-id="${r.id}" data-ym="${ym}" data-amount="${r.amount}" data-type="${r.type}" title="Modifier pour ce mois">Modifier</button>
            <button class="btn-use-recur" data-recur-id="${r.id}" title="Ajouter comme opération">+</button>
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }

  html += `<button class="btn-add-op" id="btn-add-operation">+ Ajouter une opération</button>`;

  panel.innerHTML = html;

  $('close-panel').addEventListener('click', closePanel);
  $('btn-add-operation').addEventListener('click', () => openAddModal(dateStr));

  const recurMap = Object.fromEntries(recurItems.map(r => [r.id, r]));

  panel.querySelectorAll('.btn-use-recur').forEach(btn => {
    btn.addEventListener('click', () => {
      const task = recurMap[btn.dataset.recurId];
      if (task) openAddModal(dateStr, task, null, task.id);
    });
  });

  panel.querySelectorAll('.btn-edit-recur-amount').forEach(btn => {
    btn.addEventListener('click', () => {
      const recurId = btn.dataset.recurId;
      const ym      = btn.dataset.ym;
      const type    = btn.dataset.type;
      const amtSpan = $(`recur-amt-${recurId}`);
      if (!amtSpan) return;

      const input = document.createElement('input');
      input.type        = 'text';
      input.className   = 'recur-amount-input';
      input.value       = parseFloat(btn.dataset.amount).toFixed(2).replace('.', ',');
      input.inputMode   = 'decimal';

      amtSpan.replaceWith(input);
      btn.style.display = 'none';
      input.focus();
      input.select();

      let saved = false;
      const save = () => {
        if (saved) return;
        saved = true;
        const raw = input.value.trim();
        if (raw === '' || raw === '-') {
          // Champ vide = supprime l'override, retour au montant de base
          setRecurOverride(recurId, ym, null);
        } else {
          const newAmount = parseAmount(raw);
          setRecurOverride(recurId, ym, newAmount);
        }
        renderCalendar();
        renderDayPanel();
      };

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); renderDayPanel(); }
      });
      input.addEventListener('blur', save);
    });
  });

  panel.querySelectorAll('.btn-recur-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      setRecurOverride(btn.dataset.recurId, btn.dataset.ym, null);
      renderCalendar();
      renderDayPanel();
    });
  });

  panel.querySelectorAll('.op-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const expense = state.expenses.find(e => e.id === btn.dataset.id);
      if (expense) openAddModal(dateStr, expense, expense.id);
    });
  });

  panel.querySelectorAll('.op-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const snapshot = [...state.expenses];

      state.expenses = state.expenses.filter(e => e.id !== id);
      renderCalendar();
      renderDayPanel();

      try {
        await DB.remove(id);
      } catch {
        state.expenses = snapshot;
        renderCalendar();
        renderDayPanel();
        showToast('Erreur lors de la suppression');
      }
    });
  });
}

function closePanel() {
  state.selectedDate = null;
  $('day-panel').classList.add('hidden');
  renderCalendar();
}


// ─────────────────────────────────────────────────────────────────────────────
// Rendu : Vue Récurrences
// ─────────────────────────────────────────────────────────────────────────────

function renderRecurring() {
  const container = $('recurring-list');
  const summary   = $('recurring-summary');

  // Total mensuel = montant × nombre de jours d'occurrence dans le mois
  const totalDep = state.recurring.filter(t => t.type === 'depense').reduce((s, t) => s + t.amount * t.days.length, 0);
  const totalRev = state.recurring.filter(t => t.type === 'revenu').reduce((s, t) => s + t.amount * t.days.length, 0);
  const solde    = totalRev - totalDep;
  const soldeCls = solde >= 0 ? 'revenu-color' : 'depense-color';

  if (state.recurring.length > 0) {
    summary.classList.remove('hidden');
    summary.innerHTML = `
      <div class="recur-kpi">
        <span class="recur-kpi-label">Dépenses / mois</span>
        <span class="recur-kpi-value depense-color">−${fmtEUR(totalDep)}</span>
      </div>
      <div class="recur-kpi">
        <span class="recur-kpi-label">Revenus / mois</span>
        <span class="recur-kpi-value revenu-color">+${fmtEUR(totalRev)}</span>
      </div>
      <div class="recur-kpi recur-kpi--solde">
        <span class="recur-kpi-label">Solde net</span>
        <span class="recur-kpi-value ${soldeCls}">${solde >= 0 ? '+' : ''}${fmtEUR(solde)}</span>
      </div>`;
  } else {
    summary.classList.add('hidden');
  }

  if (state.recurring.length === 0) {
    container.innerHTML = `<p class="recurring-empty">Aucune récurrence configurée.<br>Cliquez sur « + Nouvelle récurrence » pour commencer.</p>`;
    return;
  }

  // Grouper par catégorie, trier chaque groupe par montant décroissant
  const groups = {};
  state.recurring.forEach(task => {
    if (!groups[task.category]) groups[task.category] = [];
    groups[task.category].push(task);
  });
  Object.values(groups).forEach(tasks => tasks.sort((a, b) => b.amount - a.amount));

  // Trier les groupes par total dépenses mensuel décroissant
  const monthlyDep = tasks => tasks.filter(t => t.type === 'depense').reduce((s, t) => s + t.amount * t.days.length, 0);
  const monthlyRev = tasks => tasks.filter(t => t.type === 'revenu').reduce((s, t) => s + t.amount * t.days.length, 0);
  const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => monthlyDep(b) - monthlyDep(a));

  container.innerHTML = sortedGroups.map(([catId, tasks]) => {
    const cat      = getCat(catId);
    const catDep   = monthlyDep(tasks);
    const catRev   = monthlyRev(tasks);
    const totalStr = [
      catDep > 0 ? `−${fmtEUR(catDep)}/mois` : '',
      catRev > 0 ? `+${fmtEUR(catRev)}/mois` : '',
    ].filter(Boolean).join(' · ');

    const tasksHtml = tasks.map(task => `
      <div class="recurring-card">
        <span class="recurring-icon">↺</span>
        <div class="recurring-info">
          <span class="recurring-label">${task.label}</span>
          <span class="recurring-meta">${fmtDays(task.days)}</span>
        </div>
        <span class="recurring-amount ${task.type}">${task.type === 'depense' ? '−' : '+'}${fmtEUR(task.amount)}</span>
        <button class="btn-icon btn-edit-recur" data-id="${task.id}" title="Modifier">✏</button>
        <button class="btn-icon btn-delete-recur" data-id="${task.id}" title="Supprimer">&#10005;</button>
      </div>
    `).join('');

    return `
      <div class="recurring-group">
        <div class="recurring-group-header">
          <span class="rc-dot" style="background:${cat.color}"></span>
          <span class="recurring-group-name">${cat.label}</span>
          ${totalStr ? `<span class="recurring-group-total">${totalStr}</span>` : ''}
        </div>
        ${tasksHtml}
      </div>`;
  }).join('');

  container.querySelectorAll('.btn-edit-recur').forEach(btn => {
    btn.addEventListener('click', () => {
      const task = state.recurring.find(t => t.id === btn.dataset.id);
      if (task) openRecurringModal(task);
    });
  });

  container.querySelectorAll('.btn-delete-recur').forEach(btn => {
    btn.addEventListener('click', () => deleteRecurring(btn.dataset.id));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal : Récurrence (créer / modifier)
// ─────────────────────────────────────────────────────────────────────────────

function openRecurringModal(task = null) {
  $('recur-id').value       = task?.id || '';
  $('recur-label').value    = task?.label || '';
  $('recur-amount').value   = task?.amount || '';
  $('recur-type').value     = task?.type || 'depense';
  $('recur-category').value = task?.category || DEFAULT_CATEGORY;
  $('modal-recurring-title').textContent = task ? 'Modifier la récurrence' : 'Nouvelle récurrence';

  modalRecurDays = task ? [...task.days] : [];
  renderDayPicker();

  $('modal-recurring').classList.remove('hidden');
  $('recur-label').focus();
}

function closeRecurringModal() {
  $('modal-recurring').classList.add('hidden');
  modalRecurDays = [];
}

function renderDayPicker() {
  const picker = $('day-picker');
  picker.innerHTML = '';
  for (let d = 1; d <= 31; d++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-btn' + (modalRecurDays.includes(d) ? ' active' : '');
    btn.textContent = d;
    btn.addEventListener('click', () => toggleRecurDay(d));
    picker.appendChild(btn);
  }
}

function toggleRecurDay(d) {
  if (modalRecurDays.includes(d)) {
    modalRecurDays = modalRecurDays.filter(x => x !== d);
  } else {
    modalRecurDays = [...modalRecurDays, d].sort((a, b) => a - b);
  }
  renderDayPicker();
}

async function saveRecurring() {
  const id       = $('recur-id').value || generateId();
  const label    = $('recur-label').value.trim();
  const amount   = parseAmount($('recur-amount').value);
  const type     = $('recur-type').value;
  const category = $('recur-category').value;
  const days     = modalRecurDays;

  if (!label) { $('recur-label').focus(); return; }
  if (!amount) { $('recur-amount').focus(); return; }
  if (days.length === 0) { showToast('Sélectionnez au moins un jour du mois'); return; }

  const task = { id, label, amount, type, category, days };

  const snapshot = state.recurring.map(t => ({ ...t }));
  const existing = state.recurring.findIndex(t => t.id === id);
  if (existing >= 0) state.recurring[existing] = task;
  else state.recurring.push(task);

  closeRecurringModal();
  renderRecurring();
  renderCalendar();

  try {
    await RDB.save(task);
  } catch {
    state.recurring = snapshot;
    renderRecurring();
    renderCalendar();
    showToast('Erreur lors de la sauvegarde');
  }
}

async function deleteRecurring(id) {
  const snapshot = [...state.recurring];
  state.recurring = state.recurring.filter(t => t.id !== id);
  // Montants mensuels supprimés avec elle (ON DELETE CASCADE côté base)
  state.overrides = state.overrides.filter(o => o.recurId !== id);
  renderRecurring();
  renderCalendar();

  try {
    await RDB.remove(id);
  } catch {
    state.recurring = snapshot;
    renderRecurring();
    renderCalendar();
    showToast('Erreur lors de la suppression');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal : Ajouter une opération
// ─────────────────────────────────────────────────────────────────────────────

function openAddModal(dateStr, prefill = null, editId = null, recurId = null) {
  editingExpenseId = editId;
  pendingRecurId   = recurId;
  $('add-date').value     = dateStr;
  $('add-label').value    = prefill?.label    || '';
  $('add-amount').value   = prefill?.amount   || '';
  $('add-type').value     = prefill?.type     || 'depense';
  const catId = prefill?.category || DEFAULT_CATEGORY;
  populateCategoryDropdowns();
  if (isArchived(catId)) {
    const opt = document.createElement('option');
    opt.value = catId;
    opt.textContent = `${getCat(catId).label} (archivée)`;
    $('add-category').appendChild(opt);
  }
  $('add-category').value = catId;
  $('modal-add-title').textContent = editId ? 'Modifier l\'opération' : 'Nouvelle opération';
  $('modal-add').classList.remove('hidden');
  $('add-label').focus();
}

function closeAddModal() {
  editingExpenseId = null;
  pendingRecurId   = null;
  $('modal-add-title').textContent = 'Nouvelle opération';
  $('modal-add').classList.add('hidden');
}

async function saveNewExpense() {
  const date     = $('add-date').value;
  const label    = $('add-label').value.trim();
  const amount   = parseAmount($('add-amount').value);
  const type     = $('add-type').value;
  const category = $('add-category').value;

  if (!label || !amount || !date) {
    $(label ? 'add-amount' : 'add-label').focus();
    return;
  }

  if (editingExpenseId) {
    const idx = state.expenses.findIndex(e => e.id === editingExpenseId);
    if (idx === -1) return;
    const prev = { ...state.expenses[idx] };
    state.expenses[idx] = { ...prev, label, amount, type, category };
    closeAddModal();
    renderCalendar();
    renderDayPanel();
    try {
      await DB.update(state.expenses[idx]);
    } catch {
      state.expenses[idx] = prev;
      renderCalendar();
      renderDayPanel();
      showToast('Erreur lors de la modification');
    }
    return;
  }

  const expense = { id: generateId(), date, label, amount, type, category, ...(pendingRecurId ? { recurId: pendingRecurId } : {}) };

  state.expenses.push(expense);
  closeAddModal();
  renderCalendar();
  renderDayPanel();

  try {
    await DB.add(expense);
  } catch {
    state.expenses = state.expenses.filter(e => e.id !== expense.id);
    renderCalendar();
    renderDayPanel();
    showToast('Erreur lors de l\'enregistrement');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal : Import CSV
// ─────────────────────────────────────────────────────────────────────────────

let pendingImport  = null;  // nouvelles opérations (doublons écartés), déjà rapprochées
let pendingIgnored = 0;     // doublons écartés à l'aperçu

function openImportModal() {
  pendingImport = null;
  $('import-file').value        = '';
  $('import-preview').innerHTML = '';
  $('btn-confirm-import').disabled = true;
  $('modal-import').classList.remove('hidden');
}

function closeImportModal() {
  $('modal-import').classList.add('hidden');
  pendingImport = null;
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    const parsed  = detectAndParseCSV(ev.target.result);
    const preview = $('import-preview');

    if (!parsed.length) {
      pendingImport = null;
      preview.innerHTML = '<p class="import-error">Aucune opération détectée. Vérifiez le format (en-tête requis : Date, Libellé, Montant ou Débit/Crédit).</p>';
      $('btn-confirm-import').disabled = true;
      return;
    }

    const existing = new Set(state.expenses.map(e => `${e.date}|${e.label}|${e.amount}`));
    pendingImport  = parsed.filter(e => !existing.has(`${e.date}|${e.label}|${e.amount}`));
    pendingIgnored = parsed.length - pendingImport.length;
    const links    = linkImportToRecurrences(pendingImport);

    const shown = pendingImport.slice(0, 8);
    preview.innerHTML = `
      <p class="import-info">${pendingImport.length} nouvelle(s) opération(s)${pendingIgnored ? ` · ${pendingIgnored} doublon(s) ignoré(s)` : ''}</p>
      ${links.length ? `<p class="import-info import-links">↺ ${links.length} liée(s) à une récurrence (pas de double comptage) :
        ${links.slice(0, 4).map(l => `<span class="import-link">${l.op.date.slice(8, 10)}/${l.op.date.slice(5, 7)} ${l.op.label} → ${l.task.label}</span>`).join('')}
        ${links.length > 4 ? `<span class="import-link">… et ${links.length - 4} autre(s)</span>` : ''}</p>` : ''}
      <ul class="import-list">
        ${shown.map(e => `
          <li>
            <span class="import-date">${e.date}</span>
            <span class="import-label" title="${e.label}">${e.recurId ? '↺ ' : ''}${e.label}</span>
            <span class="import-amount ${e.type}">${e.type === 'depense' ? '-' : '+'}${fmtEUR(e.amount)}</span>
          </li>
        `).join('')}
        ${pendingImport.length > 8 ? `<li class="import-more">… et ${pendingImport.length - 8} opération(s) de plus</li>` : ''}
      </ul>
    `;
    $('btn-confirm-import').disabled = !pendingImport.length;
  };
  reader.readAsText(file, 'UTF-8');
}

async function confirmImport() {
  if (!pendingImport?.length) return;

  const newOps  = pendingImport;
  const ignored = pendingIgnored;
  const linked  = newOps.filter(e => e.recurId).length;

  state.expenses.push(...newOps);
  closeImportModal();
  renderCalendar();
  showToast(`${newOps.length} opération(s) importée(s)` +
    (linked ? ` · ${linked} liée(s) à une récurrence` : '') +
    (ignored > 0 ? ` · ${ignored} doublon(s) ignoré(s)` : ''));

  try {
    await DB.addMany(newOps);
  } catch {
    const newIds = new Set(newOps.map(e => e.id));
    state.expenses = state.expenses.filter(e => !newIds.has(e.id));
    renderCalendar();
    showToast('Erreur lors de l\'import — données non sauvegardées');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu : Vue Objectifs
// ─────────────────────────────────────────────────────────────────────────────

// Montant attendu des récurrences pour une catégorie/mois donnés (overrides inclus).
// Toutes les occurrences comptent, même déjà saisies : sert de « prévu » (dénominateurs).
function recurExpected(categoryId, year, month) {
  const dim = daysIn(year, month);
  const ym = ymKey(year, month);
  return state.recurring
    .filter(t => t.category === categoryId && t.type === 'depense')
    .reduce((sum, t) => {
      const ov = getOverride(t.id, ym);
      return sum + (ov ? ov.amount : t.amount) * t.days.filter(d => d <= dim).length;
    }, 0);
}

// Comme recurExpected, mais seulement les occurrences restant à saisir (pas encore
// couvertes par une opération liée) : sert au « réel » pour éviter le double comptage.
function recurRemaining(categoryId, year, month) {
  const ym = ymKey(year, month);
  return state.recurring
    .filter(t => t.category === categoryId && t.type === 'depense')
    .reduce((sum, t) => {
      const ov = getOverride(t.id, ym);
      return sum + (ov ? ov.amount : t.amount) * unrealizedOccurrences(t, year, month);
    }, 0);
}

// Total mensuel des récurrences restantes d'un type (overrides inclus, jours hors
// mois exclus, occurrences déjà saisies comme opérations liées exclues)
function recurMonthTotal(type, year, month) {
  const ym = ymKey(year, month);
  return state.recurring
    .filter(t => t.type === type)
    .reduce((s, t) => {
      const ov = getOverride(t.id, ym);
      return s + (ov ? ov.amount : t.amount) * unrealizedOccurrences(t, year, month);
    }, 0);
}

// Règle unique des totaux d'un mois : opérations saisies + récurrences attendues.
// Utilisé par l'indicateur du calendrier et la page Statistiques (cohérence).
function monthRealTotals(year, month) {
  const md = getMonthData(year, month);
  const spent  = md.filter(e => e.type === 'depense').reduce((s, e) => s + e.amount, 0) + recurMonthTotal('depense', year, month);
  const earned = md.filter(e => e.type === 'revenu').reduce((s, e) => s + e.amount, 0) + recurMonthTotal('revenu',  year, month);
  return { spent, earned };
}

// Chiffres d'une catégorie (sans ses enfants) pour un mois.
// réel = dépenses saisies + récurrences restantes (pas de double comptage) ;
// objectif = manuel si fixé, sinon somme des récurrences (auto).
function goalCatFigures(catId, year, month) {
  const spent = getMonthData(year, month)
    .filter(e => e.type === 'depense' && e.category === catId)
    .reduce((s, e) => s + e.amount, 0);
  const total = spent + recurRemaining(catId, year, month);
  const goal  = getGoalForMonth(catId, year, month);
  return { total, goal, auto: goal > 0 && !(state.goals[catId] > 0) };
}

// Chiffres agrégés d'un groupe (lui + ses sous-catégories actives).
// auto = pas de plafond global fixé → l'objectif affiché est la somme.
function goalGroupFigures(catId, year, month) {
  const ids = [catId, ...childrenOf(catId).filter(c => !c.archived).map(c => c.id)];
  const total = ids.reduce((s, id) => s + goalCatFigures(id, year, month).total, 0);
  const goal  = topGoalForMonth(catId, year, month);
  return { total, goal, auto: goal > 0 && !(state.goals[catId] > 0) };
}

// Dépenses rangées directement dans un parent : son objectif propre se limite
// à ses récurrences (le manuel du parent est le plafond global du groupe).
function goalDirectFigures(catId, year, month) {
  const { total } = goalCatFigures(catId, year, month);
  const r = recurExpected(catId, year, month);
  return { total, goal: r > 0 ? r : null, auto: r > 0 };
}

// Moyenne mensuelle du « réel » d'une catégorie (groupe : elle + ses
// sous-catégories actives) sur les 12 derniers mois complets, sans remonter
// avant le premier mois où le compte a des opérations. null si aucun mois.
// Réel = même règle que la vue : dépenses saisies + récurrences non saisies.
function categoryMonthlyAverage(catId) {
  const first = state.expenses.reduce((min, e) => (min === null || e.date < min ? e.date : min), null);
  if (!first) return null;
  const firstYm = first.slice(0, 7);
  const ids = isParent(catId)
    ? [catId, ...childrenOf(catId).filter(c => !c.archived).map(c => c.id)]
    : [catId];
  let y = today.getFullYear(), m = today.getMonth(), sum = 0, months = 0;
  for (let i = 0; i < 12; i++) {
    if (--m < 0) { m = 11; y--; }
    if (ymKey(y, m) < firstYm) break;
    sum += ids.reduce((t, id) => t + goalCatFigures(id, y, m).total, 0);
    months++;
  }
  return months ? { avg: Math.round(sum / months * 100) / 100, months } : null;
}

// Opérations d'une catégorie pour un mois : saisies + récurrences restantes (↺)
function goalOpsRows(catId, year, month) {
  const ym  = ymKey(year, month);
  const dim = daysIn(year, month);
  const rows = getMonthData(year, month)
    .filter(e => e.type === 'depense' && e.category === catId)
    .map(e => ({ day: +e.date.slice(8, 10), label: e.label, amount: e.amount, recur: false }));
  for (const t of state.recurring) {
    if (t.type !== 'depense' || t.category !== catId) continue;
    const ov  = getOverride(t.id, ym);
    const amt = ov ? ov.amount : t.amount;
    if (!(amt > 0)) continue;
    const realized = realizedRecurDays(t, year, month);
    for (const d of t.days) {
      if (d <= dim && !realized.has(d)) rows.push({ day: d, label: t.label, amount: amt, recur: true });
    }
  }
  return rows.sort((a, b) => a.day - b.day || (a.recur - b.recur));
}

// Vue Objectifs : une liste par mois. Une ligne par catégorie de premier niveau
// (réel / objectif + barre). Clic sur l'objectif → le modifier ; clic sur la
// ligne → sous-catégories (groupe) ou opérations du mois (feuille).
function renderGoals() {
  const container = $('goals-body');
  const { currentYear: year, currentMonth: month } = state;

  const figs = (cat, isGroup) => isGroup ? goalGroupFigures(cat.id, year, month) : goalCatFigures(cat.id, year, month);
  const hasData = f => f.total > 0 || f.goal > 0;
  const byWeight = (a, b) => b.f.total - a.f.total || (b.f.goal || 0) - (a.f.goal || 0);

  // Catégories archivées : jamais affichées ici, ni comptées dans le total
  const tops = topLevelExpenseCats().filter(c => !c.archived).map(cat => {
    const isGroup = isParent(cat.id);
    return { cat, isGroup, f: figs(cat, isGroup) };
  });
  const real    = monthGoalReal(year, month);
  const planned = monthPlannedTotal(year, month);
  const totalCls = goalClass(real, planned);
  const pct  = planned > 0 ? Math.round(real / planned * 100) : null;
  const diff = planned - real;

  // Bulle de survol de l'objectif : moyenne mensuelle des dépenses passées,
  // sauf si l'objectif saisi à la main est déjà égal à cette moyenne.
  const avgTip = (catId, hint) => {
    const a = categoryMonthlyAverage(catId);
    if (!a) return '';
    const manual = state.goals[catId];
    if (manual > 0 && Math.round(manual * 100) === Math.round(a.avg * 100)) return '';
    return `<span class="obj-tip" role="tooltip">
      <span class="obj-tip-avg">Moyenne : <strong>${fmtEUR(a.avg)}</strong>/mois</span>
      <span class="obj-tip-sub">${a.months > 1 ? `sur les ${a.months} derniers mois` : 'sur le mois dernier'}</span>
      ${hint ? `<span class="obj-tip-hint">${hint}</span>` : ''}
    </span>`;
  };

  const valHtml = (catId, f, editable, isGroup) => {
    const realPart = `<span class="${f.goal ? goalClass(f.total, f.goal) : ''}">${f.total > 0 ? fmtEUR(f.total) : '—'}</span>`;
    if (!editable) {
      return f.goal ? `${realPart}<span class="obj-sep">/</span><span class="obj-goal-static">${fmtEUR(f.goal)}</span>` : realPart;
    }
    if (state.editingGoal === catId) {
      return `${realPart}<span class="obj-sep">/</span>
        <span class="obj-goal-wrap">
          <input type="text" class="obj-goal-input" id="goal-input-${catId}" data-goal-input="${catId}" inputmode="decimal"
            value="${state.goals[catId] || ''}" placeholder="${f.auto ? 'auto ' + fmtCompact(f.goal) : '€/mois'}"
            aria-label="Objectif mensuel" />${avgTip(catId, '')}
        </span>`;
    }
    const hint = !f.goal ? (isGroup ? 'Fixer un plafond global' : 'Fixer un objectif mensuel')
      : f.auto ? (isGroup ? 'Somme des sous-catégories — cliquer pour fixer un plafond global' : 'Objectif auto (somme des récurrences) — cliquer pour le fixer')
      : (isGroup ? 'Plafond global du groupe (vider pour revenir à la somme)' : 'Cliquer pour modifier');
    const tip = avgTip(catId, hint);
    // Sans bulle, l'explication reste disponible en info-bulle native
    const title = tip ? '' : ` title="${hint}"`;
    const goalBtn = f.goal
      ? `<button type="button" class="obj-goal${f.auto ? ' is-auto' : ''}" data-goal="${catId}"${title}>${fmtEUR(f.goal)}</button>`
      : `<button type="button" class="obj-goal is-empty" data-goal="${catId}"${title}>+ objectif</button>`;
    return `${realPart}<span class="obj-sep">/</span><span class="obj-goal-wrap">${goalBtn}${tip}</span>`;
  };

  const barHtml = f => {
    if (!f.goal) return '';
    const w = Math.min(100, f.total / f.goal * 100).toFixed(0);
    return `<div class="obj-bar"><div class="obj-bar-fill ${goalClass(f.total, f.goal)}" style="width:${w}%"></div></div>`;
  };

  const opsHtml = catId => {
    const rows = goalOpsRows(catId, year, month);
    if (!rows.length) return `<ul class="obj-ops"><li class="obj-ops-empty">Aucune opération ce mois-ci.</li></ul>`;
    return `<ul class="obj-ops">${rows.map(r => `
      <li class="obj-op${r.recur ? ' is-recur' : ''}">
        <span class="obj-op-day">${String(r.day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}</span>
        <span class="obj-op-label" title="${r.label}">${r.recur ? '↺ ' : ''}${r.label}</span>
        <span class="obj-op-amount">−${fmtEUR(r.amount)}</span>
      </li>`).join('')}</ul>`;
  };

  // Une ligne. key = clé de dépliage ; isGroup = parent agrégé (non éditable)
  const rowHtml = ({ cat, f, key, isGroup, isChild, label, muted }) => {
    const open = state.goalsExpanded.has(key);
    let inner = '';
    if (open) {
      if (isGroup) {
        const kids = childrenOf(cat.id)
          .filter(c => !c.archived)
          .map(c => ({ c, f: goalCatFigures(c.id, year, month) }))
          .sort(byWeight);
        inner = `<ul class="obj-sublist">${kids.map(({ c, f }) =>
          rowHtml({ cat: c, f, key: c.id, isGroup: false, isChild: true })).join('')}`;
        const direct = goalDirectFigures(cat.id, year, month);
        if (hasData(direct)) {
          inner += rowHtml({ cat, f: direct, key: `${cat.id}:direct`, isGroup: false, isChild: true,
            label: `${cat.label} (sans sous-catégorie)` });
        }
        inner += `</ul>`;
      } else {
        inner = opsHtml(cat.id);
      }
    }
    const editable = !key.endsWith(':direct');
    return `
      <li class="obj-row${isChild ? ' obj-child' : ''}${open ? ' open' : ''}${muted ? ' is-muted' : ''}">
        <div class="obj-row-main" data-toggle="${key}" role="button" tabindex="0" aria-expanded="${open}">
          <span class="obj-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
          <span class="obj-dot" style="background:${cat.color}"></span>
          <span class="obj-name">${label || cat.label}</span>
          <span class="obj-val">${valHtml(cat.id, f, editable, isGroup)}</span>
        </div>
        ${barHtml(f)}
        ${inner}
      </li>`;
  };

  const shown  = tops.filter(t => hasData(t.f)).sort(byWeight);
  const others = tops.filter(t => !hasData(t.f));

  let html = `
    <div class="obj">
      <div class="obj-head">
        <button class="cal-nav-btn" id="obj-prev" aria-label="Mois précédent">&#8592;</button>
        <h2 class="obj-month">${MONTHS[month]} ${year}</h2>
        <button class="cal-nav-btn" id="obj-next" aria-label="Mois suivant">&#8594;</button>
      </div>
      <div class="obj-total">
        <div class="obj-total-line">
          <span class="obj-total-real ${totalCls}">${fmtEUR(real)}</span>
          <span class="obj-total-goal">${planned > 0 ? `/ ${fmtEUR(planned)} prévu` : 'aucun objectif ce mois-ci'}</span>
          ${pct !== null ? `<span class="obj-total-pct ${totalCls}">${pct} %</span>` : ''}
        </div>
        ${planned > 0 ? `<div class="obj-bar obj-bar--total"><div class="obj-bar-fill ${totalCls}" style="width:${Math.min(100, pct)}%"></div></div>
        <div class="obj-total-rest">${diff >= 0 ? `Reste ${fmtEUR(diff)}` : `Dépassé de ${fmtEUR(-diff)}`}</div>` : ''}
      </div>
      <ul class="obj-list">`;
  if (!shown.length) html += `<li class="obj-empty">Aucune dépense ni objectif ce mois-ci.</li>`;
  for (const t of shown) html += rowHtml({ ...t, key: t.cat.id });
  html += `</ul>`;

  if (others.length) {
    html += `
      <button type="button" class="obj-others-toggle" id="obj-others" aria-expanded="${state.goalsShowOthers}">
        ${state.goalsShowOthers ? '▾' : '▸'} Autres catégories (${others.length})
      </button>`;
    if (state.goalsShowOthers) {
      html += `<ul class="obj-list obj-list--others">${others.map(t => rowHtml({ ...t, key: t.cat.id, muted: true })).join('')}</ul>`;
    }
  }
  html += `</div>`;
  container.innerHTML = html;

  // Évènements
  $('obj-prev').addEventListener('click', prevMonth);
  $('obj-next').addEventListener('click', nextMonth);
  const others$ = $('obj-others');
  if (others$) others$.addEventListener('click', () => { state.goalsShowOthers = !state.goalsShowOthers; renderGoals(); });

  const toggle = key => {
    if (state.goalsExpanded.has(key)) state.goalsExpanded.delete(key);
    else state.goalsExpanded.add(key);
    renderGoals();
  };
  container.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.obj-goal, .obj-goal-input')) return;
      toggle(el.dataset.toggle);
    });
    el.addEventListener('keydown', e => {
      if (e.target !== el) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(el.dataset.toggle); }
    });
  });
  container.querySelectorAll('.obj-goal').forEach(btn => {
    btn.addEventListener('click', () => {
      state.editingGoal = btn.dataset.goal;
      renderGoals();
      const inp = $(`goal-input-${btn.dataset.goal}`);
      if (inp) { inp.focus(); inp.select(); }
    });
  });
  container.querySelectorAll('[data-goal-input]').forEach(inp => {
    const cat = inp.dataset.goalInput;
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); saveGoal(cat); }
      if (e.key === 'Escape') { e.stopPropagation(); state.editingGoal = null; renderGoals(); }
    });
    inp.addEventListener('blur', () => { if (state.editingGoal === cat) saveGoal(cat); });
  });
}

async function saveGoal(category) {
  const input = $(`goal-input-${category}`);
  if (!input) return;
  const amount = parseAmount(input.value);
  const prev = state.goals[category];

  state.editingGoal = null;
  if (!amount) {
    delete state.goals[category];
    renderGoals();
    try {
      await GoalDB.remove(category);
    } catch {
      if (prev !== undefined) state.goals[category] = prev;
      renderGoals();
      showToast('Erreur lors de la suppression');
    }
    return;
  }

  state.goals[category] = amount;
  renderGoals();
  try {
    await GoalDB.save(category, amount);
  } catch {
    if (prev !== undefined) state.goals[category] = prev;
    else delete state.goals[category];
    renderGoals();
    showToast('Erreur lors de la sauvegarde');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vue Catégories
// ─────────────────────────────────────────────────────────────────────────────

function renderCategories() {
  const container = $('categories-body');

  let html = `
    <div class="cat-mgmt-header">
      <h2 class="cat-mgmt-title">Catégories</h2>
      <p class="cat-mgmt-subtitle">Gérez les catégories. Une catégorie peut être une <strong>sous-catégorie</strong> d'une autre (menu « Parent ») : le parent affiche alors la somme de ses sous-catégories. Une catégorie qui ne sert plus peut être <strong>archivée</strong> : elle disparaît des menus, ses opérations restent intactes. La suppression est réservée aux catégories jamais utilisées.</p>
    </div>
    <div class="cat-add-form">
      <input type="text" id="new-cat-label" placeholder="Nom de la catégorie…" class="cat-add-input" />
      <label class="cat-color-label" title="Choisir une couleur">
        <input type="color" id="new-cat-color" class="cat-color-inp" value="#9A9888" />
        <span class="cat-color-swatch" id="new-cat-swatch" style="background:#9A9888"></span>
      </label>
      <button class="btn-primary" id="btn-add-cat">+ Ajouter</button>
    </div>
    <div class="cat-list-mgmt">`;

  const renderCatRow = (cat, isChild) => {
    const isSystem   = cat.id === DEFAULT_CATEGORY || cat.id === INCOME_CATEGORY;
    const parentCat  = isParent(cat.id);
    const { recurCount, canDelete, delTitle } = catDeleteInfo(cat);
    const canArchive = !isSystem && !parentCat && recurCount === 0;
    const archTitle  = parentCat ? 'A des sous-catégories'
      : recurCount > 0 ? `${recurCount} récurrence(s) l'utilisent encore`
      : 'Masquer des menus en gardant ses opérations';
    const archiveBtn = isSystem ? '' : `
      <button type="button" class="btn-archive-cat" data-id="${cat.id}"
        ${canArchive ? '' : 'disabled'} title="${archTitle}">Archiver</button>`;

    const groupBadge = parentCat
      ? `<span class="cat-group-badge" title="Somme de ses sous-catégories">groupe · Σ</span>`
      : '';

    // Sélecteur de parent : uniquement pour les catégories qui peuvent devenir
    // sous-catégorie (non système, sans enfant → respect des 2 niveaux).
    let parentSelect = '';
    if (!isSystem && !parentCat) {
      const opts = topLevelExpenseCats()
        .filter(c => c.id !== cat.id && !c.archived)
        .map(c => `<option value="${c.id}"${cat.parent === c.id ? ' selected' : ''}>${c.label}</option>`)
        .join('');
      parentSelect = `
        <select class="cat-parent-select" data-id="${cat.id}" title="Rattacher à une catégorie parent">
          <option value="">Parent : aucun</option>
          ${opts}
        </select>`;
    }

    // Case catégorie : ✕ + nom · parent au centre · badge groupe à droite.
    return `
      <div class="cat-mgmt-row${isChild ? ' cat-child' : ''}" data-id="${cat.id}">
        <div class="cat-mgmt-item">
          <div class="cat-cell-lead">
            <button class="btn-icon btn-delete-cat" data-id="${cat.id}"
              ${!canDelete ? 'disabled' : ''} title="${delTitle}">✕</button>
            ${isChild ? '<span class="cat-child-mark" aria-hidden="true">↳</span>' : ''}
            <label class="cat-color-label" title="Modifier la couleur">
              <input type="color" class="cat-color-inp cat-color-edit" value="${cat.color}" data-id="${cat.id}" />
              <span class="cat-color-swatch" style="background:${cat.color}"></span>
            </label>
            <input type="text" class="cat-label-edit" value="${cat.label}" data-id="${cat.id}" />
          </div>
          <div class="cat-cell-parent">${parentSelect}</div>
          <div class="cat-cell-mode">${groupBadge}${archiveBtn}</div>
        </div>
      </div>`;
  };

  // Affichage hiérarchique : catégories de premier niveau, enfants indentés dessous
  forEachCategoryOrdered((cat, isChild) => { html += renderCatRow(cat, isChild); });
  html += `</div>`;

  // Archivées : repliées en bas, restaurables, supprimables si jamais utilisées
  const archived = CATEGORIES.filter(c => c.archived);
  if (archived.length) {
    html += `<details class="cat-archived" id="cat-archived"${state.catArchivedOpen ? ' open' : ''}>
      <summary>Archivées (${archived.length})</summary>
      <div class="cat-list-mgmt">`;
    for (const cat of archived) {
      const { usedCount, canDelete, delTitle } = catDeleteInfo(cat);
      const name = cat.parent ? `${getCat(cat.parent).label} › ${cat.label}` : cat.label;
      html += `
        <div class="cat-mgmt-row cat-archived-row" data-id="${cat.id}">
          <div class="cat-mgmt-item">
            <div class="cat-cell-lead">
              <button class="btn-icon btn-delete-cat" data-id="${cat.id}"
                ${!canDelete ? 'disabled' : ''} title="${delTitle}">✕</button>
              <span class="cat-color-swatch" style="background:${cat.color}"></span>
              <span class="cat-archived-name">${name}</span>
            </div>
            <div class="cat-cell-parent cat-archived-count">${usedCount ? `${usedCount} opération(s) conservée(s)` : 'aucune opération'}</div>
            <div class="cat-cell-mode">
              ${mergeSelectHtml(cat)}
              <button type="button" class="btn-archive-cat btn-restore-cat" data-id="${cat.id}">Restaurer</button>
            </div>
          </div>
        </div>`;
    }
    html += `</div></details>`;
  }
  container.innerHTML = html;

  // Nouvelle catégorie
  $('btn-add-cat').addEventListener('click', addCategory);
  $('new-cat-label').addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); });
  $('new-cat-color').addEventListener('input', e => {
    $('new-cat-swatch').style.background = e.target.value;
  });

  // Couleur inline
  container.querySelectorAll('.cat-color-edit').forEach(input => {
    input.addEventListener('input', e => {
      e.target.nextElementSibling.style.background = e.target.value;
    });
    input.addEventListener('change', e => updateCatColor(e.target.dataset.id, e.target.value));
  });

  // Label inline
  container.querySelectorAll('.cat-label-edit').forEach(input => {
    input.addEventListener('blur', e => updateCatLabel(e.target.dataset.id, e.target.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  });

  // Rattachement à un parent (sous-catégorie)
  container.querySelectorAll('.cat-parent-select').forEach(sel => {
    sel.addEventListener('change', e => updateCatParent(e.target.dataset.id, e.target.value));
  });

  // Fusion d'une catégorie archivée dans une autre
  container.querySelectorAll('.cat-merge-select').forEach(sel => {
    sel.addEventListener('change', e => { if (e.target.value) mergeCategory(e.target.dataset.id, e.target.value); });
  });

  // Archivage / restauration
  container.querySelectorAll('.btn-archive-cat:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => setCatArchived(btn.dataset.id, !btn.classList.contains('btn-restore-cat')));
  });
  const archDetails = $('cat-archived');
  if (archDetails) archDetails.addEventListener('toggle', () => { state.catArchivedOpen = archDetails.open; });

  // Suppression
  container.querySelectorAll('.btn-delete-cat:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => deleteCategory(btn.dataset.id));
  });
}

// Suppression possible seulement si la catégorie n'a jamais servi : sinon on
// l'archive (les FK RESTRICT protègent opérations et récurrences côté base).
function catDeleteInfo(cat) {
  const isSystem   = cat.id === DEFAULT_CATEGORY || cat.id === INCOME_CATEGORY;
  const parentCat  = isParent(cat.id);
  const usedCount  = state.expenses.filter(e => e.category === cat.id).length;
  const recurCount = state.recurring.filter(t => t.category === cat.id).length;
  const canDelete  = !isSystem && !parentCat && usedCount === 0 && recurCount === 0;
  const delTitle   = isSystem ? 'Catégorie système'
    : parentCat ? 'A des sous-catégories'
    : usedCount > 0 ? `${usedCount} opération(s) liée(s) : archivez-la plutôt`
    : recurCount > 0 ? `${recurCount} récurrence(s) liée(s)`
    : 'Supprimer';
  return { usedCount, recurCount, canDelete, delTitle };
}

// Menu « Fusionner dans… » d'une catégorie archivée : cibles = catégories actives
function mergeSelectHtml(cat) {
  const opts = [];
  forEachCategoryOrdered((c, isChild) => {
    if (c.id === cat.id || c.id === INCOME_CATEGORY) return;
    opts.push(`<option value="${c.id}">${isChild ? '↳ ' : ''}${c.label}</option>`);
  });
  if (!opts.length || cat.id === DEFAULT_CATEGORY || cat.id === INCOME_CATEGORY) return '';
  return `<select class="cat-merge-select" data-id="${cat.id}"
      title="Déplacer ses opérations et récurrences dans une autre catégorie, puis la supprimer">
      <option value="">Fusionner dans…</option>${opts.join('')}
    </select>`;
}

// Fusionne une catégorie dans une autre : ses opérations et récurrences passent
// dans la cible, son objectif manuel disparaît, puis elle est supprimée.
async function mergeCategory(fromId, toId) {
  const from = CATEGORIES.find(c => c.id === fromId);
  const to   = CATEGORIES.find(c => c.id === toId);
  if (!from || !to || fromId === toId) return;
  const nOps = state.expenses.filter(e => e.category === fromId).length;
  const nRec = state.recurring.filter(t => t.category === fromId).length;
  const moved = [
    nOps ? `${nOps} opération${nOps > 1 ? 's' : ''}` : '',
    nRec ? `${nRec} récurrence${nRec > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' et ') || 'aucune opération';
  const ok = await confirmModal({
    title: 'Fusionner la catégorie',
    message: `Déplacer ${moved} de « ${from.label} » vers « ${to.label} », puis supprimer « ${from.label} » ? Cette action est définitive.`,
    okLabel: 'Fusionner',
    danger: true,
  });
  if (!ok) { renderCategories(); return; }
  try {
    await CatDB.merge(fromId, toId);
  } catch (err) {
    showToast(err.message || 'Fusion échouée');
    renderCategories();
    return;
  }
  for (const e of state.expenses)  if (e.category === fromId) e.category = toId;
  for (const t of state.recurring) if (t.category === fromId) t.category = toId;
  delete state.goals[fromId];
  CATEGORIES = CATEGORIES.filter(c => c.id !== fromId);
  for (const c of CATEGORIES) if (c.parent === fromId) c.parent = undefined; // miroir du ON DELETE SET NULL
  // Local : persistance ; déployé : caches hors ligne du compte
  localStorage.setItem(userCacheKey(STORAGE_KEY),    JSON.stringify(state.expenses));
  localStorage.setItem(userCacheKey(RECURRING_KEY),  JSON.stringify(state.recurring));
  localStorage.setItem(userCacheKey(GOALS_KEY),      JSON.stringify(state.goals));
  localStorage.setItem(userCacheKey(CATEGORIES_KEY), JSON.stringify(CATEGORIES));
  populateCategoryDropdowns();
  renderCategories();
  showToast(`« ${from.label} » fusionnée dans « ${to.label} »`);
}

async function setCatArchived(id, archived) {
  const cat = CATEGORIES.find(c => c.id === id);
  if (!cat || !!cat.archived === archived) return;
  const prev = { archived: cat.archived, parent: cat.parent };
  cat.archived = archived;
  // Restaurée sous un parent archivé ou disparu → remise au premier niveau
  if (!archived && cat.parent && (isArchived(cat.parent) || !CATEGORIES.some(c => c.id === cat.parent))) {
    cat.parent = undefined;
  }
  try {
    await CatDB.upsert(cat);
  } catch {
    Object.assign(cat, prev);
    showToast('Erreur lors de la sauvegarde');
    renderCategories();
    return;
  }
  populateCategoryDropdowns();
  renderCategories();
  showToast(archived
    ? `« ${cat.label} » archivée — ses opérations sont conservées`
    : `« ${cat.label} » restaurée`);
}

async function updateCatParent(id, parentId) {
  const cat = CATEGORIES.find(c => c.id === id);
  if (!cat) return;
  parentId = parentId || null;
  // Gardes 2 niveaux : pas de parent qui est déjà une sous-catégorie, pas de
  // cycle, et une catégorie ayant des enfants ne peut pas devenir enfant.
  if (parentId) {
    if (parentId === id) return;
    if (isParent(id)) { showToast('Cette catégorie a déjà des sous-catégories'); renderCategories(); return; }
    const parent = CATEGORIES.find(c => c.id === parentId);
    if (!parent || parent.parent) { showToast('Parent invalide (2 niveaux max)'); renderCategories(); return; }
  }
  if ((cat.parent || null) === parentId) return;
  const prev = cat.parent;
  cat.parent = parentId || undefined;
  try {
    await CatDB.upsert(cat);
  } catch {
    cat.parent = prev;
    showToast('Erreur lors de la sauvegarde');
    renderCategories();
    return;
  }
  renderCategories();
  populateCategoryDropdowns();
  showToast(parentId ? `« ${cat.label} » rattachée à « ${getCat(parentId).label} »` : `« ${cat.label} » remise au premier niveau`);
}

async function addCategory() {
  const labelInput = $('new-cat-label');
  const colorInput = $('new-cat-color');
  const label = labelInput.value.trim();
  if (!label) { labelInput.focus(); return; }

  // Doublon = même libellé visible (l'id interne, lui, est toujours rendu unique) :
  // une catégorie renommée « squatte » son ancien slug, il ne doit pas bloquer.
  if (CATEGORIES.some(c => c.label.trim().toLowerCase() === label.toLowerCase())) {
    showToast('Une catégorie avec ce nom existe déjà');
    return;
  }

  const base = label.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'cat';
  let id = base, n = 2;
  while (CATEGORIES.some(c => c.id === id)) id = `${base}_${n++}`;

  const newCat = { id, label, color: colorInput.value };
  CATEGORIES.push(newCat);
  try {
    await CatDB.upsert(newCat);
  } catch {
    showToast('Erreur lors de la sauvegarde');
    CATEGORIES.pop();
    return;
  }
  populateCategoryDropdowns();
  labelInput.value = '';
  renderCategories();
  showToast(`Catégorie « ${label} » ajoutée`);
}

async function updateCatColor(id, color) {
  const cat = CATEGORIES.find(c => c.id === id);
  if (!cat || cat.color === color) return;
  const prev = cat.color;
  cat.color = color;
  try {
    await CatDB.upsert(cat);
  } catch {
    cat.color = prev;
    showToast('Erreur lors de la sauvegarde');
    return;
  }
  if (state.view === 'calendar') renderCalendar();
  if (state.view === 'goals')    renderGoals();
}

async function updateCatLabel(id, label) {
  label = label.trim();
  if (!label) { renderCategories(); return; }
  const cat = CATEGORIES.find(c => c.id === id);
  if (!cat || cat.label === label) return;
  const prev = cat.label;
  cat.label = label;
  try {
    await CatDB.upsert(cat);
  } catch {
    cat.label = prev;
    showToast('Erreur lors de la sauvegarde');
    renderCategories();
    return;
  }
  populateCategoryDropdowns();
  renderCategories();
}

// Modal de confirmation générique → Promise<boolean>
function confirmModal({ title = 'Confirmer', message, okLabel = 'Confirmer', danger = false } = {}) {
  return new Promise(resolve => {
    const modal  = $('modal-confirm');
    const okBtn  = $('btn-confirm-ok');
    const cancel = $('btn-confirm-cancel');
    const close  = $('modal-confirm-close');
    $('modal-confirm-title').textContent   = title;
    $('modal-confirm-message').textContent = message;
    okBtn.textContent = okLabel;
    okBtn.classList.toggle('btn-danger', danger);
    okBtn.classList.toggle('btn-primary', !danger);
    modal.classList.remove('hidden');
    okBtn.focus();

    const onKey = e => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    function done(result) {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      close.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    }
    const onOk = () => done(true);
    const onCancel = () => done(false);
    okBtn.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    close.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey, true);
  });
}

async function deleteCategory(id) {
  const cat = getCat(id);
  const ok = await confirmModal({
    title: 'Supprimer la catégorie',
    message: `Supprimer la catégorie « ${cat.label} » ? Cette action est définitive.`,
    okLabel: 'Supprimer',
    danger: true,
  });
  if (!ok) return;
  try {
    await CatDB.remove(id);
  } catch (err) {
    showToast(err.message || 'Suppression échouée');
    return;
  }
  CATEGORIES = CATEGORIES.filter(c => c.id !== id);
  for (const c of CATEGORIES) if (c.parent === id) c.parent = undefined; // miroir du ON DELETE SET NULL
  localStorage.setItem(userCacheKey(CATEGORIES_KEY), JSON.stringify(CATEGORIES));
  // L'objectif manuel part avec la catégorie (supprimé côté serveur dans la même requête)
  if (state.goals[id] !== undefined) {
    delete state.goals[id];
    if (!IS_DEPLOYED) await GoalDB.remove(id);
  }
  populateCategoryDropdowns();
  renderCategories();
  showToast('Catégorie supprimée');
}

// ─────────────────────────────────────────────────────────────────────────────
// Recherche d'opérations
// ─────────────────────────────────────────────────────────────────────────────

function openSearchModal() {
  populateSearchCategory();
  ['search-text', 'search-min', 'search-max'].forEach(id => { $(id).value = ''; });
  $('search-type').value = '';
  $('search-category').value = '';
  $('modal-search').classList.remove('hidden');
  renderSearchResults();
  $('search-text').focus();
}

function closeSearchModal() {
  $('modal-search').classList.add('hidden');
}

function populateSearchCategory() {
  const sel = $('search-category');
  sel.innerHTML = '<option value="">Toutes catégories</option>';
  forEachCategoryOrdered((c, isChild) => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = (isChild ? ` ↳ ${c.label}` : c.label) + (c.archived ? ' (archivée)' : '');
    sel.appendChild(o);
  }, true);
}

function renderSearchResults() {
  const text = $('search-text').value.trim().toLowerCase();
  const cat  = $('search-category').value;
  const type = $('search-type').value;
  const min  = $('search-min').value ? parseAmount($('search-min').value) : null;
  const max  = $('search-max').value ? parseAmount($('search-max').value) : null;

  const res = state.expenses.filter(e => {
    if (text && !e.label.toLowerCase().includes(text)) return false;
    if (cat  && e.category !== cat)  return false;
    if (type && e.type !== type)     return false;
    if (min !== null && e.amount < min) return false;
    if (max !== null && e.amount > max) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const box = $('search-results');
  if (!res.length) {
    box.innerHTML = '<p class="search-empty">Aucune opération ne correspond.</p>';
    return;
  }

  const solde = res.reduce((s, e) => s + (e.type === 'depense' ? -e.amount : e.amount), 0);
  const shown = res.slice(0, 100);
  box.innerHTML =
    `<div class="search-count">${res.length} résultat(s) · solde ${fmtEUR(solde)}</div>` +
    `<ul class="search-list">` + shown.map(e => {
      const c = getCat(e.category);
      return `
        <li class="search-item" data-date="${e.date}">
          <span class="op-dot" style="background:${c.color}"></span>
          <span class="search-date">${e.date}</span>
          <span class="search-label" title="${e.label}">${e.label}</span>
          <span class="search-cat">${c.label}</span>
          <span class="op-amount ${e.type}">${e.type === 'depense' ? '-' : '+'}${fmtEUR(e.amount)}</span>
        </li>`;
    }).join('') + `</ul>` +
    (res.length > 100 ? `<p class="search-more">… ${res.length - 100} de plus — affinez la recherche</p>` : '');

  box.querySelectorAll('.search-item').forEach(li => {
    li.addEventListener('click', () => {
      const d = li.dataset.date;
      const [y, m] = d.split('-').map(Number);
      state.currentYear = y;
      state.currentMonth = m - 1;
      closeSearchModal();
      setView('calendar');
      selectDay(d);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Vue Statistiques (graphes SVG sur-mesure)
// ─────────────────────────────────────────────────────────────────────────────

// Totaux mensuels réels (saisies + récurrences) pour une année — même règle que le calendrier
// Dernier mois (0-11) pris en compte par les Statistiques : les mois à venir
// sont exclus (sinon leurs récurrences gonfleraient les totaux). -1 = aucun.
function statsLastMonth(year) {
  const y = today.getFullYear();
  return year < y ? 11 : year > y ? -1 : today.getMonth();
}

function yearMonthlyTotals(year) {
  const dep = Array(12).fill(0), rev = Array(12).fill(0);
  for (let m = 0; m <= statsLastMonth(year); m++) {
    const { spent, earned } = monthRealTotals(year, m);
    dep[m] = spent;
    rev[m] = earned;
  }
  return { dep, rev };
}

// Totaux de dépenses par catégorie pour une année (saisies + récurrences), comme la vue Objectifs
function yearCategoryTotals(year) {
  const map = {};
  for (let m = 0; m <= statsLastMonth(year); m++) {
    for (const e of getMonthData(year, m)) {
      if (e.type !== 'depense') continue;
      map[e.category] = (map[e.category] || 0) + e.amount;
    }
    for (const cat of CATEGORIES) {
      if (cat.id === INCOME_CATEGORY) continue;
      const r = recurRemaining(cat.id, year, m);
      if (r > 0) map[cat.id] = (map[cat.id] || 0) + r;
    }
  }
  return map;
}

// Barres groupées dépenses/revenus sur 12 mois
function svgGroupedBars(dep, rev) {
  const W = 720, H = 240, padX = 6, padT = 12, padB = 26;
  const innerW = W - padX * 2, innerH = H - padT - padB;
  const max = Math.max(1, ...dep, ...rev);
  const groupW = innerW / 12;
  const barW = Math.max(4, groupW / 2 - 3);
  const baseY = padT + innerH;
  let s = `<line class="chart-base" x1="${padX}" y1="${baseY}" x2="${W - padX}" y2="${baseY}"/>`;
  for (let m = 0; m < 12; m++) {
    const gx = padX + m * groupW;
    const dh = (dep[m] / max) * innerH;
    const rh = (rev[m] / max) * innerH;
    const dx = gx + groupW / 2 - barW - 1;
    const rx = gx + groupW / 2 + 1;
    if (dep[m] > 0) s += `<rect class="bar-dep" x="${dx.toFixed(1)}" y="${(baseY - dh).toFixed(1)}" width="${barW.toFixed(1)}" height="${dh.toFixed(1)}" rx="2"><title>${MONTHS_SHORT[m]} — dépenses ${fmtEUR(dep[m])}</title></rect>`;
    if (rev[m] > 0) s += `<rect class="bar-rev" x="${rx.toFixed(1)}" y="${(baseY - rh).toFixed(1)}" width="${barW.toFixed(1)}" height="${rh.toFixed(1)}" rx="2"><title>${MONTHS_SHORT[m]} — revenus ${fmtEUR(rev[m])}</title></rect>`;
    s += `<text class="chart-axis" x="${(gx + groupW / 2).toFixed(1)}" y="${H - 9}" text-anchor="middle">${MONTHS_SHORT[m]}</text>`;
  }
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dépenses et revenus par mois">${s}</svg>`;
}

function renderStats() {
  const container = $('stats-body');
  const year = state.currentYear;
  const { dep, rev } = yearMonthlyTotals(year);
  const totalDep = dep.reduce((a, b) => a + b, 0);
  const totalRev = rev.reduce((a, b) => a + b, 0);
  const solde = totalRev - totalDep;
  const activeMonths = dep.filter((d, i) => d > 0 || rev[i] > 0).length || 1;
  const avgDep = totalDep / activeMonths;

  // Totaux par catégorie, regroupés par catégorie de premier niveau (un parent
  // agrège ses sous-catégories + ses dépenses directes).
  const catMap = yearCategoryTotals(year);
  const groupTotals = {};   // topId → total agrégé
  const groupDirect = {};   // topId → dépenses directes du parent lui-même
  const groupKids   = {};   // topId → [{ id, value }]
  for (const [id, value] of Object.entries(catMap)) {
    if (!value) continue;
    const cat = getCat(id);
    const topId = cat.parent || id;
    groupTotals[topId] = (groupTotals[topId] || 0) + value;
    if (cat.parent) (groupKids[topId] ??= []).push({ id, value });
    else            groupDirect[topId] = value;
  }
  const slices = Object.entries(groupTotals)
    .map(([id, value]) => ({ id, value, label: getCat(id).label, color: getCat(id).color }))
    .sort((a, b) => b.value - a.value);
  const maxCat = slices.length ? slices[0].value : 0;

  const kpi = (label, value, cls, sub) =>
    `<div class="stat-kpi"><span class="stat-kpi-label">${label}</span><span class="stat-kpi-value ${cls || ''}">${value}</span>${sub ? `<span class="stat-kpi-sub">${sub}</span>` : ''}</div>`;
  const lastM  = statsLastMonth(year);
  const period = lastM < 0 ? 'année à venir' : lastM === 11 ? 'année complète' : `janvier → ${MONTHS[lastM].toLowerCase()}`;

  let html = `
    <div class="stats-head">
      <h2 class="stats-title">Statistiques</h2>
      <div class="stats-yearnav">
        <button class="cal-nav-btn" id="stats-prev-year" aria-label="Année précédente">&#8592;</button>
        <span class="stats-year">${year}</span>
        <button class="cal-nav-btn" id="stats-next-year" aria-label="Année suivante">&#8594;</button>
      </div>
    </div>

    <div class="stats-kpis">
      ${kpi('Dépenses', fmtEUR(totalDep), 'depense-color', `moy. ${fmtEUR(avgDep)} / mois`)}
      ${kpi('Revenus', fmtEUR(totalRev), 'revenu-color')}
      ${kpi('Solde', (solde >= 0 ? '+' : '') + fmtEUR(solde), solde >= 0 ? 'revenu-color' : 'depense-color', period)}
    </div>`;

  if (totalDep === 0 && totalRev === 0) {
    html += `<p class="stats-empty">Aucune opération enregistrée pour ${year}.</p>`;
    container.innerHTML = html;
    wireStatsNav();
    return;
  }

  html += `
    <div class="stats-charts">
    <div class="chart-card">
      <div class="chart-card-head">
        <h3 class="chart-card-title">Dépenses &amp; revenus par mois</h3>
        <div class="chart-legend-inline">
          <span class="cl-item"><span class="cl-swatch bar-dep-sw"></span>Dépenses</span>
          <span class="cl-item"><span class="cl-swatch bar-rev-sw"></span>Revenus</span>
        </div>
      </div>
      ${svgGroupedBars(dep, rev)}
    </div>

    <div class="chart-card">
      <h3 class="chart-card-title">Dépenses par catégorie</h3>
      <ul class="cat-rank">
        ${slices.length ? statsRankHtml(slices, { maxCat, totalDep, groupKids, groupDirect }) : '<li class="cat-rank-empty">Aucune dépense</li>'}
      </ul>
    </div>
    </div>`;

  container.innerHTML = html;
  wireStatsNav();
}

// Liste de rang des catégories (Stats) : parents agrégés, dépliables vers leurs
// sous-catégories (+ éventuelle part « directe » du parent).
function statsRankHtml(slices, { maxCat, totalDep, groupKids, groupDirect }) {
  const rankRow = (id, label, color, value, isChild, parentExpandable) => {
    const expanded = state.statsExpanded.has(id);
    const caret = parentExpandable
      ? `<button class="cat-rank-caret" data-stats-expand="${id}" aria-label="${expanded ? 'Replier' : 'Déplier'}">${expanded ? '▾' : '▸'}</button>`
      : `<span class="cat-rank-caret${isChild ? ' cat-rank-childmark' : ''}">${isChild ? '↳' : ''}</span>`;
    return `<li class="cat-rank-item${isChild ? ' cat-rank-child' : ''}">
      ${caret}
      <span class="op-dot" style="background:${color}"></span>
      <span class="cat-rank-name" title="${label}">${label}</span>
      <span class="cat-rank-bar"><span style="width:${maxCat ? Math.round(value / maxCat * 100) : 0}%;background:${color}"></span></span>
      <span class="cat-rank-val">${fmtEUR(value)}</span>
      <span class="cat-rank-pct">${totalDep ? Math.round(value / totalDep * 100) : 0}%</span>
    </li>`;
  };

  let out = '';
  for (const s of slices) {
    const kids = groupKids[s.id];
    const hasKids = kids && kids.length > 0;
    out += rankRow(s.id, s.label, s.color, s.value, false, hasKids);
    if (hasKids && state.statsExpanded.has(s.id)) {
      const sorted = [...kids].sort((a, b) => b.value - a.value);
      for (const k of sorted) {
        const c = getCat(k.id);
        out += rankRow(k.id, c.label, c.color, k.value, true, false);
      }
      const direct = groupDirect[s.id] || 0;
      if (direct > 0) out += rankRow(s.id + '__direct', `${s.label} (direct)`, s.color, direct, true, false);
    }
  }
  return out;
}

function wireStatsNav() {
  const prev = $('stats-prev-year'), next = $('stats-next-year');
  if (prev) prev.addEventListener('click', () => { state.currentYear--; renderStats(); });
  if (next) next.addEventListener('click', () => { state.currentYear++; renderStats(); });
  document.querySelectorAll('.cat-rank-caret[data-stats-expand]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.statsExpand;
      if (state.statsExpanded.has(id)) state.statsExpanded.delete(id);
      else state.statsExpanded.add(id);
      renderStats();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Vues
// ─────────────────────────────────────────────────────────────────────────────

function setView(view) {
  state.view = view;
  ['calendar', 'stats', 'recurring', 'goals', 'categories'].forEach(v => {
    $(`view-${v}`).classList.toggle('hidden', view !== v);
    $(`btn-view-${v}`).classList.toggle('active', view === v);
    $(`btn-view-${v}`).setAttribute('aria-selected', view === v);
  });

  if (view === 'stats') renderStats();
  if (view === 'recurring') renderRecurring();
  if (view === 'goals') renderGoals();
  if (view === 'categories') renderCategories();
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation mois
// ─────────────────────────────────────────────────────────────────────────────

// Le calendrier et les Objectifs partagent le mois courant
function monthChanged() {
  closePanel();
  if (state.view === 'goals') renderGoals();
}

function prevMonth() {
  if (state.currentMonth === 0) { state.currentMonth = 11; state.currentYear--; }
  else state.currentMonth--;
  monthChanged();
}

function nextMonth() {
  if (state.currentMonth === 11) { state.currentMonth = 0; state.currentYear++; }
  else state.currentMonth++;
  monthChanged();
}

function goToday() {
  const d = new Date();
  state.currentYear  = d.getFullYear();
  state.currentMonth = d.getMonth();
  if (state.view !== 'calendar') setView('calendar');
  closePanel(); // remet selectedDate à null et rerend le calendrier
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  // Sélecteur mois
  const selMonth = $('select-month');
  MONTHS.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = m;
    selMonth.appendChild(opt);
  });

  // Sélecteur année
  const selYear = $('select-year');
  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 4; y <= thisYear + 2; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    selYear.appendChild(opt);
  }

  // Catégories — cache local pour affichage immédiat (uniquement si on connaît
  // déjà le compte : en local, ou en déployé avec session active). Évite d'afficher
  // les catégories d'un autre compte avant connexion.
  if (!IS_DEPLOYED || sessionStorage.getItem(USER_KEY)) {
    const cachedCats = localStorage.getItem(userCacheKey(CATEGORIES_KEY));
    if (cachedCats) { try { CATEGORIES = JSON.parse(cachedCats); } catch {} }
  }
  populateCategoryDropdowns();

  // Navigation
  $('prev-month').addEventListener('click', prevMonth);
  $('next-month').addEventListener('click', nextMonth);
  $('select-month').addEventListener('change', e => {
    state.currentMonth = parseInt(e.target.value);
    closePanel();
  });
  $('select-year').addEventListener('change', e => {
    state.currentYear = parseInt(e.target.value);
    closePanel();
  });

  // Raccourcis clavier
  document.addEventListener('keydown', e => {
    // Escape ferme aussi depuis un champ (modale de recherche notamment)
    if (e.key === 'Escape') {
      closePanel(); closeAddModal(); closeImportModal(); closeRecurringModal(); closeSearchModal();
      return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft')  prevMonth();
    if (e.key === 'ArrowRight') nextMonth();
    if (e.key === 't' || e.key === 'T') goToday();
    if (e.key === '/') { e.preventDefault(); openSearchModal(); }
  });

  // Onglets
  $('btn-view-calendar').addEventListener('click',    () => setView('calendar'));
  $('btn-view-stats').addEventListener('click',       () => setView('stats'));
  $('btn-view-recurring').addEventListener('click',   () => setView('recurring'));
  $('btn-view-goals').addEventListener('click',       () => setView('goals'));
  $('btn-view-categories').addEventListener('click',  () => setView('categories'));

  // Aujourd'hui + légende
  $('btn-today').addEventListener('click', goToday);
  $('month-goal-indicator').addEventListener('click', () => setView('goals'));
  $('btn-legend').addEventListener('click', () => {
    const leg = $('calendar-legend');
    const hidden = leg.classList.toggle('hidden');
    $('btn-legend').setAttribute('aria-expanded', String(!hidden));
  });

  // Recherche
  $('btn-search').addEventListener('click', openSearchModal);
  $('modal-search-close').addEventListener('click', closeSearchModal);
  ['search-text', 'search-min', 'search-max'].forEach(id => $(id).addEventListener('input', renderSearchResults));
  ['search-category', 'search-type'].forEach(id => $(id).addEventListener('change', renderSearchResults));

  // Import
  $('btn-import').addEventListener('click', openImportModal);
  $('modal-import-close').addEventListener('click', closeImportModal);
  $('btn-cancel-import').addEventListener('click', closeImportModal);
  $('btn-confirm-import').addEventListener('click', confirmImport);
  $('import-file').addEventListener('change', handleFileSelect);

  // Modal ajout
  $('modal-add-close').addEventListener('click', closeAddModal);
  $('btn-cancel-add').addEventListener('click', closeAddModal);
  $('btn-save-add').addEventListener('click', saveNewExpense);
  $('add-amount').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNewExpense();
  });
  $('add-label').addEventListener('blur', () => {
    const label = $('add-label').value;
    const type  = $('add-type').value;
    if (label && type === 'depense' && !editingExpenseId) {
      $('add-category').value = guessCategory(label);
    }
  });
  $('add-type').addEventListener('change', e => {
    $('add-category').value = e.target.value === 'revenu' ? INCOME_CATEGORY : DEFAULT_CATEGORY;
  });

  // Modal récurrence
  $('modal-recurring-close').addEventListener('click', closeRecurringModal);
  $('btn-cancel-recurring').addEventListener('click', closeRecurringModal);
  $('btn-save-recurring').addEventListener('click', saveRecurring);
  $('recur-amount').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveRecurring();
  });
  $('recur-type').addEventListener('change', e => {
    $('recur-category').value = e.target.value === 'revenu' ? INCOME_CATEGORY : DEFAULT_CATEGORY;
  });
  $('btn-add-recurring').addEventListener('click', () => openRecurringModal());

  // Auth overlay
  $('btn-auth-submit').addEventListener('click', submitAuth);
  $('btn-auth-toggle').addEventListener('click', toggleAuthMode);
  $('auth-username').addEventListener('keydown', e => { if (e.key === 'Enter') $('auth-input').focus(); });
  $('auth-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  $('auth-input').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });
  $('btn-logout').addEventListener('click', logout);

  // Auth gate (production uniquement)
  if (IS_DEPLOYED && !sessionStorage.getItem(AUTH_KEY)) {
    $('auth-overlay').classList.remove('hidden');
    return; // le chargement des données sera déclenché après auth réussie
  }

  if (IS_DEPLOYED) showLoggedInUser();
  await loadAndRender();
}

// Mode de l'overlay : 'login' (défaut) ou 'register'
let authMode = 'login';

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  const isReg = authMode === 'register';
  $('auth-subtitle').textContent   = isReg ? 'Créez votre compte' : 'Connectez-vous à votre compte';
  $('btn-auth-submit').textContent = isReg ? 'Créer mon compte'    : 'Se connecter';
  $('auth-toggle-text').textContent = isReg ? 'Déjà un compte ?'   : 'Pas encore de compte ?';
  $('btn-auth-toggle').textContent  = isReg ? 'Se connecter'       : 'Créer un compte';
  $('auth-input').setAttribute('autocomplete', isReg ? 'new-password' : 'current-password');
  $('auth-error').classList.add('hidden');
  $('auth-username').focus();
}

function showLoggedInUser() {
  const name = sessionStorage.getItem(USER_KEY);
  if (!name) return;
  const el = $('header-user');
  el.textContent = name;
  el.classList.remove('hidden');
  $('btn-logout').classList.remove('hidden');
}

function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(USER_KEY);
  location.reload();
}

async function loadAndRender() {
  const overlay = $('loading-overlay');
  overlay.classList.remove('hidden');
  try {
    [state.expenses, state.recurring, state.goals, state.overrides] =
      await Promise.all([DB.load(), RDB.load(), GoalDB.load(), OverrideDB.load().catch(err => {
        // Non bloquant : sans les montants mensuels, on garde le dernier cache
        if (err && err.status === 401) throw err;
        try { return JSON.parse(localStorage.getItem(userCacheKey(OVERRIDES_KEY)) || '[]'); } catch { return []; }
      })]);
    await migrateLegacyOverrides();
    // Cache local du dernier chargement réussi → alimente le fallback hors ligne ci-dessous
    if (IS_DEPLOYED) {
      localStorage.setItem(userCacheKey(STORAGE_KEY),   JSON.stringify(state.expenses));
      localStorage.setItem(userCacheKey(RECURRING_KEY), JSON.stringify(state.recurring));
      localStorage.setItem(userCacheKey(GOALS_KEY),     JSON.stringify(state.goals));
      cacheOverrides();
    }
  } catch (err) {
    // Token invalide/expiré → on force une reconnexion plutôt que d'afficher un cache
    if (IS_DEPLOYED && err && err.status === 401) {
      sessionStorage.removeItem(AUTH_KEY);
      sessionStorage.removeItem(USER_KEY);
      overlay.classList.add('hidden');
      $('header-user').classList.add('hidden');
      $('btn-logout').classList.add('hidden');
      $('auth-overlay').classList.remove('hidden');
      return;
    }
    showToast('Erreur de connexion — mode hors ligne activé');
    state.expenses  = JSON.parse(localStorage.getItem(userCacheKey(STORAGE_KEY))   || '[]');
    state.recurring = JSON.parse(localStorage.getItem(userCacheKey(RECURRING_KEY)) || '[]');
    state.goals     = JSON.parse(localStorage.getItem(userCacheKey(GOALS_KEY))     || '{}');
    try { state.overrides = JSON.parse(localStorage.getItem(userCacheKey(OVERRIDES_KEY)) || '[]'); } catch { state.overrides = []; }
  } finally {
    overlay.classList.add('hidden');
  }

  // Catégories depuis DB (après auth), avec mise en cache localStorage
  try {
    const savedCats = await CatDB.load();
    if (savedCats && savedCats.length > 0) {
      CATEGORIES = savedCats;
      if (IS_DEPLOYED) localStorage.setItem(userCacheKey(CATEGORIES_KEY), JSON.stringify(CATEGORIES));
      populateCategoryDropdowns();
    }
  } catch {}

  renderCalendar();
}

async function submitAuth() {
  const userInput = $('auth-username');
  const pinInput  = $('auth-input');
  const error     = $('auth-error');
  const btn       = $('btn-auth-submit');
  const username  = userInput.value.trim();
  const pin       = pinInput.value.trim();

  if (!username) { userInput.focus(); return; }
  if (!/^\d{4,6}$/.test(pin)) {
    error.textContent = 'Le PIN doit comporter 4 à 6 chiffres.';
    error.classList.remove('hidden');
    pinInput.focus();
    return;
  }

  btn.disabled = true;
  error.classList.add('hidden');

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: authMode, username, pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) {
      sessionStorage.setItem(AUTH_KEY, data.token);
      sessionStorage.setItem(USER_KEY, data.username || username);
      $('auth-overlay').classList.add('hidden');
      showLoggedInUser();
      await loadAndRender();
    } else {
      error.textContent = data.error || 'Identifiant ou PIN incorrect.';
      error.classList.remove('hidden');
      pinInput.value = '';
      pinInput.focus();
    }
  } catch {
    error.textContent = 'Erreur de connexion. Réessayez.';
    error.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', init);
