// Types du domaine RH - Étape 1 (socle)

export type Role = 'employe' | 'responsable'

// Mode de saisie propre à une famille
export type ModeSaisie = 'journee_continue' | 'demi_journees'

// Unité de décompte du contrat
export type UniteContrat = 'heures' | 'jours'

// Mode de décompte des CONGÉS : jours ouvrés (lun–ven) ou jours ouvrables
// (lun–sam — le samedi est décompté même s'il n'est pas travaillé). Les jours
// fériés chômés ne sont JAMAIS décomptés (dans les deux modes). Défini au niveau
// du contrat (hérité du modèle). Absent sur les données historiques = 'ouvres'.
export type DecompteJours = 'ouvres' | 'ouvrables'

// Jour férié PERSONNALISÉ (paramétré par l'admin), en surcouche des fériés
// nationaux calculés automatiquement. Permet d'ajouter un « pont » chômé, ou au
// contraire de marquer un férié national comme TRAVAILLÉ dans l'entreprise.
export interface JourFerie {
  date: string // ISO yyyy-mm-dd
  label: string
  chome: boolean // true = non décompté (pont/férié) ; false = travaillé (décompté)
}

// Nature du contrat (modèle). Optionnel sur les données historiques.
export type TypeContrat = 'CDI' | 'CDD' | 'saisonnier'

// Statuts possibles d'une saisie
export type StatutSaisie = 'en_attente' | 'validee' | 'refusee' | 'verrouillee'

// Période pour le mode demi-journées
export type Periode = 'matin' | 'apres_midi' | 'journee'

export interface Famille {
  id: string
  nom: string
  modeSaisie: ModeSaisie
  pauseDeduiteMin: number // pause déduite par défaut (mode journée continue)
  // Demander (et EXIGER) une description de la journée à la saisie ? Réglé par
  // équipe : certaines doivent justifier leur activité, d'autres non.
  // Absent = non demandée (comportement des données historiques).
  activiteObligatoire?: boolean
}

export interface ModeleContrat {
  id: string
  nom: string
  typeContrat?: TypeContrat // CDI / CDD / saisonnier (optionnel sur l'historique)
  unite: UniteContrat
  base: number // base contractuelle (ex: 35 heures, ou 7 heures/jour)
  seuilHebdo: number // seuil hebdomadaire (en heures) au-delà duquel = heures sup
  // Mode de décompte des congés (défaut 'ouvres'). Hérité par le contrat.
  decompteJours?: DecompteJours
  // Quotas de congés donnés par ce modèle, PAR TYPE à solde (jours/type). Une
  // entrée par type à acquisition forfait/mensuel (CP, RTT…). Un type ABSENT =
  // « quota par défaut de la politique » (repli). L'ancienneté n'y figure pas :
  // elle reste calculée par paliers. Voir lib/soldes.ts (source du quota).
  quotasParType?: Partial<Record<CongeType, number>>
  // Legacy (avant les quotas par type) : ancien solde CP unique. Conservé
  // optionnel pour la MIGRATION ascendante (→ quotasParType.conge_paye). Ne plus
  // écrire ; lire via quotasParTypeDe() de lib/conges.ts qui gère le repli.
  congesSolde?: number
}

// Contrat rattaché à un collaborateur, pré-rempli depuis un modèle
export interface Contrat {
  modeleId: string
  unite: UniteContrat
  base: number
  seuilHebdo: number // en heures
  // Mode de décompte des congés (défaut 'ouvres'), pré-rempli depuis le modèle.
  decompteJours?: DecompteJours
  // Quotas de congés PAR TYPE à solde de CE contrat (jours/type), pré-remplis
  // depuis le modèle et modifiables. Un type ABSENT = « quota par défaut de la
  // politique ». L'ancienneté n'y figure pas (calculée par paliers). C'est la
  // source de quota prioritaire du moteur (lib/soldes.ts) : contrat sinon défaut.
  quotasParType?: Partial<Record<CongeType, number>>
  // Legacy : ancien solde CP unique. Optionnel pour la MIGRATION ascendante
  // (→ quotasParType.conge_paye). Ne plus écrire ; lire via quotasParTypeDe().
  congesSolde?: number
  // Date d'entrée du collaborateur (ISO yyyy-mm-dd). Optionnelle : si présente et
  // postérieure au début de la période de référence, elle proratise l'acquis
  // (voir PolitiqueConges.prorataEntree + lib/soldes.ts).
  dateDebut?: string
}

