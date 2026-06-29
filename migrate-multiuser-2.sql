-- ─────────────────────────────────────────────────────────────────────────────
-- Migration multi-utilisateurs — ÉTAPE 2 (rattachement des données + finalisation)
-- À exécuter APRÈS avoir créé ton compte via l'interface.
-- Remplacer TON_ID par l'id renvoyé par : SELECT id, username FROM users;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Retire les 12 catégories par défaut fraîchement seedées pour ton compte,
-- puis récupère TES catégories existantes (avec leurs couleurs personnalisées).
DELETE FROM categories WHERE user_id = 'TON_ID';
UPDATE categories      SET user_id = 'TON_ID' WHERE user_id IS NULL;

-- Rattache toutes les données existantes à ton compte
UPDATE expenses        SET user_id = 'TON_ID' WHERE user_id IS NULL;
UPDATE recurring_tasks SET user_id = 'TON_ID' WHERE user_id IS NULL;
UPDATE goals           SET user_id = 'TON_ID' WHERE user_id IS NULL;

-- Verrouille l'isolation : user_id obligatoire partout
ALTER TABLE expenses        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE recurring_tasks ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE goals           ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE categories      ALTER COLUMN user_id SET NOT NULL;

-- Clés primaires composites
ALTER TABLE categories ADD PRIMARY KEY (user_id, id);
ALTER TABLE goals      ADD PRIMARY KEY (user_id, category);

-- Clés étrangères composites (intégrité référentielle par utilisateur)
ALTER TABLE expenses ADD CONSTRAINT fk_expenses_category
  FOREIGN KEY (user_id, category) REFERENCES categories(user_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE recurring_tasks ADD CONSTRAINT fk_recurring_category
  FOREIGN KEY (user_id, category) REFERENCES categories(user_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE goals ADD CONSTRAINT fk_goals_category
  FOREIGN KEY (user_id, category) REFERENCES categories(user_id, id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Clés étrangères vers users (suppression d'un compte = purge de ses données)
ALTER TABLE expenses        ADD CONSTRAINT fk_expenses_user        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE recurring_tasks ADD CONSTRAINT fk_recurring_user       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE goals           ADD CONSTRAINT fk_goals_user           FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE categories      ADD CONSTRAINT fk_categories_user      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, date);
CREATE INDEX IF NOT EXISTS idx_recurring_user     ON recurring_tasks (user_id);

COMMIT;
