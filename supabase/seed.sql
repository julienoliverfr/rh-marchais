-- ============================================================================
-- RH ETS Marchais — DONNÉES FICTIVES (démo)  [exécuter APRÈS schema.sql + rls.sql]
-- ----------------------------------------------------------------------------
-- Données INVENTÉES pour tester : familles Vignes & Marchais, modèles de
-- contrat, types d'absence, politiques, règles, collaborateurs et saisies.
--
-- IMPORTANT — comptes de démo (jean, amelie, sophie) :
--   Les PROFILS (dernière section) référencent auth.users. Il faut donc d'abord
--   CRÉER les 3 utilisateurs Supabase Auth (Dashboard > Authentication > Users,
--   ou API admin) avec ces e-mails et un mot de passe de démo :
--     • jean@demo.local     (employé)      mot de passe : demo1234
--     • amelie@demo.local   (employé)      mot de passe : demo1234
--     • sophie@demo.local   (responsable)  mot de passe : demo1234
--   Puis (re)exécuter ce fichier : la section « profiles » retrouve leur UUID
--   par e-mail et crée les profils liés. Aucun mot de passe n'est stocké ici :
--   l'authentification est entièrement gérée par Supabase Auth.
--
-- Idempotent : les insertions utilisent des UUID fixes + ON CONFLICT DO NOTHING.
-- ============================================================================

-- ------------------------------------------------------------------ familles
insert into public.familles (id, nom, mode_saisie, pause_deduite_min) values
  ('11111111-1111-1111-1111-111111111101', 'Vignes',   'journee_continue', 60),
  ('11111111-1111-1111-1111-111111111102', 'Marchais', 'demi_journees',     0)
on conflict (id) do nothing;

-- ------------------------------------------------------------ modeles_contrat
insert into public.modeles_contrat (id, nom, type_contrat, unite, base, seuil_hebdo, quotas_par_type) values
  ('22222222-2222-2222-2222-222222222201', 'Vignes · CDI 35h',    'CDI',        'heures', 35, 35, '{"conge_paye":25,"rtt":10}'::jsonb),
  ('22222222-2222-2222-2222-222222222202', 'Vignes · CDD saison', 'CDD',        'heures', 39, 39, '{"conge_paye":12}'::jsonb),
  ('22222222-2222-2222-2222-222222222203', 'Marchais · CDI jour', 'CDI',        'jours',   7, 35, '{"conge_paye":25}'::jsonb),
  ('22222222-2222-2222-2222-222222222204', 'Saisonnier · jour',   'saisonnier', 'jours',   7, 35, '{"conge_paye":8}'::jsonb)
on conflict (id) do nothing;

-- -------------------------------------------------------------- types_absence
insert into public.types_absence (code, label, a_solde, justificatif_requis) values
  ('conge_paye', 'Congé payé', true,  false),
  ('rtt',        'RTT',        true,  false),
  ('anciennete', 'Ancienneté', true,  false),
  ('maladie',    'Maladie',    false, true),
  ('sans_solde', 'Sans solde', false, false)
on conflict (code) do nothing;

-- ---------------------------------------------------------- politiques_conges
insert into public.politiques_conges
  (type_id, debut_jour, debut_mois, mode_acquisition, quota_annuel, taux_mensuel,
   prorata_entree, report, plafond_report, report_expiration_mois, paliers_anciennete) values
  ('conge_paye', 1, 6, 'forfait',    25, 2.08, true, 'plafonne', 5, 3, '[]'::jsonb),
  ('rtt',        1, 1, 'forfait',    10, 0.83, true, 'perdu',    0, 3, '[]'::jsonb),
  ('anciennete', 1, 1, 'anciennete',  0, 0,    false, 'perdu',   0, 3,
     '[{"ansMin":10,"jours":1},{"ansMin":15,"jours":2},{"ansMin":20,"jours":3}]'::jsonb)
on conflict (type_id) do nothing;

-- ---------------------------------------------------------- regles_generales
insert into public.regles_generales
  (id, saisie_retro_jours, seuil_hsup_defaut_hebdo, verrouillage_apres_export)
values (1, 7, 35, true)
on conflict (id) do nothing;

