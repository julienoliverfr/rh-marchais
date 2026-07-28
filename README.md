# RH · Suivi des heures — Étape 1 (socle)

Application RH de suivi des heures pour un domaine agricole (familles **Vignes** et **Marchais**).
Étape 1 : socle fonctionnel, 100 % local (localStorage), sans backend.

## Stack

- Vite + React + TypeScript
- react-router-dom (routage + garde de route par rôle)
- vite-plugin-pwa (PWA installable, `registerType: 'autoUpdate'`)
- zustand (état global léger)
- Couche **repository** abstraite (interface TypeScript) + implémentation localStorage

## Lancer le projet

```bash
npm install
npm run dev      # http://localhost:5180
```

Autres scripts :

```bash
npm run build      # tsc -b && vite build (doit passer sans erreur)
npm run typecheck  # tsc --noEmit
npm run preview    # prévisualiser le build
```

Le serveur de dev écoute sur le **port 5180** (voir `vite.config.ts`).

## Comptes de démo

| Identifiant | Mot de passe | Rôle              | Famille  | Contrat            |
| ----------- | ------------ | ----------------- | -------- | ------------------ |
| `jean`      | `demo`       | employé           | Vignes   | CDI 35h/sem        |
| `amelie`    | `demo`       | employé           | Marchais | CDI 7h/jour        |
| `sophie`    | `demo`       | responsable-admin | —        | —                  |

## Écrans livrés

### Employé (`jean`, `amelie`)

- **Tableau de bord** (`/`) : total heures de la semaine courante, indicateur « dont heures supplémentaires » (`max(0, total_semaine − seuil_hebdo)`, hebdo, sans majoration), solde congés, derniers jours + statut.
- **Saisie** (`/saisie`) : formulaire adapté à la famille.
  - Vignes (journée continue) : date + début + fin + pause → total = (fin − début) − pause.
  - Marchais (demi-journées) : date + Matin / Après-midi / Journée + heures des demi-journées.
  - Saisie rétroactive autorisée jusqu'à **7 jours** en arrière (date bornée, refus au-delà).
- **Historique & correction** (`/historique`) : saisies du mois, modifiables tant que le statut est `en_attente`. Une saisie `validee` / `refusee` / `verrouillee` est en lecture seule (🔒).
- **Mes congés** (`/conges`) — Étape 3 : cartes solde (Acquis / Pris / Restant), formulaire de demande (type, dates, demi-journée si début==fin, aperçu du nbJours et du restant après validation, motif optionnel), liste de mes demandes avec statut et motif de refus.

### Responsable / Admin (`sophie`)

- **Saisie pour un collaborateur** (`/responsable`) : mêmes formulaires en choisissant le collaborateur ; la saisie enregistre `saisi_par = sophie`.
- **Validations** (`/responsable/validations`) — Étape 2 :
  - Section « À valider » : toutes les saisies `en_attente`, triées par date décroissante, avec collaborateur, famille (pill), jour, horaires, total jour, cumul semaine + badge heures sup, et « saisi par ». Actions **Valider** / **Refuser** (motif obligatoire) + bouton **Tout valider**.
  - Section « Validées & verrouillées » : saisies `validee` (🔒), action **Débloquer** → repasse en `en_attente`.
  - Chaque ligne expose un **historique d'actions** dépliable (journal d'audit : qui / quoi / quand).
  - Un compteur des saisies `en_attente` s'affiche en badge sur l'entrée de nav « Validations » et en tête de page.
- **Congés** (`/responsable/conges`) — Étape 3 :
  - Section « Demandes à traiter » (`statut=demandee`) : collaborateur, famille, période, type, nbJours, restant après validation ; actions **Approuver** / **Refuser (motif obligatoire)**.
  - Section « Soldes & allocation » : tableau par collaborateur (acquis / pris / restant, calculés) avec réglage de l'allocation annuelle (`setAllocation`).
  - Compteur des demandes en attente en badge sur l'entrée de nav « Congés ».
