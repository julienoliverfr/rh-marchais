-- ============================================================================
-- RH ETS Marchais — JEU DE DONNÉES DE DÉMONSTRATION
-- ----------------------------------------------------------------------------
-- Remplit l'application avec des données FICTIVES mais réalistes, pour montrer
-- à quoi elle ressemble en usage réel : plusieurs profils de contrat, deux mois
-- d'heures, des congés à tous les statuts, un salarié sorti des effectifs, un
-- salarié cumulant DEUX contrats, des heures supplémentaires, un pont chômé et
-- un mois déjà exporté.
--
-- REJOUABLE : le script efface d'abord ses propres données (préfixe « ddd… »)
-- puis les recrée. Il ne touche pas aux comptes de démonstration existants.
--
-- ⚠️ Il RÉÉCRIT juin et juillet 2026 pour les collaborateurs qu'il alimente
-- (les 4 d'origine et les siens). Des heures saisies à la main sur ces deux
-- mois, pour ces personnes-là, seront perdues. Les autres collaborateurs, et
-- toute autre période, ne sont pas touchés.
--
--   docker compose exec -T db psql -U postgres -d postgres < demo-data.sql
-- ============================================================================

begin;

-- ------------------------------------------------------------- Nettoyage ----
-- 1) Les données de démo portent des identifiants reconnaissables ('dddd…').
delete from public.audit_log  where cible_id::text like 'dddd%';
delete from public.saisies    where id::text like 'dddd%';
delete from public.conges     where id::text like 'dddd%';
delete from public.soldes     where id::text like 'dddd%';
delete from public.exports    where id::text like 'dddd%';
delete from public.saisies    where collaborateur_id::text like 'dddd%';
delete from public.conges     where collaborateur_id::text like 'dddd%';
delete from public.contrats   where collaborateur_id::text like 'dddd%';
-- Les comptes pointent vers ces fiches : sans détacher d'abord, la suppression
-- violerait la clé étrangère et le script ne serait plus rejouable. Les liens
-- sont rétablis plus bas, une fois les fiches recréées.
update public.profiles
   set collaborateur_id = null, collaborateurs_secondaires = null
 where collaborateur_id::text like 'dddd%';
delete from public.collaborateurs where id::text like 'dddd%';

-- 2) Heures et congés PRÉEXISTANTS sur la période de démonstration : ils
--    entreraient en conflit avec les données générées (une seule saisie par
--    collaborateur et par jour) et donneraient un résultat incohérent.
--
--    La suppression est LIMITÉE aux collaborateurs que ce script alimente. Elle
--    portait auparavant sur toute la période, tous collaborateurs confondus :
--    recharger la démo effaçait alors silencieusement les saisies et congés
--    créés à la main pour tester — y compris ceux d'un collaborateur ajouté
--    après coup, que la démo ne touche pourtant jamais.
create temporary table _demo_collabs (id uuid primary key) on commit drop;
insert into _demo_collabs
  select id from public.collaborateurs where id::text like 'dddd%'
  union
  select unnest(array[
    '33333333-3333-3333-3333-333333333301',
    '33333333-3333-3333-3333-333333333302',
    '33333333-3333-3333-3333-333333333303',
    '33333333-3333-3333-3333-333333333304']::uuid[]);

delete from public.saisies
 where date between '2026-06-01' and '2026-07-31'
   and collaborateur_id in (select id from _demo_collabs);
delete from public.conges
 where date_fin >= '2026-06-01'
   and collaborateur_id in (select id from _demo_collabs);

-- ------------------------------------------------- Équipes : réglages démo ---
-- L'équipe Vignes exige une description de la journée : cela montre le champ
-- « Ce que vous avez fait aujourd'hui » et son affichage côté responsable.
update public.familles set activite_obligatoire = true
 where id = '11111111-1111-1111-1111-111111111101';

