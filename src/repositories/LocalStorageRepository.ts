import type {
  AuditAction,
  AuditLog,
  CibleType,
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
  RecapColonneType,
  RecapExport,
  RecapLigne,
  RecapTotaux,
  ReglesGenerales,
  Saisie,
  SoldeConge,
  SoldeParType,
  SoldePeriode,
  StatutConge,
  CongeType,
  TypeAbsence,
} from '../types'
import { computeNbJours, quotasParTypeDe, typeASolde } from '../lib/conges'
import { isInMonthKey, todayISO } from '../lib/dates'
import { minutesToDecimalHours, repartitionMoisMinutes } from '../lib/hours'
import {
  POLITIQUE_DEFAUT,
  POLITIQUES_DEFAUT,
  calculerSolde,
  normalizePolitique,
  periodePour,
} from '../lib/soldes'
import type { Repository } from './Repository'
import {
  REGLES_DEFAUT,
  collaborateursSeed,
  comptesSeed,
  famillesSeed,
  modelesSeed,
  politiquesSeed,
  saisiesSeed,
  typesAbsenceSeed,
} from './seed'

// SUPABASE SWAP POINT
// -------------------
// Implémentation concrète basée sur localStorage. C'est ce fichier (et lui
// seul) qui contient la logique de stockage. Une future implémentation
// `SupabaseRepository` remplacera ces lectures/écritures par des appels à
// Supabase, sans changer l'interface `Repository` ni les composants.

const KEYS = {
  familles: 'rh.familles',
  modeles: 'rh.modeles',
  collaborateurs: 'rh.collaborateurs',
  comptes: 'rh.comptes',
  saisies: 'rh.saisies',
  conges: 'rh.conges',
  soldes: 'rh.soldes',
  // Politiques PAR type à solde (map `typeId -> PolitiqueConges`).
  politiques: 'rh.politiques',
  // Legacy (Étape 5) : ancienne politique globale unique. Conservée en lecture
  // pour la MIGRATION vers la map `politiques` (devient la politique CP).
  politiqueConges: 'rh.politiqueConges',
  regles: 'rh.regles',
  typesAbsence: 'rh.typesAbsence',
  exports: 'rh.exports',
  audit: 'rh.audit',
  seeded: 'rh.seeded',
} as const

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

export class LocalStorageRepository implements Repository {
  constructor() {
    this.ensureSeed()
    this.migrate()
  }

  private ensureSeed(): void {
    if (localStorage.getItem(KEYS.seeded) === '1') return
    write(KEYS.familles, famillesSeed)
    write(KEYS.modeles, modelesSeed)
    write(KEYS.collaborateurs, collaborateursSeed)
    write(KEYS.comptes, comptesSeed)
    write(KEYS.saisies, saisiesSeed)
    write(KEYS.conges, [] as Conge[])
    write(KEYS.soldes, [] as SoldeConge[])
    write(KEYS.politiques, politiquesSeed)
    write(KEYS.regles, REGLES_DEFAUT)
    write(KEYS.typesAbsence, typesAbsenceSeed)
    write(KEYS.exports, [] as Export[])
    write(KEYS.audit, [] as AuditLog[])
    localStorage.setItem(KEYS.seeded, '1')
  }

