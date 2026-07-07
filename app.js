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

// Catégories suivies dans la vue Objectifs
const GOAL_CATEGORIES = ['courses', 'essence', 'dijon_loisirs', 'dijon_appart', 'besac_loisirs'];

// Catégories spéciales (seuls ids hardcodés tolérés hors GOAL_CATEGORIES, cf. CLAUDE.md)
const DEFAULT_CATEGORY = 'autre';
const INCOME_CATEGORY  = 'revenus';

// Seuil d'alerte des objectifs (réel / plafond)
const GOAL_WARN_RATIO = 0.8;

// Jours par mois passés à Besançon et Dijon [besac, dijon] — indice 0 = janvier
const CITY_DAYS = {
  2026: [
    [26,  5],  // Janvier
    [23,  5],  // Février
    [26,  5],  // Mars
    [25,  5],  // Avril
    [23,  8],  // Mai
    [25,  5],  // Juin
    [21, 10],  // Juillet
    [26,  5],  // Août
    [27,  3],  // Septembre
    [24,  7],  // Octobre
    [25,  5],  // Novembre
    [28,  3],  // Décembre
  ],
};

// Tarif journalier par catégorie et par ville
const DAILY_RATES = {
  courses:       { besac: 8.5, dijon: 0,  label: '8,50 €/j · Besac' },
  essence:       { besac: 4,   dijon: 0,  label: '4 €/j · Besac'    },
  dijon_loisirs: { besac: 0,   dijon: 23,   label: '23 €/j · Dijon'    },
  dijon_appart:  { besac: 0,   dijon: 22.8, label: '22,80 €/j · Dijon' },
  // besac_loisirs : objectif manuel (pas de tarif journalier défini)
};

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

// Compte « propriétaire » : la config personnelle (budgets ville calculés via
// CITY_DAYS×DAILY_RATES + catégories suivies GOAL_CATEGORIES) ne s'applique qu'à lui.
// Les autres comptes partent neutres (aucun plafond calculé, pas de catégories suivies).
// En local (mono-utilisateur dev) : toujours considéré owner.
const OWNER_USERNAME = 'lucas_bleau';
function isOwner() {
  return !IS_DEPLOYED || sessionStorage.getItem(USER_KEY) === OWNER_USERNAME;
}

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

// Overrides toujours en localStorage (préférence UI par appareil, pas de données financières critiques)
const OverrideDB = {
  load() {
    try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '[]'); } catch { return []; }
  },
  save(overrides) {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  },
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

function setRecurOverride(recurId, ym, amount) {
  state.overrides = state.overrides.filter(o => !(o.recurId === recurId && o.yearMonth === ym));
  if (amount !== null) {
    const task = state.recurring.find(t => t.id === recurId);
    // Stocker même si égal à la base (0 = override explicite "pas ce mois")
    if (task && (amount !== task.amount || amount === 0)) {
      state.overrides.push({ recurId, yearMonth: ym, amount });
    }
  }
  OverrideDB.save(state.overrides);
}

function guessCategory(label) {
  const lower = label.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return DEFAULT_CATEGORY;
}

