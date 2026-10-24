-- Migration : surcharge du tarif journalier par mois (vue Planning)
-- À exécuter une fois sur une base existante. schema.sql inclut déjà la table
-- pour une installation neuve.
--
-- plan_rates          = tarif de base par catégorie (réglé dans Catégories)
-- plan_rate_overrides = tarif surchargé pour un mois précis (ym = 'YYYY-MM')

CREATE TABLE IF NOT EXISTS plan_rate_overrides (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  ym         TEXT NOT NULL,
  rate       NUMERIC(10, 2) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, category, ym),
  CONSTRAINT fk_plan_overrides_category
    FOREIGN KEY (user_id, category) REFERENCES categories(user_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE
);
