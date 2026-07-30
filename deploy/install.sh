#!/usr/bin/env bash
#
# RH Marchais — installation tout-en-un (test) sur un serveur Ubuntu 24.04 vierge.
# Installe : base de données + authentification + sécurité (Supabase auto-hébergé),
# puis l'application, servie sur le port 80.
#
# À lancer EN ROOT sur un serveur NEUF Hetzner Cloud (Ubuntu 24.04).
# Données 100 % fictives — destiné au TEST.
#
set -euo pipefail

REPO="https://github.com/julienoliverfr/rh-marchais.git"
APP_DIR="/opt/rh-marchais"
SUPA_DIR="/opt/supabase"
# Mot de passe des 3 comptes de démonstration. La valeur par défaut est publique
# (le dépôt est ouvert) : sur un serveur destiné à un usage réel, la surcharger
#   DEMO_PASSWORD='...' bash deploy/install.sh
DEMO_PASSWORD="${DEMO_PASSWORD:-demo1234}"

log(){ echo -e "\n\033[1;34m==> $*\033[0m"; }

log "[1/9] Adresse IP publique du serveur"
PUBLIC_IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
echo "IP détectée : $PUBLIC_IP"

log "[2/9] Installation des outils (Docker, Git, Node, openssl)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates openssl jq
if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sh; fi

