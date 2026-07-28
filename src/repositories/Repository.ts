import type {
  AuditLog,
  Compte,
  Collaborateur,
  Conge,
  CongeFiltre,
  DemandeCongeInput,
  Export,
  ExportFormat,
  Famille,
  ImportCollaborateurRow,
  ImportResult,
  ModeleContrat,
  Perimetre,
  PolitiqueConges,
  PolitiquesConges,
  RecapExport,
  ReglesGenerales,
  Saisie,
  SoldeParType,
  SoldePeriode,
  StatutConge,
  CongeType,
  TypeAbsence,
} from '../types'

// SUPABASE SWAP POINT
// -------------------
// Interface abstraite de persistance. Les composants et les stores ne
// dépendent QUE de cette interface, jamais d'une implémentation concrète.
// Pour brancher Supabase plus tard : créer une classe `SupabaseRepository`
// qui implémente cette interface (méthodes rendues asynchrones si besoin),
// puis la retourner dans `repositories/index.ts`. Aucun composant à modifier.
export interface Repository {
  // Familles
  getFamilles(): Famille[]
  saveFamille(famille: Famille): void
  deleteFamille(id: string): void

  // Modèles de contrat
  // SUPABASE SWAP POINT
  // Deviendra une table `modeles_contrat` (CRUD via policies RLS responsable).
  getModeles(): ModeleContrat[]
  saveModele(modele: ModeleContrat): void
  deleteModele(id: string): void

  // Collaborateurs
  // `getCollaborateurs` renvoie chaque collaborateur AVEC sa liste de délégation
  // de saisie (`peutSaisirPour`). `saveCollaborateur` persiste également cette
  // liste (voir aussi `setDelegationsSaisie`).
  getCollaborateurs(): Collaborateur[]
  saveCollaborateur(collaborateur: Collaborateur): void

  // Délégation de saisie pour autrui
  // SUPABASE SWAP POINT
  // Matérialisée par la table `delegations_saisie(delegant, cible)` (voir
  // supabase/schema.sql). Définit la liste des collaborateurs (`ciblesIds`) pour
  // lesquels `collaborateurId` peut saisir. Remplace intégralement la liste
  // existante. La DÉCISION d'autorisation d'écriture est prise côté base (RLS).
  setDelegationsSaisie(collaborateurId: string, ciblesIds: string[]): void

  // Import de collaborateurs (Assistant d'import)
  // SUPABASE SWAP POINT
  // Deviendra une transaction/RPC côté base : pour CHAQUE ligne valide, INSERT
  // collaborateur + contrat, création du compte de connexion (invitation
  // Supabase Auth, mot de passe jamais stocké en clair) et éventuel override
  // d'allocation, le tout ATOMIQUE (rollback si une insertion échoue). Reçoit
  // uniquement des lignes déjà validées ; construit tout puis persiste en une
  // seule passe (aucun demi-import incohérent).
  importerCollaborateurs(rows: ImportCollaborateurRow[]): ImportResult

  // Comptes (auth mockée)
  // SUPABASE SWAP POINT
  // La création/suppression deviendra la gestion des utilisateurs Supabase Auth
  // (invitations + rôles), les mots de passe n'étant jamais stockés en clair.
  getComptes(): Compte[]
  saveCompte(compte: Compte): void
  deleteCompte(id: string): void

  // Réinitialisation du mot de passe d'un compte EXISTANT (l'identifiant/e-mail
  // n'est pas modifié).
  // SUPABASE SWAP POINT
  // Deviendra un appel à la fonction SECURITY DEFINER `admin_reset_password`
  // (garde « responsable uniquement » côté base) ; le mot de passe est haché en
  // base et n'est jamais stocké en clair côté appli. En mode local (démo), met
  // simplement à jour le mot de passe stocké.
  resetPassword(userId: string, nouveauMotDePasse: string): void

  // Règles générales (singleton paramétrable)
  // SUPABASE SWAP POINT
  // Deviendra une table `regles_generales` à une seule ligne (ou une config).
  // Valeurs par défaut renvoyées si la clé est absente.
  getRegles(): ReglesGenerales
  setRegles(regles: ReglesGenerales): void

  // Types d'absence paramétrables
  // SUPABASE SWAP POINT
  // Deviendra une table `types_absence`. Le `code` reste un CongeType du domaine
  // (le moteur de solde en dépend) ; l'admin en règle libellé + options.
  getTypesAbsence(): TypeAbsence[]
  saveTypeAbsence(type: TypeAbsence): void
  deleteTypeAbsence(code: TypeAbsence['code']): void

  // Saisies d'heures
  getSaisies(): Saisie[]
  saveSaisie(saisie: Saisie): void
  deleteSaisie(id: string): void

  // Workflow de validation (Étape 2)
  // SUPABASE SWAP POINT
  // Ces transitions de statut deviendront des UPDATE Supabase (idéalement côté
  // base via des policies RLS "responsable"), avec écriture atomique dans la
  // table d'audit. L'implémentation localStorage ci-après reste la référence
  // de contrat. Chaque méthode lève une Error en cas de transition invalide.
  getSaisiesByStatut(statut: Saisie['statut']): Saisie[]

