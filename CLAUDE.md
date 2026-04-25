# CLAUDE.md — Calendrier de dépenses dynamique

## Contexte projet

Application web personnelle de suivi de dépenses au format calendrier mensuel/annuel. Outil destiné à un usage personnel (utilisateur unique, pas de multi-compte). Stack actuelle : composant React mono-fichier (artifact Claude.ai), à faire évoluer vers une vraie application web autonome.

## Objectif fonctionnel

Visualiser, saisir et analyser les dépenses et revenus quotidiens via une interface calendrier interactive. L'utilisateur navigue mois par mois, voit instantanément où l'argent part, et identifie les tendances via des stats agrégées.

## Spécifications fonctionnelles

### Vue calendrier

- Grille mensuelle classique (semaine commençant lundi)
- Navigation : flèches précédent/suivant + sélecteurs mois/année
- Chaque cellule jour affiche :
  - Numéro du jour
  - Total dépenses du jour (rouge)
  - Total revenus du jour (vert)
  - Indicateur si plusieurs opérations
- Code couleur d'intensité : la cellule s'assombrit proportionnellement au montant dépensé (max du mois = référence)
- Mise en évidence du jour courant
- Clic sur un jour → panneau détail avec liste complète des opérations + bouton ajouter/supprimer

### Saisie des dépenses

Deux modes complémentaires :

1. **Saisie manuelle** via modal au clic sur un jour
   - Champs : libellé, montant, catégorie, type (dépense/revenu)
2. **Import CSV** avec détection automatique du format
   - Compatible Crédit Mutuel et Revolut
   - Auto-détection des colonnes (date, libellé, montant, débit/crédit)
   - Catégorisation automatique par mots-clés (Carrefour → Courses, Total → Essence, Netflix → Abonnements, etc.)

### Catégories

Liste fixe avec code couleur dédié :
Courses, Voiture, Essence, Appart, Abonnements, Loisirs, Santé, Revenus, Autre.

### Vue statistiques