# Node : on PRIVILÉGIE le paquet de la distribution. NodeSource ne publie pas
# de dépôt pour les versions récentes d'Ubuntu (404 sur 26.04 « resolute »), ce
# qui faisait échouer l'installation. Le paquet Ubuntu (Node 22) convient
# parfaitement à la construction du front. NodeSource ne sert plus que de repli
# pour les distributions anciennes dont le paquet est trop vieux.
node_version_majeure() { node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/'; }
if ! command -v node >/dev/null 2>&1; then
  apt-get install -y nodejs npm || true
fi
if [ "$(node_version_majeure || echo 0)" -lt 20 ] 2>/dev/null; then
  echo "  Node absent ou trop ancien -> tentative via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
fi
command -v node >/dev/null 2>&1 || { echo "ÉCHEC : Node.js indisponible." >&2; exit 1; }
echo "  Node $(node -v) · npm $(npm -v 2>/dev/null)"

log "[3/9] Téléchargement de Supabase (Docker) et de l'application"
rm -rf /tmp/supabase-src
git clone --depth 1 https://github.com/supabase/supabase /tmp/supabase-src
mkdir -p "$SUPA_DIR"
cp -rf /tmp/supabase-src/docker/. "$SUPA_DIR"/
cp -f "$SUPA_DIR/.env.example" "$SUPA_DIR/.env"
rm -rf "$APP_DIR"
CLONE_URL="$REPO"
if [ -n "${GH_TOKEN:-}" ]; then
  CLONE_URL="https://${GH_TOKEN}@github.com/julienoliverfr/rh-marchais.git"
fi
git clone --depth 1 "$CLONE_URL" "$APP_DIR"

log "[4/9] Génération des secrets (mots de passe et clés)"
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
JWT_SECRET="$(openssl rand -hex 40)"
DASHBOARD_PASSWORD="$(openssl rand -hex 12)"
# Clés API anon + service_role : des jetons JWT signés avec JWT_SECRET.
readarray -t KEYS < <(node -e '
const c=require("crypto"), s=process.argv[1];
const u=x=>Buffer.from(x).toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const jwt=r=>{const n=Math.floor(Date.now()/1000);const d=u(JSON.stringify({alg:"HS256",typ:"JWT"}))+"."+u(JSON.stringify({role:r,iss:"supabase",iat:n,exp:n+3600*24*3650}));return d+"."+c.createHmac("sha256",s).update(d).digest("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");};
console.log(jwt("anon")); console.log(jwt("service_role"));
' "$JWT_SECRET")
ANON_KEY="${KEYS[0]}"; SERVICE_ROLE_KEY="${KEYS[1]}"

log "[5/9] Configuration de Supabase (.env)"
API_URL="http://$PUBLIC_IP:8000"
setenv(){ # setenv CLE VALEUR  -> remplace ou ajoute la ligne dans $SUPA_DIR/.env
  local k="$1" v="$2"
  if grep -q "^$k=" "$SUPA_DIR/.env"; then
    # échappe les caractères spéciaux pour sed
    local ev; ev="$(printf '%s' "$v" | sed -e 's/[\/&|]/\\&/g')"
    sed -i "s|^$k=.*|$k=$ev|" "$SUPA_DIR/.env"
  else
    echo "$k=$v" >> "$SUPA_DIR/.env"
  fi
}
setenv POSTGRES_PASSWORD   "$POSTGRES_PASSWORD"
setenv JWT_SECRET          "$JWT_SECRET"
setenv ANON_KEY            "$ANON_KEY"
setenv SERVICE_ROLE_KEY    "$SERVICE_ROLE_KEY"
# Inscription libre FERMÉE : sans cela, n'importe qui connaissant l'URL de
# l'API peut se créer un compte (et obtenir un jeton « authenticated »).
# Les comptes sont créés uniquement par le responsable, depuis l'application.
setenv DISABLE_SIGNUP      "true"
setenv DASHBOARD_USERNAME  "admin"
setenv DASHBOARD_PASSWORD  "$DASHBOARD_PASSWORD"
setenv SITE_URL            "http://$PUBLIC_IP"
setenv API_EXTERNAL_URL    "$API_URL"
setenv SUPABASE_PUBLIC_URL "$API_URL"

log "[5b/9] Durcissement réseau : la base ne doit PAS être joignable d'Internet"
# Par défaut, le pooler Supabase publie PostgreSQL sur 0.0.0.0:5432 — donc en
# accès direct depuis Internet, ce qui CONTOURNE toute la sécurité RLS. On lie
# ces ports à l'interface locale. Le port 8000 (API) reste public : le front
# l'appelle directement tant qu'HTTPS n'est pas en place.
sed -i 's|^\( *\)- \${POSTGRES_PORT}:5432$|\1- 127.0.0.1:${POSTGRES_PORT}:5432|' "$SUPA_DIR/docker-compose.yml"
sed -i 's|^\( *\)- \${POOLER_PROXY_PORT_TRANSACTION}:6543$|\1- 127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543|' "$SUPA_DIR/docker-compose.yml"
sed -i 's|^\( *\)- \${KONG_HTTPS_PORT}:8443/tcp$|\1- 127.0.0.1:${KONG_HTTPS_PORT}:8443/tcp|' "$SUPA_DIR/docker-compose.yml"

# Pare-feu (défense complémentaire : il ne gouverne pas les ports publiés par
# Docker, d'où le durcissement ci-dessus). SSH autorisé AVANT activation.
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp   comment 'SSH administration'      >/dev/null 2>&1 || true
  ufw allow 80/tcp   comment 'Application (HTTP)'      >/dev/null 2>&1 || true
  ufw allow 443/tcp  comment 'Application (HTTPS)'     >/dev/null 2>&1 || true
  ufw allow 8000/tcp comment 'API Supabase (front)'    >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
fi

log "[6/9] Démarrage de la base de données et de l'authentification"
cd "$SUPA_DIR"
docker compose pull
docker compose up -d
echo "Attente du démarrage de la base (30 s)…"; sleep 30
# Attend que Postgres réponde (jusqu'à ~2 min)
for i in $(seq 1 24); do
  if docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1; then break; fi
  echo "  …base pas encore prête ($i)"; sleep 5
done

log "[6b/9] Réduction de la pile aux services réellement utilisés"
# Supprime notamment le Studio (interface d'administration de la base, exposée
# et protégée par un simple mot de passe) et libère ~1 Go de mémoire.
bash "$APP_DIR/deploy/alleger-pile.sh" || echo "  (allègement à vérifier manuellement)"

log "[7/9] Création du schéma, des règles de sécurité, puis des comptes de démo"
docker compose exec -T db psql -U postgres -d postgres < "$APP_DIR/supabase/schema.sql"
docker compose exec -T db psql -U postgres -d postgres < "$APP_DIR/supabase/rls.sql"
# Fonctions admin SECURITY DEFINER (création/suppression de comptes via RPC).
# À appliquer APRÈS rls.sql (elles dépendent de public.is_responsable()) et AVANT
# la création des comptes de démo + le seed.
docker compose exec -T db psql -U postgres -d postgres < "$APP_DIR/supabase/functions.sql"
# Durcissement de sécurité (RLS + triggers) : sans lui, un employé pourrait se
# promouvoir responsable et valider ses propres heures/congés.
docker compose exec -T db psql -U postgres -d postgres < "$APP_DIR/supabase/security.sql"
# Comptes d'authentification (fictifs)
for pair in "jean@demo.local" "amelie@demo.local" "sophie@demo.local"; do
  echo "  - création de $pair"
  curl -fsS -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$pair\",\"password\":\"$DEMO_PASSWORD\",\"email_confirm\":true}" >/dev/null \
    && echo "    ok" || echo "    (déjà existant ou à vérifier)"
done
# Données fictives + liaison des profils aux comptes (par e-mail)
docker compose exec -T db psql -U postgres -d postgres < "$APP_DIR/supabase/seed.sql"

log "[8/9] Construction de l'application"
cd "$APP_DIR"
npm ci
VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY" npm run build

log "[9/9] Mise en ligne de l'application (port 80)"
docker rm -f rh-front >/dev/null 2>&1 || true
docker run -d --restart always --name rh-front \
  -p 80:80 \
  -v "$APP_DIR/dist":/srv \
  -v "$APP_DIR/deploy/Caddyfile":/etc/caddy/Caddyfile \
  caddy:2 >/dev/null

log "[+] Mise à jour automatique (vérifie le dépôt toutes les 3 min et reconstruit si besoin)"
cat > /opt/rh-update.sh <<'UPD'
#!/bin/bash
export PATH=/usr/local/bin:/usr/bin:/bin
cd /opt/rh-marchais || exit 0
git fetch -q origin main || exit 0
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0
git reset --hard -q origin/main
ANON=$(grep '^ANON_KEY=' /opt/supabase/.env | cut -d= -f2-)
IP=$(curl -fsS https://api.ipify.org)
npm ci >/dev/null 2>&1
VITE_SUPABASE_URL="http://$IP:8000" VITE_SUPABASE_ANON_KEY="$ANON" npm run build
echo "$(date) — application mise a jour"
UPD
chmod +x /opt/rh-update.sh

log "[+] Sauvegarde automatique de la base (chaque nuit, vérifiée, 14 jours)"
install -m 755 "$APP_DIR/deploy/backup.sh" /opt/rh-backup.sh
( crontab -l 2>/dev/null | grep -v 'rh-backup.sh' ; \
  echo "30 2 * * * /opt/rh-backup.sh >> /var/log/rh-backup.log 2>&1" ) | crontab -
bash /opt/rh-backup.sh || echo "  (première sauvegarde à vérifier manuellement)"
( crontab -l 2>/dev/null | grep -v 'rh-update.sh' ; echo "*/3 * * * * /opt/rh-update.sh >> /var/log/rh-update.log 2>&1" ) | crontab -

# Récapitulatif
cat <<EOF

============================================================
  ✅ INSTALLATION TERMINÉE
============================================================
  Application    : http://$PUBLIC_IP
  Comptes de démo (mot de passe : $DEMO_PASSWORD)
     - employé     : jean
     - employé     : amelie
     - responsable : sophie

  (Base/API interne : $API_URL — inutile au quotidien)

  ⚠️ Vérifie que les ports 80 et 8000 sont ouverts
     (Firewall Hetzner Cloud, si tu en as attaché un).

  Secrets sauvegardés dans : $SUPA_DIR/.env
============================================================
EOF