-- --------------------------------------------------- Nouveaux collaborateurs -
-- 1) Camille Dubois — DEUX contrats à mi-temps (Vignes + Marchais).
-- 2) Théo Lambert  — saisonnier vendanges, congés en jours OUVRABLES.
-- 3) Marie Sorel   — SORTIE des effectifs (montre le badge « Sorti »).
-- 4) Sophie Marchais — la RESPONSABLE, qui est aussi salariée : elle saisit ses
--    heures et pose ses congés comme les autres. Sans fiche, elle n'aurait
--    aucun moyen de gérer les siens.
insert into public.collaborateurs (id, prenom, nom, famille_id, date_sortie) values
  ('dddd0001-0000-4000-8000-000000000001','Camille','Dubois','11111111-1111-1111-1111-111111111101', null),
  ('dddd0001-0000-4000-8000-000000000002','Camille','Dubois','11111111-1111-1111-1111-111111111102', null),
  ('dddd0001-0000-4000-8000-000000000003','Théo','Lambert','11111111-1111-1111-1111-111111111101', null),
  ('dddd0001-0000-4000-8000-000000000004','Marie','Sorel','11111111-1111-1111-1111-111111111102','2026-06-30'),
  ('dddd0001-0000-4000-8000-000000000005','Sophie','Marchais','11111111-1111-1111-1111-111111111102', null);

-- Contrats. Camille : deux mi-temps (17,5 h chacun) — seuils d'heures sup
-- indépendants. Théo : saisonnier en jours ouvrables (30 j de CP).
insert into public.contrats (collaborateur_id, modele_id, unite, base, seuil_hebdo, decompte_jours, quotas_par_type, date_debut) values
  ('dddd0001-0000-4000-8000-000000000001','22222222-2222-2222-2222-222222222201','heures',17.5,17.5,'ouvres','{"conge_paye":25,"rtt":5}','2021-09-01'),
  ('dddd0001-0000-4000-8000-000000000002','22222222-2222-2222-2222-222222222203','heures',17.5,17.5,'ouvres','{"conge_paye":25}','2023-03-01'),
  ('dddd0001-0000-4000-8000-000000000003','22222222-2222-2222-2222-222222222202','heures',39,39,'ouvrables','{"conge_paye":30}','2026-07-01'),
  ('dddd0001-0000-4000-8000-000000000004','22222222-2222-2222-2222-222222222203','heures',35,35,'ouvres','{"conge_paye":25}','2019-04-15'),
  ('dddd0001-0000-4000-8000-000000000005','22222222-2222-2222-2222-222222222203','heures',35,35,'ouvres','{"conge_paye":25,"rtt":8}','2015-02-01');

-- ------------------------------------------- Compte de connexion de Camille --
-- Un SEUL compte pour ses deux contrats (c'est tout l'intérêt du cumul).
-- `admin_create_login` exige un responsable : on emprunte l'identité de Sophie
-- le temps de l'appel (uniquement dans cette transaction).
--
-- Le mot de passe n'est PAS codé en dur : la valeur par défaut est publique (le
-- dépôt est ouvert), et une installation réelle en choisit une autre. Pour
-- l'aligner sur celle des autres comptes de démonstration, passer le réglage
-- à la CONNEXION (et non par `psql -v`, qui ne fait qu'une substitution côté
-- client, invisible depuis `current_setting`) :
--   PGOPTIONS="-c rh.demo_password=…" psql -U postgres -d postgres -f demo-data.sql
do $$
declare
  v_sophie uuid;
  v_mdp    text := coalesce(current_setting('rh.demo_password', true), 'demo1234');