function getCat(id) {
  return CATEGORIES.find(c => c.id === id)
    ?? CATEGORIES.find(c => c.id === DEFAULT_CATEGORY)
    ?? CATEGORIES[CATEGORIES.length - 1];
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

function populateCategoryDropdowns() {
  ['add-category', 'recur-category'].forEach(selId => {
    const sel = $(selId);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '';
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id; opt.textContent = cat.label;
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
  editingGoal:  null,
  focusMonth:   today.getMonth(),
  goalsTab:     'synthese', // 'synthese' | 'detail'
  detailCat:    null,       // catégorie sélectionnée dans la sous-page Détail
  detailMonth:  today.getMonth(), // mois déplié dans la sous-page Détail
};

let modalRecurDays   = [];   // jours sélectionnés dans le modal récurrence
let editingExpenseId = null; // id de l'opération en cours d'édition (null = création)
let pendingRecurId   = null; // id de la récurrence source quand l'opération est créée via « + »

// ─────────────────────────────────────────────────────────────────────────────
// Agrégations
// ─────────────────────────────────────────────────────────────────────────────

// Calcule l'objectif dynamique d'une catégorie pour un mois donné
// Retourne null si aucune donnée disponible (autre année ou tarif non défini)
function getDynamicGoal(categoryId, year, month) {
  if (!isOwner()) return null; // budgets ville calculés : compte propriétaire uniquement
  const yearData = CITY_DAYS[year];
  if (!yearData) return null;
  const days  = yearData[month];
  if (!days)   return null;
  const rates = DAILY_RATES[categoryId];
  if (!rates)  return null;
  const amount = days[0] * rates.besac + days[1] * rates.dijon;
  return amount > 0 ? Math.round(amount * 100) / 100 : null;
}

// Retourne le plafond applicable : dynamique si défini, sinon objectif manuel
function getGoalForMonth(categoryId, year, month) {
  const dynamic = getDynamicGoal(categoryId, year, month);
  if (dynamic !== null) return dynamic;
  return state.goals[categoryId] || null;
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

  const goalIndicator = $('month-goal-indicator');
  if (goalIndicator) {
    const { spent: totalSpent, earned: totalEarned } = monthRealTotals(currentYear, currentMonth);
    const totalPlanned = CATEGORIES.filter(c => c.id !== INCOME_CATEGORY).reduce((s, cat) => {
      const r = recurExpected(cat.id, currentYear, currentMonth);
      const g = getGoalForMonth(cat.id, currentYear, currentMonth);
      return s + (r > 0 ? r : (g || 0));
    }, 0);
    if (totalSpent > 0 || totalEarned > 0) {
      goalIndicator.textContent = `${fmtEUR(totalSpent)} / +${fmtEUR(totalEarned)}`;
      goalIndicator.className = `month-goal-indicator ${goalClass(totalSpent, totalPlanned)}`;
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
  $('add-category').value = prefill?.category || DEFAULT_CATEGORY;
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

let pendingImport = null;

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
    pendingImport = detectAndParseCSV(ev.target.result);
    const preview = $('import-preview');

    if (!pendingImport.length) {
      preview.innerHTML = '<p class="import-error">Aucune opération détectée. Vérifiez le format (en-tête requis : Date, Libellé, Montant ou Débit/Crédit).</p>';
      $('btn-confirm-import').disabled = true;
      return;
    }

    const shown = pendingImport.slice(0, 8);
    preview.innerHTML = `
      <p class="import-info">${pendingImport.length} opération(s) détectée(s)</p>
      <ul class="import-list">
        ${shown.map(e => `
          <li>
            <span class="import-date">${e.date}</span>
            <span class="import-label" title="${e.label}">${e.label}</span>
            <span class="import-amount ${e.type}">${e.type === 'depense' ? '-' : '+'}${fmtEUR(e.amount)}</span>
          </li>
        `).join('')}
        ${pendingImport.length > 8 ? `<li class="import-more">… et ${pendingImport.length - 8} opération(s) de plus</li>` : ''}
      </ul>
    `;
    $('btn-confirm-import').disabled = false;
  };
  reader.readAsText(file, 'UTF-8');
}

async function confirmImport() {
  if (!pendingImport?.length) return;

  const existing = new Set(state.expenses.map(e => `${e.date}|${e.label}|${e.amount}`));
  const newOps   = pendingImport.filter(e => !existing.has(`${e.date}|${e.label}|${e.amount}`));
  const ignored  = pendingImport.length - newOps.length;

  if (!newOps.length) {
    showToast(`Aucun nouvel élément (${ignored} doublon(s) détecté(s))`);
    closeImportModal();
    return;
  }

  state.expenses.push(...newOps);
  closeImportModal();
  renderCalendar();
  showToast(`${newOps.length} opération(s) importée(s)${ignored > 0 ? ` · ${ignored} doublon(s) ignoré(s)` : ''}`);

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

function goalsSubTabsHtml() {
  const tab = state.goalsTab;
  return `<div class="goals-subtabs" role="tablist">
    <button class="goals-subtab ${tab === 'synthese' ? 'active' : ''}" data-goals-tab="synthese" role="tab" aria-selected="${tab === 'synthese'}">Synthèse</button>
    <button class="goals-subtab ${tab === 'detail' ? 'active' : ''}" data-goals-tab="detail" role="tab" aria-selected="${tab === 'detail'}">Détail</button>
  </div>`;
}

function attachGoalsSubTabs(container) {
  container.querySelectorAll('[data-goals-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.goalsTab = btn.dataset.goalsTab;
      renderGoals();
    });
  });
}

function renderGoals() {
  const container = $('goals-body');
  const { currentYear } = state;
  const nowMonth = today.getMonth();
  const nowYear  = today.getFullYear();

  if (state.goalsTab === 'detail') { renderGoalsDetail(container); return; }

  // Owner : budgets ville calculés + catégories suivies hardcodées.
  // Autres comptes : objectif mensuel manuel sur chacune de leurs catégories de dépense.
  const goalCats  = isOwner()
    ? GOAL_CATEGORIES.map(id => getCat(id))
    : CATEGORIES.filter(c => c.id !== INCOME_CATEGORY);
  const tableCats = CATEGORIES.filter(c => c.id !== INCOME_CATEGORY);

  // Ligne de reglage / info des objectifs
  let html = goalsSubTabsHtml();
  if (goalCats.length) {
    if (!isOwner()) html += `<p class="goals-settings-hint">Définissez un objectif mensuel par catégorie en cliquant sur ✏.</p>`;
    html += `<div class="goals-settings">`;
  }
  for (const cat of goalCats) {
    const rates = DAILY_RATES[cat.id];
    if (rates) {
      html += `<div class="goal-rate-card" data-cat="${cat.id}">
        <span class="goal-dot" style="background:${cat.color}"></span>
        <span class="goal-cat-name">${cat.label}</span>
        <span class="goal-rate-label">${rates.label}</span>
      </div>`;
    } else {
      const limit   = state.goals[cat.id];
      const editing = state.editingGoal === cat.id;
      html += `<div class="goal-setting-card" data-cat="${cat.id}">
        <span class="goal-dot" style="background:${cat.color}"></span>
        <span class="goal-cat-name">${cat.label}</span>`;
      if (editing) {
        html += `<div class="goal-inline-edit" style="margin-left:auto">
          <input type="text" class="goal-edit-input" id="goal-input-${cat.id}"
            value="${limit || ''}" placeholder="€/mois" inputmode="decimal" />
          <button class="btn-goal-confirm" data-cat="${cat.id}">✓</button>
          <button class="btn-goal-cancel"  data-cat="${cat.id}">✕</button>
        </div>`;
      } else {
        html += `<span class="goal-setting-amount">${limit ? fmtEUR(limit) + '/mois' : '—'}</span>
          <button class="btn-icon btn-set-goal" data-cat="${cat.id}" title="Modifier">✏</button>`;
      }
      html += `</div>`;
    }
  }
  if (goalCats.length) html += `</div>`;

  // Chiffres d'une catégorie pour un mois : réel + récurrence + plafond
  const monthCache = {};
  const dataForMonth = m => (monthCache[m] ??= getMonthData(currentYear, m));
  const catFigures = (cat, m) => {
    const amount = dataForMonth(m)
      .filter(e => e.type === 'depense' && e.category === cat.id)
      .reduce((s, e) => s + e.amount, 0);
    const r       = recurExpected(cat.id, currentYear, m);
    const rem     = recurRemaining(cat.id, currentYear, m);
    const goal    = getGoalForMonth(cat.id, currentYear, m);
    const denom   = goal ? Math.max(goal, r) : (r || null); // jamais sous l'objectif fixé
    const total   = amount + rem; // récurrences restantes seulement (pas de double comptage)
    const planned = goal ? Math.max(goal, r) : r;
    let cls = '';
    if (r > 0)           cls = amount === 0 ? 'ok' : goalClass(total, denom);
    else if (amount > 0) cls = denom ? goalClass(amount, denom) : '';
    return { amount, r, goal, denom, total, planned, cls };
  };

  // ── Mois en avant : liste verticale des catégories ────────────────────────
  const focusM    = state.focusMonth;
  const focusRows = tableCats
    .map(cat => ({ cat, f: catFigures(cat, focusM) }))
    .filter(({ f }) => f.total > 0 || f.goal > 0)
    .sort((a, b) => b.f.total - a.f.total || b.f.planned - a.f.planned);

  const focusActual  = focusRows.reduce((s, { f }) => s + f.total, 0);
  const focusPlanned = tableCats.reduce((s, cat) => s + catFigures(cat, focusM).planned, 0);
  const focusCls     = goalClass(focusActual, focusPlanned);

  html += `
    <div class="goal-focus">
      <div class="goal-focus-head">
        <div class="goal-focus-title">${MONTHS[focusM]} ${currentYear}</div>
        <div class="goal-focus-sub">
          <span class="${focusCls}">${focusActual > 0 ? fmtEUR(focusActual) : '—'}</span>
          <span class="goal-focus-sep">/ ${focusPlanned > 0 ? fmtEUR(focusPlanned) : '—'} prévu</span>
        </div>
      </div>
      <div class="goal-focus-list">`;

  if (focusRows.length === 0) {
    html += `<div class="goal-focus-empty">Aucune dépense ni objectif ce mois-ci.</div>`;
  }
  for (const { cat, f } of focusRows) {
    const barWidth = f.denom ? Math.min(100, f.total / f.denom * 100).toFixed(0) : 0;
    const val = f.denom
      ? `<span class="${f.cls}">${fmtCompact(f.total)}</span><span class="gcell-lim"> / ${fmtCompact(f.denom)}</span>`
      : `<span class="${f.cls}">${f.total > 0 ? fmtCompact(f.total) : '—'}</span>`;
    html += `
      <div class="gfocus-row">
        <span class="goal-dot" style="background:${cat.color}"></span>
        <span class="gfocus-name">${cat.label}</span>
        <div class="gfocus-bar-wrap">${f.denom ? `<div class="gfocus-bar ${f.cls}" style="width:${barWidth}%"></div>` : ''}</div>
        <span class="gfocus-val">${val}</span>
      </div>`;
  }
  html += `</div></div>`;

  // ── Aperçu année : heatmap (couleur = ratio, clic = met le mois en avant) ──
  const abbrev = label => label
    .replace('Abonnements', 'Abo.')
    .replace(' Loisirs', ' L.')
    .replace(' Appart', ' A.');

  html += `
    <div class="goals-year-header">${currentYear} <span class="goals-year-hint">— touchez un mois</span></div>
    <div class="goals-year-wrap">
      <table class="goals-year-table goals-heat">
        <thead><tr>
          <th>Mois</th>
          ${tableCats.map(c => `<th title="${c.label}"><span class="goal-dot" style="background:${c.color};display:inline-block;margin-right:2px;vertical-align:middle"></span>${abbrev(c.label)}</th>`).join('')}
          <th>Total</th>
        </tr></thead>
        <tbody>`;

  for (let m = 0; m < 12; m++) {
    const isCurrent = m === nowMonth && currentYear === nowYear;
    const isFuture  = currentYear > nowYear || (currentYear === nowYear && m > nowMonth);
    const isPast    = !isCurrent && !isFuture;

    let rowActual = 0, rowPlanned = 0;
    const cells = tableCats.map(cat => {
      const f = catFigures(cat, m);
      rowActual  += f.total;
      rowPlanned += f.planned;
      let display = '—', cls = f.cls;
      if (f.total > 0)            display = fmtCompact(f.total);
      else if (f.goal && !isPast) { display = `<span class="gcell-lim">${fmtCompact(f.goal)}</span>`; cls = ''; }
      return `<td class="gcell-amount ${cls}">${display}</td>`;
    }).join('');

    const totalCls  = goalClass(rowActual, rowPlanned);
    const totalCell = (rowActual > 0 || rowPlanned > 0)
      ? `<span class="${totalCls}">${rowActual > 0 ? fmtCompact(rowActual) : '—'}</span>${rowPlanned > 0 ? `<span class="gcell-lim">/${fmtCompact(rowPlanned)}</span>` : ''}`
      : '—';

    const rowCls = [isCurrent ? 'cur-row' : '', m === focusM ? 'focus-row' : ''].filter(Boolean).join(' ');
    html += `<tr class="${rowCls}" data-focus-month="${m}">
      <td class="gcell-month">${MONTHS_SHORT[m]}</td>
      ${cells}
      <td class="gcell-total-c">${totalCell}</td>
    </tr>`;
  }

  // Totaux annuels par colonne : réel / planifié
  const colData = tableCats.map(cat => {
    let actual = 0, planned = 0;
    for (let m2 = 0; m2 < 12; m2++) {
      const f = catFigures(cat, m2);
      actual  += f.total;
      planned += f.planned;
    }
    return { actual, planned };
  });
  const grandActual  = colData.reduce((s, { actual }) => s + actual, 0);
  const grandPlanned = colData.reduce((s, { planned }) => s + planned, 0);

  const tFootCells = colData.map(({ actual, planned }) => {
    const cls = goalClass(actual, planned);
    return `<td class="gcell-amount ${cls}">${actual > 0 ? fmtCompact(actual) : '—'}</td>`;
  }).join('');
  const grandCls = goalClass(grandActual, grandPlanned);

  html += `</tbody>
    <tfoot>
      <tr class="goals-foot">
        <td class="gcell-month">Total</td>
        ${tFootCells}
        <td class="gcell-total-c">
          <span class="${grandCls}">${grandActual > 0 ? fmtCompact(grandActual) : '—'}</span>${grandPlanned > 0 ? `<span class="gcell-lim">/${fmtCompact(grandPlanned)}</span>` : ''}
        </td>
      </tr>
    </tfoot>
  </table></div>`;
  container.innerHTML = html;

  // Evenements
  attachGoalsSubTabs(container);
  container.querySelectorAll('[data-focus-month]').forEach(tr => {
    tr.addEventListener('click', () => {
      state.focusMonth = +tr.dataset.focusMonth;
      renderGoals();
    });
  });
  container.querySelectorAll('.btn-set-goal').forEach(btn => {
    btn.addEventListener('click', () => {
      state.editingGoal = btn.dataset.cat;
      renderGoals();
      const inp = $(`goal-input-${btn.dataset.cat}`);
      if (inp) { inp.focus(); inp.select(); }
    });
  });
  container.querySelectorAll('.btn-goal-confirm').forEach(btn => {
    btn.addEventListener('click', () => saveGoal(btn.dataset.cat));
  });
  container.querySelectorAll('.btn-goal-cancel').forEach(btn => {
    btn.addEventListener('click', () => { state.editingGoal = null; renderGoals(); });
  });
  container.querySelectorAll('.goal-edit-input').forEach(input => {
    input.addEventListener('keydown', e => {
      const cat = input.closest('[data-cat]').dataset.cat;
      if (e.key === 'Enter')  saveGoal(cat);
      if (e.key === 'Escape') { state.editingGoal = null; renderGoals(); }
    });
  });
}

// Sous-page Détail : pour une catégorie, le détail mois par mois des opérations
function renderGoalsDetail(container) {
  const { currentYear } = state;
  const nowMonth = today.getMonth();
  const nowYear  = today.getFullYear();

  const tableCats = CATEGORIES.filter(c => c.id !== INCOME_CATEGORY);
  if (!tableCats.some(c => c.id === state.detailCat)) {
    state.detailCat = tableCats[0]?.id ?? null;
  }
  const cat = getCat(state.detailCat);

  let html = goalsSubTabsHtml();

  // Sélecteur de catégorie (puces)
  html += `<div class="detail-chips">`;
  for (const c of tableCats) {
    const on = c.id === state.detailCat;
    html += `<button class="detail-chip ${on ? 'active' : ''}" data-detail-cat="${c.id}">
      <span class="goal-dot" style="background:${c.color}"></span>${c.label}
    </button>`;
  }
  html += `</div>`;

  // Bilan annuel de la catégorie. Les récurrences attendues sont affichées
  // comme des opérations (rappels ↺) et incluses dans le total montré, en
  // cohérence avec la vue Synthèse (total = réel + récurrences).
  let yearShown = 0, yearPlanned = 0;
  const months = [];
  for (let m = 0; m < 12; m++) {
    const dim = daysIn(currentYear, m);
    const ym  = ymKey(currentYear, m);

    const realRows = getMonthData(currentYear, m)
      .filter(e => e.type === 'depense' && e.category === cat.id)
      .map(e => ({ day: +e.date.slice(8, 10), label: e.label, amount: e.amount, recur: false }));

    const recurRows = [];
    for (const t of state.recurring) {
      if (t.category !== cat.id || t.type !== 'depense') continue;
      const ov  = getOverride(t.id, ym);
      const amt = ov ? ov.amount : t.amount;
      if (!(amt > 0)) continue;
      const realized = realizedRecurDays(t, currentYear, m);
      for (const d of t.days) {
        if (d <= dim && !realized.has(d)) recurRows.push({ day: d, label: t.label, amount: amt, recur: true });
      }
    }

    const rows    = [...realRows, ...recurRows].sort((a, b) => a.day - b.day || (a.recur - b.recur));
    const r       = recurExpected(cat.id, currentYear, m); // prévu complet, occurrences saisies incluses
    const shown   = rows.reduce((s, x) => s + x.amount, 0);
    const goal    = getGoalForMonth(cat.id, currentYear, m);
    const planned = goal ? Math.max(goal, r) : r;
    const denom   = goal ? Math.max(goal, r) : (r || null);
    yearShown   += shown;
    yearPlanned += planned;
    months.push({ m, rows, shown, denom });
  }
  const yearCls = goalClass(yearShown, yearPlanned);

  html += `<div class="detail-head">
    <div class="detail-head-title"><span class="goal-dot" style="background:${cat.color}"></span>${cat.label} <span class="detail-head-year">${currentYear}</span></div>
    <div class="detail-head-sub">
      <span class="${yearCls}">${yearShown > 0 ? fmtEUR(yearShown) : '—'}</span>
      <span class="detail-head-sep">/ ${yearPlanned > 0 ? fmtEUR(yearPlanned) : '—'} prévu</span>
    </div>
  </div>`;

  // Accordéon mois par mois
  html += `<div class="detail-months">`;
  for (const { m, rows, shown, denom } of months) {
    const isCurrent = m === nowMonth && currentYear === nowYear;
    const isFuture  = currentYear > nowYear || (currentYear === nowYear && m > nowMonth);
    const open      = m === state.detailMonth;
    const cls       = denom ? goalClass(shown, denom) : '';
    const barWidth  = denom ? Math.min(100, shown / denom * 100).toFixed(0) : 0;

    const right = denom
      ? `<span class="${cls}">${fmtCompact(shown)}</span><span class="gcell-lim"> / ${fmtCompact(denom)}</span>`
      : `<span class="${cls}">${shown > 0 ? fmtCompact(shown) : '—'}</span>`;

    html += `<div class="detail-month ${open ? 'open' : ''}">
      <button class="detail-month-head ${isCurrent ? 'cur' : ''}" data-detail-month="${m}" aria-expanded="${open}">
        <span class="detail-caret">${open ? '▾' : '▸'}</span>
        <span class="detail-month-name">${MONTHS[m]}</span>
        <span class="detail-month-count">${rows.length > 0 ? rows.length + (rows.length > 1 ? ' opérations' : ' opération') : ''}</span>
        <span class="detail-month-bar">${denom ? `<span class="detail-bar ${cls}" style="width:${barWidth}%"></span>` : ''}</span>
        <span class="detail-month-val">${right}</span>
      </button>`;

    if (open) {
      html += `<ul class="detail-ops">`;
      if (rows.length === 0) {
        html += `<li class="detail-empty">Aucune opération${isFuture ? ' (mois à venir)' : ''}.</li>`;
      } else {
        for (const row of rows) {
          html += `<li class="detail-op${row.recur ? ' is-recur' : ''}">
            <span class="detail-op-day">${String(row.day).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}</span>
            <span class="detail-op-label" title="${row.label}">${row.recur ? '<span class="detail-op-recur">↺</span> ' : ''}${row.label}</span>
            <span class="detail-op-amount depense">-${fmtEUR(row.amount)}</span>
          </li>`;
        }
      }
      html += `</ul>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  container.innerHTML = html;

  // Evenements
  attachGoalsSubTabs(container);
  container.querySelectorAll('[data-detail-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.detailCat = btn.dataset.detailCat;
      renderGoals();
    });
  });
  container.querySelectorAll('[data-detail-month]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = +btn.dataset.detailMonth;
      state.detailMonth = state.detailMonth === m ? -1 : m; // accordéon : referme si déjà ouvert
      renderGoals();
    });
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
      <p class="cat-mgmt-subtitle">Gérez les catégories disponibles. Les catégories système (objectifs) et celles utilisées par des opérations existantes ne peuvent pas être supprimées.</p>
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

  CATEGORIES.forEach(cat => {
    const isGoalCat  = GOAL_CATEGORIES.includes(cat.id);
    const usedCount  = state.expenses.filter(e => e.category === cat.id).length;
    const canDelete  = !isGoalCat && usedCount === 0;
    const delTitle   = isGoalCat ? 'Catégorie système (objectifs)' : (usedCount > 0 ? `${usedCount} opération(s) liée(s)` : 'Supprimer');

    html += `
      <div class="cat-mgmt-item" data-id="${cat.id}">
        <label class="cat-color-label" title="Modifier la couleur">
          <input type="color" class="cat-color-inp cat-color-edit" value="${cat.color}" data-id="${cat.id}" />
          <span class="cat-color-swatch" style="background:${cat.color}"></span>
        </label>
        <input type="text" class="cat-label-edit" value="${cat.label}" data-id="${cat.id}" />
        <button class="btn-icon btn-delete-cat" data-id="${cat.id}"
          ${!canDelete ? 'disabled' : ''} title="${delTitle}">✕</button>
      </div>`;
  });

  html += `</div>`;
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

  // Suppression
  container.querySelectorAll('.btn-delete-cat:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => deleteCategory(btn.dataset.id));
  });
}

async function addCategory() {
  const labelInput = $('new-cat-label');
  const colorInput = $('new-cat-color');
  const label = labelInput.value.trim();
  if (!label) { labelInput.focus(); return; }

  const id = label.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  if (CATEGORIES.find(c => c.id === id)) {
    showToast('Une catégorie avec ce nom existe déjà');
    return;
  }

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

async function deleteCategory(id) {
  try {
    await CatDB.remove(id);
  } catch (err) {
    showToast(err.message || 'Suppression échouée');
    return;
  }
  CATEGORIES = CATEGORIES.filter(c => c.id !== id);
  localStorage.setItem(userCacheKey(CATEGORIES_KEY), JSON.stringify(CATEGORIES));
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
  CATEGORIES.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.label;
    sel.appendChild(o);
  });
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
function yearMonthlyTotals(year) {
  const dep = Array(12).fill(0), rev = Array(12).fill(0);
  for (let m = 0; m < 12; m++) {
    const { spent, earned } = monthRealTotals(year, m);
    dep[m] = spent;
    rev[m] = earned;
  }
  return { dep, rev };
}

// Totaux de dépenses par catégorie pour une année (saisies + récurrences), comme la vue Objectifs
function yearCategoryTotals(year) {
  const map = {};
  for (let m = 0; m < 12; m++) {
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

// Courbe du solde net mensuel (peut être négatif)
function svgLineChart(values) {
  const W = 720, H = 220, padX = 8, padT = 16, padB = 26;
  const innerW = W - padX * 2, innerH = H - padT - padB;
  const max = Math.max(1, ...values.map(v => Math.abs(v)));
  const zeroY = padT + innerH / 2;
  const scale = (innerH / 2) / max;
  const pts = values.map((v, m) => [padX + (m / 11) * innerW, zeroY - v * scale]);
  const poly = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const dots = pts.map((p, m) =>
    `<circle class="${values[m] >= 0 ? 'dot-pos' : 'dot-neg'}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2"><title>${MONTHS_SHORT[m]} — solde ${fmtEUR(values[m])}</title></circle>`
  ).join('');
  const labels = MONTHS_SHORT.map((mm, m) =>
    `<text class="chart-axis" x="${(padX + (m / 11) * innerW).toFixed(1)}" y="${H - 9}" text-anchor="middle">${mm}</text>`
  ).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du solde net">
    <line class="chart-zero" x1="${padX}" y1="${zeroY}" x2="${W - padX}" y2="${zeroY}"/>
    <polyline class="chart-soldeline" points="${poly}"/>
    ${dots}${labels}
  </svg>`;
}

// Donut de répartition (slices: {label,color,value})
function svgDonut(slices, total) {
  const size = 188, r = 70, cx = size / 2, cy = size / 2, sw = 26;
  const C = 2 * Math.PI * r;
  let segs = '', off = 0;
  if (total > 0) {
    for (const sl of slices) {
      const len = (sl.value / total) * C;
      segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${sl.color}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${sl.label} — ${fmtEUR(sl.value)} (${Math.round(sl.value / total * 100)}%)</title></circle>`;
      off += len;
    }
  } else {
    segs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border-light)" stroke-width="${sw}"/>`;
  }
  return `<svg class="donut-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Répartition des dépenses par catégorie">
    ${segs}
    <text x="${cx}" y="${cy - 1}" text-anchor="middle" class="donut-center-val">${fmtCompact(total)}</text>
    <text x="${cx}" y="${cy + 15}" text-anchor="middle" class="donut-center-lbl">dépenses</text>
  </svg>`;
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
  const soldeSeries = dep.map((d, m) => rev[m] - d);

  const catMap = yearCategoryTotals(year);
  const slices = Object.entries(catMap)
    .map(([id, value]) => ({ id, value, label: getCat(id).label, color: getCat(id).color }))
    .sort((a, b) => b.value - a.value);
  const maxCat = slices.length ? slices[0].value : 0;

  const kpi = (label, value, cls) =>
    `<div class="stat-kpi"><span class="stat-kpi-label">${label}</span><span class="stat-kpi-value ${cls || ''}">${value}</span></div>`;

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
      ${kpi('Dépenses', fmtEUR(totalDep), 'depense-color')}
      ${kpi('Revenus', fmtEUR(totalRev), 'revenu-color')}
      ${kpi('Solde', (solde >= 0 ? '+' : '') + fmtEUR(solde), solde >= 0 ? 'revenu-color' : 'depense-color')}
      ${kpi('Dépense moy. / mois', fmtEUR(avgDep))}
    </div>`;

  if (totalDep === 0 && totalRev === 0) {
    html += `<p class="stats-empty">Aucune opération enregistrée pour ${year}.</p>`;
    container.innerHTML = html;
    wireStatsNav();
    return;
  }

  html += `
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

    <div class="stats-row">
      <div class="chart-card">
        <h3 class="chart-card-title">Répartition par catégorie</h3>
        <div class="donut-layout">
          ${svgDonut(slices, totalDep)}
          <ul class="cat-rank">
            ${slices.length ? slices.slice(0, 8).map(s => `
              <li class="cat-rank-item">
                <span class="op-dot" style="background:${s.color}"></span>
                <span class="cat-rank-name" title="${s.label}">${s.label}</span>
                <span class="cat-rank-bar"><span style="width:${maxCat ? Math.round(s.value / maxCat * 100) : 0}%;background:${s.color}"></span></span>
                <span class="cat-rank-val">${fmtEUR(s.value)}</span>
                <span class="cat-rank-pct">${totalDep ? Math.round(s.value / totalDep * 100) : 0}%</span>
              </li>`).join('') : '<li class="cat-rank-empty">Aucune dépense</li>'}
          </ul>
        </div>
      </div>

      <div class="chart-card">
        <h3 class="chart-card-title">Solde net mensuel</h3>
        ${svgLineChart(soldeSeries)}
      </div>
    </div>`;

  container.innerHTML = html;
  wireStatsNav();
}

function wireStatsNav() {
  const prev = $('stats-prev-year'), next = $('stats-next-year');
  if (prev) prev.addEventListener('click', () => { state.currentYear--; renderStats(); });
  if (next) next.addEventListener('click', () => { state.currentYear++; renderStats(); });
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

function prevMonth() {
  if (state.currentMonth === 0) { state.currentMonth = 11; state.currentYear--; }
  else state.currentMonth--;
  closePanel();
}

function nextMonth() {
  if (state.currentMonth === 11) { state.currentMonth = 0; state.currentYear++; }
  else state.currentMonth++;
  closePanel();
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
    if (label && type === 'depense') {
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
  state.overrides = OverrideDB.load();
  try {
    [state.expenses, state.recurring, state.goals] = await Promise.all([DB.load(), RDB.load(), GoalDB.load()]);
    // Cache local du dernier chargement réussi → alimente le fallback hors ligne ci-dessous
    if (IS_DEPLOYED) {
      localStorage.setItem(userCacheKey(STORAGE_KEY),   JSON.stringify(state.expenses));
      localStorage.setItem(userCacheKey(RECURRING_KEY), JSON.stringify(state.recurring));
      localStorage.setItem(userCacheKey(GOALS_KEY),     JSON.stringify(state.goals));
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
