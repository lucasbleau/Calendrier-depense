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
