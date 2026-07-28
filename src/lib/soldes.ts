import type {
  Collaborateur,
  Conge,
  Contrat,
  CongeType,
  PeriodeConges,
  PolitiqueConges,
  SoldePeriode,
} from '../types'
import { computeNbJours } from './conges'

// ---------------------------------------------------------------------------
// Moteur d'acquisition et de report des congés à solde (inspiré d'Odoo Time Off).
//
// GÉNÉRALISÉ : le moteur travaille sur UN type à solde à la fois (congés payés,
// RTT, ancienneté…). Il reçoit la politique DE CE type + les congés validés DE
// CE type et renvoie le solde de la période. Le décompte n'est plus limité aux
// congés payés : chaque type porte son propre compteur.
//
// Tout est CALCULÉ à partir de la PolitiqueConges (période de référence, mode
// d'acquisition, report) + des congés validés. Rien n'est stocké de façon
// figée, hormis l'override manuel d'acquis géré côté repository.
//
// Choix d'implémentation : toutes les dates sont manipulées en UTC via
// Date.UTC(...) et comparées comme des chaînes ISO yyyy-mm-dd (zéro-paddées,
// donc l'ordre lexicographique = l'ordre chronologique). Aucune dépendance au
// fuseau horaire local, années bissextiles gérées nativement par Date.
// ---------------------------------------------------------------------------

// Politique par défaut (congés payés). Créée au seed si absente et sert de repli.
export const POLITIQUE_DEFAUT: PolitiqueConges = {
  debutJour: 1,
  debutMois: 6, // 01/06
  modeAcquisition: 'forfait',
  quotaAnnuel: 25,
  tauxMensuel: arrondi(25 / 12), // ≈ 2.08
  prorataEntree: true,
  report: 'plafonne',
  plafondReport: 5,
  reportExpirationMois: 3,
  paliersAnciennete: [],
}

// Politiques par défaut par type à solde (utilisées au seed et comme repli).
export const POLITIQUES_DEFAUT: Partial<Record<CongeType, PolitiqueConges>> = {
  conge_paye: POLITIQUE_DEFAUT,
  // RTT : forfait 10 j, période civile (01/01), report perdu.
  rtt: {
    debutJour: 1,
    debutMois: 1,
    modeAcquisition: 'forfait',
    quotaAnnuel: 10,
    tauxMensuel: arrondi(10 / 12),
    prorataEntree: true,
    report: 'perdu',
    plafondReport: 0,
    reportExpirationMois: 3,
    paliersAnciennete: [],
  },
  // Ancienneté : acquisition par paliers selon la date d'entrée, période civile.
  anciennete: {
    debutJour: 1,
    debutMois: 1,
    modeAcquisition: 'anciennete',
    quotaAnnuel: 0,
    tauxMensuel: 0,
    prorataEntree: false,
    report: 'perdu',
    plafondReport: 0,
    reportExpirationMois: 3,
    paliersAnciennete: [
      { ansMin: 10, jours: 1 },
      { ansMin: 15, jours: 2 },
      { ansMin: 20, jours: 3 },
    ],
  },
}

// Normalise une politique lue depuis le stockage : garantit les champs ajoutés
// après coup (paliersAnciennete) pour les données historiques. MIGRATION douce.
export function normalizePolitique(p: PolitiqueConges): PolitiqueConges {
  return {
    ...p,
    paliersAnciennete: Array.isArray(p.paliersAnciennete) ? p.paliersAnciennete : [],
    // MIGRATION douce : défaut raisonnable (3 mois) si le champ est absent des
    // données historiques.
    reportExpirationMois:
      typeof p.reportExpirationMois === 'number' && p.reportExpirationMois >= 0
        ? p.reportExpirationMois
        : 3,
  }
}

// Arrondi à 2 décimales (les acquis peuvent être fractionnaires).
function arrondi(n: number): number {
  return Math.round(n * 100) / 100
}

// Construit une date ISO yyyy-mm-dd à partir de composants, en normalisant les
// débordements (jour 0 → dernier jour du mois précédent, etc.) via Date.UTC.
function isoFrom(y: number, m1to12: number, d: number): string {
  return new Date(Date.UTC(y, m1to12 - 1, d)).toISOString().slice(0, 10)
}

// Parse une date ISO en composants numériques (année/mois/jour).
function parseISO(dateISO: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}