export interface Collaborateur {
  id: string
  prenom: string
  nom: string
  familleId: string
  contrat: Contrat
  // Délégation de saisie : liste d'`id` de collaborateurs pour lesquels CETTE
  // personne est autorisée à saisir les heures (en plus des siennes). Vide ou
  // absent = aucune délégation. Défini par l'admin (Administration →
  // Collaborateurs). MIGRATION : les données historiques sans ce champ sont
  // interprétées comme une liste vide.
  peutSaisirPour?: string[]
  // Faut-il ANNONCER les absences à venir de cette personne au responsable ?
  // Activé par défaut : une fiche créée sans y penser reste visible dans les
  // alertes. L'inverse rendrait un collaborateur silencieusement invisible, et
  // une absence non anticipée ne se rattrape pas.
  // MIGRATION : une valeur absente vaut `true`.
  alerteAbsences?: boolean
  // Date de SORTIE des effectifs (ISO yyyy-mm-dd). Absente = toujours présent.
  // On ne SUPPRIME jamais un collaborateur : son historique (saisies, congés,
  // exports) doit être conservé pour la paie. Une fois sorti, il disparaît des
  // listes de saisie et de délégation, mais reste consultable et exportable.
  dateSortie?: string
}

// Un collaborateur est-il présent à cette date ? (défaut : aujourd'hui)
export function estActif(c: Collaborateur, dateRef: string): boolean {
  return !c.dateSortie || c.dateSortie >= dateRef
}

// Compte de connexion (auth mockée)
export interface Compte {
  id: string
  identifiant: string
  motDePasse: string
  role: Role
  collaborateurId?: string // contrat principal (pour un employé)
  // Contrats SUPPLÉMENTAIRES rattachés au même compte (cumul de mi-temps).
  collaborateursSecondaires?: string[]
  nomAffichage: string
}

// Session persistée (sans mot de passe)
export interface Session {
  compteId: string
  identifiant: string
  role: Role
  // Contrat PRINCIPAL (compat : la plupart des écrans n'en gèrent qu'un).
  collaborateurId?: string
  // TOUS les contrats de la personne (principal inclus). Une même personne peut
  // cumuler deux mi-temps : une seule connexion, mais un solde de congés et un
  // seuil d'heures sup PAR CONTRAT. Contient 0 ou 1 élément dans le cas courant.
  collaborateurIds: string[]
  nomAffichage: string
}

export interface Saisie {
  id: string
  collaborateurId: string
  date: string // ISO yyyy-mm-dd
  // Mode journée continue
  heureDebut?: string // HH:mm
  heureFin?: string // HH:mm
  pauseMin?: number
  // Mode demi-journées
  periode?: Periode
  matinDebut?: string
  matinFin?: string
  apremDebut?: string
  apremFin?: string
  // Commun
  totalMinutes: number // total calculé et figé au moment de la saisie
  // Description libre de la journée (« ce que j'ai fait »). Demandée — et
  // exigée — selon le réglage de l'équipe (Famille.activiteObligatoire).
  activite?: string
  statut: StatutSaisie
  saisiPar: string // identifiant du compte ayant saisi
  createdAt: string
  // Workflow de validation (Étape 2) — champs "cache" pour affichage rapide.
  // L'historique complet et faisant foi vit dans AuditLog.
  validee_par?: string // id du responsable ayant validé
  validee_le?: string // date ISO de validation
  refus_motif?: string // motif fourni lors du dernier refus
  debloquee_par?: string // id du responsable ayant débloqué
  // Verrouillage comptable (Étape 4)
  exportId?: string // export ayant verrouillé la saisie
}

// Actions journalisées. Saisies (Étape 2) + congés (Étape 3).
export type AuditAction =
  // Saisies
  | 'validee'
  | 'refusee'
  | 'debloquee'
  | 'modifiee'
  // Congés
  | 'demande_conge'
  | 'conge_validee'
  | 'conge_refusee'
  // Ajustement MANUEL du nombre de jours décompté (responsable). Toujours tracé :
  // l'audit conserve l'ancienne valeur, la nouvelle et le motif.
  | 'conge_jours_modifies'
  // Annulation d'un congé DÉJÀ VALIDÉ (jours rendus au solde), motif obligatoire.
  | 'conge_annulee'
  // Exports (Étape 4)
  | 'export'

// Type de l'entité ciblée par une entrée d'audit.
export type CibleType = 'saisie' | 'conge' | 'export'

