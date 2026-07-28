-- ============================================================================
-- RH ETS Marchais — SÉCURITÉ (RLS + policies)  [exécuter APRÈS schema.sql]
-- ----------------------------------------------------------------------------
-- C'EST LA SÉCURITÉ DE L'APPLICATION. Toute décision d'autorisation est prise
-- ICI, côté base — jamais confiée au client. La clé « anon » publique ne donne
-- accès à rien : seules ces policies décident qui lit/écrit quoi.
--
-- Rôles :
--   • employé      : lit/écrit UNIQUEMENT ses saisies & congés ; lit SES soldes ;
--                    lecture seule du référentiel (familles, modèles, types,
--                    politiques, règles).
--   • responsable  : lit/écrit les données de SON PÉRIMÈTRE (par famille) —
--                    saisies/congés/soldes de son équipe, validations ; et gère
--                    le référentiel/admin. Périmètre défini par
--                    profiles.familles_perimetre (NULL/vide = toutes familles).
-- ============================================================================

-- ------------------------------------------------------------------ Fonctions
-- SECURITY DEFINER : ces fonctions lisent `profiles` en contournant la RLS (donc
-- pas de récursion de policy) mais restent bornées à l'utilisateur courant.

create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_responsable()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'responsable', false)
$$;

create or replace function public.auth_collaborateur_id()
returns uuid language sql stable security definer set search_path = public as $$
  select collaborateur_id from public.profiles where id = auth.uid()
$$;

-- Périmètre (liste de familles) du responsable courant.
create or replace function public.auth_perimetre()
returns uuid[] language sql stable security definer set search_path = public as $$
  select familles_perimetre from public.profiles where id = auth.uid()
$$;

-- Le responsable courant voit-il cette famille ? (périmètre NULL/vide = toutes)
create or replace function public.responsable_sees_famille(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_responsable()
     and (
       public.auth_perimetre() is null
       or array_length(public.auth_perimetre(), 1) is null
       or fid = any(public.auth_perimetre())
     )
$$;

-- Le responsable courant voit-il ce collaborateur ? (via sa famille)
create or replace function public.responsable_sees_collaborateur(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.collaborateurs c
    where c.id = cid and public.responsable_sees_famille(c.famille_id)
  )
$$;

-- L'utilisateur courant a-t-il reçu DÉLÉGATION pour saisir les heures de `cid` ?
-- Vrai si une ligne `delegations_saisie` relie SON collaborateur (delegant) à la
-- cible `cid`. Renvoie faux pour un responsable (collaborateur_id NULL). C'EST
-- la décision d'autorisation de la saisie déléguée, prise côté base.
create or replace function public.auth_peut_saisir_pour(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.delegations_saisie d
    where d.cible_collaborateur_id = cid
      and d.delegant_collaborateur_id = public.auth_collaborateur_id()
  )
$$;

-- --------------------------------------------------------- Activation RLS -----
alter table public.profiles          enable row level security;
alter table public.familles          enable row level security;
alter table public.modeles_contrat   enable row level security;
alter table public.collaborateurs    enable row level security;
alter table public.contrats          enable row level security;
alter table public.delegations_saisie enable row level security;
alter table public.saisies           enable row level security;
alter table public.conges            enable row level security;
alter table public.soldes            enable row level security;
alter table public.types_absence     enable row level security;
alter table public.jours_feries      enable row level security;
alter table public.politiques_conges enable row level security;
alter table public.regles_generales  enable row level security;
alter table public.exports           enable row level security;
alter table public.audit_log         enable row level security;

-- ================================ profiles ===================================
-- Chacun lit son profil ; le responsable lit/gère tous les profils.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_responsable());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_responsable())
  with check (id = auth.uid() or public.is_responsable());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_responsable());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_responsable());

-- ===================== Référentiel : lecture pour tous ======================
-- familles / modeles_contrat / types_absence / politiques_conges / regles :
-- lecture pour tout utilisateur connecté, écriture réservée au responsable.

-- familles
drop policy if exists familles_select on public.familles;
create policy familles_select on public.familles for select to authenticated
  using (true);
drop policy if exists familles_write on public.familles;
create policy familles_write on public.familles for all to authenticated
  using (public.is_responsable()) with check (public.is_responsable());

-- modeles_contrat
drop policy if exists modeles_select on public.modeles_contrat;
create policy modeles_select on public.modeles_contrat for select to authenticated
  using (true);