// Décale une date ISO de `mois` mois (peut être négatif), jour conservé/normalisé.
function addMonthsISO(dateISO: string, mois: number): string {
  const { y, m, d } = parseISO(dateISO)
  return isoFrom(y, m + mois, d)
}

// La date `dateISO` atteint-elle (>=) le point (jour/mois) d'une année donnée ?
// Comparaison (mois, jour) purement calendaire.
function atteintDebut(dateISO: string, debutJour: number, debutMois: number): boolean {
  const { m, d } = parseISO(dateISO)
  if (m !== debutMois) return m > debutMois
  return d >= debutJour
}

// Période de référence contenant `dateISO`.
// L'année de début Y est l'année civile si (mois,jour) >= (debutMois,debutJour),
// sinon l'année précédente. Fin = veille du même jour un an après.
export function periodePour(
  dateISO: string,
  politique: PolitiqueConges,
): PeriodeConges {
  const { y } = parseISO(dateISO)
  const anneeDebut = atteintDebut(dateISO, politique.debutJour, politique.debutMois)
    ? y
    : y - 1
  const debut = isoFrom(anneeDebut, politique.debutMois, politique.debutJour)
  // Fin = (même jour, un an après) − 1 jour. Le "− 1" sur le composant jour est
  // normalisé par Date.UTC (gère fin de mois, 31/05, bissextiles).
  const fin = isoFrom(anneeDebut + 1, politique.debutMois, politique.debutJour - 1)
  return { debut, fin, label: `${anneeDebut}–${anneeDebut + 1}` }
}

// Nombre de "débuts de mois" de la période (0..12) déjà atteints à `dateRef`.
// Sert de compteur de mois écoulés. Le 1er mois démarre à periode.debut.
function moisEcoules(periode: PeriodeConges, dateRef: string): number {
  let count = 0
  for (let k = 0; k < 12; k++) {
    if (addMonthsISO(periode.debut, k) <= dateRef) count++
    else break
  }
  return count
}

// Index (0-based) du mois de la période où tombe l'entrée du collaborateur.
// 0 si présent dès le début (ou entrée antérieure au début de période).
function indexMoisEntree(periode: PeriodeConges, entree: string): number {
  if (entree <= periode.debut) return 0
  // moisEcoules(entree) compte les débuts de mois <= entree (≥ 1 ici) ; l'index
  // du mois d'entrée est ce compteur − 1.
  return Math.max(0, moisEcoules(periode, entree) - 1)
}

// Nombre d'années d'ancienneté RÉVOLUES entre deux dates ISO (>= 0).
export function ancienneteEnAnnees(entreeISO: string, dateRef: string): number {
  const a = parseISO(entreeISO)
  const b = parseISO(dateRef)
  let ans = b.y - a.y
  // L'anniversaire de l'année en cours n'est pas encore atteint → une de moins.
  if (b.m < a.m || (b.m === a.m && b.d < a.d)) ans -= 1
  return Math.max(0, ans)
}

// Jours acquis pour une ancienneté donnée = jours du palier le plus élevé
// atteint (ansMin <= ancienneté). 0 si aucun palier atteint.
export function joursPalierAnciennete(
  paliers: PolitiqueConges['paliersAnciennete'],
  anciennete: number,
): number {
  return paliers
    .filter((p) => anciennete >= p.ansMin)
    .reduce((best, p) => (p.ansMin >= best.ansMin ? p : best), { ansMin: -1, jours: 0 })
    .jours
}