-- ------------------------------------------------------------- collaborateurs
-- Noms INVENTÉS. Jean & Amélie ont un compte de démo ; Karim & Nadia illustrent
-- des cas de contrat (CDD, saisonnier avec prorata d'entrée) sans compte.
insert into public.collaborateurs (id, prenom, nom, famille_id) values
  ('33333333-3333-3333-3333-333333333301', 'Jean',   'Vasseur',  '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333302', 'Amélie', 'Lheureux', '11111111-1111-1111-1111-111111111102'),
  ('33333333-3333-3333-3333-333333333303', 'Karim',  'Benali',   '11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333304', 'Nadia',  'Fontaine', '11111111-1111-1111-1111-111111111102')
on conflict (id) do nothing;

-- -------------------------------------------------------------------- contrats
insert into public.contrats
  (collaborateur_id, modele_id, unite, base, seuil_hebdo, quotas_par_type, date_debut) values
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 'heures', 35, 35, '{"conge_paye":25,"rtt":10}'::jsonb, '2005-03-01'),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222203', 'jours',   7, 35, '{"conge_paye":25}'::jsonb, '2013-09-01'),
  ('33333333-3333-3333-3333-333333333303', '22222222-2222-2222-2222-222222222202', 'heures', 39, 39, '{"conge_paye":12}'::jsonb, null),
  ('33333333-3333-3333-3333-333333333304', '22222222-2222-2222-2222-222222222204', 'jours',   7, 35, '{"conge_paye":8}'::jsonb, '2026-07-01')
on conflict (collaborateur_id) do nothing;

-- ------------------------------------------------------------ delegations_saisie
-- Délégation de démo : Jean Vasseur (employé, compte de démo) est autorisé à
-- saisir les heures de Karim Benali (même famille Vignes, sans compte). Après
-- connexion en tant que jean, l'entrée « Saisie pour un collègue » apparaît et
-- le dropdown est limité à Karim.
insert into public.delegations_saisie (delegant_collaborateur_id, cible_collaborateur_id) values
  ('33333333-3333-3333-3333-333333333301', '33333333-3333-3333-3333-333333333303')
on conflict (delegant_collaborateur_id, cible_collaborateur_id) do nothing;

-- -------------------------------------------------------------------- saisies
-- Quelques saisies récentes (dates relatives) pour peupler le tableau de bord.
insert into public.saisies
  (id, collaborateur_id, date, heure_debut, heure_fin, pause_min, periode,
   matin_debut, matin_fin, aprem_debut, aprem_fin, total_minutes, statut, saisi_par) values
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301',
     current_date - 2, '08:00', '17:00', 60, null, null, null, null, null, 480, 'validee',   'jean'),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333301',
     current_date - 1, '08:00', '18:00', 60, null, null, null, null, null, 540, 'en_attente','jean'),
  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333302',
     current_date - 1, null, null, null, 'journee', '08:00', '12:00', '14:00', '17:00', 420, 'en_attente','amelie')
on conflict (id) do nothing;

-- -------------------------------------------------------------------- profiles
-- Crée les profils des 3 comptes de démo À CONDITION que les utilisateurs Auth
-- existent déjà (voir en-tête). Sophie a familles_perimetre = NULL => TOUTES les
-- familles (responsable-admin). Réexécutable sans erreur (ON CONFLICT).
insert into public.profiles (id, identifiant, role, collaborateur_id, nom_affichage, familles_perimetre)
select u.id, 'jean@demo.local', 'employe',
       '33333333-3333-3333-3333-333333333301', 'Jean Vasseur', null
from auth.users u where u.email = 'jean@demo.local'
on conflict (id) do nothing;

insert into public.profiles (id, identifiant, role, collaborateur_id, nom_affichage, familles_perimetre)
select u.id, 'amelie@demo.local', 'employe',
       '33333333-3333-3333-3333-333333333302', 'Amélie Lheureux', null
from auth.users u where u.email = 'amelie@demo.local'
on conflict (id) do nothing;

insert into public.profiles (id, identifiant, role, collaborateur_id, nom_affichage, familles_perimetre)
select u.id, 'sophie@demo.local', 'responsable',
       null, 'Sophie Delcourt (Responsable)', null
from auth.users u where u.email = 'sophie@demo.local'
on conflict (id) do nothing;