- **Exports** (`/responsable/exports`) — Étape 4 :
  - Sélecteurs : période (mois `YYYY-MM`), périmètre (Toutes familles / Vignes / Marchais), format (Excel `.xlsx` / CSV).
  - Aperçu : une ligne par collaborateur ayant une activité (Collaborateur, Famille, Contrat, Heures normales, Heures sup., Congés jours, Absences jours) + ligne **Total équipe** ; état vide clair si aucune donnée.
  - Boutons : **Aperçu**, **Exporter CSV**, **Exporter Excel**, **« Exporter, verrouiller & envoyer »** (verrouille la période), + historique des exports verrouillés.
- **Familles** (`/responsable/familles`) : liste + création + édition + suppression (nom, mode de saisie, pause déduite). CRUD complet localStorage.
- **Collaborateurs** (`/responsable/collaborateurs`) : liste + création/édition en choisissant un **modèle de contrat** qui pré-remplit base, seuil h. sup hebdo et congés.

Statuts de saisie : `en_attente`, `validee`, `refusee`, `verrouillee`.

### Flux de statuts (Étape 2)

```
en_attente ──Valider──▶ validee (lecture seule 🔒 côté employé)
en_attente ──Refuser(motif)──▶ refusee ──(l'employé corrige)──▶ en_attente
validee ──Débloquer──▶ en_attente (de nouveau modifiable par l'employé)
validee ──Verrouiller (export comptable, Étape 4)──▶ verrouillee (exportId)
verrouillee ──Débloquer (responsable)──▶ en_attente
```

Chaque transition (valider / refuser / débloquer / verrouiller) et chaque correction employé écrit
une entrée immuable dans le **journal d'audit** (`AuditLog` : action, auteur, horodatage, détail/motif).
Cas limites gérés : pas de double validation, déblocage réservé aux saisies validées **ou verrouillées**,
motif de refus obligatoire, jamais de re-verrouillage d'une saisie déjà verrouillée.

