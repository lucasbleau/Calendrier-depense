-- À exécuter une seule fois dans Vercel Postgres (onglet "Query" du dashboard)

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT            PRIMARY KEY,
  date        TEXT            NOT NULL,
  label       TEXT            NOT NULL,
  amount      NUMERIC(10, 2)  NOT NULL,
  type        TEXT            NOT NULL,
  category    TEXT            NOT NULL,
  created_at  TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date);

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id          TEXT            PRIMARY KEY,
  label       TEXT            NOT NULL,
  amount      NUMERIC(10, 2)  NOT NULL,
  type        TEXT            NOT NULL,
  category    TEXT            NOT NULL,
  days        TEXT            NOT NULL,
  created_at  TIMESTAMPTZ     DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goals (
  category    TEXT            PRIMARY KEY,
  amount      NUMERIC(10, 2)  NOT NULL,
  updated_at  TIMESTAMPTZ     DEFAULT NOW()
);
