-- Migration : lien opération → récurrence (anti double comptage des totaux).
-- À exécuter une seule fois sur une base existante (onglet Query du dashboard).

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recur_id TEXT;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS fk_expenses_recur;
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_recur
  FOREIGN KEY (recur_id) REFERENCES recurring_tasks(id) ON DELETE SET NULL;
