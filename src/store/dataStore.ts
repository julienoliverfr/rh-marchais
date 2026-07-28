import { create } from 'zustand'
import type {
  AuditLog,
  Collaborateur,
  Compte,
  Conge,
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
  CongeType,
  TypeAbsence,
} from '../types'
import { repository } from '../repositories'

// Résultat d'une action pouvant échouer (transition de statut invalide, etc.).
export interface ActionResult {
  ok: boolean
  error?: string
}

// Résultat d'un verrouillage de période (porte l'Export créé en cas de succès).
export interface VerrouillageResult extends ActionResult {
  export?: Export
}

interface DataState {
  familles: Famille[]
  modeles: ModeleContrat[]
  collaborateurs: Collaborateur[]
  comptes: Compte[]
  saisies: Saisie[]
  conges: Conge[]
  audit: AuditLog[]
  // Politiques PAR type à solde (map `typeId -> PolitiqueConges`).
  politiques: PolitiquesConges
  regles: ReglesGenerales
  typesAbsence: TypeAbsence[]
  exports: Export[]
  // Compteur d'invalidation pour les soldes (l'acquis n'est pas dans le state).
  soldesTick: number

  refresh: () => void

  saveFamille: (famille: Famille) => void
  deleteFamille: (id: string) => void

  // Modèles de contrat (CRUD)
  saveModele: (modele: ModeleContrat) => void
  deleteModele: (id: string) => void

  saveCollaborateur: (collaborateur: Collaborateur) => void

  // Délégation de saisie : remplace la liste des collaborateurs pour lesquels
  // `collaborateurId` est autorisé à saisir, puis resynchronise l'état.
  setDelegationsSaisie: (collaborateurId: string, ciblesIds: string[]) => void

  // Import de collaborateurs (Assistant d'import) — matérialise les lignes
  // valides puis resynchronise collaborateurs / comptes / soldes.
  importerCollaborateurs: (rows: ImportCollaborateurRow[]) => ImportResult

  // Comptes utilisateurs (CRUD)
  saveCompte: (compte: Compte) => void
  deleteCompte: (id: string) => void
  // Réinitialise le mot de passe d'un compte existant (identifiant inchangé).
  resetPassword: (userId: string, nouveauMotDePasse: string) => void

  // Règles générales + types d'absence (Administration)
  setRegles: (regles: ReglesGenerales) => void
  saveTypeAbsence: (type: TypeAbsence) => void

  saveSaisie: (saisie: Saisie) => void
  deleteSaisie: (id: string) => void

  // Workflow de validation des saisies (Étape 2)
  validerSaisie: (id: string, parUserId: string) => ActionResult
  refuserSaisie: (id: string, parUserId: string, motif: string) => ActionResult
  debloquerSaisie: (id: string, parUserId: string) => ActionResult
  corrigerSaisie: (saisie: Saisie, parUserId: string) => ActionResult

  // Congés (généralisés multi-types à solde)
  creerDemandeConge: (data: DemandeCongeInput) => ActionResult
  validerConge: (id: string, parUserId: string) => ActionResult
  refuserConge: (id: string, parUserId: string, motif: string) => ActionResult
  setAllocation: (
    collaborateurId: string,
    typeId: CongeType,
    periodeLabel: string,
    acquis: number,
  ) => void
  getSolde: (collaborateurId: string, typeId: CongeType, dateRef?: string) => SoldePeriode
  getSoldesTousTypes: (collaborateurId: string, dateRef?: string) => SoldeParType[]

  // Politique de congés paramétrable PAR type à solde
  setPolitique: (typeId: CongeType, politique: PolitiqueConges) => void

  // Exports comptables (Étape 4)
  buildRecapExport: (periode: string, perimetre: Perimetre) => RecapExport
  verrouillerPeriode: (
    periode: string,
    perimetre: Perimetre,
    parUserId: string,
    format: ExportFormat,
  ) => VerrouillageResult

  listAudit: (cibleId?: string) => AuditLog[]
}