  // MIGRATION NON CASSANTE des installs existantes (localStorage déjà seedé).
  // Idempotente : ne réécrit que si nécessaire.
  private migrate(): void {
    // 1) Types d'absence : ajoute `aSolde` (dérivé de l'ancien `decrementeCp`)
    //    et garantit la présence du type `anciennete` (nouveau type à solde).
    const rawTypes = read<TypeAbsence[] | null>(KEYS.typesAbsence, null)
    if (rawTypes) {
      let changed = false
      const types = rawTypes.map((t) => {
        if (t.aSolde === undefined) {
          changed = true
          return { ...t, aSolde: t.decrementeCp ?? false }
        }
        return t
      })
      if (!types.some((t) => t.code === 'anciennete')) {
        types.push({
          code: 'anciennete',
          label: 'Ancienneté',
          aSolde: true,
          justificatifRequis: false,
        })
        changed = true
      }
      if (changed) write(KEYS.typesAbsence, types)
    }

    // 2) Politiques : si la map `rh.politiques` est absente, la construire à
    //    partir de l'ancienne politique globale unique (→ conge_paye) complétée
    //    par les politiques par défaut des autres types à solde.
    const rawMap = read<PolitiquesConges | null>(KEYS.politiques, null)
    if (!rawMap) {
      const legacy = read<PolitiqueConges | null>(KEYS.politiqueConges, null)
      const map: PolitiquesConges = {
        conge_paye: legacy ? normalizePolitique(legacy) : POLITIQUES_DEFAUT.conge_paye,
        rtt: POLITIQUES_DEFAUT.rtt,
        anciennete: POLITIQUES_DEFAUT.anciennete,
      }
      write(KEYS.politiques, map)
    }

    // 3) Quotas PAR TYPE sur les modèles et contrats : un ancien `congesSolde`
    //    (solde CP unique) devient `quotasParType = { conge_paye: <valeur> }`.
    //    Idempotent : on ne réécrit qu'une entité dépourvue de `quotasParType`.
    const rawModeles = read<ModeleContrat[] | null>(KEYS.modeles, null)
    if (rawModeles && rawModeles.some((m) => m.quotasParType === undefined)) {
      const modeles = rawModeles.map((m) =>
        m.quotasParType === undefined
          ? { ...m, quotasParType: quotasParTypeDe(m), congesSolde: undefined }
          : m,
      )
      write(KEYS.modeles, modeles)
    }
    const rawCollabs = read<Collaborateur[] | null>(KEYS.collaborateurs, null)
    if (
      rawCollabs &&
      rawCollabs.some((c) => c.contrat && c.contrat.quotasParType === undefined)
    ) {
      const collabs = rawCollabs.map((c) =>
        c.contrat && c.contrat.quotasParType === undefined
          ? {
              ...c,
              contrat: {
                ...c.contrat,
                quotasParType: quotasParTypeDe(c.contrat),
                congesSolde: undefined,
              },
            }
          : c,
      )
      write(KEYS.collaborateurs, collabs)
    }
  }

  // Familles
  getFamilles(): Famille[] {
    return read<Famille[]>(KEYS.familles, [])
  }

  saveFamille(famille: Famille): void {
    const list = this.getFamilles()
    const idx = list.findIndex((f) => f.id === famille.id)
    if (idx >= 0) list[idx] = famille
    else list.push(famille)
    write(KEYS.familles, list)
  }

  deleteFamille(id: string): void {
    write(
      KEYS.familles,
      this.getFamilles().filter((f) => f.id !== id),
    )
  }

  // Modèles de contrat
  getModeles(): ModeleContrat[] {
    return read<ModeleContrat[]>(KEYS.modeles, [])
  }

  saveModele(modele: ModeleContrat): void {
    const list = this.getModeles()
    const idx = list.findIndex((m) => m.id === modele.id)
    if (idx >= 0) list[idx] = modele
    else list.push(modele)
    write(KEYS.modeles, list)
  }

  deleteModele(id: string): void {
    write(
      KEYS.modeles,
      this.getModeles().filter((m) => m.id !== id),
    )
  }

  // Collaborateurs
  getCollaborateurs(): Collaborateur[] {
    // Normalise `peutSaisirPour` (données historiques sans le champ = liste vide).
    return read<Collaborateur[]>(KEYS.collaborateurs, []).map((c) => ({
      ...c,
      peutSaisirPour: c.peutSaisirPour ?? [],
    }))
  }

  saveCollaborateur(collaborateur: Collaborateur): void {
    const list = this.getCollaborateurs()
    // On persiste toujours la liste de délégation (normalisée) avec l'entité.
    const normalise: Collaborateur = {
      ...collaborateur,
      peutSaisirPour: collaborateur.peutSaisirPour ?? [],
    }
    const idx = list.findIndex((c) => c.id === collaborateur.id)
    if (idx >= 0) list[idx] = normalise
    else list.push(normalise)
    write(KEYS.collaborateurs, list)
  }

  // Remplace la liste des collaborateurs pour lesquels `collaborateurId` peut
  // saisir. Aucune action si le collaborateur est introuvable.
  setDelegationsSaisie(collaborateurId: string, ciblesIds: string[]): void {
    const list = this.getCollaborateurs()
    const idx = list.findIndex((c) => c.id === collaborateurId)
    if (idx < 0) return
    // On exclut une éventuelle auto-référence (on saisit déjà pour soi).
    list[idx] = {
      ...list[idx],
      peutSaisirPour: ciblesIds.filter((id) => id !== collaborateurId),
    }
    write(KEYS.collaborateurs, list)
  }

