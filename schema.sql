-- À exécuter une seule fois dans Vercel Postgres (onglet "Query" du dashboard)
-- Schéma multi-utilisateurs. Pour migrer une base mono-utilisateur existante,
-- utiliser plutôt migrate-multiuser-1.sql puis migrate-multiuser-2.sql.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL,
  username_lc  TEXT UNIQUE NOT NULL,
  pin_hash     TEXT NOT NULL,
  pin_salt     TEXT NOT NULL,
  failed_count INT  DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Catégories (propres à chaque utilisateur)
CREATE TABLE IF NOT EXISTS categories (
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id         TEXT        NOT NULL,
  label      TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#9A9888',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT            PRIMARY KEY,
  user_id     TEXT            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT            NOT NULL,
  label       TEXT            NOT NULL,
  amount      NUMERIC(10, 2)  NOT NULL,
  type        TEXT            NOT NULL,
  category    TEXT            NOT NULL,
  recur_id    TEXT,           -- récurrence source si créée via « + » (anti double comptage)
  created_at  TIMESTAMPTZ     DEFAULT NOW(),
  CONSTRAINT fk_expenses_category
    FOREIGN KEY (user_id, category) REFERENCES categories(user_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, date);

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id          TEXT            PRIMARY KEY,
  user_id     TEXT            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT            NOT NULL,
  amount      NUMERIC(10, 2)  NOT NULL,
  type        TEXT            NOT NULL,
  category    TEXT            NOT NULL,
  days        TEXT            NOT NULL,
  created_at  TIMESTAMPTZ     DEFAULT NOW(),
  CONSTRAINT fk_recurring_category
    FOREIGN KEY (user_id, category) REFERENCES categories(user_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_tasks (user_id);

-- Lien opération → récurrence (déclaré après recurring_tasks pour l'ordre de création)
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS fk_expenses_recur;
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_recur
  FOREIGN KEY (recur_id) REFERENCES recurring_tasks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS goals (
  user_id     TEXT            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT            NOT NULL,
  amount      NUMERIC(10, 2)  NOT NULL,
  updated_at  TIMESTAMPTZ     DEFAULT NOW(),
  PRIMARY KEY (user_id, category),
  CONSTRAINT fk_goals_category
    FOREIGN KEY (user_id, category) REFERENCES categories(user_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Les catégories par défaut sont seedées par l'API à l'inscription de chaque
-- utilisateur (cf. DEFAULT_CATEGORIES dans api/_lib.js).