drop policy if exists modeles_write on public.modeles_contrat;
create policy modeles_write on public.modeles_contrat for all to authenticated
  using (public.is_responsable()) with check (public.is_responsable());

-- types_absence
drop policy if exists types_select on public.types_absence;
create policy types_select on public.types_absence for select to authenticated
  using (true);
drop policy if exists types_write on public.types_absence;
create policy types_write on public.types_absence for all to authenticated
  using (public.is_responsable()) with check (public.is_responsable());

-- jours_feries (lecture par tous ; écriture responsable)
drop policy if exists feries_select on public.jours_feries;
create policy feries_select on public.jours_feries for select to authenticated
  using (true);
drop policy if exists feries_write on public.jours_feries;
create policy feries_write on public.jours_feries for all to authenticated
  using (public.is_responsable()) with check (public.is_responsable());

-- politiques_conges
drop policy if exists politiques_select on public.politiques_conges;
create policy politiques_select on public.politiques_conges for select to authenticated
  using (true);
drop policy if exists politiques_write on public.politiques_conges;
create policy politiques_write on public.politiques_conges for all to authenticated
  using (public.is_responsable()) with check (public.is_responsable());

-- regles_generales
drop policy if exists regles_select on public.regles_generales;
create policy regles_select on public.regles_generales for select to authenticated
  using (true);
drop policy if exists regles_write on public.regles_generales;
create policy regles_write on public.regles_generales for all to authenticated
  using (public.is_responsable()) with check (public.is_responsable());

-- ============================= collaborateurs ================================
-- L'employé lit SON collaborateur ; le responsable lit/écrit son périmètre.
drop policy if exists collaborateurs_select on public.collaborateurs;
create policy collaborateurs_select on public.collaborateurs for select to authenticated
  using (
    id = public.auth_collaborateur_id()
    or public.auth_peut_saisir_pour(id)          -- collègues délégués (dropdown de saisie)
    or public.responsable_sees_collaborateur(id)
  );

drop policy if exists collaborateurs_insert on public.collaborateurs;
create policy collaborateurs_insert on public.collaborateurs for insert to authenticated
  with check (public.responsable_sees_famille(famille_id));

drop policy if exists collaborateurs_update on public.collaborateurs;
create policy collaborateurs_update on public.collaborateurs for update to authenticated
  using (public.responsable_sees_collaborateur(id))
  with check (public.responsable_sees_famille(famille_id));

drop policy if exists collaborateurs_delete on public.collaborateurs;
create policy collaborateurs_delete on public.collaborateurs for delete to authenticated
  using (public.responsable_sees_collaborateur(id));

-- ================================= contrats ==================================
drop policy if exists contrats_select on public.contrats;
create policy contrats_select on public.contrats for select to authenticated
  using (
    collaborateur_id = public.auth_collaborateur_id()
    or public.auth_peut_saisir_pour(collaborateur_id)
    or public.responsable_sees_collaborateur(collaborateur_id)
  );
drop policy if exists contrats_write on public.contrats;
create policy contrats_write on public.contrats for all to authenticated
  using (public.responsable_sees_collaborateur(collaborateur_id))
  with check (public.responsable_sees_collaborateur(collaborateur_id));

-- =========================== delegations_saisie =============================
-- Lecture : le délégant lit SES délégations (pour peupler le dropdown de saisie
-- déléguée) ; le responsable lit celles de son périmètre. Écriture (définition
-- de la liste) : responsable UNIQUEMENT, et seulement pour des collaborateurs
-- (délégant + cible) de son périmètre. Un employé ne s'auto-attribue JAMAIS une
-- délégation.
drop policy if exists delegations_select on public.delegations_saisie;
create policy delegations_select on public.delegations_saisie for select to authenticated
  using (
    delegant_collaborateur_id = public.auth_collaborateur_id()
    or public.responsable_sees_collaborateur(delegant_collaborateur_id)
    or public.responsable_sees_collaborateur(cible_collaborateur_id)
  );

drop policy if exists delegations_write on public.delegations_saisie;
create policy delegations_write on public.delegations_saisie for all to authenticated
  using (
    public.responsable_sees_collaborateur(delegant_collaborateur_id)
    and public.responsable_sees_collaborateur(cible_collaborateur_id)
  )
  with check (
    public.responsable_sees_collaborateur(delegant_collaborateur_id)
    and public.responsable_sees_collaborateur(cible_collaborateur_id)
  );