export const useDataStore = create<DataState>((set, get) => {
  // Rafraîchit toutes les données transactionnelles après une mutation.
  const syncTx = () =>
    set({
      saisies: repository.getSaisies(),
      conges: repository.listConges(),
      audit: repository.listAudit(),
    })

  // Encapsule un appel repository susceptible de lever une Error.
  const run = (fn: () => void): ActionResult => {
    try {
      fn()
      syncTx()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Erreur.' }
    }
  }

  return {
    familles: repository.getFamilles(),
    modeles: repository.getModeles(),
    collaborateurs: repository.getCollaborateurs(),
    comptes: repository.getComptes(),
    saisies: repository.getSaisies(),
    conges: repository.listConges(),
    audit: repository.listAudit(),
    politiques: repository.getPolitiques(),
    regles: repository.getRegles(),
    typesAbsence: repository.getTypesAbsence(),
    exports: repository.listExports(),
    soldesTick: 0,

    refresh: () =>
      set({
        familles: repository.getFamilles(),
        modeles: repository.getModeles(),
        collaborateurs: repository.getCollaborateurs(),
        comptes: repository.getComptes(),
        saisies: repository.getSaisies(),
        conges: repository.listConges(),
        audit: repository.listAudit(),
        politiques: repository.getPolitiques(),
        regles: repository.getRegles(),
        typesAbsence: repository.getTypesAbsence(),
        exports: repository.listExports(),
      }),

    saveFamille: (famille) => {
      repository.saveFamille(famille)
      set({ familles: repository.getFamilles() })
    },

    deleteFamille: (id) => {
      repository.deleteFamille(id)
      set({ familles: repository.getFamilles() })
    },

    saveModele: (modele) => {
      repository.saveModele(modele)
      set({ modeles: repository.getModeles() })
    },

    deleteModele: (id) => {
      repository.deleteModele(id)
      set({ modeles: repository.getModeles() })
    },

    saveCollaborateur: (collaborateur) => {
      repository.saveCollaborateur(collaborateur)
      set({ collaborateurs: repository.getCollaborateurs() })
    },

    setDelegationsSaisie: (collaborateurId, ciblesIds) => {
      repository.setDelegationsSaisie(collaborateurId, ciblesIds)
      set({ collaborateurs: repository.getCollaborateurs() })
    },

    // Import transactionnel : le repository ne reçoit QUE des lignes valides et
    // persiste tout d'un bloc. On resynchronise ensuite l'état (collaborateurs,
    // comptes, + invalidation des soldes pour refléter les allocations posées).
    importerCollaborateurs: (rows) => {
      const res = repository.importerCollaborateurs(rows)
      set({
        collaborateurs: repository.getCollaborateurs(),
        comptes: repository.getComptes(),
        soldesTick: get().soldesTick + 1,
      })
      return res
    },

    saveCompte: (compte) => {
      repository.saveCompte(compte)
      set({ comptes: repository.getComptes() })
    },

    deleteCompte: (id) => {
      repository.deleteCompte(id)
      set({ comptes: repository.getComptes() })
    },

    resetPassword: (userId, nouveauMotDePasse) => {
      repository.resetPassword(userId, nouveauMotDePasse)
      // Resynchronise (le mot de passe n'est pas affiché ; sans effet visible en
      // mode Supabase, mais garde le state cohérent en mode local).
      set({ comptes: repository.getComptes() })
    },

    setRegles: (regles) => {
      repository.setRegles(regles)
      set({ regles: repository.getRegles() })
    },

    saveTypeAbsence: (type) => {
      repository.saveTypeAbsence(type)
      // `aSolde` peut changer la liste des types portant une politique/solde.
      set({
        typesAbsence: repository.getTypesAbsence(),
        politiques: repository.getPolitiques(),
        soldesTick: get().soldesTick + 1,
      })
    },

    saveSaisie: (saisie) => {
      repository.saveSaisie(saisie)
      syncTx()
    },

    deleteSaisie: (id) => {
      repository.deleteSaisie(id)
      syncTx()
    },

    validerSaisie: (id, parUserId) =>
      run(() => repository.validerSaisie(id, parUserId)),

    refuserSaisie: (id, parUserId, motif) =>
      run(() => repository.refuserSaisie(id, parUserId, motif)),

    debloquerSaisie: (id, parUserId) =>
      run(() => repository.debloquerSaisie(id, parUserId)),

    corrigerSaisie: (saisie, parUserId) =>
      run(() => repository.corrigerSaisie(saisie, parUserId)),

    creerDemandeConge: (data) =>
      run(() => {
        repository.creerDemandeConge(data)
      }),

    validerConge: (id, parUserId) =>
      run(() => repository.validerConge(id, parUserId)),

    refuserConge: (id, parUserId, motif) =>
      run(() => repository.refuserConge(id, parUserId, motif)),

    setAllocation: (collaborateurId, typeId, periodeLabel, acquis) => {
      repository.setAllocation(collaborateurId, typeId, periodeLabel, acquis)
      set({ soldesTick: get().soldesTick + 1 })
    },

    // Solde calculé d'un type (lecture directe ; `conges`, `politiques` et
    // `soldesTick` servent d'invalidation réactive).
    getSolde: (collaborateurId, typeId, dateRef) => {
      void get().conges
      void get().soldesTick
      void get().politiques
      return repository.getSolde(collaborateurId, typeId, dateRef)
    },

    getSoldesTousTypes: (collaborateurId, dateRef) => {
      void get().conges
      void get().soldesTick
      void get().politiques
      void get().typesAbsence
      return repository.getSoldesTousTypes(collaborateurId, dateRef)
    },

    setPolitique: (typeId, politique) => {
      repository.setPolitique(typeId, politique)
      // Recharge les politiques + invalide les soldes calculés.
      set({
        politiques: repository.getPolitiques(),
        soldesTick: get().soldesTick + 1,
      })
    },

    // Lecture directe de l'agrégation (dépend de `saisies`/`conges` qui servent
    // d'invalidation réactive lorsque l'appelant les lit via un sélecteur).
    buildRecapExport: (periode, perimetre) =>
      repository.buildRecapExport(periode, perimetre),

    // Verrouille la période : le repository lève une Error si aucune saisie
    // validée n'est concernée. On resynchronise saisies/audit + la liste des
    // exports après un succès.
    verrouillerPeriode: (periode, perimetre, parUserId, format) => {
      try {
        const exportEntity = repository.verrouillerPeriode(
          periode,
          perimetre,
          parUserId,
          format,
        )
        syncTx()
        set({ exports: repository.listExports() })
        return { ok: true, export: exportEntity }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erreur.' }
      }
    },

    // Lecture directe (le state `audit` sert d'invalidation réactive).
    listAudit: (cibleId) => {
      void get().audit
      return repository.listAudit(cibleId)
    },
  }
})
