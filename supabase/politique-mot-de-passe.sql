-- ============================================================================
-- POLITIQUE DE MOT DE PASSE
-- ----------------------------------------------------------------------------
-- Applicable À CHAUD, rejouable.
--
-- Pourquoi la règle vit ICI et non dans la configuration de GoTrue :
-- `admin_create_login` et `admin_reset_password` écrivent DIRECTEMENT dans
-- `auth.users` et court-circuitent donc GoTrue. Or c'est par elles que passent
-- TOUS les comptes de l'application. Un `PASSWORD_MIN_LENGTH` côté GoTrue
-- n'aurait protégé que les appels à son API, que l'application n'utilise pas —
-- une protection rassurante et sans effet.
--
-- La règle est écrite UNE FOIS et appelée par les deux fonctions : deux copies
-- finiraient par diverger, et c'est toujours la plus permissive qui gagne.
--
--   docker compose exec -T db psql -U postgres -d postgres \
--     < supabase/politique-mot-de-passe.sql
-- ============================================================================

-- Longueur minimale. 10 caractères : au-delà de ce seuil, une attaque par
-- force brute cesse d'être réaliste, et cela reste saisissable sur un clavier
-- de téléphone — critère décisif ici, où l'application s'utilise aux champs.
--
-- Pas de règle de complexité (majuscule, chiffre, caractère spécial) : elle
-- pousse invariablement vers « Vendange1! », plus court à casser qu'une phrase
-- simple, et bien plus pénible à taper avec des gants.
create or replace function public.verifier_mot_de_passe(p_mdp text)
returns void
language plpgsql
immutable
as $$
declare
  v_min constant int := 10;
  -- Mots de passe manifestement inaptes, quelle que soit leur longueur.
  v_interdits constant text[] := array[
    'motdepasse', 'password', 'azertyuiop', 'qwertyuiop', '0123456789',
    '1234567890', 'marchais', 'marchais123', 'vendanges', 'demo1234'
  ];
begin
  if p_mdp is null or length(p_mdp) < v_min then
    raise exception 'Le mot de passe doit contenir au moins % caractères.', v_min
      using errcode = '22023';
  end if;
  if lower(p_mdp) = any (v_interdits) then
    raise exception 'Ce mot de passe est trop courant : choisissez-en un autre.'
      using errcode = '22023';
  end if;
  -- Un seul caractère répété passerait la longueur sans rien valoir.
  if length(replace(p_mdp, substr(p_mdp, 1, 1), '')) = 0 then
    raise exception 'Le mot de passe ne peut pas être un seul caractère répété.'
      using errcode = '22023';
  end if;
end;
$$;

comment on function public.verifier_mot_de_passe(text) is
  'Politique de mot de passe. Appelée par admin_create_login et admin_reset_password.';