begin
  select id into v_sophie from public.profiles where identifiant = 'sophie@demo.local';
  if v_sophie is null then return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_sophie)::text, true);
  if not exists (select 1 from public.profiles where identifiant = 'camille@demo.local') then
    perform public.admin_create_login(
      'camille', v_mdp, 'employe',
      'dddd0001-0000-4000-8000-000000000001', 'Camille Dubois');
  end if;
  -- Rattachements RÉTABLIS sans condition : le nettoyage en tête de script les a
  -- détachés, et le compte n'est pas recréé lors d'un rejeu.
  update public.profiles
     set collaborateur_id = 'dddd0001-0000-4000-8000-000000000001',
         collaborateurs_secondaires = array['dddd0001-0000-4000-8000-000000000002']::uuid[]
   where identifiant = 'camille@demo.local';

  -- La responsable est elle aussi salariée : on rattache son compte à sa fiche,
  -- sans quoi « Mes heures » et « Mes congés » n'apparaîtraient pas dans son
  -- menu et elle ne pourrait pas gérer ses propres congés.
  update public.profiles
     set collaborateur_id = 'dddd0001-0000-4000-8000-000000000005'
   where identifiant = 'sophie@demo.local'
     and collaborateur_id is null;
end $$;

-- -------------------------------------------------------------- Jours fériés -
-- Un pont chômé (vendredi suivant l'Ascension) : montre la surcouche
-- paramétrable, en plus des fériés calculés automatiquement.
insert into public.jours_feries (date, label, chome) values
  ('2026-05-15','Pont de l''Ascension', true)
on conflict (date) do nothing;

-- ==================================== SAISIES ================================
-- Deux mois d'heures (juin + juillet 2026), jours ouvrés uniquement, hors
-- fériés. Les statuts racontent un cycle de vie complet :
--   • juin           -> verrouillée (mois déjà exporté au comptable)
--   • juillet ≤ 24   -> validée
--   • semaine en cours -> en attente (dont une refusée à corriger)

-- Bloc 1 : équipe Vignes, journée continue, avec description d'activité.
insert into public.saisies (id, collaborateur_id, date, heure_debut, heure_fin, pause_min,
                            total_minutes, activite, statut, saisi_par, validee_par, validee_le)
select
  ('dddd1000-0000-4000-8000-' || lpad((row_number() over ())::text, 12, '0'))::uuid,
  c.id, d::date, '08:00', '17:00', 60, 480,
  (array['Taille parcelle nord','Palissage','Traitement vigne','Entretien matériel',
         'Préparation vendanges','Désherbage rang 12'])[1 + (extract(day from d)::int % 6)],
  case when d < '2026-07-01' then 'verrouillee'
       when d <= '2026-07-24' then 'validee'
       else 'en_attente' end,
  'demo',
  case when d <= '2026-07-24' then 'sophie@demo.local' end,
  case when d <= '2026-07-24' then d::timestamptz + interval '19 hours' end
from generate_series('2026-06-01'::date, '2026-07-28'::date, '1 day') d
cross join (values
  ('33333333-3333-3333-3333-333333333301'::uuid),  -- Jean Vasseur
  ('dddd0001-0000-4000-8000-000000000003'::uuid)   -- Théo Lambert (à partir de juillet)
) as c(id)
where extract(isodow from d) between 1 and 5
  and not exists (select 1 from public.jours_feries jf where jf.date = d and jf.chome)
  and d not in ('2026-06-01','2026-07-14','2026-05-25')
  and (c.id <> 'dddd0001-0000-4000-8000-000000000003'::uuid or d >= '2026-07-01');

-- Bloc 2 : Karim Benali — une semaine de VENDANGES à 9 h/jour (45 h) : fait
-- apparaître les heures supplémentaires et le cumul hebdomadaire.
insert into public.saisies (id, collaborateur_id, date, heure_debut, heure_fin, pause_min,
                            total_minutes, activite, statut, saisi_par, validee_par, validee_le)
select
  ('dddd2000-0000-4000-8000-' || lpad((row_number() over ())::text, 12, '0'))::uuid,
  '33333333-3333-3333-3333-333333333303'::uuid, d::date, '07:00', '17:00', 60,
  case when d between '2026-07-06' and '2026-07-10' then 540 else 480 end,
  case when d between '2026-07-06' and '2026-07-10' then 'Vendanges parcelle sud'
       else 'Entretien parcelles' end,
  case when d < '2026-07-01' then 'verrouillee'
       when d <= '2026-07-24' then 'validee' else 'en_attente' end,
  'demo',
  case when d <= '2026-07-24' then 'sophie@demo.local' end,
  case when d <= '2026-07-24' then d::timestamptz + interval '19 hours' end
from generate_series('2026-06-01'::date, '2026-07-28'::date, '1 day') d
where extract(isodow from d) between 1 and 5
  and not exists (select 1 from public.jours_feries jf where jf.date = d and jf.chome)
  and d not in ('2026-06-01','2026-07-14');

-- Bloc 3 : équipe Marchais, DEMI-JOURNÉES (autre mode de saisie).
insert into public.saisies (id, collaborateur_id, date, periode, matin_debut, matin_fin,
                            aprem_debut, aprem_fin, total_minutes, statut, saisi_par,
                            validee_par, validee_le)
select
  ('dddd3000-0000-4000-8000-' || lpad((row_number() over ())::text, 12, '0'))::uuid,
  c.id, d::date, 'journee', '08:30', '12:00', '13:30', '17:00', 420,
  case when d < '2026-07-01' then 'verrouillee'
       when d <= '2026-07-24' then 'validee' else 'en_attente' end,
  'demo',
  case when d <= '2026-07-24' then 'sophie@demo.local' end,
  case when d <= '2026-07-24' then d::timestamptz + interval '19 hours' end
from generate_series('2026-06-01'::date, '2026-07-28'::date, '1 day') d
cross join (values
  ('33333333-3333-3333-3333-333333333302'::uuid),  -- Amélie Lheureux
  ('33333333-3333-3333-3333-333333333304'::uuid)   -- Nadia Fontaine
) as c(id)
where extract(isodow from d) between 1 and 5
  and not exists (select 1 from public.jours_feries jf where jf.date = d and jf.chome)
  and d not in ('2026-06-01','2026-07-14')
  -- Amélie est en congés du 13 au 24 juillet (voir plus bas) : pas d'heures.
  and not (c.id = '33333333-3333-3333-3333-333333333302'::uuid
           and d between '2026-07-13' and '2026-07-24');

-- Bloc 3 bis : SOPHIE, la responsable — elle est salariée comme les autres et
-- saisit ses heures. Sans ce bloc, sa ligne dans la vue des présences était un
-- mur d'alertes « à expliquer », ce qui donnait l'impression d'un écran cassé
-- alors que c'était simplement une personne sans données.
-- Ses saisies sont VALIDÉES d'emblée : une saisie faite par un responsable
-- l'est automatiquement (il est lui-même le valideur).
insert into public.saisies (id, collaborateur_id, date, periode, matin_debut, matin_fin,
                            aprem_debut, aprem_fin, total_minutes, statut, saisi_par,
                            validee_par, validee_le)
select
  ('dddd9000-0000-4000-8000-' || lpad((row_number() over ())::text, 12, '0'))::uuid,
  'dddd0001-0000-4000-8000-000000000005'::uuid, d::date, 'journee',
  '08:30', '12:00', '13:30', '17:00', 420,
  case when d < '2026-07-01' then 'verrouillee' else 'validee' end,
  'sophie@demo.local', 'sophie@demo.local', d::timestamptz + interval '19 hours'
from generate_series('2026-06-01'::date, '2026-07-28'::date, '1 day') d
where extract(isodow from d) between 1 and 5
  and not exists (select 1 from public.jours_feries jf where jf.date = d and jf.chome)
  and d not in ('2026-06-01','2026-07-14');

-- Bloc 4 : CAMILLE — deux mi-temps, souvent LE MÊME JOUR (matin sur un contrat,
-- après-midi sur l'autre). C'est la démonstration du cumul de contrats.
insert into public.saisies (id, collaborateur_id, date, heure_debut, heure_fin, pause_min,
                            total_minutes, activite, statut, saisi_par, validee_par, validee_le)
select
  ('dddd4000-0000-4000-8000-' || lpad((row_number() over ())::text, 12, '0'))::uuid,
  'dddd0001-0000-4000-8000-000000000001'::uuid, d::date, '08:00', '11:30', 0, 210,
  'Vignes — matin',
  case when d < '2026-07-01' then 'verrouillee'
       when d <= '2026-07-24' then 'validee' else 'en_attente' end,
  'camille@demo.local',
  case when d <= '2026-07-24' then 'sophie@demo.local' end,
  case when d <= '2026-07-24' then d::timestamptz + interval '19 hours' end
from generate_series('2026-06-01'::date, '2026-07-28'::date, '1 day') d
where extract(isodow from d) between 1 and 5
  and not exists (select 1 from public.jours_feries jf where jf.date = d and jf.chome)
  and d not in ('2026-06-01','2026-07-14');

insert into public.saisies (id, collaborateur_id, date, periode, matin_debut, matin_fin,
                            aprem_debut, aprem_fin, total_minutes, statut, saisi_par,
                            validee_par, validee_le)
select
  ('dddd5000-0000-4000-8000-' || lpad((row_number() over ())::text, 12, '0'))::uuid,
  'dddd0001-0000-4000-8000-000000000002'::uuid, d::date, 'apres_midi', null, null,
  '13:30', '17:00', 210,
  case when d < '2026-07-01' then 'verrouillee'
       when d <= '2026-07-24' then 'validee' else 'en_attente' end,
  'camille@demo.local',
  case when d <= '2026-07-24' then 'sophie@demo.local' end,
  case when d <= '2026-07-24' then d::timestamptz + interval '19 hours' end
from generate_series('2026-06-01'::date, '2026-07-28'::date, '1 day') d
where extract(isodow from d) between 1 and 5
  and not exists (select 1 from public.jours_feries jf where jf.date = d and jf.chome)
  and d not in ('2026-06-01','2026-07-14');

-- Une saisie REFUSÉE à corriger (montre le motif et le parcours de correction).
update public.saisies
   set statut = 'refusee', refus_motif = 'Pause non déduite : merci de corriger.',
       validee_par = null, validee_le = null
 where collaborateur_id = '33333333-3333-3333-3333-333333333301'
   and date = '2026-07-27';

-- ===================================== CONGÉS ================================
-- Tous les statuts représentés : validé, en attente, refusé, annulé.
insert into public.conges (id, collaborateur_id, type, date_debut, date_fin, demi_jour,
                           nb_jours, statut, demande_par_user_id, validee_par_user_id,
                           refus_motif, motif, created_at) values
  -- Congés d'été validés (Amélie, 2 semaines)
  ('dddd6000-0000-4000-8000-000000000001','33333333-3333-3333-3333-333333333302','conge_paye',
   '2026-07-13','2026-07-24','aucune',10,'validee','amelie@demo.local','sophie@demo.local',
   null,'Vacances en famille','2026-06-10T09:00:00Z'),
  -- Demande EN ATTENTE (à traiter par le responsable)
  ('dddd6000-0000-4000-8000-000000000002','33333333-3333-3333-3333-333333333303','conge_paye',
   '2026-08-17','2026-08-21','aucune',5,'demandee','karim@demo.local',null,
   null,'Congés d''été','2026-07-20T14:30:00Z'),
  -- Demande en attente de Camille (sur son contrat Vignes)
  ('dddd6000-0000-4000-8000-000000000003','dddd0001-0000-4000-8000-000000000001','conge_paye',
   '2026-08-10','2026-08-14','aucune',5,'demandee','camille@demo.local',null,
   null,null,'2026-07-22T08:15:00Z'),
  -- REFUSÉE (avec motif)
  ('dddd6000-0000-4000-8000-000000000004','33333333-3333-3333-3333-333333333304','conge_paye',
   '2026-09-07','2026-09-18','aucune',10,'refusee','nadia@demo.local',null,
   'Période de vendanges : merci de décaler.',null,'2026-07-15T11:00:00Z'),
  -- ANNULÉE (le salarié n'est finalement pas parti)
  ('dddd6000-0000-4000-8000-000000000005','33333333-3333-3333-3333-333333333301','conge_paye',
   '2026-06-22','2026-06-26','aucune',5,'annulee','jean@demo.local','sophie@demo.local',
   'Arrêt maladie : congé annulé, jours rendus.',null,'2026-05-30T16:00:00Z'),
  -- Demi-journée (montre le décompte à 0,5)
  ('dddd6000-0000-4000-8000-000000000006','33333333-3333-3333-3333-333333333301','rtt',
   '2026-07-31','2026-07-31','debut',0.5,'validee','jean@demo.local','sophie@demo.local',
   null,'Rendez-vous médical','2026-07-25T10:00:00Z'),
  -- Arrêt maladie (type sans solde, justificatif requis)
  ('dddd6000-0000-4000-8000-000000000007','33333333-3333-3333-3333-333333333304','maladie',
   '2026-06-15','2026-06-17','aucune',3,'validee','nadia@demo.local','sophie@demo.local',
   null,'Arrêt de travail','2026-06-15T08:00:00Z'),
  -- Congé du saisonnier, décompté en jours OUVRABLES (samedi inclus)
  ('dddd6000-0000-4000-8000-000000000008','dddd0001-0000-4000-8000-000000000003','conge_paye',
   '2026-07-22','2026-07-24','aucune',4,'validee','theo@demo.local','sophie@demo.local',
   null,null,'2026-07-16T09:00:00Z');

-- Théo était en congés : on retire ses heures sur ces jours (cohérence).
delete from public.saisies
 where collaborateur_id = 'dddd0001-0000-4000-8000-000000000003'
   and date between '2026-07-22' and '2026-07-24';

-- --------------------------------------------- Allocation manuelle de solde --
-- Solde repris à la bascule sur l'application : montre le badge « manuel » et
-- le bouton « Recalculer » de l'écran Congés.
insert into public.soldes (id, collaborateur_id, type_id, periode_label, acquis) values
  ('dddd7000-0000-4000-8000-000000000001','33333333-3333-3333-3333-333333333304',
   'conge_paye','2026–2027', 18)
on conflict (id) do nothing;

-- --------------------------------------------------------- Export de juin ----
-- Le mois de juin a été transmis au comptable (d'où les saisies verrouillées).
insert into public.exports (id, periode, perimetre, format, genere_le, genere_par_user_id,
                            nb_saisies_verrouillees)
select 'dddd8000-0000-4000-8000-000000000001','2026-06','toutes','xlsx',
       '2026-07-02T09:12:00Z','sophie@demo.local',
       (select count(*) from public.saisies where statut = 'verrouillee')
on conflict (id) do nothing;

commit;

-- --------------------------------------------------------------- Contrôle ----
select 'collaborateurs' as element, count(*)::text as nb from public.collaborateurs
union all select 'saisies', count(*)::text from public.saisies
union all select '  dont validées', count(*)::text from public.saisies where statut='validee'
union all select '  dont verrouillées', count(*)::text from public.saisies where statut='verrouillee'
union all select '  dont en attente', count(*)::text from public.saisies where statut='en_attente'
union all select '  dont refusées', count(*)::text from public.saisies where statut='refusee'
union all select 'congés', count(*)::text from public.conges
union all select 'comptes', count(*)::text from public.profiles
order by 1;