// Journal d'audit : trace immuable de chaque transition/correction/demande.
// Généralisé pour couvrir plusieurs types de cibles sans casser l'existant :
// `cibleType` + `cibleId` sont la clé générique ; `saisieId`/`congeId` sont
// conservés en complément pour la commodité (et la compatibilité ascendante).
export interface AuditLog {
  id: string
  cibleType: CibleType
  cibleId: string
  action: AuditAction
  parUserId: string // identifiant du compte auteur de l'action
  horodatage: string // date ISO
  detail?: string // motif de refus, description de la correction, etc.
  saisieId?: string // renseigné si cibleType === 'saisie'
  congeId?: string // renseigné si cibleType === 'conge'
}

// ---------- Congés (Étape 3) ----------

// Types d'absence. `anciennete` = congés d'ancienneté (acquis par paliers).
// L'identifiant d'un type À SOLDE (`typeId` dans le moteur/repository) est l'un
// de ces codes ; chaque type à solde porte SON PROPRE compteur et SA politique.
export type CongeType = 'conge_paye' | 'maladie' | 'sans_solde' | 'rtt' | 'anciennete'

// Positionnement d'une demi-journée (seulement si dateDebut === dateFin).
export type DemiJour = 'aucune' | 'debut' | 'fin'

// `annulee` : congé VALIDÉ puis annulé (le salarié n'est finalement pas parti —
// arrêt maladie, rappel…). Les jours sont rendus au solde et le congé sort des
// décomptes ; la trace reste visible dans l'historique et le journal d'audit.
export type StatutConge = 'demandee' | 'validee' | 'refusee' | 'annulee'

export interface Conge {
  id: string
  collaborateurId: string
  type: CongeType
  dateDebut: string // ISO yyyy-mm-dd
  dateFin: string // ISO yyyy-mm-dd
  demiJour: DemiJour
  nbJours: number // jours décomptés (calculé, ou AJUSTÉ manuellement par le responsable)
  // Valeur d'origine issue du CALCUL automatique, mémorisée uniquement lorsque
  // `nbJours` a été ajusté à la main. Absente = aucun ajustement (nbJours = calcul).
  nbJoursCalcule?: number
  statut: StatutConge
  demandeParUserId: string
  valideeParUserId?: string
  refusMotif?: string
  motif?: string // motif optionnel fourni par le demandeur
  createdAt: string
}

// Override MANUEL de l'acquis d'un collaborateur pour UNE période de référence
// ET UN type à solde donné. N'est utilisé que si un admin règle explicitement
// une allocation ; sinon l'acquis est calculé automatiquement (lib/soldes.ts).
// Le "pris" et le "restant" ne sont JAMAIS stockés : ils sont calculés.
export interface SoldeConge {
  id: string
  collaborateurId: string
  // Type à solde concerné. MIGRATION : les enregistrements historiques (Étape 3)
  // n'ont pas ce champ → ils sont interprétés comme `conge_paye`.
  typeId: CongeType
  periodeLabel: string // libellé de la période de référence, ex. "2026–2027"
  acquis: number
}

// Solde calculé "à plat" (acquis/pris/restant) — conservé pour compat éventuelle.
export interface SoldeCalcule {
  acquis: number
  pris: number
  restant: number
}

// ---------- Types d'absence paramétrables (Administration) ----------

// Un type d'absence configurable. `code` reste l'un des CongeType du domaine
// (le moteur de solde en dépend) ; l'admin en règle le libellé et les drapeaux.
export interface TypeAbsence {
  code: CongeType
  label: string
  // Ce type porte-t-il un COMPTEUR de solde (acquis / pris / restant) ? Si oui,
  // il a sa propre politique d'acquisition (map `typeId -> PolitiqueConges`) et
  // une demande de ce type décompte le solde DE CE TYPE. Généralise l'ancien
  // `decrementeCp` (qui ne visait que le compteur unique de congés payés).
  aSolde: boolean
  justificatifRequis: boolean // un justificatif est-il attendu ?
  // Legacy (Étape 3) : conservé pour la MIGRATION ascendante des données
  // localStorage existantes. `aSolde` le remplace ; ne plus lire directement
  // (utiliser `typeASolde()` de lib/conges.ts qui gère le repli).
  decrementeCp?: boolean
}

// ---------- Règles générales (Administration) ----------