- KPI mois courant : total dépenses, total revenus, solde, comparaison % vs mois précédent
- KPI année : total dépenses, total revenus, solde annuel
- Bar chart 12 mois (dépenses/revenus de l'année courante)
- Donut de répartition par catégorie pour le mois courant + liste détaillée avec pourcentages

## Spécifications techniques

### Stack actuelle

- **Vanilla HTML/CSS/JS** — aucun build step, fonctionne en ouvrant `index.html` directement
- Chart.js 4.4 via CDN (graphiques bar + donut)
- `localStorage` pour la persistance (clé : `expense-calendar-data-v1`)
- Polices : Fraunces (display) + JetBrains Mono (chiffres) + Inter (body) via Google Fonts

### Fichiers

```
index.html   — structure HTML + liens scripts/styles
style.css    — design complet (palette terreuse, responsive)
app.js       — logique applicative complète
```

### Stack originale (référence, non implémentée)

La spec initiale prévoyait React + Tailwind + Recharts + Lucide-react.
Migrer vers React/Vite reste possible : toute la logique métier (`parseCSV`, `guessCategory`, `fmtEUR`, `sumByType`, etc.) est extraite en fonctions pures facilement importables.

### Modèle de données

```ts
type Expense = {
  id: string;            // unique, généré côté client
  date: string;          // YYYY-MM-DD
  label: string;         // libellé libre
  amount: number;        // valeur absolue, toujours positive
  type: 'depense' | 'revenu';
  category: string;      // id de catégorie (cf. liste fixe)
};
```

Toutes les données sont stockées sous forme de tableau `Expense[]` sérialisé en JSON dans `localStorage`.

### Conventions UI

- Localisation FR (mois, jours, libellés)
- Format monétaire : `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })` via `fmtEUR()`
- Format compact pour l'affichage dans les cellules : `123€`, `1.2k€` via `fmtCompact()`
- Parsing des nombres tolérant : virgule ou point décimal, symbole € optionnel, via `parseAmount()`
- Parsing des dates tolérant : `DD/MM/YYYY`, `YYYY-MM-DD`, séparateurs `/`, `-`, `.` via `parseDate()`

### Persistance actuelle — localStorage

Les données sont un tableau `Expense[]` sérialisé en JSON dans `localStorage` (clé `expense-calendar-data-v1`).

**Conséquences pour le déploiement :**
- Les données sont **locales au navigateur** de la machine — pas de sync multi-device.
- Si l'app est déployée sur un hébergeur statique (Vercel, Netlify, GitHub Pages), chaque utilisateur/navigateur a ses propres données.
- Vider le cache ou changer de navigateur = données perdues.
- **Pour synchro multi-device :** voir roadmap — migration vers Supabase (Postgres hébergé) ou SQLite + API REST.

## Déploiement

### Architecture déployée

```
Browser → /api/expenses (Vercel Serverless Function) → Vercel Postgres (Neon)
```

- En local (`file://` ou `localhost`) : l'app utilise automatiquement `localStorage`
- Déployé sur Vercel : l'app appelle `/api/expenses` → base Postgres

### Structure du projet

```
/
├── index.html
├── style.css
├── app.js
├── package.json          ← dépendance @vercel/postgres
├── schema.sql            ← migration à exécuter une fois dans Vercel Postgres
├── .gitignore
└── api/
    └── expenses.js       ← serverless function (GET / POST / DELETE)
```

### Procédure de déploiement (à faire une fois)

**1. Créer le repo GitHub**
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/TON_USER/calendrier-budget.git
git push -u origin main
```

**2. Importer sur Vercel**
- Aller sur vercel.com → "Add New Project" → importer le repo GitHub
- Framework : laisser sur "Other"
- Cliquer Deploy (le premier déploiement sera sans base, c'est normal)

**3. Ajouter Vercel Postgres**
- Dans le dashboard Vercel du projet → onglet "Storage" → "Create Database" → "Postgres"
- Nommer la base `calendrier-budget` → Create
- Vercel injecte automatiquement `POSTGRES_URL` dans les env vars de la fonction

**4. Créer la table**
- Dans Vercel → Storage → la base → onglet "Query"
- Copier-coller le contenu de `schema.sql` et exécuter

**5. Redéployer**
```bash
git commit --allow-empty -m "redeploy with db"
git push
```
Ou cliquer "Redeploy" dans le dashboard Vercel.

**Pour les déploiements suivants :** un simple `git push` suffit, Vercel redéploie automatiquement.

## Roadmap / évolutions possibles

À discuter selon les besoins :

- **Persistance serveur** : passer de `localStorage` à une vraie base (SQLite via Prisma ou Supabase) pour synchro multi-device
- **Vue heatmap annuelle** style GitHub contributions
- **Budgets par catégorie** avec alertes de dépassement
- **Export** : CSV, Excel, PDF mensuel récapitulatif
- **Récurrences** : marquer un loyer ou un abonnement comme récurrent pour pré-remplir les mois suivants
- **Dépenses prévisionnelles** : distinction entre dépenses passées et planifiées
- **Filtres** : par catégorie, par plage de montants, par mots-clés
- **Multi-comptes** : ventiler entre compte courant, PEA Trade Republic, etc.
- **Règles de catégorisation** : permettre à l'utilisateur de définir ses propres mappings mot-clé → catégorie
- **PWA** : installation mobile, fonctionnement offline
- **Tests** : Vitest + React Testing Library pour la logique de parsing CSV et les calculs d'agrégation

## Conventions de code à respecter

- TypeScript préféré pour toute évolution hors prototype
- Composants fonctionnels uniquement, hooks
- Pas d'état global lourd (Redux, Zustand) tant que le besoin n'est pas avéré ; `useState` + `useMemo` suffisent
- Logique métier (parsing CSV, catégorisation, agrégations) extraite dans des fonctions pures testables
- Pas de dépendance à une UI lib lourde (Material UI, Ant Design) — Tailwind + composants maison
- Accessibilité : labels explicites, navigation clavier sur les boutons et la grille calendrier
- Format monétaire et dates toujours via les helpers (`fmtEUR`, `parseDate`, `parseAmount`) — ne jamais réimplémenter inline

## Hors scope

- Gestion multi-utilisateur / authentification
- Conseils financiers automatisés ou prévisions IA
- Intégration directe avec les API bancaires (DSP2, Bridge, Powens) — l'import CSV reste le canal d'entrée
- Gestion d'investissements (PEA, actions, crypto) — c'est un suivi de cash-flow quotidien, pas un outil de trading

## Contexte utilisateur

Apprenti dev (CI/CD, Python, Docker), utilisateur de Crédit Mutuel et Revolut. Préférence forte pour les outputs concis, actionnables, en français, avec un design soigné (typographie sérif élégante, palette terreuse, pas de gradients génériques violet/bleu).
