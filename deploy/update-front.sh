#!/usr/bin/env bash
# Reconstruit l'application (le "front") avec la dernière version du code.
# À lancer sur le serveur, après un changement de code (écrans, textes, etc.).
#   cd /opt/rh-marchais && git pull -q && bash deploy/update-front.sh
set -e
export PATH=/usr/local/bin:/usr/bin:/bin

cd /opt/rh-marchais
# reset --hard (et non `git pull`) : robuste même si un artefact de build a
# « sali » l'arbre (sinon `pull` refuse de fusionner et l'update échoue).
git fetch -q origin main
git reset --hard -q origin/main

ANON=$(grep '^ANON_KEY=' /opt/supabase/.env | cut -d= -f2-)
IP=$(curl -fsS https://api.ipify.org)

echo "==> Installation des dépendances (peut prendre ~1 min)"
npm ci >/dev/null 2>&1

echo "==> Construction de l'application"
VITE_SUPABASE_URL="http://$IP:8000" VITE_SUPABASE_ANON_KEY="$ANON" npm run build

# Configuration du serveur web. DEUX pièges, tous deux silencieux :
#  1. `cp` et non un montage direct du fichier du dépôt : Docker attache un
#     fichier unique par son INODE, que `git reset --hard` remplace. `cp` écrit
#     dans le fichier existant et conserve l'inode, donc le conteneur voit bien
#     la nouvelle version ;
#  2. Caddy garde en mémoire la configuration lue au démarrage : sans
#     rechargement, la modification resterait sans effet.
mkdir -p /opt/rh-caddy
cp -f deploy/Caddyfile /opt/rh-caddy/Caddyfile
docker exec rh-front caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 \
  || echo "  (rechargement de Caddy à vérifier)"

echo "==> OK — l'application est à jour. Recharge la page dans ton navigateur."
