#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Sauvegarde quotidienne de la base RH.
#
# Produit un dump COMPLET compressé dans /opt/backups, conserve 14 jours, et
# VÉRIFIE que l'archive est lisible — une sauvegarde jamais vérifiée n'est pas
# une sauvegarde. Sort en erreur si le dump est vide ou corrompu.
#
# Installé en cron par deploy/install.sh (une fois par nuit).
#   bash deploy/backup.sh
# ---------------------------------------------------------------------------
set -uo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin

DEST=/opt/backups
RETENTION_JOURS=14
HORO=$(date +%Y-%m-%d_%H%M)
FICHIER="$DEST/rh-$HORO.sql.gz"

mkdir -p "$DEST"
chmod 700 "$DEST"   # le dump contient des données personnelles

cd /opt/supabase || exit 1

# `pg_dump` de la base APPLICATIVE (et non pg_dumpall) : il contient tout ce qui
# compte — schéma `public` (données RH) ET schéma `auth` (comptes de connexion) —
# et surtout il se RESTAURE dans n'importe quelle base, ce qui rend la
# sauvegarde vérifiable. Les rôles du cluster sont sauvegardés à part.
if ! docker compose exec -T db pg_dump -U postgres -d postgres | gzip -9 > "$FICHIER"; then
  echo "ÉCHEC : le dump n'a pas abouti." >&2
  rm -f "$FICHIER"
  exit 1
fi
# Rôles et permissions du cluster (petit fichier, écrasé à chaque fois).
docker compose exec -T db pg_dumpall -U postgres --roles-only \
  | gzip -9 > "$DEST/roles.sql.gz" 2>/dev/null
chmod 600 "$DEST/roles.sql.gz" 2>/dev/null || true

# Contrôle d'intégrité : archive décompressable ET contenant bien nos tables.
TAILLE=$(stat -c%s "$FICHIER")
if [ "$TAILLE" -lt 10000 ]; then
  echo "ÉCHEC : dump anormalement petit ($TAILLE octets)." >&2
  exit 1
fi
if ! gzip -t "$FICHIER" 2>/dev/null; then
  echo "ÉCHEC : archive corrompue." >&2
  exit 1
fi
# NB : on COMPTE au lieu d'utiliser `grep -q`. Avec `pipefail`, un `grep -q`
# ferme le tuyau dès la première correspondance : `zcat` meurt en SIGPIPE et le
# pipeline renvoie une erreur, faisant échouer le contrôle sur un dump valide.
NB_TABLES=$(zcat "$FICHIER" | grep -c 'CREATE TABLE public\.\(saisies\|conges\|collaborateurs\)' || true)
if [ "${NB_TABLES:-0}" -lt 3 ]; then
  echo "ÉCHEC : le dump ne contient pas les tables attendues ($NB_TABLES/3)." >&2
  exit 1
fi

chmod 600 "$FICHIER"   # lisible par root seulement

# Le 1er du mois, on met de côté une copie MENSUELLE non purgée : la rotation
# de 14 jours protège des incidents récents, mais ne permet pas de revenir à
# un état ancien (une erreur de paramétrage découverte deux mois plus tard).
if [ "$(date +%d)" = "01" ]; then
  cp -p "$FICHIER" "$DEST/mensuel-$(date +%Y-%m).sql.gz"
fi

# Purge des sauvegardes QUOTIDIENNES trop anciennes. Le motif 'rh-*' ne touche
# pas les copies 'mensuel-*', volontairement conservées.
find "$DEST" -name 'rh-*.sql.gz' -mtime +$RETENTION_JOURS -delete
# Les copies mensuelles sont conservées 25 mois (2 exercices complets).
find "$DEST" -name 'mensuel-*.sql.gz' -mtime +760 -delete

echo "$(date '+%F %T') OK — $FICHIER ($(numfmt --to=iec "$TAILLE")), $(ls -1 "$DEST"/rh-*.sql.gz | wc -l) sauvegarde(s) conservée(s)"