// Configuration singleton (clé localStorage `rh.regles`). Câblée réellement :
// `saisieRetroJours` borne la saisie rétroactive ; `seuilHsupDefautHebdo` sert
// de seuil h. sup de repli quand un contrat n'en définit pas.
export interface ReglesGenerales {
  saisieRetroJours: number // fenêtre de saisie rétroactive (jours), défaut 7
  seuilHsupDefautHebdo: number // seuil h. sup hebdo par défaut (h), défaut 35
  verrouillageApresExport: boolean // proposer le verrouillage à l'export, défaut true
  // Combien de jours à l'avance annoncer une absence au responsable. L'alerte
  // couvre TOUT l'intervalle (« commence dans les x prochains jours ») et non le
  // seul jour J-x : sinon un responsable absent ce jour-là raterait l'alerte
  // définitivement. 0 = alerte désactivée. Défaut 7.
  alerteAbsenceJours: number
}

// ---------- Politique de congés paramétrable (Étape 5, inspiré Odoo) ----------

// Mode d'acquisition de l'acquis annuel.
// - forfait   : quota plein attribué en une fois (proratisable à l'entrée).
// - mensuel   : acquis au fil des mois travaillés (tauxMensuel).
// - anciennete: acquis par PALIERS selon l'ancienneté (date d'entrée).
export type ModeAcquisition = 'forfait' | 'mensuel' | 'anciennete'

// Traitement du solde restant à la clôture d'une période de référence.
export type ModeReport = 'perdu' | 'integral' | 'plafonne'

// Un palier d'ancienneté : à partir de `ansMin` années d'ancienneté révolues,
// le collaborateur acquiert `jours` jours (le palier le plus élevé atteint prime).
export interface PalierAnciennete {
  ansMin: number // ancienneté minimale (années révolues)
  jours: number // jours acquis à partir de ce palier
}

// Politique d'acquisition/report d'UN type à solde. Stockée dans la map
// `rh.politiques` (clé = typeId). MIGRATION : l'ancienne politique globale
// unique (clé `rh.politiqueConges`) devient la politique du type `conge_paye`.
export interface PolitiqueConges {
  // Début de la période de référence (jour + mois). La période dure 12 mois,
  // fin = veille du même jour un an après (ex. 01/06 → 31/05).
  debutJour: number // 1..31
  debutMois: number // 1..12
  modeAcquisition: ModeAcquisition
  quotaAnnuel: number // acquis annuel plein (mode forfait, et base du mensuel)
  tauxMensuel: number // acquis par mois travaillé (mode mensuel)
  prorataEntree: boolean // proratise l'acquis si entrée en cours de période
  report: ModeReport
  plafondReport: number // plafond du report (mode plafonné)
  // Expiration du report (chantier Étape 6) : nombre de mois APRÈS le début de
  // la nouvelle période au-delà duquel les jours REPORTÉS non encore consommés
  // sont perdus. N'a de sens que si `report !== 'perdu'`. MIGRATION : défaut
  // raisonnable (3) si absent (voir normalizePolitique).
  reportExpirationMois: number
  // Paliers d'ancienneté (utilisés si modeAcquisition === 'anciennete').
  paliersAnciennete: PalierAnciennete[]
}

// Politiques indexées par type à solde (clé = CongeType). Une entrée par type
// à solde. MIGRATION : construite à partir de l'ancienne politique unique.
export type PolitiquesConges = Partial<Record<CongeType, PolitiqueConges>>

// Période de référence bornée + libellé lisible.
export interface PeriodeConges {
  debut: string // ISO yyyy-mm-dd inclus
  fin: string // ISO yyyy-mm-dd inclus
  label: string // ex. "2026–2027"
}

// Solde calculé pour UNE période de référence ET un type à solde (retour du
// moteur/repository).
export interface SoldePeriode {
  periode: PeriodeConges
  acquis: number // acquis total = acquis de la période + report brut éventuel
  pris: number // congés (DE CE TYPE) validés dont les dates tombent dans la période
  restant: number // reportRestant + acquisRestant (voir décomposition ci-dessous)
  report: number // alias de `reportBrut` (compat) : report brut de la période précédente
  // ---- Décomposition report / acquisition (Étape 6) ----
  // Le "pris" s'impute D'ABORD sur le report, puis sur l'acquisition de période.
  // Rien n'est stocké : tout est calculé (voir lib/soldes.ts).
  reportBrut: number // report de la période précédente, avant consommation
  reportRestant: number // report non consommé ET non expiré (0 hors fenêtre)
  acquisPeriode: number // acquis propre à la période (hors report)
  acquisRestant: number // acquisPeriode − part du pris imputée sur l'acquisition
  // Date (ISO) au-delà de laquelle le report non consommé est perdu (si report actif).
  dateExpirationReport?: string
  // Ancienneté prise en compte (années révolues) en mode `anciennete`.
  ancienneteAns?: number
  // Message non bloquant (ex. mode ancienneté sans date d'entrée → acquis à 0).
  avertissement?: string
  // Vrai si l'acquis provient d'une ALLOCATION MANUELLE (override) et non du
  // calcul automatique. Dans ce cas, modifier le contrat ou la date d'entrée
  // n'a AUCUN effet sur ce solde tant que l'allocation n'est pas retirée.
  allocationManuelle?: boolean
}

