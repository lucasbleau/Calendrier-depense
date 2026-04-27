'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY    = 'expense-calendar-data-v1';
const RECURRING_KEY  = 'expense-calendar-recurring-v1';
const GOALS_KEY      = 'expense-calendar-goals-v1';
const AUTH_KEY       = 'expense-calendar-auth-v1';
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

function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem(AUTH_KEY);
  if (!token) return fetch(url, options);
  const headers = { ...(options.headers || {}), 'x-auth-token': token };
  return fetch(url, { ...options, headers });
}

const DB = {
  async load() {
    if (!IS_DEPLOYED) {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }
    const res = await apiFetch('/api/expenses');
    if (!res.ok) throw new Error('Impossible de charger les données');
    return res.json();
  },

  async add(expense) {
    if (!IS_DEPLOYED) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses));
      return;
    }
    const res = await apiFetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expense),
    });
    if (!res.ok) throw new Error('Enregistrement échoué');
  },

  async addMany(expenses) {
    if (!IS_DEPLOYED) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses));
      return;
    }
    const res = await apiFetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expenses),
    });
    if (!res.ok) throw new Error('Import échoué');
  },

  async remove(id) {
    if (!IS_DEPLOYED) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses));
      return;
    }
    const res = await apiFetch(`/api/expenses?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Suppression échouée');
  },
};

const RDB = {
  async load() {
    if (!IS_DEPLOYED) {
      return JSON.parse(localStorage.getItem(RECURRING_KEY) || '[]');
    }
    const res = await apiFetch('/api/recurring');
    if (!res.ok) throw new Error('Impossible de charger les récurrences');
    return res.json();
  },

  async save(task) {
    if (!IS_DEPLOYED) {
      localStorage.setItem(RECURRING_KEY, JSON.stringify(state.recurring));
      return;
    }
    const res = await apiFetch('/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
    if (!res.ok) throw new Error('Sauvegarde échouée');
  },

  async remove(id) {
    if (!IS_DEPLOYED) {
      localStorage.setItem(RECURRING_KEY, JSON.stringify(state.recurring));
      return;
    }
    const res = await apiFetch(`/api/recurring?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Suppression échouée');
  },
};

