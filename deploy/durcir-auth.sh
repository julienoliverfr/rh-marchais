#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Durcissement de l'AUTHENTIFICATION.
#
# Corrige deux constats de l'audit du 2026-07-31 :
#   • aucune limitation des tentatives de connexion — 12 mots de passe faux
#     d'affilée ne déclenchaient rien, donc rien n'empêchait d'en essayer des
#     millions ;
#   • l'inscription par téléphone restait activée, sans usage.
#
# La configuration de Kong est REGÉNÉRÉE à chaque installation depuis le dépôt
# Supabase : une modification faite à la main serait perdue à la réinstallation
# suivante. D'où ce script, appelé par install.sh et rejouable à volonté.
#
#   bash deploy/durcir-auth.sh
# ---------------------------------------------------------------------------
set -uo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin

SUPA_DIR=${SUPA_DIR:-/opt/supabase}
KONG_YML="$SUPA_DIR/volumes/api/kong.yml"
COMPOSE="$SUPA_DIR/docker-compose.yml"
ENV_FILE="$SUPA_DIR/.env"

cd "$SUPA_DIR" || { echo "Répertoire Supabase introuvable : $SUPA_DIR" >&2; exit 1; }

echo "==> 1/3 Activation du plugin de limitation dans Kong"
# Le plugin est présent dans l'image mais doit être DÉCLARÉ pour être chargé.
if grep -q 'KONG_PLUGINS:.*rate-limiting' "$COMPOSE"; then
  echo "    déjà déclaré"
else
  sed -i 's/\(KONG_PLUGINS: *\)\(.*\)/\1\2,rate-limiting/' "$COMPOSE"
  echo "    ajouté à KONG_PLUGINS"
fi

echo "==> 2/3 Limitation des tentatives sur /auth/v1/*"
# Valeurs choisies pour arrêter une attaque SANS gêner l'usage réel : les
# employés peuvent partager une même adresse IP (bureau de l'exploitation,
# réseau mobile), et l'application renouvelle son jeton une fois par heure.
# 200 tentatives/heure laissent largement la place à cet usage, tout en rendant
# une attaque par force brute sans espoir sur un mot de passe de 10 caractères.
node - "$KONG_YML" <<'JS'
const fs = require('fs');
const chemin = process.argv[2];
let lignes = fs.readFileSync(chemin, 'utf8').split('\n');

if (lignes.some(l => l.includes('name: rate-limiting'))) {
  console.log('    déjà en place');
  process.exit(0);
}
// On vise le service qui sert TOUT /auth/v1/ (dont /token), puis le premier
// bloc `plugins:` qui le suit.
const iRoute = lignes.findIndex(l => l.includes('name: auth-v1-all'));
if (iRoute < 0) { console.error('    route auth-v1-all introuvable'); process.exit(1); }
const iPlugins = lignes.findIndex((l, i) => i > iRoute && /^\s*plugins:\s*$/.test(l));
if (iPlugins < 0) { console.error('    bloc plugins introuvable'); process.exit(1); }

const indent = (lignes[iPlugins].match(/^\s*/) || [''])[0];
lignes.splice(iPlugins + 1, 0,
  `${indent}  - name: rate-limiting`,
  `${indent}    config:`,
  `${indent}      minute: 30`,
  `${indent}      hour: 200`,
  `${indent}      policy: local`,
  `${indent}      limit_by: ip`,
  // Si le compteur devient indisponible, on laisse passer plutôt que de
  // bloquer tout le monde : une panne du garde-fou ne doit pas couper l'accès.
  `${indent}      fault_tolerant: true`,
);
fs.writeFileSync(chemin, lignes.join('\n'));
console.log('    plugin ajouté sur auth-v1-all (30/min, 200/h par adresse IP)');
JS

echo "==> 3/3 Réglages GoTrue"
setenv(){
  local k="$1" v="$2"
  if grep -q "^$k=" "$ENV_FILE"; then sed -i "s|^$k=.*|$k=$v|" "$ENV_FILE"
  else echo "$k=$v" >> "$ENV_FILE"; fi
  echo "    $k=$v"
}
# Inutilisée, et toute voie d'inscription non utilisée est une porte laissée
# entrouverte pour rien.
setenv ENABLE_PHONE_SIGNUP false
# Défense en profondeur UNIQUEMENT : l'application crée ses comptes par
# `admin_create_login`, qui écrit directement dans auth.users et ne passe pas
# par GoTrue. La vraie règle est en base (supabase/politique-mot-de-passe.sql) ;
# celle-ci ne couvre que d'éventuels appels directs à l'API GoTrue.
setenv PASSWORD_MIN_LENGTH 10

echo "==> Redémarrage de kong et auth"
docker compose up -d kong auth >/dev/null 2>&1 || docker compose restart kong auth >/dev/null 2>&1
sleep 6
docker compose ps --format '  {{.Service}} ({{.State}})' 2>/dev/null | grep -E 'kong|auth'