  // ---------- Import de collaborateurs (Assistant d'import) ----------
  // SUPABASE SWAP POINT
  // Ici l'import est TRANSACTIONNEL "à la localStorage" : on construit d'abord
  // en mémoire l'ensemble des entités (collaborateurs + comptes + éventuels
  // overrides d'allocation), puis on écrit chaque clé en UNE seule passe. Aucun
  // demi-import : si la construction lève, rien n'a encore été persisté.
  // Côté Supabase, remplacer ce bloc par une RPC/transaction serveur.
  importerCollaborateurs(rows: ImportCollaborateurRow[]): ImportResult {
    if (rows.length === 0) return { importes: 0, ignores: 0 }

    const modeles = this.getModeles()
    const seuilDefaut = this.getRegles().seuilHsupDefautHebdo
    // Libellé de la période de référence COURANTE, calculé PAR TYPE à solde (chaque
    // type a sa propre politique/période). Mémoïsé pour éviter les recalculs.
    const periodeLabelParType = new Map<CongeType, string>()
    const labelPeriodeType = (typeId: CongeType): string => {
      let l = periodeLabelParType.get(typeId)
      if (l === undefined) {
        l = periodePour(todayISO(), this.getPolitique(typeId)).label
        periodeLabelParType.set(typeId, l)
      }
      return l
    }

    const nouveauxCollabs: Collaborateur[] = []
    const nouveauxComptes: Compte[] = []
    const nouveauxSoldes: SoldeConge[] = []

    for (const row of rows) {
      // Le modèle pré-remplit base / seuil h. sup / congés du contrat.
      const modele = modeles.find((m) => m.id === row.modeleId)
      const collabId = genId('col')

      nouveauxCollabs.push({
        id: collabId,
        prenom: row.prenom,
        nom: row.nom,
        familleId: row.familleId,
        contrat: {
          modeleId: row.modeleId,
          unite: modele?.unite ?? 'heures',
          base: modele?.base ?? 35,
          seuilHebdo: modele?.seuilHebdo ?? seuilDefaut,
          // Quotas de congés PAR TYPE hérités du modèle (repli défaut politique
          // par type si le modèle ne précise rien).
          quotasParType: modele ? quotasParTypeDe(modele) : {},
          // Date d'entrée si fournie → proratise l'acquis (lib/soldes.ts).
          dateDebut: row.dateDebut,
        },
      })

      // Compte de connexion rattaché (rôle employé).
      nouveauxComptes.push({
        id: genId('cpt'),
        identifiant: row.identifiant,
        motDePasse: row.motDePasse,
        role: 'employe',
        collaborateurId: collabId,
        nomAffichage: `${row.prenom} ${row.nom}`,
      })

      // Solde initial PAR TYPE à solde → override d'allocation sur la période
      // courante DE CHAQUE type (même structure que setAllocation, prime sur le
      // calcul auto). Rétrocompatibilité : l'ancienne colonne « Solde congés
      // initial » (row.soldeInitial) alimente le type CP s'il n'est pas déjà
      // fourni via soldesInitiaux.
      const soldesRow: Partial<Record<CongeType, number>> = {
        ...(row.soldesInitiaux ?? {}),
      }
      if (row.soldeInitial != null && soldesRow.conge_paye == null) {
        soldesRow.conge_paye = row.soldeInitial
      }
      for (const [code, valeur] of Object.entries(soldesRow) as [
        CongeType,
        number | undefined,
      ][]) {
        if (valeur == null) continue
        nouveauxSoldes.push({
          id: genId('sld'),
          collaborateurId: collabId,
          typeId: code,
          periodeLabel: labelPeriodeType(code),
          acquis: valeur,
        })
      }
    }

    // Persistance atomique : on n'écrit qu'après avoir tout construit.
    write(KEYS.collaborateurs, [...this.getCollaborateurs(), ...nouveauxCollabs])
    write(KEYS.comptes, [...this.getComptes(), ...nouveauxComptes])
    if (nouveauxSoldes.length > 0) {
      write(KEYS.soldes, [...this.getSoldes(), ...nouveauxSoldes])
    }

    return { importes: nouveauxCollabs.length, ignores: 0 }
  }

  // Comptes
  getComptes(): Compte[] {
    return read<Compte[]>(KEYS.comptes, [])
  }

  saveCompte(compte: Compte): void {
    const list = this.getComptes()
    const idx = list.findIndex((c) => c.id === compte.id)
    if (idx >= 0) list[idx] = compte
    else list.push(compte)
    write(KEYS.comptes, list)
  }

  deleteCompte(id: string): void {
    write(
      KEYS.comptes,
      this.getComptes().filter((c) => c.id !== id),
    )
  }

  // Mode démo : le mot de passe vit en clair dans localStorage (voir authStore).
  // On met simplement à jour la ligne concernée ; aucune action si introuvable.
  resetPassword(userId: string, nouveauMotDePasse: string): void {
    const list = this.getComptes()
    const idx = list.findIndex((c) => c.id === userId)
    if (idx < 0) return
    list[idx] = { ...list[idx], motDePasse: nouveauMotDePasse }
    write(KEYS.comptes, list)
  }

