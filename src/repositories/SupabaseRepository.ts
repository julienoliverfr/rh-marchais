import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type {
  AuditAction,
  AuditLog,
  CibleType,
  Collaborateur,
  Compte,
  Conge,
  CongeFiltre,
  Contrat,
  DecompteJours,
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
  Session,
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
import { REGLES_DEFAUT, typesAbsenceSeed } from './seed'
import { newId } from '../lib/id'
import type { Repository } from './Repository'

// ---------------------------------------------------------------------------
// SupabaseRepository — implémentation « cerveau partagé » (base distante).
//
// PATRON : cache mémoire + write-through (IMPÉRATIF, pour ne PAS rendre
// l'interface Repository asynchrone).
//  1. `init(session)` (au login) CHARGE en mémoire toutes les lignes autorisées
//     (filtrées par les policies RLS côté base) → caches locaux.
//  2. Les LECTURES (`getX(): X[]`) servent depuis le cache : SYNCHRONES, aucune
//     signature ne change, l'UI reste identique.
//  3. Les ÉCRITURES (`saveX(): void`) mettent à jour le cache IMMÉDIATEMENT
//     (UI instantanée) PUIS poussent vers Supabase en arrière-plan (upsert /
//     delete). Toute erreur distante est remontée via `onError` + console.
//
// SÉCURITÉ : aucune décision d'autorisation n'est prise ici. Le client ne voit
// QUE ce que les policies RLS l'autorisent à lire/écrire (voir supabase/rls.sql).
// ---------------------------------------------------------------------------

// ----------------------------- Formes DB (snake_case) -----------------------

interface FamilleRow {
  id: string
  nom: string
  mode_saisie: Famille['modeSaisie']
  pause_deduite_min: number
}

interface ModeleRow {
  id: string
  nom: string
  type_contrat: ModeleContrat['typeContrat'] | null
  unite: ModeleContrat['unite']
  base: number
  seuil_hebdo: number
  decompte_jours: DecompteJours | null
  // Quotas de congés par type à solde (jours/type) donnés par ce modèle.
  quotas_par_type: Partial<Record<CongeType, number>> | null
}

interface CollaborateurRow {
  id: string
  prenom: string
  nom: string
  famille_id: string
}

interface ContratRow {
  collaborateur_id: string
  modele_id: string
  unite: Contrat['unite']
  base: number
  seuil_hebdo: number
  decompte_jours: DecompteJours | null
  // Quotas de congés par type à solde (jours/type) propres au contrat.
  quotas_par_type: Partial<Record<CongeType, number>> | null
  date_debut: string | null
}

interface DelegationRow {
  delegant_collaborateur_id: string
  cible_collaborateur_id: string
}

interface SaisieRow {
  id: string
  collaborateur_id: string
  date: string
  heure_debut: string | null
  heure_fin: string | null
  pause_min: number | null
  periode: Saisie['periode'] | null
  matin_debut: string | null
  matin_fin: string | null
  aprem_debut: string | null
  aprem_fin: string | null
  total_minutes: number
  statut: Saisie['statut']
  saisi_par: string
  created_at: string
  validee_par: string | null
  validee_le: string | null
  refus_motif: string | null
  debloquee_par: string | null
  export_id: string | null
}

interface CongeRow {
  id: string
  collaborateur_id: string
  type: CongeType
  date_debut: string
  date_fin: string
  demi_jour: Conge['demiJour']
  nb_jours: number
  statut: StatutConge
  demande_par_user_id: string
  validee_par_user_id: string | null
  refus_motif: string | null
  motif: string | null
  created_at: string
}

interface SoldeRow {
  id: string
  collaborateur_id: string
  type_id: CongeType
  periode_label: string
  acquis: number
}

interface TypeAbsenceRow {
  code: CongeType
  label: string
  a_solde: boolean
  justificatif_requis: boolean
}

interface PolitiqueRow {
  type_id: CongeType
  debut_jour: number
  debut_mois: number
  mode_acquisition: PolitiqueConges['modeAcquisition']
  quota_annuel: number
  taux_mensuel: number
  prorata_entree: boolean
  report: PolitiqueConges['report']
  plafond_report: number
  report_expiration_mois: number
  paliers_anciennete: PolitiqueConges['paliersAnciennete']
}

interface ReglesRow {
  id: number
  saisie_retro_jours: number
  seuil_hsup_defaut_hebdo: number
  verrouillage_apres_export: boolean
}

interface AuditRow {
  id: string
  cible_type: CibleType
  cible_id: string
  action: AuditAction
  par_user_id: string
  horodatage: string
  detail: string | null
  saisie_id: string | null
  conge_id: string | null
}

interface ExportRow {
  id: string
  periode: string
  perimetre: string
  format: ExportFormat
  genere_le: string
  genere_par_user_id: string
  nb_saisies_verrouillees: number
}

interface ProfileRow {
  id: string
  identifiant: string
  role: Compte['role']
  collaborateur_id: string | null
  nom_affichage: string
}

// -------------------------------- Utilitaires -------------------------------

function uuid(): string {
  return newId()
}

// -------------------------------- Mappers ----------------------------------
// DB (snake_case) -> Domaine (camelCase). Les numériques sont coercés (PostgREST
// peut renvoyer certains `numeric` sous forme de chaîne) pour rester robuste.

function familleFromRow(r: FamilleRow): Famille {
  return {
    id: r.id,
    nom: r.nom,
    modeSaisie: r.mode_saisie,
    pauseDeduiteMin: Number(r.pause_deduite_min),
  }
}
function familleToRow(f: Famille): FamilleRow {
  return {
    id: f.id,
    nom: f.nom,
    mode_saisie: f.modeSaisie,
    pause_deduite_min: f.pauseDeduiteMin,
  }
}

function modeleFromRow(r: ModeleRow): ModeleContrat {
  return {
    id: r.id,
    nom: r.nom,
    typeContrat: r.type_contrat ?? undefined,
    unite: r.unite,
    base: Number(r.base),
    seuilHebdo: Number(r.seuil_hebdo),
    decompteJours: r.decompte_jours ?? 'ouvres',
    // MIGRATION douce : accepte un ancien enregistrement sans quotas (→ défauts).
    quotasParType: r.quotas_par_type ?? {},
  }
}
function modeleToRow(m: ModeleContrat): ModeleRow {
  return {
    id: m.id,
    nom: m.nom,
    type_contrat: m.typeContrat ?? null,
    unite: m.unite,
    base: m.base,
    seuil_hebdo: m.seuilHebdo,
    decompte_jours: m.decompteJours ?? 'ouvres',
    quotas_par_type: quotasParTypeDe(m),
  }
}

function contratFromRow(r: ContratRow): Contrat {
  return {
    modeleId: r.modele_id,
    unite: r.unite,
    base: Number(r.base),
    seuilHebdo: Number(r.seuil_hebdo),
    decompteJours: r.decompte_jours ?? 'ouvres',
    // MIGRATION douce : accepte un ancien enregistrement sans quotas (→ défauts).
    quotasParType: r.quotas_par_type ?? {},
    dateDebut: r.date_debut ?? undefined,
  }
}
function contratToRow(collaborateurId: string, c: Contrat): ContratRow {
  return {
    collaborateur_id: collaborateurId,
    modele_id: c.modeleId,
    unite: c.unite,
    base: c.base,
    seuil_hebdo: c.seuilHebdo,
    decompte_jours: c.decompteJours ?? 'ouvres',
    quotas_par_type: quotasParTypeDe(c),
    date_debut: c.dateDebut ?? null,
  }
}

function saisieFromRow(r: SaisieRow): Saisie {
  return {
    id: r.id,
    collaborateurId: r.collaborateur_id,
    date: r.date,
    heureDebut: r.heure_debut ?? undefined,
    heureFin: r.heure_fin ?? undefined,
    pauseMin: r.pause_min ?? undefined,
    periode: r.periode ?? undefined,
    matinDebut: r.matin_debut ?? undefined,
    matinFin: r.matin_fin ?? undefined,
    apremDebut: r.aprem_debut ?? undefined,
    apremFin: r.aprem_fin ?? undefined,
    totalMinutes: Number(r.total_minutes),
    statut: r.statut,
    saisiPar: r.saisi_par,
    createdAt: r.created_at,
    validee_par: r.validee_par ?? undefined,
    validee_le: r.validee_le ?? undefined,
    refus_motif: r.refus_motif ?? undefined,
    debloquee_par: r.debloquee_par ?? undefined,
    exportId: r.export_id ?? undefined,
  }
}
function saisieToRow(s: Saisie): SaisieRow {
  return {
    id: s.id,
    collaborateur_id: s.collaborateurId,
    date: s.date,
    heure_debut: s.heureDebut ?? null,
    heure_fin: s.heureFin ?? null,
    pause_min: s.pauseMin ?? null,
    periode: s.periode ?? null,
    matin_debut: s.matinDebut ?? null,
    matin_fin: s.matinFin ?? null,
    aprem_debut: s.apremDebut ?? null,
    aprem_fin: s.apremFin ?? null,
    total_minutes: s.totalMinutes,
    statut: s.statut,
    saisi_par: s.saisiPar,
    created_at: s.createdAt,
    validee_par: s.validee_par ?? null,
    validee_le: s.validee_le ?? null,
    refus_motif: s.refus_motif ?? null,
    debloquee_par: s.debloquee_par ?? null,
    export_id: s.exportId ?? null,
  }
}

function congeFromRow(r: CongeRow): Conge {
  return {
    id: r.id,
    collaborateurId: r.collaborateur_id,
    type: r.type,
    dateDebut: r.date_debut,
    dateFin: r.date_fin,
    demiJour: r.demi_jour,
    nbJours: Number(r.nb_jours),
    statut: r.statut,
    demandeParUserId: r.demande_par_user_id,
    valideeParUserId: r.validee_par_user_id ?? undefined,
    refusMotif: r.refus_motif ?? undefined,
    motif: r.motif ?? undefined,
    createdAt: r.created_at,
  }
}
function congeToRow(c: Conge): CongeRow {
  return {
    id: c.id,
    collaborateur_id: c.collaborateurId,
    type: c.type,
    date_debut: c.dateDebut,
    date_fin: c.dateFin,
    demi_jour: c.demiJour,
    nb_jours: c.nbJours,
    statut: c.statut,
    demande_par_user_id: c.demandeParUserId,
    validee_par_user_id: c.valideeParUserId ?? null,
    refus_motif: c.refusMotif ?? null,
    motif: c.motif ?? null,
    created_at: c.createdAt,
  }
}

function soldeFromRow(r: SoldeRow): SoldeConge {
  return {
    id: r.id,
    collaborateurId: r.collaborateur_id,
    typeId: r.type_id,
    periodeLabel: r.periode_label,
    acquis: Number(r.acquis),
  }
}
function soldeToRow(s: SoldeConge): SoldeRow {
  return {
    id: s.id,
    collaborateur_id: s.collaborateurId,
    type_id: s.typeId,
    periode_label: s.periodeLabel,
    acquis: s.acquis,
  }
}

function typeAbsenceFromRow(r: TypeAbsenceRow): TypeAbsence {
  return {
    code: r.code,
    label: r.label,
    aSolde: r.a_solde,
    justificatifRequis: r.justificatif_requis,
  }
}
function typeAbsenceToRow(t: TypeAbsence): TypeAbsenceRow {
  return {
    code: t.code,
    label: t.label,
    a_solde: typeASolde(t),
    justificatif_requis: t.justificatifRequis,
  }
}

function politiqueFromRow(r: PolitiqueRow): PolitiqueConges {
  return normalizePolitique({
    debutJour: Number(r.debut_jour),
    debutMois: Number(r.debut_mois),
    modeAcquisition: r.mode_acquisition,
    quotaAnnuel: Number(r.quota_annuel),
    tauxMensuel: Number(r.taux_mensuel),
    prorataEntree: r.prorata_entree,
    report: r.report,
    plafondReport: Number(r.plafond_report),
    reportExpirationMois: Number(r.report_expiration_mois),
    paliersAnciennete: Array.isArray(r.paliers_anciennete) ? r.paliers_anciennete : [],
  })
}
function politiqueToRow(typeId: CongeType, p: PolitiqueConges): PolitiqueRow {
  const n = normalizePolitique(p)
  return {
    type_id: typeId,
    debut_jour: n.debutJour,
    debut_mois: n.debutMois,
    mode_acquisition: n.modeAcquisition,
    quota_annuel: n.quotaAnnuel,
    taux_mensuel: n.tauxMensuel,
    prorata_entree: n.prorataEntree,
    report: n.report,
    plafond_report: n.plafondReport,
    report_expiration_mois: n.reportExpirationMois,
    paliers_anciennete: n.paliersAnciennete,
  }
}

function reglesFromRow(r: ReglesRow): ReglesGenerales {
  return {
    saisieRetroJours: Number(r.saisie_retro_jours),
    seuilHsupDefautHebdo: Number(r.seuil_hsup_defaut_hebdo),
    verrouillageApresExport: r.verrouillage_apres_export,
  }
}
function reglesToRow(r: ReglesGenerales): ReglesRow {
  return {
    id: 1, // singleton
    saisie_retro_jours: r.saisieRetroJours,
    seuil_hsup_defaut_hebdo: r.seuilHsupDefautHebdo,
    verrouillage_apres_export: r.verrouillageApresExport,
  }
}

function auditFromRow(r: AuditRow): AuditLog {
  return {
    id: r.id,
    cibleType: r.cible_type,
    cibleId: r.cible_id,
    action: r.action,
    parUserId: r.par_user_id,
    horodatage: r.horodatage,
    detail: r.detail ?? undefined,
    saisieId: r.saisie_id ?? undefined,
    congeId: r.conge_id ?? undefined,
  }
}

function exportFromRow(r: ExportRow): Export {
  return {
    id: r.id,
    periode: r.periode,
    perimetre: r.perimetre,
    format: r.format,
    genereLe: r.genere_le,
    genereParUserId: r.genere_par_user_id,
    nbSaisiesVerrouillees: Number(r.nb_saisies_verrouillees),
  }
}

function profileToCompte(r: ProfileRow): Compte {
  return {
    id: r.id,
    identifiant: r.identifiant,
    // SÉCURITÉ : aucun mot de passe côté appli. L'auth est gérée par Supabase.
    motDePasse: '',
    role: r.role,
    collaborateurId: r.collaborateur_id ?? undefined,
    nomAffichage: r.nom_affichage,
  }
}

// ---------------------------------------------------------------------------

export class SupabaseRepository implements Repository {
  private readonly sb: SupabaseClient

  // Caches mémoire (peuplés par init(), servis par les lectures synchrones).
  private familles: Famille[] = []
  private modeles: ModeleContrat[] = []
  private collaborateurs: Collaborateur[] = []
  private saisies: Saisie[] = []
  // Délégations de saisie : delegant_collaborateur_id -> [cible_collaborateur_id].
  // Reconstruit à chaque init ; sert à peupler `peutSaisirPour` des collaborateurs.
  private delegations: DelegationRow[] = []
  private conges: Conge[] = []
  private soldes: SoldeConge[] = []
  private typesAbsence: TypeAbsence[] = []
  private politiques: PolitiquesConges = {}
  private regles: ReglesGenerales = REGLES_DEFAUT
  private exports: Export[] = []
  private audit: AuditLog[] = []
  private profiles: Compte[] = []

  private session: Session | null = null
  private ready = false

  // Remontée d'erreur des écritures write-through (branchable par l'UI).
  public onError: ((contexte: string, error: unknown) => void) | null = null

  // Notifie l'UI qu'un cache a changé de façon ASYNCHRONE (résultat d'une RPC
  // par exemple) : le store applicatif s'y branche pour se resynchroniser.
  public onChange: (() => void) | null = null

  constructor(client: SupabaseClient) {
    this.sb = client
  }

  isReady(): boolean {
    return this.ready
  }

  // Session applicative associée au cache courant (null tant que non initialisé).
  getSession(): Session | null {
    return this.session
  }

  // ---- Chargement initial (au login) : remplit tous les caches (RLS filtre) --
  async init(session: Session): Promise<void> {
    this.session = session

    const [
      familles,
      modeles,
      collaborateurs,
      contrats,
      delegations,
      saisies,
      conges,
      soldes,
      typesAbsence,
      politiques,
      regles,
      exportsRows,
      audit,
      profiles,
    ] = await Promise.all([
      this.selectAll<FamilleRow>('familles'),
      this.selectAll<ModeleRow>('modeles_contrat'),
      this.selectAll<CollaborateurRow>('collaborateurs'),
      this.selectAll<ContratRow>('contrats'),
      this.selectAll<DelegationRow>('delegations_saisie'),
      this.selectAll<SaisieRow>('saisies'),
      this.selectAll<CongeRow>('conges'),
      this.selectAll<SoldeRow>('soldes'),
      this.selectAll<TypeAbsenceRow>('types_absence'),
      this.selectAll<PolitiqueRow>('politiques_conges'),
      this.selectAll<ReglesRow>('regles_generales'),
      this.selectAll<ExportRow>('exports'),
      this.selectAll<AuditRow>('audit_log'),
      this.selectAll<ProfileRow>('profiles'),
    ])

    this.familles = familles.map(familleFromRow)
    this.modeles = modeles.map(modeleFromRow)

    // Délégations : delegant -> liste de cibles (peuple `peutSaisirPour`).
    this.delegations = delegations
    const ciblesParDelegant = new Map<string, string[]>()
    for (const d of delegations) {
      const arr = ciblesParDelegant.get(d.delegant_collaborateur_id) ?? []
      arr.push(d.cible_collaborateur_id)
      ciblesParDelegant.set(d.delegant_collaborateur_id, arr)
    }

    const contratByCollab = new Map<string, Contrat>()
    for (const c of contrats) contratByCollab.set(c.collaborateur_id, contratFromRow(c))
    this.collaborateurs = collaborateurs.map((r) => ({
      id: r.id,
      prenom: r.prenom,
      nom: r.nom,
      familleId: r.famille_id,
      peutSaisirPour: ciblesParDelegant.get(r.id) ?? [],
      contrat:
        contratByCollab.get(r.id) ??
        // Contrat manquant (donnée incomplète) : repli neutre pour ne pas casser
        // l'UI. Quotas vides → le moteur retombe sur les défauts des politiques.
        {
          modeleId: '',
          unite: 'heures',
          base: 35,
          seuilHebdo: this.regles.seuilHsupDefautHebdo,
          quotasParType: {},
        },
    }))

    this.saisies = saisies.map(saisieFromRow)
    this.conges = conges.map(congeFromRow)
    this.soldes = soldes.map(soldeFromRow)
    this.typesAbsence = typesAbsence.length
      ? typesAbsence.map(typeAbsenceFromRow)
      : typesAbsenceSeed
    this.politiques = {}
    for (const p of politiques) this.politiques[p.type_id] = politiqueFromRow(p)
    this.regles = regles.length ? reglesFromRow(regles[0]) : REGLES_DEFAUT
    this.exports = exportsRows.map(exportFromRow)
    this.audit = audit.map(auditFromRow)
    this.profiles = profiles.map(profileToCompte)

    this.ready = true
  }

  // Sélectionne toutes les lignes autorisées d'une table (RLS filtre côté base).
  private async selectAll<Row>(table: string): Promise<Row[]> {
    const { data, error } = await this.sb.from(table).select('*')
    if (error) throw new Error(`Chargement ${table} : ${error.message}`)
    return (data as Row[] | null) ?? []
  }

  // Write-through : pousse une opération en arrière-plan, remonte les erreurs.
  private track(
    op: PromiseLike<{ error: PostgrestError | null }>,
    contexte: string,
  ): void {
    op.then(({ error }) => {
      if (error) this.report(contexte, error)
    })
    // Les rejets réseau imprévus sont aussi capturés.
    Promise.resolve(op).catch((e: unknown) => this.report(contexte, e))
  }

  private report(contexte: string, error: unknown): void {
    // Journalisation maîtrisée + callback optionnel pour l'UI.
    console.error(`[Supabase] Échec ${contexte} :`, error)
    if (this.onError) this.onError(contexte, error)
  }

  // Signale à l'UI un changement de cache survenu en arrière-plan (RPC résolue).
  private notifyChange(): void {
    if (this.onChange) this.onChange()
  }

  private upsert(
    table: string,
    row: object,
    contexte: string,
    onConflict?: string,
  ): void {
    this.track(
      this.sb.from(table).upsert(row as never, onConflict ? { onConflict } : undefined),
      contexte,
    )
  }

  private removeRow(table: string, column: string, value: string, contexte: string): void {
    this.track(this.sb.from(table).delete().eq(column, value), contexte)
  }

  // ------------------------------- Familles ---------------------------------
  getFamilles(): Famille[] {
    return [...this.familles]
  }

  saveFamille(famille: Famille): void {
    const idx = this.familles.findIndex((f) => f.id === famille.id)
    if (idx >= 0) this.familles[idx] = famille
    else this.familles.push(famille)
    this.upsert('familles', familleToRow(famille), 'enregistrement famille')
  }

  deleteFamille(id: string): void {
    this.familles = this.familles.filter((f) => f.id !== id)
    this.removeRow('familles', 'id', id, 'suppression famille')
  }

  // --------------------------- Modèles de contrat ---------------------------
  getModeles(): ModeleContrat[] {
    return [...this.modeles]
  }

  saveModele(modele: ModeleContrat): void {
    const idx = this.modeles.findIndex((m) => m.id === modele.id)
    if (idx >= 0) this.modeles[idx] = modele
    else this.modeles.push(modele)
    this.upsert('modeles_contrat', modeleToRow(modele), 'enregistrement modèle')
  }

  deleteModele(id: string): void {
    this.modeles = this.modeles.filter((m) => m.id !== id)
    this.removeRow('modeles_contrat', 'id', id, 'suppression modèle')
  }

  // ----------------------------- Collaborateurs -----------------------------
  getCollaborateurs(): Collaborateur[] {
    return [...this.collaborateurs]
  }

  saveCollaborateur(collaborateur: Collaborateur): void {
    const idx = this.collaborateurs.findIndex((c) => c.id === collaborateur.id)
    const normalise: Collaborateur = {
      ...collaborateur,
      peutSaisirPour: collaborateur.peutSaisirPour ?? [],
    }
    if (idx >= 0) this.collaborateurs[idx] = normalise
    else this.collaborateurs.push(normalise)
    // Collaborateur + son contrat (table 1:1) écrits ensemble.
    this.upsert(
      'collaborateurs',
      {
        id: collaborateur.id,
        prenom: collaborateur.prenom,
        nom: collaborateur.nom,
        famille_id: collaborateur.familleId,
      },
      'enregistrement collaborateur',
    )
    this.upsert(
      'contrats',
      contratToRow(collaborateur.id, collaborateur.contrat) as unknown as Record<string, unknown>,
      'enregistrement contrat',
      'collaborateur_id',
    )
    // La liste de délégation n'est synchronisée QUE lorsqu'elle est explicitement
    // fournie (les imports la laissent indéfinie → aucun write inutile).
    if (collaborateur.peutSaisirPour !== undefined) {
      this.syncDelegations(collaborateur.id, collaborateur.peutSaisirPour)
    }
  }

  // Remplace la liste de délégation d'un délégant (cache + write-through). La
  // décision d'autorisation est prise côté base (RLS : responsable uniquement).
  setDelegationsSaisie(collaborateurId: string, ciblesIds: string[]): void {
    const idx = this.collaborateurs.findIndex((c) => c.id === collaborateurId)
    if (idx >= 0) {
      this.collaborateurs[idx] = {
        ...this.collaborateurs[idx],
        peutSaisirPour: ciblesIds.filter((id) => id !== collaborateurId),
      }
    }
    this.syncDelegations(collaborateurId, ciblesIds)
  }

  // Réécrit intégralement les lignes `delegations_saisie` d'un délégant : purge
  // puis insertion des cibles (auto-référence exclue). Met à jour le cache.
  private syncDelegations(delegantId: string, ciblesIds: string[]): void {
    const cibles = Array.from(new Set(ciblesIds.filter((id) => id !== delegantId)))
    this.delegations = [
      ...this.delegations.filter((d) => d.delegant_collaborateur_id !== delegantId),
      ...cibles.map((cible) => ({
        delegant_collaborateur_id: delegantId,
        cible_collaborateur_id: cible,
      })),
    ]
    this.track(
      this.sb
        .from('delegations_saisie')
        .delete()
        .eq('delegant_collaborateur_id', delegantId),
      'purge délégations saisie',
    )
    if (cibles.length > 0) {
      this.upsert(
        'delegations_saisie',
        cibles.map((cible) => ({
          delegant_collaborateur_id: delegantId,
          cible_collaborateur_id: cible,
        })),
        'enregistrement délégations saisie',
        'delegant_collaborateur_id,cible_collaborateur_id',
      )
    }
  }

  // -------------------- Import de collaborateurs (assistant) -----------------
  // Matérialise des lignes DÉJÀ validées. Écrit collaborateurs + contrats +
  // overrides de solde en write-through. La création des COMPTES d'accès passe
  // par Supabase Auth (invitation / mot de passe jamais stocké) : hors périmètre
  // du client, à réaliser via une fonction Edge/RPC admin.
  importerCollaborateurs(rows: ImportCollaborateurRow[]): ImportResult {
    if (rows.length === 0) return { importes: 0, ignores: 0 }

    const seuilDefaut = this.regles.seuilHsupDefautHebdo
    const periodeLabelParType = new Map<CongeType, string>()
    const labelPeriodeType = (typeId: CongeType): string => {
      let l = periodeLabelParType.get(typeId)
      if (l === undefined) {
        l = periodePour(todayISO(), this.getPolitique(typeId)).label
        periodeLabelParType.set(typeId, l)
      }
      return l
    }

    for (const row of rows) {
      const modele = this.modeles.find((m) => m.id === row.modeleId)
      const collabId = uuid()
      const collaborateur: Collaborateur = {
        id: collabId,
        prenom: row.prenom,
        nom: row.nom,
        familleId: row.familleId,
        contrat: {
          modeleId: row.modeleId,
          unite: modele?.unite ?? 'heures',
          base: modele?.base ?? 35,
          seuilHebdo: modele?.seuilHebdo ?? seuilDefaut,
          // Quotas de congés PAR TYPE hérités du modèle (repli défaut politique).
          quotasParType: modele ? quotasParTypeDe(modele) : {},
          dateDebut: row.dateDebut,
        },
      }
      this.saveCollaborateur(collaborateur)

      // TODO runtime : créer le compte d'accès (Supabase Auth) + profil lié.
      // Le mot de passe (row.motDePasse) ne doit JAMAIS être persisté en clair ;
      // il sert uniquement à l'invitation côté serveur (fonction admin).

      const soldesRow: Partial<Record<CongeType, number>> = { ...(row.soldesInitiaux ?? {}) }
      if (row.soldeInitial != null && soldesRow.conge_paye == null) {
        soldesRow.conge_paye = row.soldeInitial
      }
      for (const [code, valeur] of Object.entries(soldesRow) as [
        CongeType,
        number | undefined,
      ][]) {
        if (valeur == null) continue
        this.setAllocation(collabId, code, labelPeriodeType(code), valeur)
      }
    }

    return { importes: rows.length, ignores: 0 }
  }

  // -------------------------------- Comptes ---------------------------------
  // En mode Supabase, la source de vérité des comptes est la table `profiles`
  // (liée à auth.users). Aucun mot de passe n'est exposé.
  getComptes(): Compte[] {
    return [...this.profiles]
  }

  saveCompte(compte: Compte): void {
    const idx = this.profiles.findIndex((c) => c.id === compte.id)
    if (idx >= 0) {
      // ÉDITION d'un compte EXISTANT : on met seulement à jour le PROFIL
      // (rôle / nom / rattachement). Le mot de passe et l'utilisateur Auth ne
      // sont pas touchés ici (opération séparée non gérée pour l'instant).
      this.profiles[idx] = { ...compte, motDePasse: '' }
      this.upsert(
        'profiles',
        {
          id: compte.id,
          identifiant: compte.identifiant,
          role: compte.role,
          collaborateur_id: compte.collaborateurId ?? null,
          nom_affichage: compte.nomAffichage,
        },
        'enregistrement profil',
      )
      return
    }
    // CRÉATION : la création d'un utilisateur Auth est une opération PRIVILÉGIÉE
    // déléguée à la fonction SQL SECURITY DEFINER `admin_create_login` (garde
    // « responsable uniquement » côté base). On n'ajoute au cache QU'APRÈS
    // succès : en cas d'échec, aucun « compte fantôme » ne subsiste et l'erreur
    // est remontée à l'UI (onError) pour un message clair.
    this.createLogin(compte)
  }

  // Appel RPC de création de compte. Succès -> ajoute le compte réel (avec l'UID
  // renvoyé) au cache + notifie l'UI. Échec -> aucune écriture de cache, erreur
  // remontée via le mécanisme habituel.
  private createLogin(compte: Compte): void {
    const login = compte.identifiant.trim().toLowerCase()
    const email = login.includes('@') ? login : `${login}@demo.local`
    // Promise.resolve : le builder Supabase est un PromiseLike (pas de `.catch`).
    void Promise.resolve(
      this.sb.rpc('admin_create_login', {
        p_identifiant: compte.identifiant,
        p_mot_de_passe: compte.motDePasse,
        p_role: compte.role,
        p_collaborateur_id: compte.collaborateurId ?? null,
        p_nom_affichage: compte.nomAffichage,
      }),
    )
      .then(({ data, error }) => {
        if (error) {
          this.report('création du compte', error)
          return
        }
        const uid = (data as string | null) ?? compte.id
        const cree: Compte = {
          ...compte,
          id: uid,
          identifiant: email,
          motDePasse: '',
        }
        // Écarte un éventuel doublon puis ajoute le compte réellement créé.
        this.profiles = this.profiles.filter((c) => c.id !== uid)
        this.profiles.push(cree)
        this.notifyChange()
      })
      .catch((e: unknown) => this.report('création du compte', e))
  }

  deleteCompte(id: string): void {
    // La suppression de l'utilisateur Auth exige elle aussi un privilège : elle
    // passe par la fonction SECURITY DEFINER `admin_delete_login` (responsable
    // uniquement, auto-suppression interdite côté base). Retrait optimiste du
    // cache ; restauration + remontée d'erreur si la RPC échoue.
    const snapshot = this.profiles
    this.profiles = this.profiles.filter((c) => c.id !== id)
    // Promise.resolve : le builder Supabase est un PromiseLike (pas de `.catch`).
    void Promise.resolve(this.sb.rpc('admin_delete_login', { p_user_id: id }))
      .then(({ error }) => {
        if (error) {
          this.profiles = snapshot
          this.report('suppression du compte', error)
          this.notifyChange()
        }
      })
      .catch((e: unknown) => {
        this.profiles = snapshot
        this.report('suppression du compte', e)
        this.notifyChange()
      })
  }

  // Réinitialise le mot de passe d'un compte EXISTANT via la fonction SECURITY
  // DEFINER `admin_reset_password` (garde « responsable uniquement » côté base).
  // Le mot de passe n'est jamais mis en cache (les profils ne l'exposent pas) :
  // aucune écriture de cache, seule une erreur éventuelle est remontée à l'UI.
  resetPassword(userId: string, nouveauMotDePasse: string): void {
    // Promise.resolve : le builder Supabase est un PromiseLike (pas de `.catch`).
    void Promise.resolve(
      this.sb.rpc('admin_reset_password', {
        p_user_id: userId,
        p_nouveau_mot_de_passe: nouveauMotDePasse,
      }),
    )
      .then(({ error }) => {
        if (error) this.report('réinitialisation du mot de passe', error)
      })
      .catch((e: unknown) => this.report('réinitialisation du mot de passe', e))
  }

  // --------------------------- Règles générales -----------------------------
  getRegles(): ReglesGenerales {
    return this.regles
  }

  setRegles(regles: ReglesGenerales): void {
    this.regles = regles
    this.upsert('regles_generales', reglesToRow(regles) as unknown as Record<string, unknown>, 'enregistrement règles', 'id')
  }

  // --------------------------- Types d'absence ------------------------------
  getTypesAbsence(): TypeAbsence[] {
    return [...this.typesAbsence]
  }

  saveTypeAbsence(type: TypeAbsence): void {
    const idx = this.typesAbsence.findIndex((t) => t.code === type.code)
    if (idx >= 0) this.typesAbsence[idx] = type
    else this.typesAbsence.push(type)
    this.upsert('types_absence', typeAbsenceToRow(type) as unknown as Record<string, unknown>, 'enregistrement type absence', 'code')
  }

  deleteTypeAbsence(code: TypeAbsence['code']): void {
    this.typesAbsence = this.typesAbsence.filter((t) => t.code !== code)
    this.removeRow('types_absence', 'code', code, 'suppression type absence')
  }

  // -------------------------------- Saisies ---------------------------------
  getSaisies(): Saisie[] {
    return [...this.saisies]
  }

  saveSaisie(saisie: Saisie): void {
    const idx = this.saisies.findIndex((s) => s.id === saisie.id)
    if (idx >= 0) this.saisies[idx] = saisie
    else this.saisies.push(saisie)
    this.upsert('saisies', saisieToRow(saisie) as unknown as Record<string, unknown>, 'enregistrement saisie')
  }

  deleteSaisie(id: string): void {
    this.saisies = this.saisies.filter((s) => s.id !== id)
    this.removeRow('saisies', 'id', id, 'suppression saisie')
  }

  getSaisiesByStatut(statut: Saisie['statut']): Saisie[] {
    return this.saisies.filter((s) => s.statut === statut)
  }

  // --------------------- Workflow de validation (Étape 2) -------------------
  private appendAudit(
    cibleType: CibleType,
    cibleId: string,
    action: AuditAction,
    parUserId: string,
    detail?: string,
  ): void {
    const entry: AuditLog = {
      id: uuid(),
      cibleType,
      cibleId,
      action,
      parUserId,
      horodatage: new Date().toISOString(),
      detail,
      saisieId: cibleType === 'saisie' ? cibleId : undefined,
      congeId: cibleType === 'conge' ? cibleId : undefined,
    }
    this.audit.push(entry)
    this.upsert(
      'audit_log',
      {
        id: entry.id,
        cible_type: entry.cibleType,
        cible_id: entry.cibleId,
        action: entry.action,
        par_user_id: entry.parUserId,
        horodatage: entry.horodatage,
        detail: entry.detail ?? null,
        saisie_id: entry.saisieId ?? null,
        conge_id: entry.congeId ?? null,
      },
      'écriture audit',
    )
  }

  private requireSaisie(id: string): Saisie {
    const s = this.saisies.find((x) => x.id === id)
    if (!s) throw new Error('Saisie introuvable.')
    return s
  }

  validerSaisie(id: string, parUserId: string): void {
    const saisie = this.requireSaisie(id)
    if (saisie.statut === 'validee') throw new Error('Cette saisie est déjà validée.')
    this.saveSaisie({
      ...saisie,
      statut: 'validee',
      validee_par: parUserId,
      validee_le: new Date().toISOString(),
      refus_motif: undefined,
    })
    this.appendAudit('saisie', id, 'validee', parUserId)
  }

  refuserSaisie(id: string, parUserId: string, motif: string): void {
    const motifClean = motif.trim()
    if (!motifClean) throw new Error('Un motif de refus est obligatoire.')
    const saisie = this.requireSaisie(id)
    this.saveSaisie({
      ...saisie,
      statut: 'refusee',
      refus_motif: motifClean,
      validee_par: undefined,
      validee_le: undefined,
    })
    this.appendAudit('saisie', id, 'refusee', parUserId, motifClean)
  }

  debloquerSaisie(id: string, parUserId: string): void {
    const saisie = this.requireSaisie(id)
    if (saisie.statut !== 'validee' && saisie.statut !== 'verrouillee') {
      throw new Error('Seule une saisie validée ou verrouillée peut être débloquée.')
    }
    const etait = saisie.statut
    this.saveSaisie({
      ...saisie,
      statut: 'en_attente',
      debloquee_par: parUserId,
      validee_par: undefined,
      validee_le: undefined,
      exportId: undefined,
    })
    this.appendAudit(
      'saisie',
      id,
      'debloquee',
      parUserId,
      etait === 'verrouillee' ? 'Déblocage (période verrouillée)' : undefined,
    )
  }

  corrigerSaisie(saisie: Saisie, parUserId: string): void {
    this.saveSaisie({
      ...saisie,
      statut: 'en_attente',
      refus_motif: undefined,
      validee_par: undefined,
      validee_le: undefined,
    })
    this.appendAudit(
      'saisie',
      saisie.id,
      'modifiee',
      parUserId,
      `Correction (${Math.round(saisie.totalMinutes)} min)`,
    )
  }

  // -------------------------------- Congés ----------------------------------
  private requireConge(id: string): Conge {
    const c = this.conges.find((x) => x.id === id)
    if (!c) throw new Error('Demande de congé introuvable.')
    return c
  }

  private saveConge(conge: Conge): void {
    const idx = this.conges.findIndex((c) => c.id === conge.id)
    if (idx >= 0) this.conges[idx] = conge
    else this.conges.push(conge)
    this.upsert('conges', congeToRow(conge) as unknown as Record<string, unknown>, 'enregistrement congé')
  }

  listConges(filtre?: CongeFiltre): Conge[] {
    let list = this.conges.slice()
    if (filtre?.collaborateurId) {
      list = list.filter((c) => c.collaborateurId === filtre.collaborateurId)
    }
    if (filtre?.statut) list = list.filter((c) => c.statut === filtre.statut)
    if (filtre?.annee != null) {
      list = list.filter(
        (c) => new Date(c.dateDebut + 'T12:00:00').getFullYear() === filtre.annee,
      )
    }
    return list.sort((a, b) => (a.dateDebut < b.dateDebut ? 1 : -1))
  }

  getCongesByCollaborateur(collaborateurId: string): Conge[] {
    return this.listConges({ collaborateurId })
  }

  getCongesByStatut(statut: StatutConge): Conge[] {
    return this.listConges({ statut })
  }

  creerDemandeConge(data: DemandeCongeInput): Conge {
    if (data.dateFin < data.dateDebut) {
      throw new Error('La date de fin ne peut pas précéder la date de début.')
    }
    const demiJour = data.dateDebut === data.dateFin ? data.demiJour : 'aucune'
    const mode = this.collaborateurs.find((c) => c.id === data.collaborateurId)
      ?.contrat.decompteJours
    const nbJours = computeNbJours(data.dateDebut, data.dateFin, demiJour, mode)
    if (nbJours <= 0) {
      throw new Error('La période sélectionnée ne contient aucun jour décompté (week-end ou férié uniquement).')
    }
    const conge: Conge = {
      id: uuid(),
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
    if (conge.statut !== 'demandee') throw new Error('Cette demande a déjà été traitée.')
    this.saveConge({
      ...conge,
      statut: 'validee',
      valideeParUserId: parUserId,
      refusMotif: undefined,
    })
    this.appendAudit('conge', id, 'conge_validee', parUserId, `${conge.nbJours} j`)
  }

  refuserConge(id: string, parUserId: string, motif: string): void {
    const motifClean = motif.trim()
    if (!motifClean) throw new Error('Un motif de refus est obligatoire.')
    const conge = this.requireConge(id)
    if (conge.statut !== 'demandee') throw new Error('Cette demande a déjà été traitée.')
    this.saveConge({
      ...conge,
      statut: 'refusee',
      refusMotif: motifClean,
      valideeParUserId: undefined,
    })
    this.appendAudit('conge', id, 'conge_refusee', parUserId, motifClean)
  }

  // ----------------------- Politiques de congés -----------------------------
  getPolitique(typeId: CongeType): PolitiqueConges {
    const p = this.politiques[typeId] ?? POLITIQUES_DEFAUT[typeId] ?? POLITIQUE_DEFAUT
    return normalizePolitique(p)
  }

  getPolitiques(): PolitiquesConges {
    const out: PolitiquesConges = {}
    for (const t of this.typesAbsence) {
      if (typeASolde(t)) out[t.code] = this.getPolitique(t.code)
    }
    return out
  }

  setPolitique(typeId: CongeType, politique: PolitiqueConges): void {
    this.politiques[typeId] = normalizePolitique(politique)
    this.upsert(
      'politiques_conges',
      politiqueToRow(typeId, politique) as unknown as Record<string, unknown>,
      'enregistrement politique',
      'type_id',
    )
  }

  getPolitiqueConges(): PolitiqueConges {
    return this.getPolitique('conge_paye')
  }

  setPolitiqueConges(politique: PolitiqueConges): void {
    this.setPolitique('conge_paye', politique)
  }

  // ------------------------------- Soldes -----------------------------------
  private typeIdOverride(s: SoldeConge): CongeType {
    return s.typeId ?? 'conge_paye'
  }

  getSolde(
    collaborateurId: string,
    typeId: CongeType,
    dateRef: string = todayISO(),
  ): SoldePeriode {
    const politique = this.getPolitique(typeId)
    const collaborateur = this.collaborateurs.find((c) => c.id === collaborateurId)

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

    const congesValides = this.listConges({ collaborateurId, statut: 'validee' }).filter(
      (c) => c.type === typeId,
    )
    // Source du quota : contrat.quotasParType[type] s'il est défini, sinon le
    // quota par défaut de la politique (repli géré côté moteur).
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

    const override = this.soldes.find(
      (s) =>
        s.collaborateurId === collaborateurId &&
        this.typeIdOverride(s) === typeId &&
        s.periodeLabel === auto.periode.label,
    )
    if (override) {
      const acquis = override.acquis
      const restant = Math.round((acquis - auto.pris) * 100) / 100
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

  getSoldesTousTypes(
    collaborateurId: string,
    dateRef: string = todayISO(),
  ): SoldeParType[] {
    return this.typesAbsence
      .filter((t) => typeASolde(t))
      .map((t) => ({
        typeId: t.code,
        label: t.label,
        solde: this.getSolde(collaborateurId, t.code, dateRef),
      }))
  }

  setAllocation(
    collaborateurId: string,
    typeId: CongeType,
    periodeLabel: string,
    acquis: number,
  ): void {
    const idx = this.soldes.findIndex(
      (s) =>
        s.collaborateurId === collaborateurId &&
        this.typeIdOverride(s) === typeId &&
        s.periodeLabel === periodeLabel,
    )
    const solde: SoldeConge = {
      id: idx >= 0 ? this.soldes[idx].id : uuid(),
      collaborateurId,
      typeId,
      periodeLabel,
      acquis,
    }
    if (idx >= 0) this.soldes[idx] = solde
    else this.soldes.push(solde)
    this.upsert('soldes', soldeToRow(solde) as unknown as Record<string, unknown>, 'enregistrement solde')
  }

  // --------------------------- Exports (Étape 4) ----------------------------
  private static readonly PERIMETRE_TOUTES = 'toutes'

  private matchPerimetre(c: Collaborateur, perimetre: Perimetre): boolean {
    return perimetre === SupabaseRepository.PERIMETRE_TOUTES || c.familleId === perimetre
  }

  private saisiesRetenues(collaborateurId: string, periode: string): Saisie[] {
    return this.saisies.filter(
      (s) =>
        s.collaborateurId === collaborateurId &&
        (s.statut === 'validee' || s.statut === 'verrouillee') &&
        isInMonthKey(s.date, periode),
    )
  }

  buildRecapExport(periode: string, perimetre: Perimetre): RecapExport {
    const seuilDefaut = this.regles.seuilHsupDefautHebdo
    const collaborateurs = this.collaborateurs.filter((c) =>
      this.matchPerimetre(c, perimetre),
    )
    const colonnesTypes: RecapColonneType[] = this.typesAbsence.map((t) => ({
      code: t.code,
      label: t.label,
    }))
    const round2 = (n: number) => Math.round(n * 100) / 100

    const lignes: RecapLigne[] = []
    for (const c of collaborateurs) {
      const saisiesMois = this.saisiesRetenues(c.id, periode)
      const { supMin, normalMin } = repartitionMoisMinutes(
        saisiesMois,
        c.contrat.seuilHebdo || seuilDefaut,
      )
      const heuresNormales = minutesToDecimalHours(normalMin)
      const heuresSup = minutesToDecimalHours(supMin)

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
      if (heuresNormales === 0 && heuresSup === 0 && totalJours === 0) continue

      const famille = this.familles.find((f) => f.id === c.familleId)
      const modele = this.modeles.find((m) => m.id === c.contrat.modeleId)
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

    lignes.sort((a, b) => a.collaborateur.localeCompare(b.collaborateur, 'fr'))

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
    const collaborateursIds = new Set(
      this.collaborateurs
        .filter((c) => this.matchPerimetre(c, perimetre))
        .map((c) => c.id),
    )
    const aVerrouiller = this.saisies.filter(
      (s) =>
        s.statut === 'validee' &&
        collaborateursIds.has(s.collaborateurId) &&
        isInMonthKey(s.date, periode),
    )
    if (aVerrouiller.length === 0) {
      throw new Error(
        'Aucune saisie validée à verrouiller sur cette période / ce périmètre.',
      )
    }

    const exportEntity: Export = {
      id: uuid(),
      periode,
      perimetre,
      format,
      genereLe: new Date().toISOString(),
      genereParUserId: parUserId,
      nbSaisiesVerrouillees: aVerrouiller.length,
    }

    // Passe les saisies concernées en `verrouillee` (cache + write-through).
    for (const s of aVerrouiller) {
      this.saveSaisie({ ...s, statut: 'verrouillee', exportId: exportEntity.id })
    }

    this.exports.push(exportEntity)
    this.upsert(
      'exports',
      {
        id: exportEntity.id,
        periode: exportEntity.periode,
        perimetre: exportEntity.perimetre,
        format: exportEntity.format,
        genere_le: exportEntity.genereLe,
        genere_par_user_id: exportEntity.genereParUserId,
        nb_saisies_verrouillees: exportEntity.nbSaisiesVerrouillees,
      },
      'enregistrement export',
    )
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
    return this.exports.slice().sort((a, b) => (a.genereLe < b.genereLe ? 1 : -1))
  }

  // ----------------------------- Journal d'audit ----------------------------
  listAudit(cibleId?: string): AuditLog[] {
    const filtered = cibleId
      ? this.audit.filter(
          (a) => a.cibleId === cibleId || a.saisieId === cibleId || a.congeId === cibleId,
        )
      : this.audit
    return filtered.slice().sort((a, b) => (a.horodatage < b.horodatage ? 1 : -1))
  }
}
