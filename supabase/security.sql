-- ============================================================================
-- RH ETS Marchais — DURCISSEMENT DE SÉCURITÉ
-- [à exécuter APRÈS rls.sql ; réexécutable sans effet de bord]
-- ----------------------------------------------------------------------------
-- Corrige trois failles qui rendaient le modèle d'autorisation décoratif :
--   1. un employé pouvait se promouvoir « responsable » (profiles.role ouvert
--      en écriture à son propre porteur) ;
--   2. un employé pouvait valider ses propres heures/congés (aucune contrainte
--      de transition sur `statut` côté base) ;
--   3. le journal d'audit était falsifiable (`par_user_id` fourni par le client).
-- Ajoute aussi un garde-fou « il doit rester au moins un responsable ».
--
-- Principe : la décision d'autorisation appartient à la BASE. L'interface ne
-- fait que refléter ces règles ; elle n'en est plus la seule gardienne.
-- ============================================================================

-- ---------------------------------------------------------------- profiles ---
-- Le client n'a AUCUN besoin d'écrire son propre profil (il ne fait que le
-- lire au login). Seul un responsable modifie les profils.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_responsable())
  with check (public.is_responsable());

-- Garde-fou : interdire de supprimer/rétrograder le DERNIER responsable
-- (sinon plus personne ne peut administrer, réparation SQL uniquement).
create or replace function public.guard_dernier_responsable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.profiles where role = 'responsable') = 0 then
    raise exception 'Il doit rester au moins un responsable.' using errcode = '42501';
  end if;
  return null;
end $$;

drop trigger if exists trg_dernier_responsable_upd on public.profiles;
create trigger trg_dernier_responsable_upd
  after update on public.profiles
  for each statement execute function public.guard_dernier_responsable();

drop trigger if exists trg_dernier_responsable_del on public.profiles;
create trigger trg_dernier_responsable_del
  after delete on public.profiles
  for each statement execute function public.guard_dernier_responsable();

-- ----------------------------------------------------------------- saisies ---
-- Seul le responsable pilote le WORKFLOW (statut, validation, verrouillage,
-- rattachement à un export). Un salarié (ou un délégué) crée en « en_attente »
-- et ne peut modifier que tant que la saisie n'est pas validée/verrouillée.
-- Exception nécessaire : corriger une saisie REFUSÉE la renvoie en validation.
create or replace function public.guard_saisie_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Le responsable qui a le collaborateur dans son périmètre garde la main.
  if public.responsable_sees_collaborateur(new.collaborateur_id) then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    -- Création : toujours en attente de validation, jamais pré-validée.
    new.statut        := 'en_attente';
    new.validee_par   := null;
    new.validee_le    := null;
    new.debloquee_par := null;
    new.export_id     := null;
    return new;
  end if;

  -- UPDATE : une saisie validée ou verrouillée est FIGÉE pour le salarié.
  if old.statut in ('validee', 'verrouillee') then
    raise exception 'Saisie verrouillée : seul le responsable peut la rouvrir.'
      using errcode = '42501';
  end if;

  -- Le salarié ne touche à aucun champ de workflow… sauf renvoyer en
  -- validation une saisie refusée (correction).
  if new.statut is distinct from old.statut
     and not (old.statut = 'refusee' and new.statut = 'en_attente') then
    raise exception 'Seul le responsable peut changer le statut d''une saisie.'
      using errcode = '42501';
  end if;
  if new.validee_par   is distinct from old.validee_par
     or new.validee_le    is distinct from old.validee_le
     or new.debloquee_par is distinct from old.debloquee_par
     or new.export_id     is distinct from old.export_id then
    raise exception 'Champs de validation réservés au responsable.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_saisie_workflow on public.saisies;
create trigger trg_saisie_workflow
  before insert or update on public.saisies
  for each row execute function public.guard_saisie_workflow();