  // Règles générales (repli sur les valeurs par défaut si la clé est absente).
  getRegles(): ReglesGenerales {
    return read<ReglesGenerales>(KEYS.regles, REGLES_DEFAUT)
  }

  setRegles(regles: ReglesGenerales): void {
    write(KEYS.regles, regles)
  }

  // Types d'absence (repli sur le seed si la clé est absente).
  getTypesAbsence(): TypeAbsence[] {
    return read<TypeAbsence[]>(KEYS.typesAbsence, typesAbsenceSeed)
  }

  saveTypeAbsence(type: TypeAbsence): void {
    const list = this.getTypesAbsence()
    const idx = list.findIndex((t) => t.code === type.code)
    if (idx >= 0) list[idx] = type
    else list.push(type)
    write(KEYS.typesAbsence, list)
  }

  deleteTypeAbsence(code: TypeAbsence['code']): void {
    write(
      KEYS.typesAbsence,
      this.getTypesAbsence().filter((t) => t.code !== code),
    )
  }

  // Saisies
  getSaisies(): Saisie[] {
    return read<Saisie[]>(KEYS.saisies, [])
  }

  saveSaisie(saisie: Saisie): void {
    const list = this.getSaisies()
    const idx = list.findIndex((s) => s.id === saisie.id)
    if (idx >= 0) list[idx] = saisie
    else list.push(saisie)
    write(KEYS.saisies, list)
  }

  deleteSaisie(id: string): void {
    write(
      KEYS.saisies,
      this.getSaisies().filter((s) => s.id !== id),
    )
  }

  // ---------- Workflow de validation (Étape 2) ----------

  getSaisiesByStatut(statut: Saisie['statut']): Saisie[] {
    return this.getSaisies().filter((s) => s.statut === statut)
  }

  // Écrit une entrée d'audit générique (append-only), pour n'importe quelle
  // cible (saisie ou congé).
  private appendAudit(
    cibleType: CibleType,
    cibleId: string,
    action: AuditAction,
    parUserId: string,
    detail?: string,
  ): void {
    const list = read<AuditLog[]>(KEYS.audit, [])
    list.push({
      id: genId('aud'),
      cibleType,
      cibleId,
      action,
      parUserId,
      horodatage: new Date().toISOString(),
      detail,
      saisieId: cibleType === 'saisie' ? cibleId : undefined,
      congeId: cibleType === 'conge' ? cibleId : undefined,
    })
    write(KEYS.audit, list)
  }

  // Récupère une saisie ou lève une erreur explicite.
  private requireSaisie(id: string): Saisie {
    const s = this.getSaisies().find((x) => x.id === id)
    if (!s) throw new Error("Saisie introuvable.")
    return s
  }

  validerSaisie(id: string, parUserId: string): void {
    const saisie = this.requireSaisie(id)
    // Cas limite : ne pas valider deux fois.
    if (saisie.statut === 'validee') {
      throw new Error('Cette saisie est déjà validée.')
    }
    const maj: Saisie = {
      ...saisie,
      statut: 'validee',
      validee_par: parUserId,
      validee_le: new Date().toISOString(),
      // On efface un éventuel motif de refus précédent.
      refus_motif: undefined,
    }
    this.saveSaisie(maj)
    this.appendAudit('saisie', id, 'validee', parUserId)
  }

  refuserSaisie(id: string, parUserId: string, motif: string): void {
    // Cas limite : motif obligatoire.
    const motifClean = motif.trim()
    if (!motifClean) {
      throw new Error('Un motif de refus est obligatoire.')
    }
    const saisie = this.requireSaisie(id)
    const maj: Saisie = {
      ...saisie,
      statut: 'refusee',
      refus_motif: motifClean,
      // Le refus annule une validation précédente éventuelle.
      validee_par: undefined,
      validee_le: undefined,
    }
    this.saveSaisie(maj)
    this.appendAudit('saisie', id, 'refusee', parUserId, motifClean)
  }

  debloquerSaisie(id: string, parUserId: string): void {
    const saisie = this.requireSaisie(id)
    // Cas limite : on ne débloque qu'une saisie validée ou verrouillée.
    if (saisie.statut !== 'validee' && saisie.statut !== 'verrouillee') {
      throw new Error(
        'Seule une saisie validée ou verrouillée peut être débloquée.',
      )
    }
    const etait = saisie.statut
    const maj: Saisie = {
      ...saisie,
      statut: 'en_attente',
      debloquee_par: parUserId,
      validee_par: undefined,
      validee_le: undefined,
      // Le déblocage retire la saisie de l'export qui l'avait verrouillée.
      exportId: undefined,
    }
    this.saveSaisie(maj)
    this.appendAudit(
      'saisie',
      id,
      'debloquee',
      parUserId,
      etait === 'verrouillee' ? 'Déblocage (période verrouillée)' : undefined,
    )
  }