-- ================================= saisies ===================================
-- L'employé gère SES saisies ; le responsable gère celles de son périmètre.
-- DÉLÉGATION : un employé peut lire/insérer/mettre à jour une saisie dont le
-- `collaborateur_id` est le sien OU ∈ ses délégations (`auth_peut_saisir_pour`).
-- La SUPPRESSION reste réservée au propriétaire ou au responsable (une
-- délégation autorise la saisie, pas l'effacement des données d'un collègue).
drop policy if exists saisies_select on public.saisies;
create policy saisies_select on public.saisies for select to authenticated
  using (
    collaborateur_id = public.auth_collaborateur_id()
    or public.auth_peut_saisir_pour(collaborateur_id)
    or public.responsable_sees_collaborateur(collaborateur_id)
  );

drop policy if exists saisies_insert on public.saisies;
create policy saisies_insert on public.saisies for insert to authenticated
  with check (
    collaborateur_id = public.auth_collaborateur_id()
    or public.auth_peut_saisir_pour(collaborateur_id)
    or public.responsable_sees_collaborateur(collaborateur_id)
  );

drop policy if exists saisies_update on public.saisies;
create policy saisies_update on public.saisies for update to authenticated
  using (
    collaborateur_id = public.auth_collaborateur_id()
    or public.auth_peut_saisir_pour(collaborateur_id)
    or public.responsable_sees_collaborateur(collaborateur_id)
  )
  with check (
    collaborateur_id = public.auth_collaborateur_id()
    or public.auth_peut_saisir_pour(collaborateur_id)
    or public.responsable_sees_collaborateur(collaborateur_id)
  );

drop policy if exists saisies_delete on public.saisies;
create policy saisies_delete on public.saisies for delete to authenticated
  using (
    collaborateur_id = public.auth_collaborateur_id()
    or public.responsable_sees_collaborateur(collaborateur_id)
  );

-- ================================== conges ===================================
-- L'employé demande/gère SES congés ; le responsable valide/refuse son périmètre.
drop policy if exists conges_select on public.conges;
create policy conges_select on public.conges for select to authenticated
  using (
    collaborateur_id = public.auth_collaborateur_id()
    or public.responsable_sees_collaborateur(collaborateur_id)
  );

drop policy if exists conges_insert on public.conges;
create policy conges_insert on public.conges for insert to authenticated
  with check (
    collaborateur_id = public.auth_collaborateur_id()
    or public.responsable_sees_collaborateur(collaborateur_id)
  );

drop policy if exists conges_update on public.conges;
create policy conges_update on public.conges for update to authenticated
  using (
    collaborateur_id = public.auth_collaborateur_id()
    or public.responsable_sees_collaborateur(collaborateur_id)
  )
  with check (
    collaborateur_id = public.auth_collaborateur_id()
    or public.responsable_sees_collaborateur(collaborateur_id)
  );

drop policy if exists conges_delete on public.conges;
create policy conges_delete on public.conges for delete to authenticated
  using (
    collaborateur_id = public.auth_collaborateur_id()
    or public.responsable_sees_collaborateur(collaborateur_id)
  );

-- ================================== soldes ===================================
-- L'employé lit SES soldes (override d'acquis) ; écriture = responsable seul.
drop policy if exists soldes_select on public.soldes;
create policy soldes_select on public.soldes for select to authenticated
  using (
    collaborateur_id = public.auth_collaborateur_id()
    or public.responsable_sees_collaborateur(collaborateur_id)
  );
drop policy if exists soldes_write on public.soldes;
create policy soldes_write on public.soldes for all to authenticated
  using (public.responsable_sees_collaborateur(collaborateur_id))
  with check (public.responsable_sees_collaborateur(collaborateur_id));

-- ================================== exports ==================================
-- Verrouillages comptables : réservés au responsable.
drop policy if exists exports_select on public.exports;
create policy exports_select on public.exports for select to authenticated
  using (public.is_responsable());
drop policy if exists exports_write on public.exports;
create policy exports_write on public.exports for all to authenticated
  using (public.is_responsable()) with check (public.is_responsable());

-- ================================= audit_log =================================
-- Journal APPEND-ONLY : insertion par tout utilisateur connecté (traçabilité de
-- ses propres actions), lecture par le responsable (ou l'auteur), et AUCUN
-- update/delete (immuable — pas de policy = interdit).
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_responsable() or par_user_id = auth.uid()::text);

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (auth.uid() is not null);
