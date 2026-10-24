-- Migration : sous-catégories (hiérarchie 2 niveaux)
-- À exécuter une fois sur une base existante. schema.sql inclut déjà la colonne
-- et la contrainte pour une installation neuve.
--
-- parent = id de la catégorie parent (NULL = catégorie de premier niveau).
-- Un parent (catégorie ayant des enfants) agrège ses sous-catégories.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent TEXT;

-- Contrainte auto-référente : la sous-catégorie pointe vers une catégorie
-- existante du même utilisateur ; suppression du parent → enfants remis à plat.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS fk_categories_parent;
ALTER TABLE categories ADD CONSTRAINT fk_categories_parent
  FOREIGN KEY (user_id, parent) REFERENCES categories(user_id, id)
  ON DELETE SET NULL ON UPDATE CASCADE;