  corrigerSaisie(saisie: Saisie, parUserId: string): void {
    // Une correction ramène toujours la saisie en attente de validation et
    // efface le motif de refus précédent.
    const maj: Saisie = {
      ...saisie,
      statut: 'en_attente',
      refus_motif: undefined,
      validee_par: undefined,
      validee_le: undefined,
    }
    this.saveSaisie(maj)
    this.appendAudit(
      'saisie',
      saisie.id,
      'modifiee',
      parUserId,
      `Correction (${Math.round(saisie.totalMinutes)} min)`,
    )
  }

  // ---------- Congés (Étape 3) ----------

  private getConges(): Conge[] {
    return read<Conge[]>(KEYS.conges, [])
  }

  private saveConge(conge: Conge): void {
    const list = this.getConges()
    const idx = list.findIndex((c) => c.id === conge.id)
    if (idx >= 0) list[idx] = conge
    else list.push(conge)
    write(KEYS.conges, list)
  }

  private requireConge(id: string): Conge {
    const c = this.getConges().find((x) => x.id === id)
    if (!c) throw new Error('Demande de congé introuvable.')
    return c
  }

  listConges(filtre?: CongeFiltre): Conge[] {
    let list = this.getConges()
    if (filtre?.collaborateurId) {
      list = list.filter((c) => c.collaborateurId === filtre.collaborateurId)
    }
    if (filtre?.statut) {
      list = list.filter((c) => c.statut === filtre.statut)
    }
    if (filtre?.annee != null) {
      list = list.filter(
        (c) => new Date(c.dateDebut + 'T12:00:00').getFullYear() === filtre.annee,
      )
    }
    // Tri antéchronologique par date de début.
    return list.slice().sort((a, b) => (a.dateDebut < b.dateDebut ? 1 : -1))
  }

  getCongesByCollaborateur(collaborateurId: string): Conge[] {
    return this.listConges({ collaborateurId })
  }

  getCongesByStatut(statut: StatutConge): Conge[] {
    return this.listConges({ statut })
  }

  creerDemandeConge(data: DemandeCongeInput): Conge {
    // Cohérence des dates.
    if (data.dateFin < data.dateDebut) {
      throw new Error('La date de fin ne peut pas précéder la date de début.')
    }
    const demiJour =
      data.dateDebut === data.dateFin ? data.demiJour : 'aucune'
    const nbJours = computeNbJours(data.dateDebut, data.dateFin, demiJour)
    if (nbJours <= 0) {
      throw new Error(
        'La période sélectionnée ne contient aucun jour ouvré (lun→ven).',
      )
    }
    const conge: Conge = {
      id: genId('cng'),
      collaborateurId: data.collaborateurId,
      type: data.type,
      dateDebut: data.dateDebut,
      dateFin: data.dateFin,
      demiJour,
      nbJours,
      statut: 'demandee',
      demandeParUserId: data.demandeParUserId,
      motif: data.motif?.trim() || undefined,
      createdAt: new Date().toISOString(),
    }
    this.saveConge(conge)
    this.appendAudit(
      'conge',
      conge.id,
      'demande_conge',
      data.demandeParUserId,
      `${nbJours} j — ${data.type}`,
    )
    return conge
  }

  validerConge(id: string, parUserId: string): void {
    const conge = this.requireConge(id)
    // Cas limite : pas de double traitement.
    if (conge.statut !== 'demandee') {
      throw new Error('Cette demande a déjà été traitée.')
    }
    const maj: Conge = {
      ...conge,
      statut: 'validee',
      valideeParUserId: parUserId,
      refusMotif: undefined,
    }
    this.saveConge(maj)
    this.appendAudit('conge', id, 'conge_validee', parUserId, `${conge.nbJours} j`)
  }

  refuserConge(id: string, parUserId: string, motif: string): void {
    const motifClean = motif.trim()
    if (!motifClean) {
      throw new Error('Un motif de refus est obligatoire.')
    }
    const conge = this.requireConge(id)
    if (conge.statut !== 'demandee') {
      throw new Error('Cette demande a déjà été traitée.')
    }
    const maj: Conge = {
      ...conge,
      statut: 'refusee',
      refusMotif: motifClean,
      valideeParUserId: undefined,
    }
    this.saveConge(maj)
    this.appendAudit('conge', id, 'conge_refusee', parUserId, motifClean)
  }