// Acquis "de la période" (hors report), selon le mode d'acquisition + prorata.
//
// `quotaOverride` (optionnel) : quota annuel PROPRE AU CONTRAT pour ce type
// (contrat.quotasParType[type]). S'il est défini, il PRIME sur le quota par
// défaut de la politique (politique.quotaAnnuel) — c'est la source « contrat
// sinon défaut politique ». En mode mensuel, le taux mensuel effectif est dérivé
// du quota override (override / 12). L'ancienneté (paliers) N'est PAS concernée.
function acquisPeriode(
  contrat: Contrat,
  politique: PolitiqueConges,
  periode: PeriodeConges,
  dateRef: string,
  quotaOverride?: number,
): number {
  const entree = contrat.dateDebut

  // Mode ancienneté : indépendant du prorata mensuel, piloté par les paliers.
  // Le quota du contrat ne s'y applique pas (droit calculé par paliers).
  if (politique.modeAcquisition === 'anciennete') {
    if (!entree) return 0 // pas de date d'entrée → aucun droit (signalé en amont)
    // Entrée postérieure à la fin de période → pas encore présent sur la période.
    if (entree > periode.fin) return 0
    const anciennete = ancienneteEnAnnees(entree, dateRef)
    return arrondi(joursPalierAnciennete(politique.paliersAnciennete, anciennete))
  }

  // Entrée postérieure à la fin de période → aucun droit acquis sur la période.
  if (entree && entree > periode.fin) return 0

  const prorata = politique.prorataEntree && !!entree && entree > periode.debut
  const eIndex = prorata ? indexMoisEntree(periode, entree as string) : 0

  // Quota annuel effectif : celui du contrat s'il est défini, sinon la politique.
  const quotaAnnuel = quotaOverride ?? politique.quotaAnnuel

  if (politique.modeAcquisition === 'forfait') {
    // Forfait : quota plein, éventuellement proratisé aux mois restants après
    // l'entrée (12 − index du mois d'entrée). Attribué en une fois.
    const moisRestants = 12 - eIndex
    return arrondi((quotaAnnuel * moisRestants) / 12)
  }

  // Mensuel : tauxMensuel × nb de mois travaillés écoulés jusqu'à dateRef.
  // Mois travaillés = mois écoulés dans la période − mois précédant l'entrée.
  // Taux mensuel effectif dérivé du quota du contrat s'il est fourni.
  const tauxMensuel =
    quotaOverride != null ? arrondi(quotaOverride / 12) : politique.tauxMensuel
  const moisTravailles = Math.max(0, moisEcoules(periode, dateRef) - eIndex)
  return arrondi(tauxMensuel * moisTravailles)
}

// Part d'un congé qui tombe DANS la période de référence.
//
// Un congé à cheval sur deux périodes (ex. 25/05 → 05/06) ne doit pas être
// imputé à 100 % sur la période de sa date de début : on ventile au prorata des
// jours décomptables de chaque côté de la frontière.
//
// `c.nbJours` reste la référence (il peut avoir été AJUSTÉ manuellement par le
// responsable) : on ne le recalcule jamais, on le répartit.
function partSurPeriode(
  c: Conge,
  contrat: Contrat,
  periode: PeriodeConges,
): number {
  // Entièrement hors période.
  if (c.dateFin < periode.debut || c.dateDebut > periode.fin) return 0
  // Entièrement dedans : valeur telle quelle (cas courant).
  if (c.dateDebut >= periode.debut && c.dateFin <= periode.fin) return c.nbJours

  // À cheval : prorata des jours décomptables situés dans la période.
  const mode = contrat.decompteJours
  const total = computeNbJours(c.dateDebut, c.dateFin, 'aucune', mode)
  if (total <= 0) return 0
  const debut = c.dateDebut > periode.debut ? c.dateDebut : periode.debut
  const fin = c.dateFin < periode.fin ? c.dateFin : periode.fin
  const dedans = computeNbJours(debut, fin, 'aucune', mode)
  return arrondi((c.nbJours * dedans) / total)
}

