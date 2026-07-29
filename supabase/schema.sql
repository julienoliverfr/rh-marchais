-- ============================================================================
-- RH ETS Marchais — SCHÉMA (tables du « cerveau partagé »)
-- ----------------------------------------------------------------------------
-- Ordre d'exécution : 1) schema.sql  2) rls.sql  3) seed.sql
--
-- Ce fichier crée UNIQUEMENT les tables (structure). La sécurité (RLS + policies)
-- est dans rls.sql ; les données fictives dans seed.sql.
--
-- Les tables reflètent src/types.ts. Clés primaires en UUID (gen_random_uuid())
-- sauf les tables de RÉFÉRENTIEL dont la clé métier est un code stable
-- (types_absence.code, politiques_conges.type_id) et le singleton regles_generales.
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ------------------------------------------------------------------ profiles
-- Un profil par utilisateur Supabase Auth. Porte le RÔLE et le rattachement au
-- collaborateur (pour un employé). C'est la table qui fait autorité pour les
-- décisions de sécurité (voir fonctions auth_* dans rls.sql).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  identifiant text not null,                       -- e-mail / login affiché
  role text not null check (role in ('employe', 'responsable')),
  collaborateur_id uuid,                           -- lien employé -> collaborateur
  nom_affichage text not null,
  -- Périmètre d'un responsable, par famille (liste d'UUID de familles). NULL ou
  -- tableau vide = accès à TOUTES les familles (responsable-admin, ex. Sophie).
  familles_perimetre uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ familles