  // ---------- Politiques de congés PAR TYPE à solde ----------

  // Map brute des politiques (migrée au démarrage via migrate()).
  private getPolitiquesMap(): PolitiquesConges {
    return read<PolitiquesConges>(KEYS.politiques, {})
  }

  // Politique d'un type à solde : map → défaut du type → défaut CP. Normalisée.
  getPolitique(typeId: CongeType): PolitiqueConges {
    const map = this.getPolitiquesMap()
    const p = map[typeId] ?? POLITIQUES_DEFAUT[typeId] ?? POLITIQUE_DEFAUT
    return normalizePolitique(p)
  }

  // Politiques résolues de TOUS les types à solde (selon les types d'absence).
  getPolitiques(): PolitiquesConges {
    const out: PolitiquesConges = {}
    for (const t of this.getTypesAbsence()) {
      if (typeASolde(t)) out[t.code] = this.getPolitique(t.code)
    }
    return out
  }

  setPolitique(typeId: CongeType, politique: PolitiqueConges): void {
    const map = this.getPolitiquesMap()
    map[typeId] = normalizePolitique(politique)
    write(KEYS.politiques, map)
  }

  // Compat ascendante : politique du type `conge_paye`.
  getPolitiqueConges(): PolitiqueConges {
    return this.getPolitique('conge_paye')
  }

  setPolitiqueConges(politique: PolitiqueConges): void {
    this.setPolitique('conge_paye', politique)
  }

  // ---------- Solde de congés PAR TYPE (acquis calculé, pris/restant dérivés) ----------

  private getSoldes(): SoldeConge[] {
    return read<SoldeConge[]>(KEYS.soldes, [])
  }

  // typeId effectif d'un override (MIGRATION : historique sans typeId = CP).
  private typeIdOverride(s: SoldeConge): CongeType {
    return s.typeId ?? 'conge_paye'
  }

  // Solde calculé d'UN type à solde pour la période contenant `dateRef`.
  // L'acquis est piloté par la politique DU TYPE (moteur lib/soldes.ts) ; un
  // override manuel (setAllocation) pour ce type + cette période prime.
  getSolde(
    collaborateurId: string,
    typeId: CongeType,
    dateRef: string = todayISO(),
  ): SoldePeriode {
    const politique = this.getPolitique(typeId)
    const collaborateur = this.getCollaborateurs().find((c) => c.id === collaborateurId)

    // Collaborateur introuvable : renvoyer un solde vide cohérent.
    if (!collaborateur) {
      const periode = periodePour(dateRef, politique)
      return {
        periode,
        acquis: 0,
        pris: 0,
        restant: 0,
        report: 0,
        reportBrut: 0,
        reportRestant: 0,
        acquisPeriode: 0,
        acquisRestant: 0,
      }
    }

    // Congés VALIDÉS de CE TYPE (le moteur filtre par période).
    const congesValides = this.listConges({
      collaborateurId,
      statut: 'validee',
    }).filter((c) => c.type === typeId)

    // Source du quota : contrat.quotasParType[type] s'il est défini, sinon le
    // quota par défaut de la politique (géré côté moteur). Migration douce gérée
    // par quotasParTypeDe (ancien congesSolde → conge_paye).
    const quotaOverride = quotasParTypeDe(collaborateur.contrat)[typeId]

    const auto = calculerSolde(
      collaborateur,
      collaborateur.contrat,
      congesValides,
      politique,
      dateRef,
      1,
      quotaOverride,
    )

    // Override manuel de l'acquis pour ce type + cette période (prime).
    const override = this.getSoldes().find(
      (s) =>
        s.collaborateurId === collaborateurId &&
        this.typeIdOverride(s) === typeId &&
        s.periodeLabel === auto.periode.label,
    )
    if (override) {
      const acquis = override.acquis
      const restant = Math.round((acquis - auto.pris) * 100) / 100
      // L'override remplace l'acquis TOTAL (aucun report distinct : l'allocation
      // manuelle est réputée être l'acquis complet de la période).
      return {
        ...auto,
        acquis,
        restant,
        report: 0,
        reportBrut: 0,
        reportRestant: 0,
        acquisPeriode: acquis,
        acquisRestant: restant,
        dateExpirationReport: undefined,
      }
    }
    return auto
  }

  // Soldes de TOUS les types à solde (une entrée par type à solde configuré).
  getSoldesTousTypes(
    collaborateurId: string,
    dateRef: string = todayISO(),
  ): SoldeParType[] {
    return this.getTypesAbsence()
      .filter((t) => typeASolde(t))
      .map((t) => ({
        typeId: t.code,
        label: t.label,
        solde: this.getSolde(collaborateurId, t.code, dateRef),
      }))
  }