Heures supplémentaires : décompte **hebdomadaire, sans majoration** (aucun taux dans l'app).

### Congés (Étape 3)

Entités : **Conge** (`id, collaborateurId, type, dateDebut, dateFin, demiJour, nbJours, statut, demandeParUserId, valideeParUserId?, refusMotif?, motif?, createdAt`)
et **SoldeConge** (`id, collaborateurId, annee, acquis`).

Types d'absence : `conge_paye`, `maladie`, `sans_solde`, `rtt`.
Statuts : `demandee` → `validee` / `refusee`.

- **nbJours** = jours ouvrés **lundi→vendredi** dans `[dateDebut ; dateFin]` ; une **demi-journée** (`demiJour ≠ 'aucune'`, uniquement si `dateDebut == dateFin`) compte **0.5**.
- **Solde** : le « pris » et le « restant » ne sont **jamais stockés**, ils sont **calculés** — `pris` = somme des `nbJours` des congés `conge_paye` `validee` de l'année ; `restant` = `acquis − pris`. Seul `conge_paye` décompte le solde CP ; `maladie` / `sans_solde` / `rtt` sont enregistrés mais **ne décomptent pas** le CP.
- `acquis` par défaut = `congesSolde` du contrat, sinon 25 (surchargé par une allocation annuelle via `setAllocation`).
- Cas limites : motif de refus obligatoire, pas de double traitement d'une demande déjà validée/refusée, dates cohérentes (`dateFin ≥ dateDebut`), alerte non bloquante si le restant deviendrait négatif.

### Exports comptables (Étape 4)

Entité **Export** (`id, periode, perimetre, format, genereLe, genereParUserId, nbSaisiesVerrouillees`)
+ champ `exportId?` sur `Saisie` (export ayant figé la saisie).

- **Agrégation mensuelle** (`buildRecapExport(periode, perimetre)`) : une ligne par collaborateur du périmètre ayant une activité. N'inclut **que** les saisies `validee`/`verrouillee` (jamais `en_attente`/`refusee`).
  - **Heures sup** = décompte **hebdomadaire sans majoration** : pour chaque semaine ISO (regroupée par lundi via `lib/hours.ts › repartitionMoisMinutes`), `sup = max(0, total_semaine − seuil_hebdo)`, sommé sur le mois ; `normales = total_mois − sup`. Exprimées en **heures décimales** (2 décimales).
  - **Congés (jours)** = Σ `nbJours` des congés `conge_paye` `validee` dont `dateDebut` tombe dans le mois. **Absences (jours)** = idem pour `maladie` / `sans_solde`.
- **Fichiers** : CSV natif (séparateur `;`, UTF-8 **avec BOM**, `Blob` + `<a download>`) ; Excel `.xlsx` via **SheetJS** (feuille « Récap <mois> », nombres réels). Voir `src/lib/exportFile.ts`.
- **Verrouillage** (`verrouillerPeriode`) : passe les saisies `validee` incluses en `verrouillee` (avec `exportId`), crée l'`Export`, journalise `action:'export'` (cible `cibleType:'export'`). Ne re-verrouille jamais une saisie déjà `verrouillee` ; lève une erreur si aucune saisie validée sur la période. Le déblocage responsable accepte `verrouillee → en_attente`.

### Journal d'audit (généralisé)

`AuditLog` est généralisé avec une **cible générique** `cibleType ∈ {'saisie','conge','export'}` + `cibleId`
(les champs `saisieId?` / `congeId?` sont conservés en complément, compat ascendante).
Actions congés journalisées : `demande_conge`, `conge_validee`, `conge_refusee` ; action export : `export` — en plus des actions saisies existantes (`validee`, `refusee`, `debloquee`, `modifiee`), non cassées.

## Données seedées au 1er lancement

- **Familles** : Vignes (journée continue, pause 60 min), Marchais (demi-journées).
- **Modèles de contrat** : Vignes · CDI 35h (base 35, seuil 35), Vignes · CDD saison (39/39), Marchais · CDI jour (jours, 7h/j, seuil 35), Saisonnier · jour.
- **Collaborateurs** : Jean Ferrand (Vignes), Amélie Marchais (Marchais), Luc Bonnet (Vignes), Nadia Roux (Marchais).

Pour ré-initialiser les données : vider le localStorage du site (clé `rh.seeded` et `rh.*`).

## Points `// SUPABASE SWAP POINT`

La persistance est isolée derrière une interface `Repository`. Pour brancher Supabase
plus tard, on ne touche **pas** aux composants — uniquement ces 3 fichiers :

- `src/repositories/Repository.ts` — interface abstraite `Repository` (workflow de validation, congés + soldes calculés, exports/verrouillage, `listAudit`).
- `src/repositories/LocalStorageRepository.ts` — implémentation localStorage (à dupliquer en `SupabaseRepository`) : transitions de statut, congés, soldes calculés, agrégation/verrouillage des exports, écriture du journal d'audit.
- `src/repositories/index.ts` — fabrique unique : remplacer `new LocalStorageRepository()` par `new SupabaseRepository(...)`.

## Arborescence (2 niveaux)

```
rh-app/
├─ public/            icon.svg (icône PWA)
├─ src/
│  ├─ components/     Layout, ProtectedRoute, SaisieForm, StatusBadge
│  ├─ lib/            dates.ts, hours.ts (calculs)
│  ├─ pages/          Login + employe/ + responsable/
│  ├─ repositories/   Repository (interface), LocalStorageRepository, seed, index
│  ├─ store/          authStore, dataStore (zustand)
│  ├─ types.ts        types du domaine
│  ├─ App.tsx         routeur + gardes
│  ├─ main.tsx        entrée + enregistrement PWA
│  └─ styles.css      CSS maison (palette vigne/ocre)
├─ vite.config.ts     port 5180 + PWA
└─ README.md
```

## Limites connues (Étape 1)

- Auth **mockée** (mot de passe en clair dans le seed) — à remplacer par une vraie auth.
- Congés : pas de gestion de l'acquisition mensuelle (l'acquis est une allocation annuelle réglée à la main) ; `rtt` est enregistré mais ne décompte aucun compteur dédié pour l'instant.
- Export « envoi au service comptable » simulé (message de confirmation, pas d'e-mail réel).
- PWA : icône SVG unique (pas de jeu d'icônes PNG multi-tailles).
