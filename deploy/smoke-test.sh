#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Smoke-test de l'application RH — À LANCER SUR LE SERVEUR après un déploiement.
#   cd /opt/rh-marchais && bash deploy/smoke-test.sh
#
# Il teste l'appli dans les VRAIES conditions (http + Supabase + RLS) : il se
# connecte via l'API d'authentification comme les comptes de démo, exerce les
# écritures clés (saisie, congé, audit) et vérifie les résultats attendus —
# succès pour les actions légitimes, REJET pour les actions interdites — puis
# nettoie les données de test. Sort en erreur (code ≠ 0) si un test échoue.
#
# But : attraper AVANT toi les bugs d'intégration (RLS, colonnes, doublons…)
# qui ne se voient pas dans un test unitaire.
# ---------------------------------------------------------------------------
set -uo pipefail
cd /opt/supabase

ANON=$(grep "^ANON_KEY=" .env | cut -d= -f2-)
IP=$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
API="http://$IP:8000"
PASS=0; FAIL=0
ok(){ echo "  OK  $1"; PASS=$((PASS+1)); }
ko(){ echo "  KO  $1"; FAIL=$((FAIL+1)); }

psql(){ docker compose exec -T db psql -U postgres -d postgres -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }
login(){ curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
  | grep -o '"access_token":"[^"]*"' | head -1 | cut -d'"' -f4; }
post(){ curl -s -o /tmp/smoke_body.txt -w "%{http_code}" -X POST "$API/rest/v1/$1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $2" -H "Content-Type: application/json" -d "$3"; }

echo "== Smoke-test RH ($API) =="

# 1) Authentification des 3 comptes de démo
JEAN=$(login jean@demo.local demo1234)
AMELIE=$(login amelie@demo.local demo1234)
SOPHIE=$(login sophie@demo.local demo1234)
[ "${#JEAN}"   -gt 50 ] && ok "login jean"   || ko "login jean"
[ "${#AMELIE}" -gt 50 ] && ok "login amelie" || ko "login amelie"
[ "${#SOPHIE}" -gt 50 ] && ok "login sophie" || ko "login sophie"

# Collaborateurs rattachés (découverts, pas codés en dur)
JC=$(psql "select collaborateur_id from public.profiles where identifiant='jean@demo.local'")
AC=$(psql "select collaborateur_id from public.profiles where identifiant='amelie@demo.local'")
[ -n "$JC" ] && ok "collaborateur de jean trouvé" || ko "collaborateur de jean introuvable"

# Dates de test RELATIVES : une date figée finit par sortir de la fenêtre de
# saisie rétroactive (7 j) et fait échouer le test sans que l'appli soit en cause.
JOUR=$(date +%F)
PLUS_TARD=$(date -d "+40 days" +%F)

# ids de test (nettoyés à la fin)
S1=aaaaaaaa-0000-4000-8000-000000000001
C1=aaaaaaaa-0000-4000-8000-000000000002
A1=aaaaaaaa-0000-4000-8000-000000000003
X9=aaaaaaaa-0000-4000-8000-000000000009

# 2) jean lit SON collaborateur (RLS select)
SEEN=$(curl -s "$API/rest/v1/collaborateurs?id=eq.$JC&select=id" -H "apikey: $ANON" \
  -H "Authorization: Bearer $JEAN" | grep -c "$JC")
[ "$SEEN" -ge 1 ] && ok "jean lit son collaborateur (RLS)" || ko "jean ne lit pas son collaborateur"

# 3) jean saisit ses heures (INSERT saisies)
# Le serveur contient peut-être déjà une saisie ce jour-là (jeu de démonstration) :
# on libère la journée pour que le test reste reproductible sur un serveur peuplé.
psql "delete from public.saisies where collaborateur_id='$JC' and date='$JOUR';" >/dev/null
ST=$(post saisies "$JEAN" "{\"id\":\"$S1\",\"collaborateur_id\":\"$JC\",\"date\":\"$JOUR\",\"heure_debut\":\"08:00\",\"heure_fin\":\"17:00\",\"pause_min\":60,\"total_minutes\":480,\"statut\":\"en_attente\",\"saisi_par\":\"jean@demo.local\"}")
[ "$ST" = "201" ] && ok "jean saisit ses heures ($ST)" || ko "jean saisit ses heures ($ST : $(cat /tmp/smoke_body.txt))"

# 4) jean demande un congé (INSERT conges) + trace d'audit (INSERT audit_log)
CT=$(post conges "$JEAN" "{\"id\":\"$C1\",\"collaborateur_id\":\"$JC\",\"type\":\"conge_paye\",\"date_debut\":\"$PLUS_TARD\",\"date_fin\":\"$PLUS_TARD\",\"demi_jour\":\"aucune\",\"nb_jours\":1,\"statut\":\"demandee\",\"demande_par_user_id\":\"jean@demo.local\"}")
[ "$CT" = "201" ] && ok "jean demande un congé ($CT)" || ko "jean demande un congé ($CT : $(cat /tmp/smoke_body.txt))"
AT=$(post audit_log "$JEAN" "{\"id\":\"$A1\",\"cible_type\":\"conge\",\"cible_id\":\"$C1\",\"action\":\"demande_conge\",\"par_user_id\":\"jean@demo.local\"}")
[ "$AT" = "201" ] && ok "écriture audit en INSERT ($AT)" || ko "écriture audit ($AT : $(cat /tmp/smoke_body.txt))"

