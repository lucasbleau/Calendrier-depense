-- Migration : mode d'objectif par catégorie (au mois / au jour)
-- À exécuter une fois sur une base existante. schema.sql inclut déjà la colonne
-- pour une installation neuve.
--
-- 'mois' = objectif mensuel fixe (n'apparaît pas dans le Planning)
-- 'jour' = tarif €/jour × jours peints (apparaît dans la vue Planning)

ALTER TABLE categories ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'mois';
