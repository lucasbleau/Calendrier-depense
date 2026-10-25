# CLAUDE.md — Calendrier de dépenses dynamique

## Contexte projet

Application web personnelle de suivi de dépenses au format calendrier mensuel/annuel. Outil personnel ouvert à un cercle de confiance (multi-comptes, inscription libre, données isolées par compte). Déployée sur Vercel, repo GitHub **public** : github.com/lucasbleau/Calendrier-depense — ne jamais y committer d'identifiant ou de donnée personnelle.

État détaillé avant la phase de simplification (rôle de chaque page, archive du Planning) : `ETAT-PROJET.md`.

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
- Indicateur mensuel en-tête (bouton → ouvre Objectifs) : « Reste X € » ou « Dépassé de X € » = `monthPlannedTotal − monthGoalReal`, mêmes chiffres que la vue Objectifs (archivées exclues), coloré par `goalClass`. Masqué si aucun objectif ce mois.

### Saisie des dépenses

Deux modes complémentaires :

1. **Saisie manuelle** via modal au clic sur un jour
   - Champs : libellé, montant, catégorie, type (dépense/revenu)
   - Auto-suggestion catégorie sur blur du champ libellé
2. **Import CSV** avec détection automatique du format
   - Compatible Crédit Mutuel et Revolut
   - Auto-détection des colonnes (date, libellé, montant, débit/crédit)
   - **Catégorisation apprise** (`guessCategory`, aussi au blur du libellé à la création) : libellé normalisé (`labelTokens` : sans accents, chiffres, ni bruit bancaire CB/PRLV/VIR…). Ordre : (1) opération passée au libellé normalisé identique, (2) opération passée partageant un mot nettement associé à une catégorie (≥ 70 % de ses occurrences), (3) `CATEGORY_KEYWORDS` sur **mots entiers**, l'id du mot-clé étant résolu vers la catégorie active réelle (`keywordCategory` : id actif, sinon libellé au même slug), (4) `autre`. Catégories archivées et `autre` jamais apprises.
   - Doublons (même date + libellé + montant qu'une opération existante) écartés dès l'aperçu
   - **Rapprochement avec les récurrences** (`linkImportToRecurrences`) : une opération importée est liée (`recurId` + catégorie de la récurrence) si même type, montant à ±5 % (min 1 €) du montant attendu ce mois-là (override inclus), date à ±5 jours (`LINK_DAY_TOLERANCE`) d'une occurrence du même mois pas encore saisie ; candidates multiples → la plus proche. L'aperçu liste les liens ; évite le double comptage opération importée + rappel ↺.

### Catégories

- Liste dynamique, éditable dans l'onglet **Catégories**
- Déployé : un nouveau compte ne reçoit que `Revenus` et `Autre` (seed d'`api/auth.js`) ; en local, liste par défaut codée dans `app.js` (`let CATEGORIES`)
- Chaque catégorie : `id` (slug généré, rendu unique), `label`, `color` (hex), `parent?`, `archived?`
- Persistance : table `categories` (déployé, cache `localStorage` par compte) ou `localStorage` `expense-calendar-categories-v1` (local)
- **Archivage** (`archived`) pour les catégories qui ne servent plus ; suppression réservée aux catégories jamais utilisées (cf. Vue Catégories)

### Vue Statistiques

Simplifiée le 24/10/2026 (donut et courbe du solde retirés).

- Navigation par année (`state.currentYear`). **Seuls les mois écoulés + le mois en cours sont comptés** (`statsLastMonth`) : les récurrences des mois à venir ne gonflent plus les totaux.
- 3 KPI pleine largeur en haut : Dépenses (+ moyenne mensuelle sur les mois actifs), Revenus, Solde (+ période couverte)
- En dessous, deux colonnes (`.stats-charts`, empilées sous 700 px) :
- À gauche : bar chart 12 mois dépenses/revenus (mois à venir vides)
- À droite : classement de **toutes** les catégories avec montant et %, **regroupé par catégorie de premier niveau** (un parent agrège ses sous-catégories) ; chaque parent est **dépliable** (`state.statsExpanded`) pour voir ses sous-catégories + la part « directe » du parent (`statsRankHtml`)

### Vue Récurrences

- Créer/modifier/supprimer des tâches récurrentes (loyer, Netflix, salaire...)
- Chaque tâche : libellé, montant, type, catégorie, jours du mois (ex : 1er et 15), **date de départ** (`startDate`, aujourd'hui par défaut à la création)
- **Date de départ** : les occurrences antérieures ne comptent nulle part (calendrier, Objectifs, Stats, rapprochement d'import) via `recurDaysInMonth`, seul point d'entrée des jours d'occurrence d'un mois. Vide (récurrences créées avant cette option) = compte sur tous les mois passés.
- Les récurrences apparaissent dans le calendrier comme rappels (↺ montant)
- Depuis le panneau jour : bouton `+` pour créer une opération pré-remplie depuis la récurrence
- **Règle anti-double-comptage** : l'opération créée via `+` garde l'id de sa récurrence (`recurId`, colonne `recur_id` en DB). Une occurrence « réalisée » (opération liée dans le mois, affectée à l'occurrence la plus proche) disparaît des rappels ↺ et des totaux « réels » (`recurRemaining`, `recurMonthTotal`, `getRecurringForDay`). Le « prévu » des Objectifs (`recurExpected`) compte en revanche **toutes** les occurrences — le dénominateur ne bouge pas quand on saisit.
- **Affichage groupé** par catégorie, trié par montant décroissant dans chaque groupe
- **Bandeau résumé** en haut à droite : total dépenses/mois, total revenus/mois, solde net
- **Montant modifié pour un mois** (depuis le panneau jour, `setRecurOverride`) : stocké **en base** (table `recurring_overrides`, `GET /api/recurring?overrides=1`, `POST /api/recurring {action:'overrides', set, remove}`), mise à jour optimiste avec rollback. Anciennement en `localStorage` par appareil : `migrateLegacyOverrides` reprend une fois les valeurs locales (sans écraser la base) puis supprime la clé. Chargement non bloquant (repli sur le cache du compte).

### Vue Objectifs

Simplifiée le 24/10/2026 : **une seule liste par mois** (l'ancienne version — cartes de réglage, tableau annuel, sous-page Détail — est décrite dans `ETAT-PROJET.md`, commit `5b748e6`).

- **Mois** partagé avec le calendrier (`state.currentMonth/Year`, flèches ← → et clavier ; `monthChanged()` rerend la vue).
- **Bloc total** : réel / prévu du mois, %, barre, « Reste X € » ou « Dépassé de X € ».
- **Une ligne par catégorie de premier niveau** ayant de l'activité ou un objectif, triée par réel décroissant : `réel / objectif` + barre colorée (vert < 80 %, orange 80–100 %, rouge > 100 %, `goalClass`).
  - Réel = dépenses saisies + récurrences restantes (`recurRemaining`, anti double comptage).
  - **Objectif d'une feuille** (`getGoalForMonth`) : valeur manuelle (`state.goals`) si fixée — elle remplace tout —, sinon somme des récurrences du mois (`recurExpected`, affichée en italique = auto).
  - **Objectif d'un groupe** (`topGoalForMonth`, groupe = a des sous-catégories **actives**, `isParent`) : **plafond global** manuel (`state.goals[parent]`) s'il est fixé, sinon somme (récurrences propres du parent + objectifs des sous-catégories actives, en italique).
  - Total prévu du mois : `monthPlannedTotal` (aussi utilisé par l'indicateur du calendrier).
  - Un objectif manuel vaut pour **tous les mois** (table `goals` sans colonne mois).
- **Clic sur l'objectif** (feuille ou groupe) → champ inline (Entrée/blur = enregistrer via `saveGoal`, vide = revenir à l'auto/somme, Échap = annuler).
- **Bulle de survol** sur l'objectif (et le champ en édition) : **moyenne mensuelle du réel** de la catégorie (dépenses saisies + récurrences non saisies, overrides inclus — même règle que la vue) (`categoryMonthlyAverage` ; groupe = lui + sous-catégories actives) sur les 12 derniers mois complets, sans remonter avant le premier mois où le compte a des opérations. Masquée si l'objectif manuel est égal à cette moyenne (au centime) ou s'il n'y a aucun mois d'historique — l'explication reste alors en `title` natif.
- **Clic sur la ligne** → dépliage (`state.goalsExpanded`) : un **groupe** montre ses sous-catégories (chacune éditable et dépliable) + une ligne « (sans sous-catégorie) » non éditable si le parent a des dépenses directes (objectif = ses récurrences, `goalDirectFigures`) ; une **feuille** montre ses opérations du mois (`goalOpsRows`, récurrences restantes en ↺ italique).
- **« Autres catégories (n) »** repliable (`state.goalsShowOthers`) : catégories actives sans activité ni objectif, pour pouvoir leur fixer un objectif.
- **Catégories archivées : jamais affichées dans Objectifs, ni comptées** dans les totaux (réel et prévu), y compris comme sous-catégories.
- Helpers : `goalCatFigures` (une catégorie), `goalGroupFigures` (groupe), `goalDirectFigures`, `goalOpsRows`.

### Vue Planning — retirée (24/10/2026)

Page supprimée du front lors de la simplification (avec le mode « au jour » et le tarif €/j des catégories). Back-end (`api/plan.js`, tables `plan_*`) et données conservés. Description complète et procédure de restauration : **`ETAT-PROJET.md` §4** (dernier commit avec la page : `361488e`).

### Vue Catégories

- Liste toutes les catégories avec swatch couleur + label éditable inline
- **Modifier la couleur** : clic sur le rond → color picker natif (mise à jour en live)
- **Modifier le nom** : clic sur le texte, édition directe, confirmation au blur ou Entrée
- **Sous-catégories** (hiérarchie 2 niveaux, champ `parent`, `updateCatParent`) : menu « Parent » par catégorie pour la rattacher à une catégorie de premier niveau. Affichage hiérarchique (enfants indentés ↳ sous leur parent). Une catégorie ayant des enfants **actifs** devient un **groupe** (badge « groupe · Σ ») : elle agrège ses sous-catégories (+ ses dépenses directes) dans Objectifs et Stats ; son objectif est la somme de ses sous-catégories ou un plafond global fixé dans Objectifs. Un parent n'est pas supprimable tant qu'il a des enfants (helpers `childrenOf`, `isParent`, `topLevelExpenseCats`, `familyIds`).
- **Ajouter** : formulaire en haut (nom + couleur), Entrée ou bouton `+ Ajouter`
- **Archiver** (`setCatArchived`, champ `archived`) : bouton par ligne. La catégorie disparaît des menus de saisie/récurrence, des cartes d'objectifs, du menu Parent et de l'auto-catégorisation (`guessCategory`) ; son objectif manuel est ignoré (`getGoalForMonth` → null). Ses opérations **gardent leur catégorie** (nom + couleur) dans calendrier, panneau, recherche et Stats ; elle n'apparaît plus du tout dans Objectifs. Bloqué si système, si sous-catégories actives, ou si une récurrence l'utilise. Section repliée « Archivées (n) » en bas avec **Restaurer** (remise au premier niveau si son parent est archivé/disparu). `isParent` ne compte que les enfants actifs ; `childrenOf` garde les archivés pour l'agrégation. `forEachCategoryOrdered(cb, all)` exclut les archivées sauf `all`. Éditer une opération d'une catégorie archivée ajoute l'option « (archivée) » au menu.
- **Fusionner** (`mergeCategory`, catégories archivées uniquement) : menu « Fusionner dans… » (cibles = catégories actives hors Revenus). Ses opérations **et** récurrences passent dans la cible, son objectif manuel est supprimé, ses sous-catégories remontent au premier niveau, puis elle est supprimée. Côté API : `POST /api/categories {action:'merge', from, to}` en une transaction (refus si `from` est système ou si l'une des deux n'existe pas). Confirmation annonçant le nombre d'éléments déplacés ; action définitive.
- **Supprimer** : ✕ actif uniquement si catégorie non système, sans sous-catégorie active, sans opération ni récurrence (`catDeleteInfo`) — sinon on l'archive. L'objectif manuel est supprimé avec elle (même transaction côté API). Modal de confirmation.
- Modifications propagées instantanément aux dropdowns des modals

### Authentification (multi-utilisateurs)

- **Comptes** : chaque utilisateur a un compte **email** + `PIN` (4-6 chiffres) ; plus de pseudo à l'inscription. Overlay de connexion/inscription à l'ouverture en production.
- **Anciens comptes (pseudo, sans email)** : la connexion accepte encore le pseudo tant que le compte n'a pas d'email (`login` → `needsEmail`). L'overlay passe alors à l'étape « Ajoutez votre email » (`POST /api/auth {action:'set-email'}` avec le token, une seule fois) ; ensuite, connexion par email uniquement. Colonnes `email`/`email_lc` créées par `api/auth.js` au cold start, `username` devenu facultatif.
- **Inscription libre** : n'importe qui avec l'URL peut créer un compte (`POST /api/auth {action:'register'}`).
- **Sécurité** : PIN haché en **scrypt** (sel par utilisateur) côté serveur — jamais stocké en clair. Verrou anti-bruteforce (15 min après 5 échecs).
- **Token** : `/api/auth` renvoie un **token signé HMAC** (`base64url(payload).signature`) encodant l'`user_id` + expiration (30 j). Secret serveur `APP_TOKEN_SECRET`. Stocké en `sessionStorage` (clé `AUTH_KEY`), email en `USER_KEY`. Envoyé via `x-auth-token`.
- **Isolation des données (critique)** : `withDb` (`api/_lib.js`) extrait l'`user_id` du token vérifié et le passe à chaque route. **Toutes** les requêtes sont filtrées par `user_id` (WHERE + INSERT + `UPDATE/DELETE … WHERE id=$ AND user_id=$`). L'`user_id` ne vient jamais du body/query. Un utilisateur ne peut ni lire ni modifier les données d'un autre, même en forgeant un id.
- **Catégories par compte** : isolées par `user_id` (PK composite `(user_id, id)`). À l'inscription, seules **2 catégories structurelles** sont seedées (`Revenus`, `Autre`) — les nouveaux comptes partent neutres et créent les leurs.
- **Aucun compte privilégié** : tous les comptes sont équivalents (objectifs auto/manuels, catégories). Il n'y a plus de compte « propriétaire » ni de config personnelle hardcodée.
- **Cache hors-ligne** : cloisonné par compte via `userCacheKey()` (suffixe `:email`) pour éviter toute fuite inter-comptes sur un appareil partagé.
- **Déconnexion** : bouton header → vide `sessionStorage` et recharge.
- En local (`file://` ou `localhost`) : aucune auth, mono-utilisateur localStorage, overlay jamais affiché.

## Spécifications techniques

### Stack actuelle

- **Vanilla HTML/CSS/JS** — aucun build step, fonctionne en ouvrant `index.html` directement
- Graphiques en SVG générés à la main (`svgGroupedBars`), aucune librairie
- `localStorage` pour la persistance en local (`file://` ou `localhost`)
- `pg` ^8.13.0 (driver PostgreSQL standard) pour la persistance en production via Vercel Serverless
- Polices : Fraunces (display) + JetBrains Mono (chiffres) + Inter (body) via Google Fonts

### Fichiers

```
index.html        — structure HTML + modales
style.css         — design complet (palette terreuse, responsive)
app.js            — logique applicative complète (front)
package.json      — dépendance pg + engines.node 24.x (Node 20 n'est plus accepté par Vercel)
schema.sql        — schéma complet pour une installation neuve
ETAT-PROJET.md    — état du projet avant simplification + archive de la page Planning
.gitignore
api/
  _lib.js         — pool pg, withDb (CORS + auth + user_id), tokens signés, hachage PIN scrypt, catégories par défaut
  auth.js         — POST /api/auth : register (email + PIN) / login (email, ou ancien pseudo) / set-email, renvoie un token signé
  expenses.js     — GET / POST / PUT / DELETE : table expenses
  recurring.js    — GET / POST / DELETE : recurring_tasks ; ?overrides=1 et {action:'overrides'} : recurring_overrides (auto-migration)
  goals.js        — GET / POST / DELETE : table goals
  categories.js   — GET / POST / DELETE : table categories ; {action:'merge'} : fusion (auto-migration de `archived`)
  plan.js         — Planning (page retirée) : conservé pour une éventuelle restauration
migrations/       — scripts SQL historiques pour une base existante (cf. Tables SQL)
docs/archive-planning/ — notes de l'ancien Planning (jours Besançon/Dijon, tarifs €/j)
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
  startDate?: string | null; // YYYY-MM-DD, occurrences antérieures ignorées ; null = depuis toujours
};

type Category = {
  id: string;            // slug généré depuis le label
  label: string;
  color: string;         // couleur hex
  mode?: 'mois' | 'jour'; // hérité du Planning (retiré) — persisté mais ignoré par le front
  parent?: string;        // id de la catégorie parent si sous-catégorie (2 niveaux max)
  archived?: boolean;     // archivée : masquée des menus, opérations conservées
};

type Goals = Record<string, number>; // category → limite mensuelle en €

type RecurringOverride = { recurId: string; yearMonth: string; amount: number }; // montant d'un mois précis

// Plan (Planning retiré) : cf. ETAT-PROJET.md §4
```

### Constantes clés (app.js)

| Constante | Rôle |
|---|---|
| `let CATEGORIES` | Liste courante des catégories (initialisée depuis défauts, surchargeable via CatDB) |
| `CATEGORY_KEYWORDS` | Mots-clés de secours de la catégorisation (après l'historique), comparés sur mots entiers |

### Clés localStorage

| Clé | Contenu |
|---|---|
| `expense-calendar-data-v1` | `Expense[]` |
| `expense-calendar-recurring-v1` | `RecurringTask[]` |
| `expense-calendar-goals-v1` | `Goals` |
| `expense-calendar-recurring-overrides-v1` | `RecurringOverride[]` (local ; en déployé, cache du compte — l'ancienne clé non suffixée est migrée puis supprimée) |
| `expense-calendar-plan-v1` | `Plan` (vue Planning retirée — clé plus lue) |
| `expense-calendar-categories-v1` | `Category[]` (si modifié, sinon défauts hardcodés) |
| `expense-calendar-auth-v1` | Token d'auth signé (sessionStorage) |
| `expense-calendar-user-v1` | Email du compte connecté (sessionStorage) |

> En mode déployé, les caches hors-ligne de données sont suffixés par `:email` (cloisonnement par compte).

### Conventions UI

- **Style « verre dépoli »** (type liquid glass) : fond ambré fixe (`--page-bg`, halos cuivre/sauge/ocre) visible derrière des surfaces translucides (`--surface`, `--surface-2` en rgba blanc) + `backdrop-filter` (`--glass-blur`) sur les grands conteneurs (barre latérale, `.app-main`, modales, popovers). Cadre de `--frame` (6 px) autour de l'écran.
- **Navigation** : barre latérale verticale à gauche (`.app-sidebar`), une icône SVG par page ; au survol, la pastille (`.nav-pill`) s'élargit pour afficher l'icône + le nom. Recherche, import, compte et déconnexion en bas. Sous 760 px : barre d'onglets en bas, sans libellés.
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

En mode déployé, toutes les données (opérations, récurrences et leurs montants mensuels, objectifs, catégories) sont en base ; `localStorage` ne sert que de cache hors ligne cloisonné par compte. Les tables ajoutées récemment (`recurring_overrides`, colonne `categories.archived`) sont créées par les routes elles-mêmes au cold start : aucun script à lancer.

### Tables SQL (cf. `schema.sql`)

```sql
users           — id (PK), email, email_lc (unique), username, username_lc (unique, anciens comptes), pin_hash, pin_salt, failed_count, locked_until, created_at
expenses        — id (PK), user_id, date, label, amount, type, category, recur_id (FK recurring_tasks, SET NULL), created_at
recurring_tasks — id (PK), user_id, label, amount, type, category, days (JSON), start_date (DATE, NULL = depuis toujours ; ajoutée par api/recurring.js au cold start), created_at
goals           — (user_id, category) PK, amount, updated_at
categories      — (user_id, id) PK, label, color, mode ('mois'|'jour'), parent (FK self, SET NULL), archived (bool), created_at
plan_days       — (user_id, category, date) PK — jours peints (vue Planning, retirée — table conservée), FK categories CASCADE
plan_rates      — (user_id, category) PK, rate, updated_at — tarif de base €/jour, FK categories CASCADE
plan_rate_overrides — (user_id, category, ym) PK, rate, updated_at — tarif surchargé pour un mois, FK categories CASCADE
recurring_overrides — (user_id, recur_id, ym) PK, amount, updated_at — montant d'une récurrence modifié pour un mois, FK recurring_tasks CASCADE (créée par api/recurring.js au cold start)
```

> Installation neuve : `schema.sql` suffit. Base existante, scripts historiques dans `migrations/` : `migrate-multiuser-1.sql` puis `migrate-multiuser-2.sql` (passage multi-user ; **remplacer `TON_ID` localement, ne jamais committer le vrai id**), `migrate-recur-link.sql` (`expenses.recur_id`), `migrate-plan.sql` + `migrate-plan-overrides.sql` (tables `plan_*`), `migrate-cat-mode.sql` (`categories.mode`), `migrate-cat-parent.sql` (`categories.parent`). `migrate-cat-archive.sql` et `recurring_overrides` sont appliqués automatiquement par les routes (`ensureSchema`).

## Déploiement

### Architecture

```
Browser → /api/auth         → register/login, renvoie un token signé (user_id)
Browser → /api/expenses     → Postgres (expenses WHERE user_id)       ← token requis
Browser → /api/recurring    → Postgres (recurring_tasks + recurring_overrides WHERE user_id) ← token requis
Browser → /api/goals        → Postgres (goals WHERE user_id)           ← token requis
Browser → /api/categories   → Postgres (categories WHERE user_id, fusion) ← token requis
Browser → /api/plan         → Postgres (plan_* WHERE user_id) — plus appelé par le front (Planning retiré)
```

### Variables d'environnement Vercel

| Variable           | Description                                                |
|--------------------|------------------------------------------------------------|
| `POSTGRES_URL`     | URL de connexion Postgres (`postgresql://...`)            |
| `APP_TOKEN_SECRET` | Secret de signature des tokens (chaîne aléatoire longue). **Obligatoire** en prod. |

> `APP_PIN` / `APP_TOKEN` (ancien système mono-utilisateur) ne sont plus utilisés.
> Si `APP_TOKEN_SECRET` n'est pas défini, un secret de dev par défaut est utilisé (à ne pas laisser en prod).

### Procédure de déploiement initial

1. **Créer le repo GitHub** et pousser le code
2. **Importer sur Vercel** — framework "Other", déployer
3. **Ajouter une base Postgres** (Vercel Marketplace → Neon ou Prisma Postgres) et définir `POSTGRES_URL`
4. **Créer les tables** — exécuter `schema.sql` dans l'onglet Query de la base
5. **Définir `APP_TOKEN_SECRET`** (chaîne aléatoire longue) dans les env vars Vercel
6. **Redéployer** (`git push` ou bouton Redeploy) ; chaque push sur `main` déploie en production

> Le repo doit être **public** sur GitHub pour que le déploiement continu fonctionne sur un plan Vercel Hobby (limitation des comptes Équipe).

## Roadmap / évolutions possibles

- **Vue heatmap annuelle** style GitHub contributions
- **Export** : CSV, Excel, PDF mensuel récapitulatif
- **Dépenses prévisionnelles** : distinction dépenses passées / planifiées
- **Filtres** : par catégorie, par plage de montants, par mots-clés
- **Multi-comptes** : ventiler entre compte courant, PEA, etc.
- **Règles de catégorisation** : mappings mot-clé → catégorie personnalisables (la catégorisation apprend déjà de l'historique)
- **Rapprochement rétroactif** : lier aux récurrences les opérations importées avant le rapprochement automatique (elles restent comptées deux fois)
- **PWA** : installation mobile, fonctionnement offline
- **Tests** : Vitest pour la logique de parsing CSV et les calculs d'agrégation

## Conventions de code à respecter

- Logique métier extraite en fonctions pures (`detectAndParseCSV`, `guessCategory`, `linkImportToRecurrences`, `fmtEUR`, `sumByType`, etc.)
- Accessibilité : labels explicites, navigation clavier sur les boutons et la grille calendrier
- Format monétaire et dates toujours via les helpers — ne jamais réimplémenter inline
- Pas de commentaires sauf si le WHY est non-évident
- Dual-mode storage : toujours vérifier `IS_DEPLOYED` avant tout appel réseau ou accès localStorage
- **Catégories** : toujours lire depuis `CATEGORIES` (variable `let`, peut être surchargée par CatDB), jamais hardcoder un id de catégorie sauf `DEFAULT_CATEGORY` et `INCOME_CATEGORY`

## Hors scope

- Authentification forte (2FA, OAuth, rôles/admin) — l'auth actuelle est email + PIN haché, suffisante pour un cercle de confiance
- Conseils financiers automatisés ou prévisions IA
- Intégration directe avec les API bancaires (DSP2, Bridge, Powens)
- Gestion d'investissements (PEA, actions, crypto)

## Contexte utilisateur

Apprenti dev (CI/CD, Python, Docker), utilisateur de Crédit Mutuel et Revolut. Préférence forte pour les outputs concis, actionnables, en français, avec un design soigné (typographie sérif élégante, palette terreuse, pas de gradients génériques violet/bleu).