  // Override manuel de l'acquis pour un TYPE + une période `periodeLabel`.
  setAllocation(
    collaborateurId: string,
    typeId: CongeType,
    periodeLabel: string,
    acquis: number,
  ): void {
    const list = this.getSoldes()
    const idx = list.findIndex(
      (s) =>
        s.collaborateurId === collaborateurId &&
        this.typeIdOverride(s) === typeId &&
        s.periodeLabel === periodeLabel,
    )
    const solde: SoldeConge = {
      id: idx >= 0 ? list[idx].id : genId('sld'),
      collaborateurId,
      typeId,
      periodeLabel,
      acquis,
    }
    if (idx >= 0) list[idx] = solde
    else list.push(solde)
    write(KEYS.soldes, list)
  }

  // ---------- Exports comptables (Étape 4) ----------
  // SUPABASE SWAP POINT
  // L'agrégation (`buildRecapExport`) deviendra une vue/RPC côté base ; le
  // verrouillage (`verrouillerPeriode`) un UPDATE transactionnel des saisies
  // + INSERT dans `exports` + `audit_log`, sous policies RLS responsable.

  // Sentinelle "toutes familles" du périmètre (sinon = id d'une famille).
  private static readonly PERIMETRE_TOUTES = 'toutes'

  // Un collaborateur entre-t-il dans le périmètre demandé ?
  private matchPerimetre(c: Collaborateur, perimetre: Perimetre): boolean {
    return (
      perimetre === LocalStorageRepository.PERIMETRE_TOUTES ||
      c.familleId === perimetre
    )
  }

  // Saisies retenues pour l'agrégation d'un collaborateur sur `periode`
  // (mois 'YYYY-MM') : uniquement les statuts figés (`validee`/`verrouillee`),
  // jamais `en_attente`/`refusee`.
  private saisiesRetenues(collaborateurId: string, periode: string): Saisie[] {
    return this.getSaisies().filter(
      (s) =>
        s.collaborateurId === collaborateurId &&
        (s.statut === 'validee' || s.statut === 'verrouillee') &&
        isInMonthKey(s.date, periode),
    )
  }

  buildRecapExport(periode: string, perimetre: Perimetre): RecapExport {
    const modeles = this.getModeles()
    const familles = this.getFamilles()
    // Seuil h. sup de repli (règles générales) quand un contrat n'en définit pas.
    const seuilDefaut = this.getRegles().seuilHsupDefautHebdo
    const collaborateurs = this.getCollaborateurs().filter((c) =>
      this.matchPerimetre(c, perimetre),
    )

    // Colonnes dynamiques : une par type d'absence configuré, dans l'ordre des
    // types (CP, RTT, Ancienneté, Maladie, Sans solde…).
    const types = this.getTypesAbsence()
    const colonnesTypes: RecapColonneType[] = types.map((t) => ({
      code: t.code,
      label: t.label,
    }))
    const round2 = (n: number) => Math.round(n * 100) / 100

    const lignes: RecapLigne[] = []
    for (const c of collaborateurs) {
      // Heures : total du mois puis répartition normales/sup PAR SEMAINE ISO
      // (sans majoration), via lib/hours.ts pour ne pas réinventer le cumul.
      const saisiesMois = this.saisiesRetenues(c.id, periode)
      const { supMin, normalMin } = repartitionMoisMinutes(
        saisiesMois,
        c.contrat.seuilHebdo || seuilDefaut,
      )
      const heuresNormales = minutesToDecimalHours(normalMin)
      const heuresSup = minutesToDecimalHours(supMin)

      // Congés VALIDÉS dont la date de début tombe dans le mois (même convention
      // de rattachement que le moteur de soldes), sommés PAR TYPE d'absence.
      const congesValides = this.listConges({
        collaborateurId: c.id,
        statut: 'validee',
      }).filter((cg) => isInMonthKey(cg.dateDebut, periode))
      const joursParType: Partial<Record<CongeType, number>> = {}
      for (const col of colonnesTypes) joursParType[col.code] = 0
      for (const cg of congesValides) {
        if (cg.type in joursParType) {
          joursParType[cg.type] = round2((joursParType[cg.type] ?? 0) + cg.nbJours)
        }
      }
      const totalJours = colonnesTypes.reduce(
        (acc, col) => acc + (joursParType[col.code] ?? 0),
        0,
      )

      // On n'inclut que les collaborateurs ayant une activité sur le mois :
      // un mois sans données produit ainsi un aperçu vide (état vide clair).
      if (heuresNormales === 0 && heuresSup === 0 && totalJours === 0) {
        continue
      }

      const famille = familles.find((f) => f.id === c.familleId)
      const modele = modeles.find((m) => m.id === c.contrat.modeleId)
      lignes.push({
        collaborateurId: c.id,
        collaborateur: `${c.prenom} ${c.nom}`,
        famille: famille?.nom ?? '—',
        contrat: modele?.nom ?? c.contrat.modeleId,
        heuresNormales,
        heuresSup,
        joursParType,
      })
    }

    // Tri stable par nom de collaborateur pour un rendu déterministe.
    lignes.sort((a, b) => a.collaborateur.localeCompare(b.collaborateur, 'fr'))

    // Totaux équipe (arrondis à 2 décimales pour éviter les dérives flottantes),
    // colonne par colonne de type d'absence.
    const totauxJours: Partial<Record<CongeType, number>> = {}
    for (const col of colonnesTypes) totauxJours[col.code] = 0
    let heuresNormalesTot = 0
    let heuresSupTot = 0
    for (const l of lignes) {
      heuresNormalesTot = round2(heuresNormalesTot + l.heuresNormales)
      heuresSupTot = round2(heuresSupTot + l.heuresSup)
      for (const col of colonnesTypes) {
        totauxJours[col.code] = round2(
          (totauxJours[col.code] ?? 0) + (l.joursParType[col.code] ?? 0),
        )
      }
    }
    const totaux: RecapTotaux = {
      heuresNormales: heuresNormalesTot,
      heuresSup: heuresSupTot,
      joursParType: totauxJours,
    }

    return { periode, perimetre, colonnesTypes, lignes, totaux }
  }

