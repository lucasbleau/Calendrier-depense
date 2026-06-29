-- ─────────────────────────────────────────────────────────────────────────────
-- Migration multi-utilisateurs — ÉTAPE 1 (schéma)
-- À coller dans l'onglet "Query" de Vercel Postgres AVANT de déployer le code.
-- Ajoute la table users + une colonne user_id (nullable, temporaire) et relâche
-- les clés primaires/étrangères qui empêchent les doublons de catégorie/objectif.
-- ─────────────────────────────────────────────────────────────────────────────

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

ALTER TABLE expenses        ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE goals           ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE categories      ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Les FK catégorie mono-user empêchent l'isolation par user : on les retire,
-- elles seront recréées en composite à l'étape 2.
ALTER TABLE expenses        DROP CONSTRAINT IF EXISTS fk_expenses_category;
ALTER TABLE recurring_tasks DROP CONSTRAINT IF EXISTS fk_recurring_category;
ALTER TABLE goals           DROP CONSTRAINT IF EXISTS fk_goals_category;

-- PK mono-user → retirées (état transitoire). Recréées en composite à l'étape 2.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE goals      DROP CONSTRAINT IF EXISTS goals_pkey;

-- ➜ Déployer le code, puis CRÉER TON COMPTE via l'interface (inscription).
-- ➜ Récupérer ton id :  SELECT id, username FROM users;
-- ➜ Reporter cet id dans migrate-multiuser-2.sql et l'exécuter.
