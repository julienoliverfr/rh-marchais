-- ============================================================================
-- RH ETS Marchais — FONCTIONS d'administration des comptes de connexion
-- [exécuter APRÈS rls.sql, AVANT la création des comptes de démo + seed.sql]
-- ----------------------------------------------------------------------------
-- Créer (ou supprimer) un utilisateur d'AUTHENTIFICATION exige une opération
-- PRIVILÉGIÉE (normalement la clé « service_role »). Cette clé ne doit JAMAIS
-- se retrouver dans le client. À la place, ces fonctions `SECURITY DEFINER`
-- s'exécutent avec les droits de leur propriétaire (postgres) et sont appelées
-- via `supabase.rpc(...)` avec la clé anon + le JWT de l'utilisateur connecté.
--
-- La seule autorisation est la GARDE interne « responsable uniquement », lue
-- depuis `public.profiles` via `public.is_responsable()` (définie dans rls.sql).
-- `search_path` est FIXÉ (obligatoire pour une fonction SECURITY DEFINER).
-- ============================================================================

create extension if not exists pgcrypto;  -- crypt(), gen_salt(), gen_random_uuid()

-- --------------------------------------------------------- admin_create_login
-- Crée un utilisateur d'auth (GoTrue) + son identité e-mail + le profil lié.
-- L'e-mail suit la convention de l'appli : « <identifiant>@demo.local ».
-- Retourne l'UID du nouvel utilisateur. Lève une exception claire si l'appelant
-- n'est pas responsable, si le rôle est invalide, ou si l'e-mail existe déjà.
create or replace function public.admin_create_login(
  p_identifiant      text,
  p_mot_de_passe     text,
  p_role             text,
  p_collaborateur_id uuid,
  p_nom_affichage    text
) returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid   uuid := gen_random_uuid();
  v_login text := lower(trim(p_identifiant));
  v_email text;
begin
  -- GARDE : réservé au responsable connecté (décision prise côté base).
  if not public.is_responsable() then
    raise exception 'Action réservée au responsable.' using errcode = '42501';
  end if;

  if v_login is null or v_login = '' then
    raise exception 'Identifiant obligatoire.' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('employe', 'responsable') then
    raise exception 'Rôle invalide : %', p_role using errcode = '22023';
  end if;
  -- Politique de mot de passe (supabase/politique-mot-de-passe.sql). Contrôlée
  -- ICI parce que cette fonction écrit directement dans auth.users : un réglage
  -- côté GoTrue ne s'appliquerait pas.
  perform public.verifier_mot_de_passe(p_mot_de_passe);

  -- Cohérence avec l'auth de l'appli (authStore.toEmail).
  v_email := case when position('@' in v_login) > 0 then v_login else v_login || '@demo.local' end;

  -- Erreur claire si le compte existe déjà (plutôt qu'une violation d'unicité brute).
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Un compte existe déjà pour l''identifiant « % ».', v_login
      using errcode = '23505';
  end if;

  -- 1) Utilisateur d'authentification.
  --    IMPORTANT : GoTrue lit certains champs texte comme des chaînes Go et
  --    échoue à la connexion s'ils sont NULL (« converting NULL to string »).
  --    On les initialise donc explicitement à '' (chaîne vide).
  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
    crypt(p_mot_de_passe, gen_salt('bf')), now(),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '',
    '', '', '',
    '', '', ''
  );

  -- 2) Identité e-mail liée. `provider_id` = l'UID (comme le fait l'API admin
  --    GoTrue), pas l'e-mail ; la colonne `email` d'auth.identities est générée
  --    depuis identity_data dans les versions récentes : on ne l'insère pas.
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email),
    now(), now(), now()
  );

  -- 3) Profil applicatif (cohérent avec public.profiles : rôle + rattachement).
  insert into public.profiles (id, identifiant, role, collaborateur_id, nom_affichage)
  values (
    v_uid, v_email, p_role, p_collaborateur_id,
    coalesce(nullif(trim(p_nom_affichage), ''), v_email)
  );

  return v_uid;
end;
$$;

