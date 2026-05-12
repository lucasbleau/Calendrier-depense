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

-- ── Table categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT        PRIMARY KEY,
  label      TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#9A9888',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catégories par défaut (idempotent)
INSERT INTO categories (id, label, color) VALUES
  ('courses',       'Courses',       '#7B9E6B'),
  ('voiture',       'Voiture',       '#8B7355'),
  ('essence',       'Essence',       '#C17F3C'),
  ('appart',        'Appart',        '#8A6F4E'),
  ('abonnements',   'Abonnements',   '#7A8FA6'),
  ('loisirs',       'Loisirs',       '#A67B8A'),
  ('dijon_loisirs', 'Dijon Loisirs', '#C4856A'),
  ('dijon_appart',  'Dijon Appart',  '#A0917A'),
  ('besac_loisirs', 'Besac Loisirs', '#8B7BA8'),
  ('epargne',       'Épargne',       '#5B8E7D'),
  ('revenus',       'Revenus',       '#4A7C59'),
  ('autre',         'Autre',         '#9A9888')
ON CONFLICT (id) DO NOTHING;

-- Rattraper les catégories orphelines déjà présentes dans les données
INSERT INTO categories (id, label, color)
SELECT DISTINCT category, category, '#9A9888' FROM expenses
WHERE category NOT IN (SELECT id FROM categories)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, label, color)
SELECT DISTINCT category, category, '#9A9888' FROM recurring_tasks
WHERE category NOT IN (SELECT id FROM categories)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, label, color)
SELECT DISTINCT category, category, '#9A9888' FROM goals
WHERE category NOT IN (SELECT id FROM categories)
ON CONFLICT (id) DO NOTHING;

-- ── Clés étrangères (idempotentes) ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_category'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT fk_expenses_category
      FOREIGN KEY (category) REFERENCES categories(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_recurring_category'
  ) THEN
    ALTER TABLE recurring_tasks ADD CONSTRAINT fk_recurring_category
      FOREIGN KEY (category) REFERENCES categories(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_goals_category'
  ) THEN
    ALTER TABLE goals ADD CONSTRAINT fk_goals_category
      FOREIGN KEY (category) REFERENCES categories(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