-- Suppression : un salarié ne supprime que ce qui n'est pas encore acté.
drop policy if exists saisies_delete on public.saisies;
create policy saisies_delete on public.saisies for delete to authenticated
  using (
    public.responsable_sees_collaborateur(collaborateur_id)
    or (
      collaborateur_id = public.auth_collaborateur_id()
      and statut in ('en_attente', 'refusee')
      and export_id is null
    )
  );

-- ------------------------------------------------------------------ conges ---
-- Même principe : une demande naît « demandee » ; seul le responsable valide,
-- refuse ou ajuste.
create or replace function public.guard_conge_workflow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.responsable_sees_collaborateur(new.collaborateur_id) then
    return new;
  end if;

  if TG_OP = 'INSERT' then
    new.statut               := 'demandee';
    new.validee_par_user_id  := null;
    new.refus_motif          := null;
    return new;
  end if;

  if new.statut is distinct from old.statut
     or new.validee_par_user_id is distinct from old.validee_par_user_id
     or new.refus_motif is distinct from old.refus_motif
     or new.nb_jours is distinct from old.nb_jours then
    raise exception 'Seul le responsable peut traiter une demande de congé.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_conge_workflow on public.conges;
create trigger trg_conge_workflow
  before insert or update on public.conges
  for each row execute function public.guard_conge_workflow();

-- Suppression : le salarié ne retire qu'une demande NON traitée.
drop policy if exists conges_delete on public.conges;
create policy conges_delete on public.conges for delete to authenticated
  using (
    public.responsable_sees_collaborateur(collaborateur_id)
    or (collaborateur_id = public.auth_collaborateur_id() and statut = 'demandee')
  );

-- ---------------------------------------------------------- collaborateurs ---
-- On ne SUPPRIME jamais un collaborateur : ses saisies, congés et soldes
-- partiraient en CASCADE (schema.sql), détruisant un historique de paie soumis
-- à obligation de conservation. La sortie des effectifs se fait en renseignant
-- `collaborateurs.date_sortie`. On retire donc la policy de suppression.
drop policy if exists collaborateurs_delete on public.collaborateurs;

-- --------------------------------------------------------------- audit_log ---
-- L'AUTEUR n'est plus déclaratif : il est imposé depuis le jeton de session.
-- Le journal redevient probant (on ne peut plus signer à la place d'autrui).
create or replace function public.audit_force_auteur()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_identifiant text;
begin
  -- Uniquement pour un appel AUTHENTIFIÉ (le seul cas falsifiable). Une
  -- insertion administrateur (script SQL, seed, maintenance) n'a pas de jeton :
  -- on ne l'écrase pas, sinon `par_user_id` deviendrait NULL.
  if auth.uid() is not null then
    select identifiant into v_identifiant from public.profiles where id = auth.uid();
    new.par_user_id := coalesce(v_identifiant, auth.uid()::text);
    new.horodatage  := now();  -- l'horodatage non plus n'est pas déclaratif
  end if;
  return new;
end $$;

-- APPEND-ONLY garanti par la base : une trace ne peut être ni modifiée ni
-- supprimée (y compris via un upsert « INSERT … ON CONFLICT DO UPDATE »).
-- Portée : les utilisateurs de l'APPLICATION (porteurs d'un jeton). Un
-- administrateur de base (psql, maintenance, purge RGPD) reste souverain — de
-- toute façon rien ne peut l'en empêcher, il pourrait désactiver le trigger.
create or replace function public.audit_immuable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    raise exception 'Le journal d''audit est immuable (ni modification ni suppression).'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_audit_immuable on public.audit_log;
create trigger trg_audit_immuable
  before update or delete on public.audit_log
  for each row execute function public.audit_immuable();

drop trigger if exists trg_audit_auteur on public.audit_log;
create trigger trg_audit_auteur
  before insert on public.audit_log
  for each row execute function public.audit_force_auteur();

-- Lecture : la comparaison portait sur auth.uid() alors que la colonne contient
-- un identifiant lisible → la branche « ses propres actions » était morte.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (
    public.is_responsable()
    or par_user_id = (select identifiant from public.profiles where id = auth.uid())
  );
