-- Migration : archivage des catégories
-- Facultatif : api/categories.js ajoute la colonne automatiquement au premier appel.
-- schema.sql l'inclut déjà pour une installation neuve.
--
-- archived = TRUE : catégorie masquée des menus et réglages, mais ses opérations
-- passées gardent leur catégorie (nom + couleur) dans l'historique et les stats.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
