# Supabase — « cerveau partagé » RH ETS Marchais

Ce dossier contient tout le nécessaire pour brancher l'application sur une base
Supabase (base de données + authentification + sécurité par RLS) à la place du
stockage local. **Tant que les variables d'environnement ne sont pas
renseignées, l'application reste en mode démo local (localStorage) — rien ne
change.**

## Fichiers

| Fichier         | Rôle                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `schema.sql`    | Tables (structure) reflétant `src/types.ts`.                                |
| `rls.sql`       | **Sécurité** : active RLS + policies (qui lit/écrit quoi).                   |
| `functions.sql` | Fonctions admin `SECURITY DEFINER` (création/suppression de comptes en RPC).|
| `seed.sql`      | Données **fictives** de démo (familles, contrats, saisies…).                |

## Ordre d'exécution (obligatoire)

1. `schema.sql`    → crée les tables.
2. `rls.sql`       → active la sécurité (Row Level Security) + fonctions d'autorisation.
3. `functions.sql` → fonctions admin (dépendent de `is_responsable()` de `rls.sql`).
4. `seed.sql`      → insère les données fictives et les profils de démo.

Exécution possible via **Dashboard Supabase > SQL Editor** (coller/exécuter
chaque fichier dans l'ordre) ou via la CLI `supabase db` / `psql`.

## Étapes exactes pour brancher l'application

1. **Créer le projet Supabase** (https://supabase.com) → noter l'URL du projet
   et la clé **anon** (Project Settings > API).
2. **Exécuter les SQL** dans l'ordre ci-dessus (`schema` → `rls` → `seed`).
3. **Créer les 3 utilisateurs Auth** (Dashboard > Authentication > Users > *Add
   user*, ou API admin) — mot de passe de démo au choix (ex. `demo1234`) :
   - `jean@demo.local` — employé
   - `amelie@demo.local` — employé
   - `sophie@demo.local` — responsable
4. **Réexécuter `seed.sql`** (ou seulement sa dernière section *profiles*) : les
   profils sont alors reliés aux utilisateurs Auth par e-mail. Les rôles et le
   rattachement collaborateur sont posés côté base.
5. **Configurer l'application** : copier `.env.example` en `.env` à la racine de
   `rh-app/` et renseigner :
   ```
   VITE_SUPABASE_URL=https://<votre-projet>.supabase.co
   VITE_SUPABASE_ANON_KEY=<votre clé anon>
   ```
6. Relancer le serveur de dev (`npm run dev`). L'écran de connexion utilise
   désormais Supabase Auth.

## Connexion (mode Supabase)

L'identifiant saisi à l'écran de connexion est traité comme un **e-mail**. Par
convention de démo, un identifiant sans `@` est complété en
`<identifiant>@demo.local` — saisir `sophie` revient donc à `sophie@demo.local`.

## Modèle de sécurité (résumé)

Toute autorisation est décidée **côté base** par les policies RLS, à partir de la
table `profiles` (rôle + périmètre). Le client ne voit jamais que ce que la base
l'autorise à voir.

- **Employé** : lit/écrit uniquement **ses** saisies et congés, lit **ses**
  soldes ; lecture seule du référentiel (familles, modèles, types d'absence,
  politiques, règles).
- **Responsable** : lit/écrit les données de **son périmètre** (défini par
  `profiles.familles_perimetre` ; `NULL`/vide = **toutes** les familles) —
  saisies/congés/soldes de son équipe, validations, verrouillages d'export ; et
  gère le référentiel/administration.
- **`audit_log`** est **append-only** (aucune modification/suppression possible).

Les décisions reposent sur des fonctions SQL `SECURITY DEFINER` (`auth_role()`,
`is_responsable()`, `responsable_sees_collaborateur()`…) qui lisent `profiles`
sans jamais confier l'autorisation au client.

## Notes de fonctionnement (côté application)

- **Cache + write-through** : au login, `SupabaseRepository.init()` charge en
  mémoire toutes les lignes autorisées (RLS). Les lectures sont servies depuis ce
  cache (synchrones, UI inchangée) ; les écritures mettent à jour le cache
  immédiatement puis sont poussées vers Supabase en arrière-plan.
- **Comptes** : la création/suppression d'utilisateurs Auth est une opération
  **privilégiée**. Elle n'utilise PAS la clé de service côté client : elle passe
  par les fonctions SQL `SECURITY DEFINER` `admin_create_login` /
  `admin_delete_login` (`functions.sql`), appelées via `supabase.rpc(...)` et
  protégées par une garde « responsable uniquement » côté base. En cas d'échec,
  aucun compte n'est ajouté au cache et l'UI reçoit un message d'erreur clair
  (plus de « compte fantôme » qui apparaît puis disparaît).
- **Import de collaborateurs** : la création des comptes de connexion lors de
  l'import (`importerCollaborateurs`) reste **hors périmètre** pour l'instant —
  l'import crée collaborateurs + contrats + soldes, mais pas encore les comptes
  Auth. À brancher plus tard sur la même fonction `admin_create_login`. L'import
  actuel n'est pas cassé.