create table if not exists public.familles (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  mode_saisie text not null check (mode_saisie in ('journee_continue', 'demi_journees')),
  pause_deduite_min integer not null default 0,
  -- Exiger une description de la journée à la saisie ? Réglé par équipe.
  activite_obligatoire boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ modeles_contrat
create table if not exists public.modeles_contrat (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type_contrat text check (type_contrat in ('CDI', 'CDD', 'saisonnier')),
  unite text not null check (unite in ('heures', 'jours')),
  base numeric not null,
  seuil_hebdo numeric not null,
  -- Mode de décompte des congés : 'ouvres' (lun–ven) ou 'ouvrables' (lun–sam).
  decompte_jours text not null default 'ouvres' check (decompte_jours in ('ouvres', 'ouvrables')),
  -- Quotas de congés PAR TYPE à solde (jours/type), ex. {"conge_paye":25,"rtt":10}.
  -- Un type absent = « quota par défaut de la politique ». Remplace conges_solde.
  quotas_par_type jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- collaborateurs
create table if not exists public.collaborateurs (
  id uuid primary key default gen_random_uuid(),
  prenom text not null,
  nom text not null,
  famille_id uuid not null references public.familles (id) on delete restrict,
  -- Sortie des effectifs. On ne supprime JAMAIS un collaborateur (l'historique
  -- de paie doit être conservé) : on renseigne sa date de sortie.
  date_sortie date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lien profil (employé) -> collaborateur : FK posée après création de la table.
alter table public.profiles
  drop constraint if exists profiles_collaborateur_fk;
alter table public.profiles
  add constraint profiles_collaborateur_fk
  foreign key (collaborateur_id) references public.collaborateurs (id) on delete set null;

-- -------------------------------------------------------------------- contrats
-- Contrat 1:1 d'un collaborateur (pré-rempli depuis un modèle). Clé = collaborateur.
create table if not exists public.contrats (
  collaborateur_id uuid primary key
    references public.collaborateurs (id) on delete cascade,
  modele_id uuid references public.modeles_contrat (id) on delete set null,
  unite text not null check (unite in ('heures', 'jours')),
  base numeric not null,
  seuil_hebdo numeric not null,
  -- Mode de décompte des congés : 'ouvres' (lun–ven) ou 'ouvrables' (lun–sam).
  decompte_jours text not null default 'ouvres' check (decompte_jours in ('ouvres', 'ouvrables')),
  -- Quotas de congés PAR TYPE à solde (jours/type), pré-remplis depuis le modèle
  -- et modifiables. Un type absent = « quota par défaut de la politique ».
  quotas_par_type jsonb not null default '{}'::jsonb,
  date_debut date,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ delegations_saisie
-- Délégation de saisie pour autrui : `delegant` est autorisé à saisir (créer /
-- modifier) les heures de `cible`. Matérialise `Collaborateur.peutSaisirPour`.
-- Clé composite (un couple unique) + FK cascade sur les deux collaborateurs.
-- C'est la SOURCE DE VÉRITÉ utilisée par les policies RLS des `saisies`.
create table if not exists public.delegations_saisie (
  delegant_collaborateur_id uuid not null
    references public.collaborateurs (id) on delete cascade,
  cible_collaborateur_id uuid not null
    references public.collaborateurs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (delegant_collaborateur_id, cible_collaborateur_id),
  -- On ne délègue pas « pour soi-même » (déjà couvert par le cas propriétaire).
  check (delegant_collaborateur_id <> cible_collaborateur_id)
);
create index if not exists delegations_delegant_idx
  on public.delegations_saisie (delegant_collaborateur_id);
create index if not exists delegations_cible_idx
  on public.delegations_saisie (cible_collaborateur_id);

-- -------------------------------------------------------------------- saisies
create table if not exists public.saisies (
  id uuid primary key default gen_random_uuid(),
  collaborateur_id uuid not null references public.collaborateurs (id) on delete cascade,
  date date not null,
  -- Mode journée continue
  heure_debut text,
  heure_fin text,
  pause_min integer,
  -- Mode demi-journées
  periode text check (periode in ('matin', 'apres_midi', 'journee')),
  matin_debut text,
  matin_fin text,
  aprem_debut text,
  aprem_fin text,
  -- Commun
  total_minutes integer not null default 0,
  activite text,  -- description libre de la journée (exigée selon l'équipe)
  statut text not null check (statut in ('en_attente', 'validee', 'refusee', 'verrouillee')),
  saisi_par text not null,
  created_at timestamptz not null default now(),
  -- Workflow de validation
  validee_par text,
  validee_le timestamptz,
  refus_motif text,
  debloquee_par text,
  export_id uuid,          -- FK ajoutée après création de la table exports
  updated_at timestamptz not null default now()
);
create index if not exists saisies_collaborateur_idx on public.saisies (collaborateur_id);
create index if not exists saisies_statut_idx on public.saisies (statut);
create index if not exists saisies_date_idx on public.saisies (date);

-- --------------------------------------------------------------------- conges
create table if not exists public.conges (
  id uuid primary key default gen_random_uuid(),
  collaborateur_id uuid not null references public.collaborateurs (id) on delete cascade,
  type text not null check (type in ('conge_paye', 'maladie', 'sans_solde', 'rtt', 'anciennete')),
  date_debut date not null,
  date_fin date not null,
  demi_jour text not null default 'aucune' check (demi_jour in ('aucune', 'debut', 'fin')),
  nb_jours numeric not null,
  -- Valeur issue du CALCUL automatique, mémorisée si nb_jours a été ajusté à la
  -- main par le responsable (NULL = aucun ajustement). L'ajustement est tracé
  -- dans audit_log (action 'conge_jours_modifies').
  nb_jours_calcule numeric,
  statut text not null check (statut in ('demandee', 'validee', 'refusee', 'annulee')),
  demande_par_user_id text not null,
  validee_par_user_id text,
  refus_motif text,
  motif text,
  created_at timestamptz not null default now()
);
create index if not exists conges_collaborateur_idx on public.conges (collaborateur_id);
create index if not exists conges_statut_idx on public.conges (statut);

-- --------------------------------------------------------------------- soldes
-- Override MANUEL de l'acquis (par collaborateur + type à solde + période).
-- Le "pris" et le "restant" ne sont JAMAIS stockés : ils sont calculés côté appli.
create table if not exists public.soldes (
  id uuid primary key default gen_random_uuid(),
  collaborateur_id uuid not null references public.collaborateurs (id) on delete cascade,
  type_id text not null check (type_id in ('conge_paye', 'maladie', 'sans_solde', 'rtt', 'anciennete')),
  periode_label text not null,
  acquis numeric not null,
  unique (collaborateur_id, type_id, periode_label)
);

-- ------------------------------------------------------------- types_absence
-- Référentiel des types d'absence. Clé métier = code (dépendance du moteur de solde).
create table if not exists public.types_absence (
  code text primary key check (code in ('conge_paye', 'maladie', 'sans_solde', 'rtt', 'anciennete')),
  label text not null,
  a_solde boolean not null default false,
  justificatif_requis boolean not null default false
);

-- --------------------------------------------------------------- jours_feries
-- Jours fériés PERSONNALISÉS (ponts / overrides), en surcouche des fériés
-- nationaux calculés côté client. `chome` = false => jour TRAVAILLÉ (décompté).
create table if not exists public.jours_feries (
  date date primary key,
  label text not null,
  chome boolean not null default true
);

-- ---------------------------------------------------------- politiques_conges
-- Politique d'acquisition/report PAR type à solde (clé = type_id).
create table if not exists public.politiques_conges (
  type_id text primary key check (type_id in ('conge_paye', 'maladie', 'sans_solde', 'rtt', 'anciennete')),
  debut_jour integer not null check (debut_jour between 1 and 31),
  debut_mois integer not null check (debut_mois between 1 and 12),
  mode_acquisition text not null check (mode_acquisition in ('forfait', 'mensuel', 'anciennete')),
  quota_annuel numeric not null default 0,
  taux_mensuel numeric not null default 0,
  prorata_entree boolean not null default true,
  report text not null check (report in ('perdu', 'integral', 'plafonne')),
  plafond_report numeric not null default 0,
  report_expiration_mois integer not null default 3,
  paliers_anciennete jsonb not null default '[]'::jsonb
);

-- ---------------------------------------------------------- regles_generales
-- Singleton : une seule ligne (id = 1).
create table if not exists public.regles_generales (
  id integer primary key default 1 check (id = 1),
  saisie_retro_jours integer not null default 7,
  seuil_hsup_defaut_hebdo numeric not null default 35,
  verrouillage_apres_export boolean not null default true
);

-- -------------------------------------------------------------------- exports
create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  periode text not null,            -- 'YYYY-MM'
  perimetre text not null,          -- 'toutes' ou id de famille
  format text not null check (format in ('csv', 'xlsx')),
  genere_le timestamptz not null default now(),
  genere_par_user_id text not null,
  nb_saisies_verrouillees integer not null default 0
);

-- FK saisies.export_id -> exports.id (posée après création de exports).
alter table public.saisies
  drop constraint if exists saisies_export_fk;
alter table public.saisies
  add constraint saisies_export_fk
  foreign key (export_id) references public.exports (id) on delete set null;

-- ------------------------------------------------------------------ audit_log
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  cible_type text not null check (cible_type in ('saisie', 'conge', 'export')),
  cible_id uuid not null,
  action text not null check (action in (
    'validee', 'refusee', 'debloquee', 'modifiee',
    'demande_conge', 'conge_validee', 'conge_refusee', 'conge_jours_modifies', 'conge_annulee', 'export'
  )),
  par_user_id text not null,
  horodatage timestamptz not null default now(),
  detail text,
  saisie_id uuid,
  conge_id uuid
);
create index if not exists audit_cible_idx on public.audit_log (cible_id);
