# CLAUDE.md — Calendrier de dépenses dynamique

## Contexte projet

Application web personnelle de suivi de dépenses au format calendrier mensuel/annuel. Outil destiné à un usage personnel (utilisateur unique, pas de multi-compte). Déployée sur Vercel, repo GitHub : github.com/lucasbleau/Calendrier-depense.

## Objectif fonctionnel

Visualiser, saisir et analyser les dépenses et revenus quotidiens via une interface calendrier interactive. L'utilisateur navigue mois par mois, voit instantanément où l'argent part, et identifie les tendances via des stats agrégées.

## Spécifications fonctionnelles

### Vue Calendrier

- Grille mensuelle classique (semaine commençant lundi)
- Navigation : flèches précédent/suivant + sélecteurs mois/année
- Chaque cellule jour affiche :
  - Numéro du jour
  - Total dépenses du jour (rouge) + total revenus (vert)
  - Récurrences du jour en italique avec ↺ (masquées si déjà saisies comme opération liée)
  - Indicateur si plusieurs opérations
- Code couleur d'intensité : la cellule s'assombrit proportionnellement au montant dépensé (max du mois = référence)
- Mise en évidence du jour courant
- Clic sur un jour → panneau détail : liste des opérations + section récurrences du jour + bouton ajouter/supprimer
- Indicateur mensuel en-tête : total dépenses réelles / total objectifs (toutes catégories avec objectif défini)

### Saisie des dépenses

Deux modes complémentaires :

1. **Saisie manuelle** via modal au clic sur un jour
   - Champs : libellé, montant, catégorie, type (dépense/revenu)
   - Auto-suggestion catégorie sur blur du champ libellé
2. **Import CSV** avec détection automatique du format
   - Compatible Crédit Mutuel et Revolut
   - Auto-détection des colonnes (date, libellé, montant, débit/crédit)
   - Catégorisation automatique par mots-clés

### Catégories

- Liste dynamique, éditable dans l'onglet **Catégories**
- Défauts : Courses, Voiture, Essence, Appart, Abonnements, Loisirs, Dijon Loisirs, Dijon Appart, Besac Loisirs, Épargne, Revenus, Autre
- Chaque catégorie : `id` (slug généré), `label`, `color` (hex)
- Persistance : `localStorage` clé `expense-calendar-categories-v1` (config utilisateur, pas sync serveur)
- Suppression impossible si catégorie utilisée par des opérations, présente dans le Planning (jours ou tarif), ou système (`autre`, `revenus`)

### Vue Statistiques

