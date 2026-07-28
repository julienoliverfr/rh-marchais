#!/usr/bin/env bash
# Ré-applique les fonctions SQL d'administration des comptes (après correction)
# et nettoie les comptes de test créés « à la main » qui ne peuvent pas se
# connecter. Garde les 3 comptes de démo. À lancer sur le serveur :
#   cd /opt/rh-marchais && git pull -q && bash deploy/reapply-functions.sh
set -e

echo "==> Ré-application de supabase/functions.sql"
cd /opt/supabase
docker compose exec -T db psql -U postgres -d postgres < /opt/rh-marchais/supabase/functions.sql

echo "==> Nettoyage des comptes de test cassés (on garde jean/amelie/sophie)"
docker compose exec -T db psql -U postgres -d postgres -c "
delete from auth.identities where user_id in (select id from auth.users where email not in ('jean@demo.local','amelie@demo.local','sophie@demo.local'));
delete from public.profiles  where id      in (select id from auth.users where email not in ('jean@demo.local','amelie@demo.local','sophie@demo.local'));
delete from auth.users       where email not in ('jean@demo.local','amelie@demo.local','sophie@demo.local');
"

echo "==> Terminé. Tu peux recréer un compte depuis l'appli et tester la connexion."
