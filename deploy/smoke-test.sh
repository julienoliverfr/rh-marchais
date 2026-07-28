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
ST=$(post saisies "$JEAN" "{\"id\":\"$S1\",\"collaborateur_id\":\"$JC\",\"date\":\"2026-07-20\",\"heure_debut\":\"08:00\",\"heure_fin\":\"17:00\",\"pause_min\":60,\"total_minutes\":480,\"statut\":\"en_attente\",\"saisi_par\":\"jean@demo.local\"}")
[ "$ST" = "201" ] && ok "jean saisit ses heures ($ST)" || ko "jean saisit ses heures ($ST : $(cat /tmp/smoke_body.txt))"

# 4) jean demande un congé (INSERT conges) + trace d'audit (INSERT audit_log)
CT=$(post conges "$JEAN" "{\"id\":\"$C1\",\"collaborateur_id\":\"$JC\",\"type\":\"conge_paye\",\"date_debut\":\"2026-09-01\",\"date_fin\":\"2026-09-01\",\"demi_jour\":\"aucune\",\"nb_jours\":1,\"statut\":\"demandee\",\"demande_par_user_id\":\"jean@demo.local\"}")
[ "$CT" = "201" ] && ok "jean demande un congé ($CT)" || ko "jean demande un congé ($CT : $(cat /tmp/smoke_body.txt))"
AT=$(post audit_log "$JEAN" "{\"id\":\"$A1\",\"cible_type\":\"conge\",\"cible_id\":\"$C1\",\"action\":\"demande_conge\",\"par_user_id\":\"jean@demo.local\"}")
[ "$AT" = "201" ] && ok "écriture audit en INSERT ($AT)" || ko "écriture audit ($AT : $(cat /tmp/smoke_body.txt))"

# 4b) l'audit NE doit PAS accepter un upsert (append-only : pas de policy UPDATE)
AU=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/rest/v1/audit_log" -H "apikey: $ANON" \
  -H "Authorization: Bearer $JEAN" -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d "{\"id\":\"$X9\",\"cible_type\":\"conge\",\"cible_id\":\"$C1\",\"action\":\"demande_conge\",\"par_user_id\":\"jean@demo.local\"}")
[ "$AU" != "201" ] && ok "audit refuse l'upsert (append-only, $AU)" || ko "audit accepte l'upsert (à écrire en INSERT !)"

# 5) NÉGATIF : jean ne doit PAS pouvoir saisir pour le collaborateur d'un autre
NT=$(post saisies "$JEAN" "{\"id\":\"$X9\",\"collaborateur_id\":\"$AC\",\"date\":\"2026-07-20\",\"total_minutes\":100,\"statut\":\"en_attente\",\"saisi_par\":\"jean@demo.local\"}")
[ "$NT" != "201" ] && ok "jean NE peut PAS saisir pour autrui (rejet $NT)" || ko "FAILLE: jean a saisi pour autrui ($NT)"

# Nettoyage des données de test
psql "delete from public.audit_log where id in ('$A1','$X9'); delete from public.conges where id='$C1'; delete from public.saisies where id in ('$S1','$X9');" >/dev/null

echo ""
echo "== Résultat : $PASS OK, $FAIL KO =="
[ "$FAIL" -eq 0 ]
