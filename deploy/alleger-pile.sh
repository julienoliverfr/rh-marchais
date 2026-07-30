#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Réduit la pile Supabase aux SEULS services utilisés par l'application RH.
#
# L'installation standard démarre 12 conteneurs. Or l'application n'appelle que
# trois choses : la base (PostgreSQL), l'authentification (GoTrue) et l'API
# (PostgREST) — le tout derrière la passerelle (Kong). Vérifié dans le code :
# aucun usage du temps réel, du stockage de fichiers ni des fonctions edge.
#
# Retirer le reste apporte DEUX gains :
#   • sécurité — on supprime notamment le Studio, interface d'administration de
#     la base protégée par un simple mot de passe et exposée sur le réseau ;
#   • ressources — environ 1 Go de mémoire et plusieurs Go d'images en moins,
#     ce qui permet de tenir confortablement sur un petit serveur.
#
# Réversible : une copie de docker-compose.yml est conservée, et il suffit de
# `docker compose up -d` après restauration pour retrouver la pile complète.
#
#   bash deploy/alleger-pile.sh
# ---------------------------------------------------------------------------
set -uo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin

SUPA_DIR=${SUPA_DIR:-/opt/supabase}
cd "$SUPA_DIR" || { echo "Répertoire Supabase introuvable : $SUPA_DIR" >&2; exit 1; }

# Services conservés : db · auth · rest · kong.
INUTILES="studio meta realtime storage imgproxy functions supavisor vector analytics"

[ -f docker-compose.yml.pile-complete ] || cp docker-compose.yml docker-compose.yml.pile-complete

# Kong attend le Studio au démarrage : sans le retrait de cette dépendance, la
# passerelle refuserait de démarrer une fois le Studio supprimé.
node -e "
const fs=require('fs');
let t=fs.readFileSync('docker-compose.yml','utf8');
t=t.replace(/(\n  kong:[\s\S]*?)\n    depends_on:\n      studio:\n        condition: [a-z_]+\n/, '\$1\n');
fs.writeFileSync('docker-compose.yml',t);
" 2>/dev/null || true

# On ne cible que les services RÉELLEMENT présents. La composition de la pile
# varie d'une version de Supabase à l'autre (« vector » a par exemple disparu) :
# or `docker compose stop` échoue EN BLOC sur un service inconnu et n'arrête
# alors plus rien. Filtrer évite cet échec silencieux.
PRESENTS=$(docker compose config --services 2>/dev/null)
A_RETIRER=""
for s in $INUTILES; do
  echo "$PRESENTS" | grep -qx "$s" && A_RETIRER="$A_RETIRER $s"
done

if [ -z "$A_RETIRER" ]; then
  echo "==> Aucun service superflu à retirer."
else
  echo "==> Retrait :$A_RETIRER"
  # shellcheck disable=SC2086
  docker compose stop $A_RETIRER >/dev/null || echo "  (arrêt partiel)"
  # shellcheck disable=SC2086
  docker compose rm -f $A_RETIRER >/dev/null || echo "  (suppression partielle)"
fi

echo "==> Pile réduite. Conteneurs actifs :"
docker compose ps --format '  {{.Service}} ({{.State}})' 2>/dev/null
echo "==> Mémoire :"
free -h | sed -n '2p' | awk '{print "  utilisée "$3" / "$2" — disponible "$7}'
