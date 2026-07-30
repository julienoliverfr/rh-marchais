-- ============================================================================
-- Migration — vue des présences et alerte des absences à venir
-- ----------------------------------------------------------------------------
-- Deux colonnes ADDITIVES : applicable À CHAUD, sans recréer le serveur ni
-- perdre de données. Rejouable sans effet de bord.
--
--   docker compose exec -T db psql -U postgres -d postgres \
--     < supabase/migration-2026-07-30-alerte-absences.sql
-- ============================================================================

-- Faut-il annoncer les absences à venir de cette personne au responsable ?
-- `default true` volontaire : les fiches EXISTANTES deviennent suivies. Un
-- défaut à false les aurait rendues silencieusement invisibles dans les
-- alertes, et une absence non anticipée ne se rattrape pas.
alter table public.collaborateurs
  add column if not exists alerte_absences boolean not null default true;

-- Combien de jours à l'avance annoncer une absence. 0 = alerte désactivée.
alter table public.regles_generales
  add column if not exists alerte_absence_jours integer not null default 7;

-- Contrôle.
select 'collaborateurs.alerte_absences' as colonne,
       count(*) as present
  from information_schema.columns
 where table_schema = 'public' and table_name = 'collaborateurs'
   and column_name = 'alerte_absences'
union all
select 'regles_generales.alerte_absence_jours', count(*)
  from information_schema.columns
 where table_schema = 'public' and table_name = 'regles_generales'
   and column_name = 'alerte_absence_jours';
