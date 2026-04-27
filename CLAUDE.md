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
  - Récurrences du jour en italique avec ↺ (non comptées dans les totaux)
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
- Suppression impossible si catégorie utilisée par des opérations ou si catégorie système (GOAL_CATEGORIES)

### Vue Statistiques

- KPI mois courant : total dépenses, total revenus, solde, comparaison % vs mois précédent
- KPI année : total dépenses, total revenus, solde annuel
- Bar chart 12 mois (dépenses/revenus de l'année courante)
- Donut de répartition par catégorie pour le mois courant + liste détaillée avec pourcentages

### Vue Récurrences

- Créer/modifier/supprimer des tâches récurrentes (loyer, Netflix, salaire...)
- Chaque tâche : libellé, montant, type, catégorie, jours du mois (ex : 1er et 15)
- Les récurrences apparaissent dans le calendrier comme rappels (↺ montant) mais ne sont **pas** comptées dans les statistiques tant qu'elles ne sont pas saisies manuellement
- Depuis le panneau jour : bouton `+` pour créer une opération pré-remplie depuis la récurrence
- **Affichage groupé** par catégorie, trié par montant décroissant dans chaque groupe
- **Bandeau résumé** en haut à droite : total dépenses/mois, total revenus/mois, solde net

### Vue Objectifs

- Tableau annuel (12 mois × toutes catégories de dépenses) avec colonne Total
- **Plafonds mensuels calculés dynamiquement** pour 4 catégories d'après `CITY_DAYS` × `DAILY_RATES` :
  - Courses : 8,50 €/j à Besançon
  - Essence : 4 €/j à Besançon
  - Dijon Loisirs : 23 €/j à Dijon
  - Dijon Appart : 22,80 €/j à Dijon
- Besac Loisirs : objectif manuel (édition inline ✏)
- **Logique d'affichage par cellule** :
  - Si dépense réelle > 0 : `réel/dénominateur` (dénominateur = récurrence prévue > objectif > rien)
  - Si dépense = 0 et récurrence prévue > 0 : `↺prévu/prévu` (mois passé en style atténué, mois futur/courant normal)
  - Si dépense = 0 et pas de récurrence, mois futur : affiche l'objectif seul
  - Sinon : `—`
  - Colorisation : vert < 80 % du dénominateur, orange 80–100 %, rouge ≥ 100 %
- **Colonne Total** : `réel / planifié` où planifié = Σ(récurrence ou objectif par catégorie)
  - Barre de progression colorée
- **Ligne de pied (tfoot)** : totaux annuels réel / planifié par colonne + grand total
- Séparateur visuel entre dernière catégorie et colonne Total
- Sources : `Jour-besac-dijon.md` (jours par ville), `prix-activité-jour.md` (tarifs)

### Vue Catégories

- Liste toutes les catégories avec swatch couleur + label éditable inline
- **Modifier la couleur** : clic sur le rond → color picker natif (mise à jour en live)
- **Modifier le nom** : clic sur le texte, édition directe, confirmation au blur ou Entrée
- **Ajouter** : formulaire en haut (nom + couleur), Entrée ou bouton `+ Ajouter`
- **Supprimer** : ✕ actif uniquement si catégorie non système et non utilisée par des opérations
- Modifications propagées instantanément aux dropdowns des modals

### Authentification

- Overlay de code d'accès (PIN) à l'ouverture du site en production
- PIN vérifié côté serveur (`APP_PIN` env var) — jamais exposé dans le JS client
- Token renvoyé par `/api/auth` et stocké en `sessionStorage` ; envoyé via `x-auth-token` sur toutes les requêtes API
- Toutes les routes API vérifient ce token (`APP_TOKEN` env var) → 401 si absent/invalide
- En local (`file://` ou `localhost`) : aucune auth, l'overlay n'est jamais affiché

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
  auth.js       — POST /api/auth : vérifie APP_PIN, renvoie APP_TOKEN
  expenses.js   — GET / POST / DELETE : table expenses
  recurring.js  — GET / POST / DELETE : table recurring_tasks
  goals.js      — GET / POST / DELETE : table goals
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
};

type Goals = Record<string, number>; // category → limite mensuelle en €
```

### Constantes clés (app.js)

| Constante | Rôle |
|---|---|
| `let CATEGORIES` | Liste courante des catégories (initialisée depuis défauts, surchargeable via CatDB) |
| `GOAL_CATEGORIES` | IDs des catégories suivies dans la vue Objectifs (hardcodé) |
| `CITY_DAYS` | Jours par mois à Besançon/Dijon pour l'année en cours |
| `DAILY_RATES` | Tarif journalier par catégorie et ville |
| `CATEGORY_KEYWORDS` | Mots-clés pour l'auto-détection de catégorie à l'import CSV |

### Clés localStorage

| Clé | Contenu |
|---|---|
| `expense-calendar-data-v1` | `Expense[]` |
| `expense-calendar-recurring-v1` | `RecurringTask[]` |
| `expense-calendar-goals-v1` | `Goals` |
| `expense-calendar-categories-v1` | `Category[]` (si modifié, sinon défauts hardcodés) |
| `expense-calendar-auth-v1` | Token d'auth (sessionStorage) |

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
expenses        — id, date, label, amount, type, category, created_at
recurring_tasks — id, label, amount, type, category, days (JSON), created_at
goals           — category (PK), amount, updated_at
```

## Déploiement

### Architecture

```
Browser → /api/auth         → vérifie APP_PIN, renvoie APP_TOKEN
Browser → /api/expenses     → Postgres (expenses)       ← token requis
Browser → /api/recurring    → Postgres (recurring_tasks) ← token requis
Browser → /api/goals        → Postgres (goals)           ← token requis
```

### Variables d'environnement Vercel

| Variable      | Description                                                |
|---------------|------------------------------------------------------------|
| `POSTGRES_URL` | URL de connexion Postgres (`postgresql://...`)            |
| `APP_PIN`     | Code saisi par l'utilisateur pour accéder au site         |
| `APP_TOKEN`   | Secret interne envoyé avec chaque requête API (générer une chaîne aléatoire longue) |

> Si `APP_PIN` / `APP_TOKEN` ne sont pas définis : l'auth est désactivée (tout token accepté). Définir les deux pour activer la protection.

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
- **Catégories** : toujours lire depuis `CATEGORIES` (variable `let`, peut être surchargée par CatDB), jamais hardcoder un id de catégorie sauf dans `GOAL_CATEGORIES`

## Hors scope

- Gestion multi-utilisateur (authentification forte, sessions, rôles)
- Conseils financiers automatisés ou prévisions IA
- Intégration directe avec les API bancaires (DSP2, Bridge, Powens)
- Gestion d'investissements (PEA, actions, crypto)

## Contexte utilisateur

Apprenti dev (CI/CD, Python, Docker), utilisateur de Crédit Mutuel et Revolut. Préférence forte pour les outputs concis, actionnables, en français, avec un design soigné (typographie sérif élégante, palette terreuse, pas de gradients génériques violet/bleu).