const GoalDB = {
  async load() {
    if (!IS_DEPLOYED) {
      return JSON.parse(localStorage.getItem(GOALS_KEY) || '{}');
    }
    const res = await apiFetch('/api/goals');
    if (!res.ok) throw new Error('Impossible de charger les objectifs');
    return res.json();
  },

  async save(category, amount) {
    if (!IS_DEPLOYED) {
      localStorage.setItem(GOALS_KEY, JSON.stringify(state.goals));
      return;
    }
    const res = await apiFetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, amount }),
    });
    if (!res.ok) throw new Error('Sauvegarde échouée');
  },

  async remove(category) {
    if (!IS_DEPLOYED) {
      localStorage.setItem(GOALS_KEY, JSON.stringify(state.goals));
      return;
    }
    const res = await apiFetch(`/api/goals?category=${encodeURIComponent(category)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Suppression échouée');
  },
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

// Categories toujours en localStorage (config utilisateur, pas de données financières)
const CatDB = {
  load() {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  save(cats) {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
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
  return 'autre';
}

function getCat(id) {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

function populateCategoryDropdowns() {
  ['add-category', 'recur-category'].forEach(selId => {
    const sel = document.getElementById(selId);
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDays(days) {
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map(d => d + (d === 1 ? 'er' : '')).join(', ') + ' du mois';
}

// Retourne les récurrences actives pour un jour donné, avec overrides mensuels appliqués
function getRecurringForDay(year, month, day) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
  return state.recurring
    .filter(task => task.days.some(d => Math.min(d, daysInMonth) === day))
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
      category: type === 'revenu' ? 'revenus' : guessCategory(label),
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
};

let modalRecurDays = [];  // jours sélectionnés dans le modal récurrence

// ─────────────────────────────────────────────────────────────────────────────
// Agrégations
// ─────────────────────────────────────────────────────────────────────────────

// Calcule l'objectif dynamique d'une catégorie pour un mois donné
// Retourne null si aucune donnée disponible (autre année ou tarif non défini)
function getDynamicGoal(categoryId, year, month) {
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
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
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

  document.getElementById('select-month').value = currentMonth;
  document.getElementById('select-year').value  = currentYear;
  document.getElementById('month-title').textContent = `${MONTHS[currentMonth]} ${currentYear}`;

  const monthData = getMonthData(currentYear, currentMonth);

  // Indicateur objectif mensuel — même calcul que la colonne Total de l'onglet Objectifs
  const goalIndicator = document.getElementById('month-goal-indicator');
  if (goalIndicator) {
    const totalPlanned = CATEGORIES.filter(c => c.id !== 'revenus').reduce((s, cat) => {
      const r = recurExpected(cat.id, currentYear, currentMonth);
      const g = getGoalForMonth(cat.id, currentYear, currentMonth);
      return s + (r > 0 ? r : (g || 0));
    }, 0);
    if (totalPlanned > 0) {
      const totalSpent = monthData.filter(e => e.type === 'depense').reduce((s, e) => s + e.amount, 0);
      const pct = totalSpent / totalPlanned;
      const cls = pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok';
      goalIndicator.textContent = `${fmtCompact(totalSpent)} / ${fmtCompact(totalPlanned)}`;
      goalIndicator.className = `month-goal-indicator ${cls}`;
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
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

  const grid = document.getElementById('calendar-grid');
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
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const panel = document.getElementById('day-panel');
  const dateStr = state.selectedDate;

  if (!dateStr) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  const [year, month, day] = dateStr.split('-').map(Number);
  const label = new Date(year, month - 1, day)
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const items = getDayData(dateStr);
  const { depenses, revenus } = sumByType(items);
  const recurItems = getRecurringForDay(year, month - 1, day);

  let html = `
    <div class="panel-header">
      <h2 class="panel-date">${label}</h2>
      <button class="btn-icon" id="close-panel" aria-label="Fermer">&#10005;</button>
    </div>
    <div class="panel-summary">
      ${depenses > 0 ? `<span class="summary-depense">Dépenses : ${fmtEUR(depenses)}</span>` : ''}
      ${revenus  > 0 ? `<span class="summary-revenu">Revenus : ${fmtEUR(revenus)}</span>`    : ''}
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

  document.getElementById('close-panel').addEventListener('click', closePanel);
  document.getElementById('btn-add-operation').addEventListener('click', () => openAddModal(dateStr));

  const recurMap = Object.fromEntries(recurItems.map(r => [r.id, r]));

  panel.querySelectorAll('.btn-use-recur').forEach(btn => {
    btn.addEventListener('click', () => {
      const task = recurMap[btn.dataset.recurId];
      if (task) openAddModal(dateStr, task);
    });
  });

  panel.querySelectorAll('.btn-edit-recur-amount').forEach(btn => {
    btn.addEventListener('click', () => {
      const recurId = btn.dataset.recurId;
      const ym      = btn.dataset.ym;
      const type    = btn.dataset.type;
      const amtSpan = document.getElementById(`recur-amt-${recurId}`);
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
  document.getElementById('day-panel').classList.add('hidden');
  renderCalendar();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu : Statistiques
// ─────────────────────────────────────────────────────────────────────────────

let barChart   = null;
let donutChart = null;

function renderStats() {
  const { currentYear, currentMonth } = state;

  document.getElementById('stats-month-title').textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  document.getElementById('kpi-year-label').textContent   = currentYear;

  const monthData = getMonthData(currentYear, currentMonth);
  const { depenses: mDep, revenus: mRev } = sumByType(monthData);
  const mSolde = mRev - mDep;

  document.getElementById('kpi-depenses').textContent = fmtEUR(mDep);
  document.getElementById('kpi-revenus').textContent  = fmtEUR(mRev);
  document.getElementById('kpi-solde').textContent    = fmtEUR(mSolde);
  document.getElementById('kpi-solde').className      = 'kpi-value ' + (mSolde >= 0 ? 'positive' : 'negative');

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear  = currentMonth === 0 ? currentYear - 1 : currentYear;
  const { depenses: pDep } = sumByType(getMonthData(prevYear, prevMonth));
  const diffEl = document.getElementById('kpi-diff');
  if (pDep > 0) {
    const pct = ((mDep - pDep) / pDep) * 100;
    diffEl.textContent = (pct > 0 ? '+' : '') + pct.toFixed(1) + '% vs mois préc.';
    diffEl.className   = 'kpi-diff ' + (pct > 0 ? 'negative' : 'positive');
  } else {
    diffEl.textContent = '';
  }

  let yDep = 0, yRev = 0;
  for (let m = 0; m < 12; m++) {
    const { depenses, revenus } = sumByType(getMonthData(currentYear, m));
    yDep += depenses;
    yRev += revenus;
  }
  document.getElementById('kpi-year-dep').textContent   = fmtEUR(yDep);
  document.getElementById('kpi-year-rev').textContent   = fmtEUR(yRev);
  document.getElementById('kpi-year-solde').textContent = fmtEUR(yRev - yDep);
  document.getElementById('kpi-year-solde').className   = 'kpi-value ' + ((yRev - yDep) >= 0 ? 'positive' : 'negative');

  const barDep = [], barRev = [];
  for (let m = 0; m < 12; m++) {
    const { depenses, revenus } = sumByType(getMonthData(currentYear, m));
    barDep.push(depenses);
    barRev.push(revenus);
  }

  const barCtx = document.getElementById('bar-chart').getContext('2d');
  if (barChart) barChart.destroy();
  barChart = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: MONTHS_SHORT,
      datasets: [
        { label: 'Dépenses', data: barDep, backgroundColor: '#B85C38', borderRadius: 4 },
        { label: 'Revenus',  data: barRev, backgroundColor: '#4A7C59', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Inter', size: 12 }, color: '#7A6A52' } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label} : ${fmtEUR(ctx.raw)}` } },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => fmtCompact(v), font: { family: 'JetBrains Mono', size: 11 }, color: '#A8977E' },
          grid: { color: '#E4DECE' },
        },
        x: {
          ticks: { font: { family: 'Inter', size: 12 }, color: '#7A6A52' },
          grid: { display: false },
        },
      },
    },
  });

  const catTotals = {};
  for (const e of monthData) {
    if (e.type === 'depense') catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
  }

  const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const total = catEntries.reduce((s, [, v]) => s + v, 0);

  const donutCanvas = document.getElementById('donut-chart');
  const catListEl   = document.getElementById('cat-list');
  const catEmpty    = document.getElementById('cat-empty');

  if (!catEntries.length) {
    donutCanvas.classList.add('hidden');
    catListEl.classList.add('hidden');
    catEmpty.classList.remove('hidden');
  } else {
    donutCanvas.classList.remove('hidden');
    catListEl.classList.remove('hidden');
    catEmpty.classList.add('hidden');

    const donutCtx = donutCanvas.getContext('2d');
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: catEntries.map(([id]) => getCat(id).label),
        datasets: [{
          data:            catEntries.map(([, v]) => v),
          backgroundColor: catEntries.map(([id]) => getCat(id).color),
          borderWidth: 2,
          borderColor: '#FAF7F1',
        }],
      },
      options: {
        responsive: true,
        cutout: '66%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.label} : ${fmtEUR(ctx.raw)} (${((ctx.raw / total) * 100).toFixed(1)}%)` } },
        },
      },
    });

    catListEl.innerHTML = catEntries.map(([id, amount]) => {
      const cat = getCat(id);
      const pct = (amount / total * 100).toFixed(1);
      return `
        <li class="cat-item">
          <span class="cat-dot" style="background:${cat.color}"></span>
          <span class="cat-name">${cat.label}</span>
          <div class="cat-right">
            <span class="cat-amount">${fmtEUR(amount)}</span>
            <span class="cat-pct">${pct}%</span>
          </div>
        </li>
      `;
    }).join('');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu : Vue Récurrences
// ─────────────────────────────────────────────────────────────────────────────

function renderRecurring() {
  const container = document.getElementById('recurring-list');
  const summary   = document.getElementById('recurring-summary');

  const totalDep = state.recurring.filter(t => t.type === 'depense').reduce((s, t) => s + t.amount, 0);
  const totalRev = state.recurring.filter(t => t.type === 'revenu').reduce((s, t) => s + t.amount, 0);
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

  // Trier les groupes par total dépenses décroissant
  const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => {
    const sumA = a.filter(t => t.type === 'depense').reduce((s, t) => s + t.amount, 0);
    const sumB = b.filter(t => t.type === 'depense').reduce((s, t) => s + t.amount, 0);
    return sumB - sumA;
  });

  container.innerHTML = sortedGroups.map(([catId, tasks]) => {
    const cat      = getCat(catId);
    const catDep   = tasks.filter(t => t.type === 'depense').reduce((s, t) => s + t.amount, 0);
    const catRev   = tasks.filter(t => t.type === 'revenu').reduce((s, t) => s + t.amount, 0);
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
  document.getElementById('recur-id').value       = task?.id || '';
  document.getElementById('recur-label').value    = task?.label || '';
  document.getElementById('recur-amount').value   = task?.amount || '';
  document.getElementById('recur-type').value     = task?.type || 'depense';
  document.getElementById('recur-category').value = task?.category || 'autre';
  document.getElementById('modal-recurring-title').textContent = task ? 'Modifier la récurrence' : 'Nouvelle récurrence';

  modalRecurDays = task ? [...task.days] : [];
  renderDayPicker();

  document.getElementById('modal-recurring').classList.remove('hidden');
  document.getElementById('recur-label').focus();
}

function closeRecurringModal() {
  document.getElementById('modal-recurring').classList.add('hidden');
  modalRecurDays = [];
}

function renderDayPicker() {
  const picker = document.getElementById('day-picker');
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
  const id       = document.getElementById('recur-id').value || generateId();
  const label    = document.getElementById('recur-label').value.trim();
  const amount   = parseAmount(document.getElementById('recur-amount').value);
  const type     = document.getElementById('recur-type').value;
  const category = document.getElementById('recur-category').value;
  const days     = modalRecurDays;

  if (!label) { document.getElementById('recur-label').focus(); return; }
  if (!amount) { document.getElementById('recur-amount').focus(); return; }
  if (days.length === 0) { showToast('Sélectionnez au moins un jour du mois'); return; }

  const task = { id, label, amount, type, category, days };

  const existing = state.recurring.findIndex(t => t.id === id);
  if (existing >= 0) state.recurring[existing] = task;
  else state.recurring.push(task);

  closeRecurringModal();
  renderRecurring();
  renderCalendar();

  try {
    await RDB.save(task);
  } catch {
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

function openAddModal(dateStr, prefill = null) {
  document.getElementById('add-date').value     = dateStr;
  document.getElementById('add-label').value    = prefill?.label    || '';
  document.getElementById('add-amount').value   = prefill?.amount   || '';
  document.getElementById('add-type').value     = prefill?.type     || 'depense';
  document.getElementById('add-category').value = prefill?.category || 'autre';
  document.getElementById('modal-add').classList.remove('hidden');
  document.getElementById('add-label').focus();
}

function closeAddModal() {
  document.getElementById('modal-add').classList.add('hidden');
}

async function saveNewExpense() {
  const date     = document.getElementById('add-date').value;
  const label    = document.getElementById('add-label').value.trim();
  const amount   = parseAmount(document.getElementById('add-amount').value);
  const type     = document.getElementById('add-type').value;
  const category = document.getElementById('add-category').value;

  if (!label || !amount || !date) {
    document.getElementById(label ? 'add-amount' : 'add-label').focus();
    return;
  }

  const expense = { id: generateId(), date, label, amount, type, category };

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
  document.getElementById('import-file').value        = '';
  document.getElementById('import-preview').innerHTML = '';
  document.getElementById('btn-confirm-import').disabled = true;
  document.getElementById('modal-import').classList.remove('hidden');
}

function closeImportModal() {
  document.getElementById('modal-import').classList.add('hidden');
  pendingImport = null;
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    pendingImport = detectAndParseCSV(ev.target.result);
    const preview = document.getElementById('import-preview');

    if (!pendingImport.length) {
      preview.innerHTML = '<p class="import-error">Aucune opération détectée. Vérifiez le format (en-tête requis : Date, Libellé, Montant ou Débit/Crédit).</p>';
      document.getElementById('btn-confirm-import').disabled = true;
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
    document.getElementById('btn-confirm-import').disabled = false;
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
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendu : Vue Objectifs
// ─────────────────────────────────────────────────────────────────────────────

// Montant attendu des récurrences pour une catégorie/mois donnés (overrides inclus)
function recurExpected(categoryId, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
  return state.recurring
    .filter(t => t.category === categoryId && t.type === 'depense')
    .reduce((sum, t) => {
      const ov = getOverride(t.id, ym);
      return sum + (ov ? ov.amount : t.amount) * t.days.filter(d => d <= daysInMonth).length;
    }, 0);
}

function renderGoals() {
  const container = document.getElementById('goals-body');
  const { currentYear } = state;
  const nowMonth = today.getMonth();
  const nowYear  = today.getFullYear();

  const goalCats  = GOAL_CATEGORIES.map(id => getCat(id));
  const tableCats = CATEGORIES.filter(c => c.id !== 'revenus');

  // Ligne de reglage / info des objectifs
  let html = `<div class="goals-settings">`;
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
  html += `</div>`;

  // Tableau annuel — toutes les categories de depenses
  const abbrev = label => label
    .replace('Abonnements', 'Abo.')
    .replace(' Loisirs', ' L.')
    .replace(' Appart', ' A.');

  html += `
    <div class="goals-year-header">${currentYear}</div>
    <div class="goals-year-wrap">
      <table class="goals-year-table">
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
    const monthData = getMonthData(currentYear, m);

    const amounts = tableCats.map(cat =>
      monthData.filter(e => e.type === 'depense' && e.category === cat.id)
               .reduce((s, e) => s + e.amount, 0)
    );

    // Budget planifié : récurrence prioritaire, sinon objectif
    const rowPlanned = tableCats.reduce((s, cat) => {
      const r = recurExpected(cat.id, currentYear, m);
      const g = getGoalForMonth(cat.id, currentYear, m);
      return s + (r > 0 ? r : (g || 0));
    }, 0);

    const rowActual = amounts.reduce((s, a) => s + a, 0);
    const pct       = rowPlanned > 0 ? rowActual / rowPlanned : 0;
    const totalCls  = rowPlanned > 0 ? (pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok') : '';

    html += `<tr${isCurrent ? ' class="cur-row"' : ''}>`;
    html += `<td class="gcell-month">${MONTHS_SHORT[m]}</td>`;

    amounts.forEach((amount, i) => {
      const cat   = tableCats[i];
      const r     = recurExpected(cat.id, currentYear, m);
      const goal  = getGoalForMonth(cat.id, currentYear, m);
      const denom = r > 0 ? r : goal; // dénominateur : récurrence prioritaire, sinon objectif
      let cls = '', display = '', limitStr = '';

      if (r > 0) {
        // Récurrence : montant réel = transactions + récurrence
        const total = amount + r;
        const p = total / r;
        cls     = amount === 0 ? 'ok' : (p >= 1 ? 'over' : p >= 0.8 ? 'warn' : 'ok');
        display = fmtCompact(total);
        limitStr = `<span class="gcell-lim">/${fmtCompact(r)}</span>`;
      } else if (amount > 0) {
        display = fmtCompact(amount);
        if (denom) {
          const p = amount / denom;
          cls = p >= 1 ? 'over' : p >= 0.8 ? 'warn' : 'ok';
          limitStr = `<span class="gcell-lim">/${fmtCompact(denom)}</span>`;
        }
      } else if (goal && !isPast) {
        display = `<span class="gcell-lim">${fmtCompact(goal)}</span>`;
      } else {
        display = '—';
      }

      html += `<td class="gcell-amount ${cls}">${display}${limitStr}</td>`;
    });

    const totalDisplay = rowActual > 0 ? fmtCompact(rowActual) : '—';
    const barWidth     = rowPlanned > 0 ? Math.min(100, pct * 100).toFixed(0) : 0;
    const totalLimStr  = rowPlanned > 0 ? `<span class="gcell-lim">/${fmtCompact(rowPlanned)}</span>` : '';
    html += `<td class="gcell-total">
      <div class="gcell-total-inner">
        <span class="${totalCls}">${totalDisplay}${totalLimStr}</span>
        ${rowPlanned > 0 ? `<div class="goal-bar-wrap gbar-sm"><div class="goal-bar ${totalCls}" style="width:${barWidth}%"></div></div>` : ''}
      </div>
    </td>`;
    html += `</tr>`;
  }

  // Totaux annuels par colonne : réel / planifié (récurrence prioritaire, sinon objectif)
  const colData = tableCats.map(cat => {
    let actual = 0, planned = 0;
    for (let m2 = 0; m2 < 12; m2++) {
      actual += getMonthData(currentYear, m2)
        .filter(e => e.type === 'depense' && e.category === cat.id)
        .reduce((s, e) => s + e.amount, 0);
      const r = recurExpected(cat.id, currentYear, m2);
      const g = getGoalForMonth(cat.id, currentYear, m2);
      planned += r > 0 ? r : (g || 0);
    }
    return { actual, planned };
  });
  const grandActual  = colData.reduce((s, { actual }) => s + actual, 0);
  const grandPlanned = colData.reduce((s, { planned }) => s + planned, 0);

  const tFootCells = colData.map(({ actual, planned }) => {
    const cls = planned > 0 ? (actual >= planned ? 'over' : actual >= planned * 0.8 ? 'warn' : 'ok') : '';
    const lim = planned > 0 ? `<span class="gcell-lim">/${fmtCompact(planned)}</span>` : '';
    return `<td class="gcell-amount ${cls}">${actual > 0 ? fmtCompact(actual) : '—'}${lim}</td>`;
  }).join('');
  const grandCls = grandPlanned > 0 ? (grandActual >= grandPlanned ? 'over' : grandActual >= grandPlanned * 0.8 ? 'warn' : 'ok') : '';
  const grandLim = grandPlanned > 0 ? `<span class="gcell-lim">/${fmtCompact(grandPlanned)}</span>` : '';

  html += `</tbody>
    <tfoot>
      <tr class="goals-foot">
        <td class="gcell-month">Total</td>
        ${tFootCells}
        <td class="gcell-total">
          <div class="gcell-total-inner">
            <span class="${grandCls}">${grandActual > 0 ? fmtCompact(grandActual) : '—'}${grandLim}</span>
          </div>
        </td>
      </tr>
    </tfoot>
  </table></div>`;
  container.innerHTML = html;

  // Evenements
  container.querySelectorAll('.btn-set-goal').forEach(btn => {
    btn.addEventListener('click', () => {
      state.editingGoal = btn.dataset.cat;
      renderGoals();
      const inp = document.getElementById(`goal-input-${btn.dataset.cat}`);
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

async function saveGoal(category) {
  const input = document.getElementById(`goal-input-${category}`);
  if (!input) return;
  const amount = parseAmount(input.value);

  state.editingGoal = null;
  if (!amount) {
    delete state.goals[category];
    renderGoals();
    try { await GoalDB.remove(category); } catch { showToast('Erreur lors de la suppression'); }
    return;
  }

  state.goals[category] = amount;
  renderGoals();
  try {
    await GoalDB.save(category, amount);
  } catch {
    showToast('Erreur lors de la sauvegarde');
  }
}

async function deleteGoal(category) {
  delete state.goals[category];
  renderGoals();

  try {
    await GoalDB.remove(category);
  } catch {
    showToast('Erreur lors de la suppression');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Vue Catégories
// ─────────────────────────────────────────────────────────────────────────────

function renderCategories() {
  const container = document.getElementById('categories-body');

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
  document.getElementById('btn-add-cat').addEventListener('click', addCategory);
  document.getElementById('new-cat-label').addEventListener('keydown', e => { if (e.key === 'Enter') addCategory(); });
  document.getElementById('new-cat-color').addEventListener('input', e => {
    document.getElementById('new-cat-swatch').style.background = e.target.value;
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

function addCategory() {
  const labelInput = document.getElementById('new-cat-label');
  const colorInput = document.getElementById('new-cat-color');
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

  CATEGORIES.push({ id, label, color: colorInput.value });
  CatDB.save(CATEGORIES);
  populateCategoryDropdowns();
  labelInput.value = '';
  renderCategories();
  showToast(`Catégorie « ${label} » ajoutée`);
}

function updateCatColor(id, color) {
  const cat = CATEGORIES.find(c => c.id === id);
  if (!cat || cat.color === color) return;
  cat.color = color;
  CatDB.save(CATEGORIES);
  if (state.view === 'calendar') renderCalendar();
  if (state.view === 'stats')    renderStats();
  if (state.view === 'goals')    renderGoals();
}

function updateCatLabel(id, label) {
  label = label.trim();
  if (!label) { renderCategories(); return; }
  const cat = CATEGORIES.find(c => c.id === id);
  if (!cat || cat.label === label) return;
  cat.label = label;
  CatDB.save(CATEGORIES);
  populateCategoryDropdowns();
  renderCategories();
}

function deleteCategory(id) {
  CATEGORIES = CATEGORIES.filter(c => c.id !== id);
  CatDB.save(CATEGORIES);
  populateCategoryDropdowns();
  renderCategories();
  showToast('Catégorie supprimée');
}

// ─────────────────────────────────────────────────────────────────────────────
// Vues
// ─────────────────────────────────────────────────────────────────────────────

function setView(view) {
  state.view = view;
  ['calendar', 'stats', 'recurring', 'goals', 'categories'].forEach(v => {
    document.getElementById(`view-${v}`).classList.toggle('hidden', view !== v);
    document.getElementById(`btn-view-${v}`).classList.toggle('active', view === v);
    document.getElementById(`btn-view-${v}`).setAttribute('aria-selected', view === v);
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

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  // Sélecteur mois
  const selMonth = document.getElementById('select-month');
  MONTHS.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = m;
    selMonth.appendChild(opt);
  });

  // Sélecteur année
  const selYear = document.getElementById('select-year');
  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 4; y <= thisYear + 2; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    selYear.appendChild(opt);
  }

  // Catégories — charger depuis localStorage si sauvegardé
  const savedCats = CatDB.load();
  if (savedCats && savedCats.length > 0) CATEGORIES = savedCats;
  populateCategoryDropdowns();

  // Navigation
  document.getElementById('prev-month').addEventListener('click', prevMonth);
  document.getElementById('next-month').addEventListener('click', nextMonth);
  document.getElementById('select-month').addEventListener('change', e => {
    state.currentMonth = parseInt(e.target.value);
    closePanel();
  });
  document.getElementById('select-year').addEventListener('change', e => {
    state.currentYear = parseInt(e.target.value);
    closePanel();
  });

  // Raccourcis clavier
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft')  prevMonth();
    if (e.key === 'ArrowRight') nextMonth();
    if (e.key === 'Escape') { closePanel(); closeAddModal(); closeImportModal(); closeRecurringModal(); }
  });

  // Onglets
  document.getElementById('btn-view-calendar').addEventListener('click',    () => setView('calendar'));
  document.getElementById('btn-view-stats').addEventListener('click',       () => setView('stats'));
  document.getElementById('btn-view-recurring').addEventListener('click',   () => setView('recurring'));
  document.getElementById('btn-view-goals').addEventListener('click',       () => setView('goals'));
  document.getElementById('btn-view-categories').addEventListener('click',  () => setView('categories'));

  // Import
  document.getElementById('btn-import').addEventListener('click', openImportModal);
  document.getElementById('modal-import-close').addEventListener('click', closeImportModal);
  document.getElementById('btn-cancel-import').addEventListener('click', closeImportModal);
  document.getElementById('btn-confirm-import').addEventListener('click', confirmImport);
  document.getElementById('import-file').addEventListener('change', handleFileSelect);
  document.getElementById('modal-import').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-import')) closeImportModal();
  });

  // Modal ajout
  document.getElementById('modal-add-close').addEventListener('click', closeAddModal);
  document.getElementById('btn-cancel-add').addEventListener('click', closeAddModal);
  document.getElementById('btn-save-add').addEventListener('click', saveNewExpense);
  document.getElementById('modal-add').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-add')) closeAddModal();
  });
  document.getElementById('add-amount').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNewExpense();
  });
  document.getElementById('add-label').addEventListener('blur', () => {
    const label = document.getElementById('add-label').value;
    const type  = document.getElementById('add-type').value;
    if (label && type === 'depense') {
      document.getElementById('add-category').value = guessCategory(label);
    }
  });
  document.getElementById('add-type').addEventListener('change', e => {
    document.getElementById('add-category').value = e.target.value === 'revenu' ? 'revenus' : 'autre';
  });

  // Modal récurrence
  document.getElementById('modal-recurring-close').addEventListener('click', closeRecurringModal);
  document.getElementById('btn-cancel-recurring').addEventListener('click', closeRecurringModal);
  document.getElementById('btn-save-recurring').addEventListener('click', saveRecurring);
  document.getElementById('modal-recurring').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-recurring')) closeRecurringModal();
  });
  document.getElementById('recur-amount').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveRecurring();
  });
  document.getElementById('recur-type').addEventListener('change', e => {
    document.getElementById('recur-category').value = e.target.value === 'revenu' ? 'revenus' : 'autre';
  });
  document.getElementById('btn-add-recurring').addEventListener('click', () => openRecurringModal());

  // Auth overlay
  document.getElementById('btn-auth-submit').addEventListener('click', submitPin);
  document.getElementById('auth-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPin();
  });

  // Auth gate (production uniquement)
  if (IS_DEPLOYED && !sessionStorage.getItem(AUTH_KEY)) {
    document.getElementById('auth-overlay').classList.remove('hidden');
    return; // le chargement des données sera déclenché après auth réussie
  }

  await loadAndRender();
}

async function loadAndRender() {
  const overlay = document.getElementById('loading-overlay');
  overlay.classList.remove('hidden');
  state.overrides = OverrideDB.load();
  try {
    [state.expenses, state.recurring, state.goals] = await Promise.all([DB.load(), RDB.load(), GoalDB.load()]);
  } catch {
    showToast('Erreur de connexion — mode hors ligne activé');
    state.expenses  = JSON.parse(localStorage.getItem(STORAGE_KEY)   || '[]');
    state.recurring = JSON.parse(localStorage.getItem(RECURRING_KEY) || '[]');
    state.goals     = JSON.parse(localStorage.getItem(GOALS_KEY)     || '{}');
  } finally {
    overlay.classList.add('hidden');
  }
  renderCalendar();
}

async function submitPin() {
  const input = document.getElementById('auth-input');
  const error = document.getElementById('auth-error');
  const btn   = document.getElementById('btn-auth-submit');
  const pin   = input.value.trim();
  if (!pin) { input.focus(); return; }

  btn.disabled = true;
  error.classList.add('hidden');

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      const { token } = await res.json();
      sessionStorage.setItem(AUTH_KEY, token);
      document.getElementById('auth-overlay').classList.add('hidden');
      await loadAndRender();
    } else {
      error.classList.remove('hidden');
      input.value = '';
      input.focus();
    }
  } catch {
    error.textContent = 'Erreur de connexion. Réessayez.';
    error.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', init);
