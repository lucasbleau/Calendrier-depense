# État du projet — Calendrier Budget

> Photographie au **24/10/2026**, prise juste avant la phase de simplification.
> Dernier commit contenant **toutes** les fonctionnalités décrites ici (Planning inclus) : **`361488e`**.
> Pour retrouver le code d'une page retirée : `git show 361488e:app.js`, ou `git checkout 361488e` dans une branche à part.

---

## 1. Vue d'ensemble

Application web de suivi des dépenses et revenus sous forme de **calendrier mensuel**.

- **Stack** : HTML/CSS/JS vanilla, sans build (`index.html`, `style.css`, `app.js` d'environ 2 900 lignes).
- **Deux modes** (`IS_DEPLOYED`) :
  - **local** (`file://` / `localhost`) : tout passe par `localStorage`, sans authentification ;
  - **déployé** (Vercel) : routes serverless dans `api/` et PostgreSQL (Prisma Postgres, driver `pg`).
- **Multi-utilisateurs** en production : identifiant + PIN haché en scrypt, token HMAC dans `x-auth-token`, données isolées par `user_id`.
- **Couche de stockage** : la fabrique `makeStore()` gère les deux modes. Stores : `DB` (opérations), `RDB` (récurrences), `GoalDB`, `CatDB`, `PlanDB`. `OverrideDB` (surcharges mensuelles des récurrences) reste en `localStorage`.

### Éléments transverses (header et modales)

| Élément | Rôle |
|---|---|
| Onglets | Calendrier · Récurrences · Objectifs · Planning · Catégories · Statistiques |
| **Rechercher** (`/`) | Modale de recherche : libellé, catégorie, type, montant min/max |
| **Importer CSV** | Import d'un relevé Crédit Mutuel ou Revolut : détection des colonnes, catégorie devinée par mots-clés (`CATEGORY_KEYWORDS`), aperçu avant import |
| **Déconnexion** | Visible seulement en production |
| Modale « Nouvelle opération » | Libellé, montant, type, catégorie ; catégorie suggérée quand on quitte le champ libellé |
| Modale de confirmation | Utilisée pour les suppressions (catégories) |
| Raccourcis clavier | `←` / `→` changent de mois, `T` revient à aujourd'hui, `/` lance la recherche, `Échap` ferme |

---

## 2. Rôle de chaque page

### Calendrier
**Saisir et visualiser au jour le jour.**
- Grille mensuelle (semaine commençant le lundi). Chaque case affiche le total des dépenses (rouge), celui des revenus (vert) et les récurrences prévues (↺, en italique).
- Plus la dépense du jour est élevée, plus la case est foncée.
- Indicateur dans l'en-tête : dépensé / revenus du mois, coloré selon la somme des objectifs.
- Clic sur un jour : **panneau latéral** avec les opérations (modifier, supprimer), les récurrences du jour (bouton `+` pour créer l'opération liée, avec `recurId`) et un bouton d'ajout.
- Navigation : flèches, sélecteurs mois/année, bouton « Aujourd'hui », légende.

### Récurrences
**Déclarer ce qui revient chaque mois** (loyer, abonnements, salaire…).
- Tâche : libellé, montant, type, catégorie, jours du mois.
- Liste groupée par catégorie, triée par montant. Résumé : dépenses/mois, revenus/mois, solde net.
- Une récurrence apparaît comme rappel ↺ dans le calendrier. Une fois saisie via `+`, l'occurrence est « réalisée » et disparaît des rappels, ce qui évite de la compter deux fois (`realizedRecurDays`).
- Surcharge possible du montant d'un mois précis (`setRecurOverride`, stockée en `localStorage`).

### Objectifs
**Comparer le réel au prévu par catégorie.** Deux sous-onglets :
- **Synthèse** :
  - cartes de réglage par catégorie feuille : objectif **auto** = somme des récurrences du mois (`recurExpected`), qu'une valeur manuelle ✏ remplace ;
  - « mois en avant » : barres réel / prévu par catégorie de premier niveau, les parents se déplient ;
  - tableau annuel (12 mois × catégories), colonne et ligne de totaux ;
  - couleurs : vert < 80 %, orange 80–100 %, rouge > 100 %.
  - Réel = dépenses saisies + récurrences restantes (`recurRemaining`).
- **Détail** : choix d'une catégorie (un parent regroupe ses sous-catégories), bilan mois par mois avec la liste des opérations.

### Planning ❌ *retiré, voir §4*
Calendrier « à peindre » qui servait aux objectifs calculés au jour (tarif €/j × jours).

### Catégories
**Configurer les catégories.**
- Ajout (nom + couleur), renommage sur place, couleur (sélecteur natif).
- **Sous-catégories** (2 niveaux, menu « Parent ») : un parent devient un groupe (badge « groupe · Σ ») qui additionne ses enfants dans Objectifs et Stats.
- Mode d'objectif **Au mois / Au jour** et tarif de base €/j (retirés avec le Planning, voir §4).
- Suppression bloquée pour une catégorie système (`autre`, `revenus`), un parent qui a des enfants ou une catégorie utilisée par des opérations ; une confirmation est demandée.

### Statistiques
**Analyser l'année.**
- KPI annuels (dépenses, revenus, solde, moyenne mensuelle).
- Graphes SVG faits main : barres dépenses/revenus sur 12 mois, courbe du solde, donut par catégorie.
- Classement par catégorie de premier niveau, les parents se déplient (`statsRankHtml`).

---

## 3. Données

```
Expense       { id, date, label, amount, type, category, recurId? }
RecurringTask { id, label, amount, type, category, days[] }
Category      { id, label, color, mode?: 'mois'|'jour', parent? }
Goals         { [categoryId]: montant mensuel manuel }
Plan          { days, rates, overrides }   ← propre au Planning
```

Tables : `users`, `expenses`, `recurring_tasks`, `goals`, `categories`, `plan_days`, `plan_rates`, `plan_rate_overrides`.

---

## 4. Archive : la page Planning (retirée le 24/10/2026)

### Ce qu'elle faisait
Elle permettait des **objectifs dynamiques au jour** pour certaines catégories : par exemple « Dijon Loisirs = 23 €/jour × nombre de jours passés à Dijon dans le mois ». Elle répondait au besoin de vivre entre deux villes (Besançon / Dijon), voir `docs/archive-planning/Jour-besac-dijon.md` et `docs/archive-planning/prix-activité-jour.md`.

**Fonctionnement :**
1. Dans **Catégories**, on passait une catégorie en mode **« Au jour »** (`cat.mode = 'jour'`, `updateCatMode`) et on lui donnait un **tarif de base €/j** (`savePlanBaseRate` → table `plan_rates`).
2. Dans **Planning**, seules les catégories « au jour » apparaissaient sous forme de puces de couleur. On en choisissait une, puis on **peignait les jours au glisser** sur un calendrier (pointer events + `elementFromPoint`, souris et tactile). Repasser sur un jour peint l'effaçait. Plusieurs catégories pouvaient couvrir le même jour (points de couleur).
3. Un glisser = **un seul `POST /api/plan`** `{ add, remove }` au relâchement, avec retour en arrière local et toast en cas d'échec.
4. Une barre au-dessus de la grille donnait le **tarif du mois affiché** : le tarif de base par défaut, modifiable pour ce mois seulement (`savePlanMonthRate` → `plan_rate_overrides`), avec un bouton « ↺ base » (`resetPlanMonthRate`).
5. Un **résumé latéral** affichait `n j × tarif = montant` par catégorie et le total planifié.
6. Le mois était partagé avec le calendrier principal (`state.currentMonth/Year`, flèches clavier actives).

**Effet sur les Objectifs :**
`getGoalForMonth()` renvoyait, pour une catégorie « au jour », `getDynamicGoal()` = `effectiveRate(cat, mois) × planCountInMonth(cat, mois)`, sans repli sur les récurrences ni sur une valeur manuelle. Dans Objectifs, ces catégories avaient une carte `goal-rate-card` (« 23,00€/j · 12 j en Oct ») qui menait au Planning.

**Effet sur les Catégories :**
- sélecteur segmenté « Au mois / Au jour » sur chaque feuille (sauf Revenus) ;
- case « tarif €/j » à droite de la ligne quand le mode était « au jour » ;
- suppression bloquée si la catégorie était utilisée dans le planning (jours peints ou tarif).

### Code concerné (au commit `361488e`)
| Fichier | Éléments |
|---|---|
| `index.html` | onglet `#btn-view-planning`, conteneur `#view-planning > #planning-body` |
| `app.js` | `PLAN_KEY`, `normalizePlan`, `planStore` / `PlanDB`, `state.plan`, helpers `planDates`, `planHasDay`, `planCountInMonth`, `setPlanDayLocal`, `cachePlan`, `planBaseRate`, `planOverride`, `effectiveRate`, `setPlanOverrideLocal`, `getDynamicGoal`, `catMode`, `updateCatMode` ; vue `renderPlanning`, `wirePlanning`, `paintPlanCell`, `endPlanPaint`, `savePlanBaseRate`, `savePlanMonthRate`, `resetPlanMonthRate` ; branches `'jour'` dans `getGoalForMonth`, `renderGoals` et `renderCategories` ; écouteurs `pointerup` / `pointercancel` |
| `style.css` | bloc « Vue Planning » (`.plan-*`), `.goal-rate-card`, `.cat-mode-*`, `.cat-rate-*` |
| `api/plan.js` | GET / POST (batch `add` / `remove` / `rates` / `overrides`), scopé par `user_id` |
| SQL | `migrations/migrate-plan.sql` (`plan_days`, `plan_rates`), `migrations/migrate-plan-overrides.sql`, `migrations/migrate-cat-mode.sql` (colonne `categories.mode`) |

### Ce qui a été conservé pour pouvoir la remettre
- **Back-end intact** : `api/plan.js` et les tables `plan_days`, `plan_rates` et `plan_rate_overrides` restent en place. **Aucune donnée n'a été supprimée.**
- La colonne `categories.mode` reste en base et dans l'API ; le front l'ignore. Une catégorie anciennement « au jour » est simplement traitée comme « au mois » : objectif = récurrences ou valeur manuelle.

### Pour la remettre
1. Récupérer le code front depuis `361488e` (`git show 361488e:app.js`, `index.html`, `style.css`) : vue Planning, helpers, branches `'jour'`.
2. Rebrancher `PlanDB.load()` dans `loadAndRender()` et `state.plan`.
3. Les données (jours peints, tarifs) réapparaîtront telles quelles, puisque le back-end n'a pas bougé.