  verrouillerPeriode(
    periode: string,
    perimetre: Perimetre,
    parUserId: string,
    format: ExportFormat,
  ): Export {
    // Ne verrouille QUE les saisies `validee` incluses dans le périmètre/mois.
    // Les saisies déjà `verrouillee` sont ignorées (jamais re-verrouillées).
    const collaborateursIds = new Set(
      this.getCollaborateurs()
        .filter((c) => this.matchPerimetre(c, perimetre))
        .map((c) => c.id),
    )
    const aVerrouiller = this.getSaisies().filter(
      (s) =>
        s.statut === 'validee' &&
        collaborateursIds.has(s.collaborateurId) &&
        isInMonthKey(s.date, periode),
    )

    // Cas limite : rien à verrouiller (aucune saisie validée sur la période).
    if (aVerrouiller.length === 0) {
      throw new Error(
        'Aucune saisie validée à verrouiller sur cette période / ce périmètre.',
      )
    }

    // 1) Crée l'entité Export (trace du verrouillage).
    const exportEntity: Export = {
      id: genId('exp'),
      periode,
      perimetre,
      format,
      genereLe: new Date().toISOString(),
      genereParUserId: parUserId,
      nbSaisiesVerrouillees: aVerrouiller.length,
    }

    // 2) Passe les saisies concernées en `verrouillee` avec leur `exportId`.
    const idsAVerrouiller = new Set(aVerrouiller.map((s) => s.id))
    const saisies = this.getSaisies().map<Saisie>((s) =>
      idsAVerrouiller.has(s.id)
        ? { ...s, statut: 'verrouillee', exportId: exportEntity.id }
        : s,
    )
    write(KEYS.saisies, saisies)

    // 3) Persiste l'export et journalise l'audit (cible générique 'export').
    const exports = read<Export[]>(KEYS.exports, [])
    exports.push(exportEntity)
    write(KEYS.exports, exports)
    this.appendAudit(
      'export',
      exportEntity.id,
      'export',
      parUserId,
      `${periode} · ${aVerrouiller.length} saisie(s) verrouillée(s) · ${format.toUpperCase()}`,
    )

    return exportEntity
  }

  listExports(): Export[] {
    // Tri antéchronologique (export le plus récent d'abord).
    return read<Export[]>(KEYS.exports, [])
      .slice()
      .sort((a, b) => (a.genereLe < b.genereLe ? 1 : -1))
  }

  // ---------- Journal d'audit ----------

  listAudit(cibleId?: string): AuditLog[] {
    const list = read<AuditLog[]>(KEYS.audit, [])
    const filtered = cibleId
      ? list.filter(
          (a) =>
            a.cibleId === cibleId ||
            a.saisieId === cibleId ||
            a.congeId === cibleId,
        )
      : list
    // Tri antéchronologique (plus récent d'abord).
    return filtered
      .slice()
      .sort((a, b) => (a.horodatage < b.horodatage ? 1 : -1))
  }
}