// Calcule le solde d'une période de référence pour un collaborateur, POUR UN
// type à solde donné.
//
// - `congesValidesDuType` : congés du collaborateur déjà filtrés sur statut
//   `validee` ET sur le type concerné (le moteur ne refiltre plus par type).
// - `dateRef`       : date d'observation (défaut = aujourd'hui côté appelant).
// - `niveauReport`  : garde-fou anti-récursion. 1 = on ajoute le report de la
//   période précédente ; 0 = on calcule cette période SANS son propre report
//   (utilisé pour évaluer le restant de la période précédente → 1 seul niveau).
// - `quotaOverride` : quota annuel propre au contrat pour ce type
//   (contrat.quotasParType[type]) ; prime sur le quota par défaut de la politique
//   quand il est défini. Voir acquisPeriode.
export function calculerSolde(
  collaborateur: Collaborateur,
  contrat: Contrat,
  congesValidesDuType: Conge[],
  politique: PolitiqueConges,
  dateRef: string,
  niveauReport = 1,
  quotaOverride?: number,
): SoldePeriode {
  const periode = periodePour(dateRef, politique)
  const base = arrondi(acquisPeriode(contrat, politique, periode, dateRef, quotaOverride))

  // Report de la période PRÉCÉDENTE (borné à 1 niveau).
  let reportBrut = 0
  if (politique.report !== 'perdu' && niveauReport > 0) {
    // Une date dans la période précédente = la veille du début de période
    // (le "− 1" jour est normalisé par Date.UTC).
    const p = parseISO(periode.debut)
    const veille = isoFrom(p.y, p.m, p.d - 1)
    const prec = calculerSolde(
      collaborateur,
      contrat,
      congesValidesDuType,
      politique,
      veille,
      0, // pas de report en cascade → pas de récursion infinie
      quotaOverride, // même source de quota (contrat) sur la période précédente
    )
    const restantPrec = Math.max(0, prec.restant)
    reportBrut =
      politique.report === 'integral'
        ? restantPrec
        : Math.min(restantPrec, Math.max(0, politique.plafondReport))
  }
  reportBrut = arrondi(reportBrut)

  // --- Fenêtre d'expiration du report (calculée AVANT l'imputation) ---------
  // Le report n'est disponible que jusqu'à débutPériode + reportExpirationMois.
  let dateExpirationReport: string | undefined
  if (reportBrut > 0) {
    dateExpirationReport = addMonthsISO(periode.debut, politique.reportExpirationMois)
  }

  // Part de chaque congé revenant à CETTE période (gère les congés à cheval).
  const parts = congesValidesDuType
    .map((c) => ({ conge: c, jours: partSurPeriode(c, contrat, periode) }))
    .filter((p) => p.jours > 0)
  const pris = arrondi(parts.reduce((acc, p) => acc + p.jours, 0))

  // --- Ordre de consommation : le report D'ABORD, puis l'acquisition --------
  // MAIS seuls les congés PRIS AVANT l'expiration peuvent consommer le report.
  // Sinon un congé posé après l'expiration s'imputait sur un report déjà perdu
  // et ne décomptait plus RIEN (jours offerts silencieusement).
  const prisEligibleReport = dateExpirationReport
    ? arrondi(
        parts
          .filter((p) => p.conge.dateDebut < (dateExpirationReport as string))
          .reduce((acc, p) => acc + p.jours, 0),
      )
    : pris
  const prisSurReport = Math.min(prisEligibleReport, reportBrut)
  const reportRestantAvantExp = arrondi(reportBrut - prisSurReport)

  const reportDansFenetre = dateExpirationReport ? dateRef < dateExpirationReport : true
  const reportRestant = reportDansFenetre ? reportRestantAvantExp : 0

  const prisSurAcquis = arrondi(pris - prisSurReport)
  const acquisRestant = arrondi(base - prisSurAcquis)

  const acquis = arrondi(base + reportBrut)
  const solde: SoldePeriode = {
    periode,
    acquis,
    pris,
    restant: arrondi(reportRestant + acquisRestant),
    report: reportBrut,
    reportBrut,
    reportRestant,
    acquisPeriode: base,
    acquisRestant,
    dateExpirationReport,
  }

  // Informations spécifiques au mode ancienneté (ancienneté prise en compte /
  // date d'entrée manquante). Signalées proprement pour l'UI.
  if (politique.modeAcquisition === 'anciennete') {
    if (!contrat.dateDebut) {
      solde.avertissement =
        "Date d'entrée manquante : aucun congé d'ancienneté n'est acquis."
    } else {
      solde.ancienneteAns = ancienneteEnAnnees(contrat.dateDebut, dateRef)
    }
  }
  return solde
}

// Aperçu textuel de la politique (utilisé par l'UI admin/employé).
export function apercuPolitique(politique: PolitiqueConges): string {
  let acq: string
  if (politique.modeAcquisition === 'forfait') {
    acq = `forfait ${politique.quotaAnnuel} j`
  } else if (politique.modeAcquisition === 'mensuel') {
    acq = `mensuel ${politique.tauxMensuel} j/mois`
  } else {
    const n = politique.paliersAnciennete.length
    acq = `ancienneté · ${n} palier${n > 1 ? 's' : ''}`
  }
  const rep =
    politique.report === 'perdu'
      ? 'report perdu'
      : politique.report === 'integral'
        ? 'report intégral'
        : `report plafonné ${politique.plafondReport} j`
  return `acquisition ${acq} · ${rep}`
}