-- --------------------------------------------------------- admin_delete_login
-- Supprime le profil PUIS l'utilisateur d'auth (les identités partent en
-- cascade via la FK auth.identities.user_id -> auth.users). Réservé au
-- responsable ; INTERDIT de supprimer son propre compte.
create or replace function public.admin_delete_login(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if not public.is_responsable() then
    raise exception 'Action réservée au responsable.' using errcode = '42501';
  end if;

  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas supprimer votre propre compte.'
      using errcode = '42501';
  end if;

  delete from public.profiles   where id = p_user_id;
  -- Filet de sécurité si la contrainte FK n'assure pas le CASCADE.
  delete from auth.identities   where user_id = p_user_id;
  delete from auth.users        where id = p_user_id;
end;
$$;

-- --------------------------------------------------------- admin_reset_password
-- Réinitialise le mot de passe d'un utilisateur d'auth EXISTANT (l'identifiant /
-- e-mail n'est PAS modifié). Réservé au responsable connecté. Simple mise à jour
-- de la ligne `auth.users` (pas besoin de toucher aux identités ni aux jetons).
create or replace function public.admin_reset_password(
  p_user_id             uuid,
  p_nouveau_mot_de_passe text
) returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  -- GARDE : réservé au responsable connecté (décision prise côté base).
  if not public.is_responsable() then
    raise exception 'Action réservée au responsable.' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Utilisateur cible obligatoire.' using errcode = '22023';
  end if;
  if p_nouveau_mot_de_passe is null or p_nouveau_mot_de_passe = '' then
    raise exception 'Le nouveau mot de passe est obligatoire.' using errcode = '22023';
  end if;
  -- Même politique qu'à la création : sans cela, une réinitialisation aurait
  -- suffi à contourner la règle.
  perform public.verifier_mot_de_passe(p_nouveau_mot_de_passe);

  update auth.users
     set encrypted_password = crypt(p_nouveau_mot_de_passe, gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;

  if not found then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- Exécution autorisée à tout utilisateur connecté ; l'autorisation FINE
-- (responsable uniquement) est portée par la garde dans le corps des fonctions.
grant execute on function public.admin_create_login(text, text, text, uuid, text) to authenticated;
grant execute on function public.admin_delete_login(uuid) to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;

-- ------------------------------------------------------ admin_purger_donnees
-- REMISE À ZÉRO : efface toutes les données SAISIES en conservant le
-- PARAMÉTRAGE (équipes, modèles de contrat, types d'absence, politiques de
-- congés, règles générales, jours fériés). Sert à repartir d'une base propre
-- après une phase de test ou de démonstration, avant les vraies données.
--
-- Ce qui est EFFACÉ : journal d'audit · exports · soldes · congés · saisies ·
-- délégations · contrats · collaborateurs · TOUS les comptes de connexion.
-- Ce qui est CONSERVÉ : tout le paramétrage, et UNIQUEMENT le compte qui lance
-- l'opération — sinon l'administrateur se couperait l'accès à sa propre
-- application (et la base n'aurait plus aucun responsable).
--
-- Opération IRRÉVERSIBLE. Réservée au responsable (garde interne). Elle laisse
-- une trace unique dans le journal, écrite après l'effacement.
create or replace function public.admin_purger_donnees()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_moi     uuid;
  v_compte  jsonb;
begin
  if not public.is_responsable() then
    raise exception 'Action réservée au responsable.' using errcode = '42501';
  end if;
  v_moi := auth.uid();

  -- Décompte AVANT effacement (retourné à l'appelant pour un message précis).
  select jsonb_build_object(
           'saisies',        (select count(*) from public.saisies),
           'conges',         (select count(*) from public.conges),
           'collaborateurs', (select count(*) from public.collaborateurs),
           'comptes',        (select count(*) from public.profiles where id <> v_moi),
           'exports',        (select count(*) from public.exports)
         ) into v_compte;

  -- Autorise la suppression du journal (immuable en fonctionnement normal).
  perform set_config('rh.purge', 'on', true);

  delete from public.audit_log;
  delete from public.exports;
  delete from public.soldes;
  delete from public.conges;
  delete from public.saisies;
  delete from public.delegations_saisie;
  delete from public.contrats;

  -- TOUS les comptes sauf celui qui lance l'opération : on supprime
  -- l'utilisateur d'authentification, le profil part en cascade
  -- (profiles.id -> auth.users on delete cascade). Le compte conservé garantit
  -- qu'il reste un administrateur pour reconstruire l'équipe.
  delete from auth.identities where user_id in (
    select id from public.profiles where id <> v_moi);
  delete from auth.users where id in (
    select id from public.profiles where id <> v_moi);
  delete from public.profiles where id <> v_moi;  -- filet de sécurité

  -- Les collaborateurs en dernier : les profils responsables qui y étaient
  -- rattachés sont détachés automatiquement (FK on delete set null).
  delete from public.collaborateurs;
  update public.profiles set collaborateurs_secondaires = null;

  -- Trace de l'opération (le journal vient d'être vidé : cette ligne est la
  -- première du nouveau journal).
  insert into public.audit_log (cible_type, cible_id, action, par_user_id, detail)
  select 'systeme', gen_random_uuid(), 'purge',
         coalesce((select identifiant from public.profiles where id = v_moi), v_moi::text),
         'Remise à zéro : ' || v_compte::text;

  return v_compte;
end;
$$;

grant execute on function public.admin_purger_donnees() to authenticated;