  // Valide une saisie `en_attente`. Erreur si absente ou déjà validée.
  validerSaisie(id: string, parUserId: string): void

  // Refuse une saisie ; `motif` obligatoire (non vide). Erreur sinon.
  refuserSaisie(id: string, parUserId: string, motif: string): void

  // Débloque une saisie `validee` OU `verrouillee` -> repasse en `en_attente`.
  // Réservé au responsable. Erreur si la saisie n'est ni validée ni verrouillée.
  debloquerSaisie(id: string, parUserId: string): void

  // Enregistre une correction d'une saisie éditable (par l'employé ou le
  // responsable) : sauvegarde, repasse en `en_attente`, journalise `modifiee`.
  corrigerSaisie(saisie: Saisie, parUserId: string): void

  // Congés (Étape 3)
  // SUPABASE SWAP POINT
  // Table `conges` + table `soldes_conge` (allocation annuelle). Le "pris" et
  // le "restant" restent CALCULÉS (aucun compteur mutable) pour éviter toute
  // dérive : ils dérivent de la somme des congés payés validés de l'année.
  listConges(filtre?: CongeFiltre): Conge[]
  getCongesByCollaborateur(collaborateurId: string): Conge[]
  getCongesByStatut(statut: StatutConge): Conge[]

  // Crée une demande de congé (statut `demandee`), calcule `nbJours`, journalise
  // `demande_conge`. Renvoie le congé créé.
  creerDemandeConge(data: DemandeCongeInput): Conge

  // Approuve une demande `demandee` -> `validee` + audit. Erreur si déjà traitée.
  validerConge(id: string, parUserId: string): void

  // Refuse une demande ; `motif` obligatoire. Erreur si déjà traitée.
  refuserConge(id: string, parUserId: string, motif: string): void

  // Politique de congés PAR TYPE à solde (map `typeId -> PolitiqueConges`)
  // SUPABASE SWAP POINT
  // Deviendra une table `politique_conges` (une ligne par type à solde).
  // MIGRATION : l'ancienne politique globale unique devient la politique du
  // type `conge_paye` (aucune perte ; repli sur les valeurs par défaut).

  // Politiques de TOUS les types à solde (map résolue, valeurs par défaut si
  // absentes).
  getPolitiques(): PolitiquesConges
  // Politique d'UN type à solde (repli sur la politique par défaut du type).
  getPolitique(typeId: CongeType): PolitiqueConges
  // Enregistre la politique d'UN type à solde.
  setPolitique(typeId: CongeType, politique: PolitiqueConges): void

  // Compat ascendante : la politique du type `conge_paye`.
  getPolitiqueConges(): PolitiqueConges
  setPolitiqueConges(politique: PolitiqueConges): void

  // Solde CALCULÉ d'UN type à solde pour la période de référence (de ce type)
  // contenant `dateRef` (défaut = aujourd'hui) : acquis (acquisition selon la
  // politique du type + report), pris (congés DE CE TYPE validés tombant dans la
  // période), restant. Un override manuel (setAllocation) prime sur le calcul.
  getSolde(collaborateurId: string, typeId: CongeType, dateRef?: string): SoldePeriode

  // Soldes de TOUS les types à solde d'un collaborateur (une entrée par type).
  getSoldesTousTypes(collaborateurId: string, dateRef?: string): SoldeParType[]

  // Override MANUEL de l'acquis d'un collaborateur pour un TYPE à solde et la
  // période dont le libellé est `periodeLabel`. Prime sur le calcul auto.
  setAllocation(
    collaborateurId: string,
    typeId: CongeType,
    periodeLabel: string,
    acquis: number,
  ): void

  // Exports comptables (Étape 4)
  // SUPABASE SWAP POINT
  // `buildRecapExport` deviendra une vue/RPC d'agrégation côté base. Le
  // verrouillage sera un UPDATE transactionnel (saisies -> `verrouillee`) +
  // INSERT dans `exports` + `audit_log`, protégé par policies RLS responsable.

  // Construit le récapitulatif agrégé du mois pour le périmètre donné
  // (n'inclut QUE les saisies `validee`/`verrouillee`).
  buildRecapExport(periode: string, perimetre: Perimetre): RecapExport

  // Verrouille la période : passe les saisies `validee` incluses en
  // `verrouillee` (avec `exportId`), crée l'Export, journalise. Ne re-verrouille
  // jamais une saisie déjà `verrouillee`. Renvoie l'Export créé.
  verrouillerPeriode(
    periode: string,
    perimetre: Perimetre,
    parUserId: string,
    format: ExportFormat,
  ): Export

  listExports(): Export[]

  // Journal d'audit
  // SUPABASE SWAP POINT
  // Deviendra un SELECT sur la table `audit_log`. `cibleId` filtre sur la cible
  // générique (saisie ou congé).
  listAudit(cibleId?: string): AuditLog[]
}