// Solde d'UN type à solde pour un collaborateur (retour de getSoldesTousTypes).
export interface SoldeParType {
  typeId: CongeType
  label: string
  solde: SoldePeriode
}

// Filtre optionnel pour lister les congés.
export interface CongeFiltre {
  collaborateurId?: string
  statut?: StatutConge
  annee?: number
}

// Charge utile de création d'une demande de congé (le reste est calculé).
export interface DemandeCongeInput {
  collaborateurId: string
  type: CongeType
  dateDebut: string
  dateFin: string
  demiJour: DemiJour
  demandeParUserId: string
  motif?: string
}

// ---------- Exports comptables (Étape 4) ----------

export type ExportFormat = 'csv' | 'xlsx'

// Périmètre d'export : 'toutes' ou l'id d'une famille.
export type Perimetre = string

// Une colonne « type d'absence » du récapitulatif (Étape 6) : une par type
// d'absence configuré, dans l'ordre des types (CP, RTT, Ancienneté, Maladie…).
export interface RecapColonneType {
  code: CongeType
  label: string
}

// Une ligne du récapitulatif mensuel (un collaborateur).
// Les heures sont exprimées en heures décimales (arrondies à 2 décimales).
export interface RecapLigne {
  collaborateurId: string
  collaborateur: string
  famille: string
  contrat: string // libellé du modèle de contrat
  heuresNormales: number // h décimales
  heuresSup: number // h décimales
  // Jours de congés VALIDÉS du mois, par type d'absence (clé = CongeType).
  // Une entrée par colonne de `RecapExport.colonnesTypes`.
  joursParType: Partial<Record<CongeType, number>>
}

export interface RecapTotaux {
  heuresNormales: number
  heuresSup: number
  // Total équipe des jours par type d'absence (mêmes clés que les lignes).
  joursParType: Partial<Record<CongeType, number>>
}

// Récapitulatif agrégé retourné par buildRecapExport.
export interface RecapExport {
  periode: string // 'YYYY-MM'
  perimetre: Perimetre
  // Colonnes dynamiques par type d'absence (ordre = ordre des types configurés).
  colonnesTypes: RecapColonneType[]
  lignes: RecapLigne[]
  totaux: RecapTotaux
}

// Entité Export : trace d'un verrouillage de période.
export interface Export {
  id: string
  periode: string // 'YYYY-MM'
  perimetre: Perimetre
  format: ExportFormat
  genereLe: string // date ISO
  genereParUserId: string
  nbSaisiesVerrouillees: number
}

// ---------- Import de collaborateurs (Assistant d'import) ----------

// Une ligne d'import DÉJÀ VALIDÉE, prête à être matérialisée par le repository.
// Les libellés (famille / modèle) ont été résolus en identifiants côté UI, les
// options normalisées (date en ISO, solde en nombre, mot de passe non vide).
export interface ImportCollaborateurRow {
  nom: string
  prenom: string
  identifiant: string
  familleId: string
  modeleId: string
  motDePasse: string
  // Créer le compte de connexion associé ? Colonne « Créer un compte » du
  // fichier (oui/non, vide = oui). `false` = collaborateur SANS accès à
  // l'application : ses heures sont saisies par un responsable ou un délégué.
  creerCompte: boolean
  dateDebut?: string // ISO yyyy-mm-dd si fournie (sinon acquis non proratisé)
  // Legacy (Étape 4) : ancienne colonne « Solde congés initial » = solde CP.
  // Conservé pour la rétrocompatibilité ; replié dans `soldesInitiaux.conge_paye`
  // si ce dernier n'est pas déjà renseigné (voir repository.importerCollaborateurs).
  soldeInitial?: number
  // Solde initial par type à solde (Étape 6) : override d'allocation sur la
  // période courante DE CHAQUE type (clé = CongeType). Optionnel par type.
  soldesInitiaux?: Partial<Record<CongeType, number>>
}

// Résultat d'un import transactionnel (matérialisation des lignes valides).
export interface ImportResult {
  importes: number
  ignores: number
}