- KPI mois courant : total dépenses, total revenus, solde, comparaison % vs mois précédent
- KPI année : total dépenses, total revenus, solde annuel
- Bar chart 12 mois (dépenses/revenus de l'année courante)
- Donut de répartition par catégorie + liste détaillée avec pourcentages, **regroupée par catégorie de premier niveau** (un parent agrège ses sous-catégories) ; chaque parent est **dépliable** (`state.statsExpanded`) pour voir ses sous-catégories + la part « directe » du parent (`statsRankHtml`)

### Vue Récurrences

- Créer/modifier/supprimer des tâches récurrentes (loyer, Netflix, salaire...)
- Chaque tâche : libellé, montant, type, catégorie, jours du mois (ex : 1er et 15)
- Les récurrences apparaissent dans le calendrier comme rappels (↺ montant)
- Depuis le panneau jour : bouton `+` pour créer une opération pré-remplie depuis la récurrence
- **Règle anti-double-comptage** : l'opération créée via `+` garde l'id de sa récurrence (`recurId`, colonne `recur_id` en DB). Une occurrence « réalisée » (opération liée dans le mois, affectée à l'occurrence la plus proche) disparaît des rappels ↺ et des totaux « réels » (`recurRemaining`, `recurMonthTotal`, `getRecurringForDay`). Le « prévu » des Objectifs (`recurExpected`) compte en revanche **toutes** les occurrences — le dénominateur ne bouge pas quand on saisit.
- **Affichage groupé** par catégorie, trié par montant décroissant dans chaque groupe
- **Bandeau résumé** en haut à droite : total dépenses/mois, total revenus/mois, solde net

### Vue Objectifs

- Tableau annuel (12 mois × toutes catégories de dépenses) avec colonne Total
- **Objectif « effectif » d'une catégorie feuille** (`getGoalForMonth`, réglé selon `catMode`) :
  - **« au jour »** (`mode: 'jour'`) : plafond dynamique (`getDynamicGoal`) = tarif effectif du mois (base ou surcharge) × jours peints dans le Planning. Carte de réglage cliquable renvoyant vers Planning. Pas de repli sur les récurrences.
  - **« au mois »** (`mode: 'mois'`, défaut) : **objectif auto = somme des récurrences du mois** (`recurExpected`) ; une **valeur manuelle** (✏, `state.goals`) **remplace tout** (même si inférieure aux récurrences — plus de `max()`). La carte affiche le montant auto avec un tag « auto » quand aucun manuel n'est fixé.
- **Logique d'affichage par cellule** (`catFigures`) : réel = dépenses saisies + récurrences restantes (`recurRemaining`) ; dénominateur = objectif effectif (`getGoalForMonth`). Colorisation : vert < 80 % du dénominateur, orange 80–100 %, rouge ≥ 100 %.
- **Colonne Total** : `réel / planifié` où planifié = Σ objectifs effectifs par catégorie
  - Barre de progression colorée
- **Ligne de pied (tfoot)** : totaux annuels réel / planifié par colonne + grand total
- Séparateur visuel entre dernière catégorie et colonne Total
- **Regroupement par sous-catégories** : les colonnes du tableau et la liste « mois en avant » sont par catégorie de **premier niveau** (`tableCats = topLevelExpenseCats()`), agrégées via `groupFigures` (somme d'elle-même + de ses sous-catégories, chacune avec ses dépenses et son objectif effectif). Dans « mois en avant », un parent est **dépliable** (caret, `state.goalsExpanded`) pour voir le détail de ses sous-catégories. Les cartes de réglage restent par feuille, préfixées « Parent › Enfant ».
- **Sous-page Détail** (`renderGoalsDetail`) : puces ordonnées hiérarchiquement (enfants ↳ indentés). Sélectionner un **parent** agrège toute sa famille (`familyIds`) — total et opérations mois par mois, chaque ligne annotée de sa sous-catégorie (badge « total sous-catégories »). Sélectionner une feuille n'affiche qu'elle.

### Vue Planning

- **Seules les catégories « au jour »** (`mode: 'jour'`, réglé dans Catégories) apparaissent ici. Si aucune, un message invite à en marquer une « au jour ».
- **Calendrier interactif** type réservation : on choisit une catégorie (chips colorées) puis on **peint au glisser** (souris ou tactile, pointer events + `elementFromPoint`) les jours où elle s'applique ; re-glisser sur des jours peints les efface. Plusieurs catégories peuvent couvrir le même jour (points colorés dans les cellules).
- **Tarif de base** €/j réglé dans l'onglet **Catégories** (`plan_rates`, un par catégorie). La barre au-dessus de la grille affiche le **tarif du mois affiché** : par défaut le tarif de base, surchargeable pour ce mois-là uniquement (bouton **↺ base** pour revenir au tarif de base). Voir `effectiveRate` (surcharge `plan_rate_overrides` sinon base) et `savePlanMonthRate` / `resetPlanMonthRate`.
- Objectif mensuel auto = `tarif effectif du mois × jours peints`, consommé par la vue Objectifs via `getDynamicGoal`. Sans tarif : les jours sont mémorisés mais aucun objectif calculé.
- **Résumé latéral** du mois : `n j × tarif = montant` par catégorie peinte + total planifié.
- Navigation mois partagée avec le calendrier principal (`state.currentMonth/Year`, flèches clavier actives).
- Un glisser = un batch : les jours ajoutés/retirés sont envoyés en une seule requête `POST /api/plan` au relâchement (rollback local + toast si échec).
- Aucun seed automatique : chaque compte part d'un planning vide et le remplit à la main (le seed initial « budgets ville » de l'owner a été retiré).

### Vue Catégories

- Liste toutes les catégories avec swatch couleur + label éditable inline
- **Modifier la couleur** : clic sur le rond → color picker natif (mise à jour en live)
- **Modifier le nom** : clic sur le texte, édition directe, confirmation au blur ou Entrée
- **Type d'objectif** (`catMode`) : sélecteur segmenté par catégorie **Au mois** / **Au jour** (`updateCatMode`, champ `mode` persisté). « Au jour » fait apparaître la catégorie dans le Planning ; « au mois » = objectif fixe. Défaut `mois`. Pas de sélecteur sur la catégorie Revenus.
- **Tarif de base €/j** (`savePlanBaseRate` → `plan_rates`) : champ inline affiché sur la ligne quand la catégorie est « au jour ». C'est le tarif proposé par défaut à chaque mois dans le Planning (surchargeable par mois là-bas).
- **Sous-catégories** (hiérarchie 2 niveaux, champ `parent`, `updateCatParent`) : menu « Parent » par catégorie pour la rattacher à une catégorie de premier niveau. Affichage hiérarchique (enfants indentés ↳ sous leur parent). Une catégorie ayant des enfants devient un **groupe** (badge « groupe · Σ ») : pas de config d'objectif propre, elle agrège ses sous-catégories (+ ses dépenses directes) dans Objectifs et Stats. Un parent n'est pas supprimable tant qu'il a des enfants (helpers `childrenOf`, `isParent`, `topLevelExpenseCats`, `familyIds`).
- **Ajouter** : formulaire en haut (nom + couleur), Entrée ou bouton `+ Ajouter` (nouvelle catégorie créée en `mode: 'mois'`)
- **Supprimer** : ✕ actif uniquement si catégorie non système, non utilisée par des opérations et non présente dans le planning (jours/tarif d'une catégorie « au jour »)
- Modifications propagées instantanément aux dropdowns des modals

### Authentification (multi-utilisateurs)

- **Comptes** : chaque utilisateur a un compte `username` + `PIN` (4-6 chiffres). Overlay de connexion/inscription à l'ouverture en production.
- **Inscription libre** : n'importe qui avec l'URL peut créer un compte (`POST /api/auth {action:'register'}`).
- **Sécurité** : PIN haché en **scrypt** (sel par utilisateur) côté serveur — jamais stocké en clair. Verrou anti-bruteforce (15 min après 5 échecs).
- **Token** : `/api/auth` renvoie un **token signé HMAC** (`base64url(payload).signature`) encodant l'`user_id` + expiration (30 j). Secret serveur `APP_TOKEN_SECRET`. Stocké en `sessionStorage` (clé `AUTH_KEY`), username en `USER_KEY`. Envoyé via `x-auth-token`.
- **Isolation des données (critique)** : `withDb` (`api/_lib.js`) extrait l'`user_id` du token vérifié et le passe à chaque route. **Toutes** les requêtes sont filtrées par `user_id` (WHERE + INSERT + `UPDATE/DELETE … WHERE id=$ AND user_id=$`). L'`user_id` ne vient jamais du body/query. Un utilisateur ne peut ni lire ni modifier les données d'un autre, même en forgeant un id.
- **Catégories par compte** : isolées par `user_id` (PK composite `(user_id, id)`). À l'inscription, seules **2 catégories structurelles** sont seedées (`Revenus`, `Autre`) — les nouveaux comptes partent neutres et créent les leurs.
- **Aucun compte privilégié** : tous les comptes sont équivalents (plafonds dynamiques via Planning, objectifs manuels, catégories). Il n'y a plus de compte « propriétaire » ni de config personnelle hardcodée.
- **Cache hors-ligne** : cloisonné par compte via `userCacheKey()` (suffixe `:username`) pour éviter toute fuite inter-comptes sur un appareil partagé.
- **Déconnexion** : bouton header → vide `sessionStorage` et recharge.
- En local (`file://` ou `localhost`) : aucune auth, mono-utilisateur localStorage, overlay jamais affiché.

## Spécifications techniques

### Stack actuelle

- **Vanilla HTML/CSS/JS** — aucun build step, fonctionne en ouvrant `index.html` directement
- Chart.js 4.4 via CDN (graphiques bar + donut)
- `localStorage` pour la persistance en local (`file://` ou `localhost`)
- `pg` ^8.13.0 (driver PostgreSQL standard) pour la persistance en production via Vercel Serverless
- Polices : Fraunces (display) + JetBrains Mono (chiffres) + Inter (body) via Google Fonts

### Fichiers

```
index.html      — structure HTML + liens scripts/styles
style.css       — design complet (palette terreuse, responsive)
app.js          — logique applicative complète
package.json    — dépendance pg + engines.node 20.x
schema.sql      — migrations à exécuter une fois dans la base Postgres
.gitignore
api/
  _lib.js       — pool pg, withDb (CORS+auth+user_id), tokens signés, hachage PIN scrypt, catégories par défaut
  auth.js       — POST /api/auth : register / login (username + PIN), renvoie token signé
  expenses.js   — GET / POST / PUT / DELETE : table expenses (scopée user_id)
  recurring.js  — GET / POST / DELETE : table recurring_tasks (scopée user_id)
  goals.js      — GET / POST / DELETE : table goals (scopée user_id)
  categories.js — GET / POST / DELETE : table categories (scopée user_id, champ mode inclus)
  plan.js       — GET / POST : tables plan_days + plan_rates + plan_rate_overrides (scopées user_id, POST batch add/remove/rates/overrides)
```

### Modèle de données

```ts
type Expense = {
  id: string;            // unique, généré côté client
  date: string;          // YYYY-MM-DD
  label: string;
  amount: number;        // valeur absolue, toujours positive
  type: 'depense' | 'revenu';
  category: string;      // id de catégorie
  recurId?: string;      // id de la récurrence source si créée via « + » (anti double comptage)
};

type RecurringTask = {
  id: string;
  label: string;
  amount: number;
  type: 'depense' | 'revenu';
  category: string;
  days: number[];        // ex: [1, 15] = 1er et 15 du mois
};

type Category = {
  id: string;            // slug généré depuis le label
  label: string;
  color: string;         // couleur hex
  mode?: 'mois' | 'jour'; // objectif fixe mensuel (défaut) ou tarif €/j via Planning
  parent?: string;        // id de la catégorie parent si sous-catégorie (2 niveaux max)
};

type Goals = Record<string, number>; // category → limite mensuelle en €

type Plan = {
  days:      Record<string, string[]>;             // category → dates YYYY-MM-DD « peintes »
  rates:     Record<string, number>;               // category → tarif de base €/jour
  overrides: Record<string, Record<string, number>>; // category → { 'YYYY-MM' → tarif surchargé ce mois }
};
// Objectif d'un mois = (override[cat][ym] ?? rates[cat]) × jours peints ce mois-là
```

### Constantes clés (app.js)

| Constante | Rôle |
|---|---|
| `let CATEGORIES` | Liste courante des catégories (initialisée depuis défauts, surchargeable via CatDB) |
| `CATEGORY_KEYWORDS` | Mots-clés pour l'auto-détection de catégorie à l'import CSV |

### Clés localStorage

| Clé | Contenu |
|---|---|
| `expense-calendar-data-v1` | `Expense[]` |
| `expense-calendar-recurring-v1` | `RecurringTask[]` |
| `expense-calendar-goals-v1` | `Goals` |
| `expense-calendar-plan-v1` | `Plan` (jours peints + tarifs de la vue Planning) |
| `expense-calendar-categories-v1` | `Category[]` (si modifié, sinon défauts hardcodés) |
| `expense-calendar-auth-v1` | Token d'auth signé (sessionStorage) |
| `expense-calendar-user-v1` | Username du compte connecté (sessionStorage) |

> En mode déployé, les caches hors-ligne de données sont suffixés par `:username` (cloisonnement par compte).

### Conventions UI

- Localisation FR (mois, jours, libellés)
- Format monétaire : `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })` via `fmtEUR()`
- Format compact pour les cellules calendrier : `123,50€`, `1,2k€` via `fmtCompact()` (aucun arrondi)
- Parsing des nombres tolérant : virgule ou point décimal, symbole € optionnel, via `parseAmount()`
- Parsing des dates tolérant : `DD/MM/YYYY`, `YYYY-MM-DD`, séparateurs `/`, `-`, `.` via `parseDate()`

### Persistance

Deux modes détectés automatiquement (`IS_DEPLOYED` dans `app.js`) :

- **Local (`file://` ou `localhost`)** : `localStorage` — aucune dépendance réseau, aucune auth
- **Déployé sur Vercel** : appels via `apiFetch()` → `/api/*` → Postgres via `pg`

`apiFetch()` injecte automatiquement le header `x-auth-token` sur toutes les requêtes API.

La base est une **Prisma Postgres** (`db.prisma.io:5432`) accessible via `POSTGRES_URL`. Le driver `pg` est utilisé avec `ssl: { rejectUnauthorized: false }`.

Les **catégories** sont toujours en localStorage (même en mode déployé) car c'est de la configuration utilisateur, pas des données financières.

### Tables SQL (cf. `schema.sql`)

```sql
users           — id (PK), username, username_lc (unique), pin_hash, pin_salt, failed_count, locked_until, created_at
expenses        — id (PK), user_id, date, label, amount, type, category, recur_id (FK recurring_tasks, SET NULL), created_at
recurring_tasks — id (PK), user_id, label, amount, type, category, days (JSON), created_at
goals           — (user_id, category) PK, amount, updated_at
categories      — (user_id, id) PK, label, color, mode ('mois'|'jour'), parent (FK self, SET NULL), created_at
plan_days       — (user_id, category, date) PK — jours peints (vue Planning), FK categories CASCADE
plan_rates      — (user_id, category) PK, rate, updated_at — tarif de base €/jour, FK categories CASCADE
plan_rate_overrides — (user_id, category, ym) PK, rate, updated_at — tarif surchargé pour un mois, FK categories CASCADE
```

> Migration mono→multi-user : `migrate-multiuser-1.sql` (schéma) puis `migrate-multiuser-2.sql` (rattache les données existantes à un compte + finalise les PK/FK composites). `schema.sql` part directement en multi-user pour une installation neuve. Base existante : exécuter aussi `migrate-recur-link.sql` (colonne `recur_id` sur `expenses`), `migrate-plan.sql` (tables `plan_days`/`plan_rates`), `migrate-cat-mode.sql` (colonne `mode` sur `categories`), `migrate-plan-overrides.sql` (table `plan_rate_overrides`) et `migrate-cat-parent.sql` (colonne `parent` + FK auto-référente sur `categories`).

## Déploiement

### Architecture

```
Browser → /api/auth         → register/login, renvoie un token signé (user_id)
Browser → /api/expenses     → Postgres (expenses WHERE user_id)       ← token requis
Browser → /api/recurring    → Postgres (recurring_tasks WHERE user_id) ← token requis
Browser → /api/goals        → Postgres (goals WHERE user_id)           ← token requis
Browser → /api/categories   → Postgres (categories WHERE user_id)      ← token requis
Browser → /api/plan         → Postgres (plan_days + plan_rates WHERE user_id) ← token requis
```

### Variables d'environnement Vercel

| Variable           | Description                                                |
|--------------------|------------------------------------------------------------|
| `POSTGRES_URL`     | URL de connexion Postgres (`postgresql://...`)            |
| `APP_TOKEN_SECRET` | Secret de signature des tokens (chaîne aléatoire longue). **Obligatoire** en prod. |

> `APP_PIN` / `APP_TOKEN` (ancien système mono-utilisateur) ne sont plus utilisés.
> Si `APP_TOKEN_SECRET` n'est pas défini, un secret de dev par défaut est utilisé (à ne pas laisser en prod).

### Structure du projet

```
/
├── index.html
├── style.css
├── app.js
├── package.json
├── schema.sql
├── .gitignore
├── CLAUDE.md
└── api/
    ├── auth.js
    ├── expenses.js
    ├── recurring.js
    └── goals.js
```

### Procédure de déploiement initial

1. **Créer le repo GitHub** et pousser le code
2. **Importer sur Vercel** — framework "Other", déployer
3. **Ajouter une base Postgres** (Vercel Storage → Postgres Neon ou Prisma Postgres externe)
   - Définir `POSTGRES_URL` dans les env vars Vercel
4. **Créer les tables** — coller `schema.sql` dans l'onglet Query de la base
5. **Définir `APP_PIN` et `APP_TOKEN`** dans les env vars Vercel (Settings → Environment Variables)
6. **Redéployer** (`git push` ou bouton Redeploy)

> Le repo doit être **public** sur GitHub pour que le déploiement continu fonctionne sur un plan Vercel Hobby (limitation des comptes Équipe).

## Roadmap / évolutions possibles

- **Vue heatmap annuelle** style GitHub contributions
- **Export** : CSV, Excel, PDF mensuel récapitulatif
- **Dépenses prévisionnelles** : distinction dépenses passées / planifiées
- **Filtres** : par catégorie, par plage de montants, par mots-clés
- **Multi-comptes** : ventiler entre compte courant, PEA, etc.
- **Règles de catégorisation** : mappings mot-clé → catégorie personnalisables
- **PWA** : installation mobile, fonctionnement offline
- **Tests** : Vitest pour la logique de parsing CSV et les calculs d'agrégation

## Conventions de code à respecter

- Logique métier extraite en fonctions pures (`parseCSV`, `guessCategory`, `fmtEUR`, `sumByType`, etc.)
- Accessibilité : labels explicites, navigation clavier sur les boutons et la grille calendrier
- Format monétaire et dates toujours via les helpers — ne jamais réimplémenter inline
- Pas de commentaires sauf si le WHY est non-évident
- Dual-mode storage : toujours vérifier `IS_DEPLOYED` avant tout appel réseau ou accès localStorage
- **Catégories** : toujours lire depuis `CATEGORIES` (variable `let`, peut être surchargée par CatDB), jamais hardcoder un id de catégorie sauf `DEFAULT_CATEGORY` et `INCOME_CATEGORY`

## Hors scope

- Authentification forte (2FA, OAuth, rôles/admin) — l'auth actuelle est username + PIN haché, suffisante pour un cercle de confiance
- Conseils financiers automatisés ou prévisions IA
- Intégration directe avec les API bancaires (DSP2, Bridge, Powens)
- Gestion d'investissements (PEA, actions, crypto)

## Contexte utilisateur

Apprenti dev (CI/CD, Python, Docker), utilisateur de Crédit Mutuel et Revolut. Préférence forte pour les outputs concis, actionnables, en français, avec un design soigné (typographie sérif élégante, palette terreuse, pas de gradients génériques violet/bleu).