# 4b) IMMUABILITÉ : une trace EXISTANTE ne doit pas pouvoir être réécrite
#     (ni par un update, ni par un upsert « INSERT … ON CONFLICT DO UPDATE »).
A2=aaaaaaaa-0000-4000-8000-000000000004
psql "insert into public.audit_log (id,cible_type,cible_id,action,par_user_id,detail)
      values ('$A2','conge','$C1','conge_validee','sophie@demo.local','ORIGINAL')
      on conflict (id) do nothing;" >/dev/null
curl -s -o /dev/null -X POST "$API/rest/v1/audit_log" -H "apikey: $ANON" \
  -H "Authorization: Bearer $JEAN" -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d "{\"id\":\"$A2\",\"cible_type\":\"conge\",\"cible_id\":\"$C1\",\"action\":\"conge_refusee\",\"par_user_id\":\"sophie@demo.local\",\"detail\":\"FALSIFIE\"}"
DET=$(psql "select detail from public.audit_log where id='$A2'")
[ "$DET" = "ORIGINAL" ] && ok "audit : trace existante non falsifiable (reste $DET)" \
  || ko "FAILLE: trace d'audit réécrite ($DET)"

# 4c) SÉCURITÉ : jean ne doit PAS pouvoir se promouvoir responsable
patch(){ curl -s -o /tmp/smoke_body.txt -w "%{http_code}" -X PATCH "$API/rest/v1/$1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $2" -H "Content-Type: application/json" -d "$3"; }
JUID=$(psql "select id from public.profiles where identifiant='jean@demo.local'")
patch "profiles?id=eq.$JUID" "$JEAN" '{"role":"responsable"}' >/dev/null
ROLE_APRES=$(psql "select role from public.profiles where identifiant='jean@demo.local'")
[ "$ROLE_APRES" = "employe" ] && ok "jean NE peut PAS se promouvoir responsable" \
  || ko "FAILLE: jean est devenu $ROLE_APRES"

# 4d) SÉCURITÉ : jean ne doit PAS pouvoir valider sa propre saisie
patch "saisies?id=eq.$S1" "$JEAN" '{"statut":"validee"}' >/dev/null
ST_APRES=$(psql "select statut from public.saisies where id='$S1'")
[ "$ST_APRES" = "en_attente" ] && ok "jean NE peut PAS valider sa saisie (reste $ST_APRES)" \
  || ko "FAILLE: saisie auto-validée ($ST_APRES)"

# 4e) SÉCURITÉ : jean ne doit PAS pouvoir valider son propre congé
patch "conges?id=eq.$C1" "$JEAN" '{"statut":"validee"}' >/dev/null
CG_APRES=$(psql "select statut from public.conges where id='$C1'")
[ "$CG_APRES" = "demandee" ] && ok "jean NE peut PAS valider son congé (reste $CG_APRES)" \
  || ko "FAILLE: congé auto-validé ($CG_APRES)"

# 4f) SÉCURITÉ : l'auteur de l'audit est imposé par la base (non falsifiable)
post audit_log "$JEAN" "{\"id\":\"$X9\",\"cible_type\":\"conge\",\"cible_id\":\"$C1\",\"action\":\"demande_conge\",\"par_user_id\":\"sophie@demo.local\"}" >/dev/null
AUTEUR=$(psql "select par_user_id from public.audit_log where id='$X9'")
[ "$AUTEUR" = "jean@demo.local" ] && ok "audit : auteur impose par la base ($AUTEUR)" \
  || ko "FAILLE: audit signe '$AUTEUR' au lieu de jean"

# 5) NÉGATIF : jean ne doit PAS pouvoir saisir pour le collaborateur d'un autre
NT=$(post saisies "$JEAN" "{\"id\":\"$X9\",\"collaborateur_id\":\"$AC\",\"date\":\"$JOUR\",\"total_minutes\":100,\"statut\":\"en_attente\",\"saisi_par\":\"jean@demo.local\"}")
[ "$NT" != "201" ] && ok "jean NE peut PAS saisir pour autrui (rejet $NT)" || ko "FAILLE: jean a saisi pour autrui ($NT)"

# Nettoyage des données de test
psql "delete from public.audit_log where id in ('$A1','$A2','$X9'); delete from public.conges where id='$C1'; delete from public.saisies where id in ('$S1','$X9');" >/dev/null

echo ""
echo "== Résultat : $PASS OK, $FAIL KO =="
[ "$FAIL" -eq 0 ]
