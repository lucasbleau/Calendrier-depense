-- Migration : vue Planning (calendrier interactif des catégories)
-- À exécuter une fois sur une base existante. schema.sql inclut déjà ces tables
-- pour une installation neuve.

-- Jours « peints » : la catégorie s'applique ce jour-là
CREATE TABLE IF NOT EXISTS plan_days (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category  TEXT NOT NULL,
  date      TEXT NOT NULL, -- YYYY-MM-DD
  PRIMARY KEY (user_id, category, date),
  CONSTRAINT fk_plan_days_category
    FOREIGN KEY (user_id, category) REFERENCES categories(user_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Tarif journalier par catégorie : objectif mensuel auto = rate × jours peints
CREATE TABLE IF NOT EXISTS plan_rates (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  rate       NUMERIC(10, 2) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, category),
  CONSTRAINT fk_plan_rates_category
    FOREIGN KEY (user_id, category) REFERENCES categories(user_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE
);
