import type { Contrat, Saisie } from '../types'
import { endOfWeek, isInCurrentWeek, startOfWeek } from './dates'

// Convertit "HH:mm" en minutes depuis minuit. Retourne null si invalide.
export function timeToMinutes(t?: string): number | null {
  if (!t) return null
  const m = /^(\d{2}):(\d{2})$/.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

// Total (en minutes) d'un créneau début->fin, jamais négatif.
export function slotMinutes(debut?: string, fin?: string): number {
  const a = timeToMinutes(debut)
  const b = timeToMinutes(fin)
  if (a == null || b == null) return 0
  return Math.max(0, b - a)
}

// Total pour une journée continue : (fin - début) - pause.
export function computeJourneeContinue(
  debut: string,
  fin: string,
  pauseMin: number,
): number {
  return Math.max(0, slotMinutes(debut, fin) - Math.max(0, pauseMin))
}

// Total pour une saisie en demi-journées selon la période.
export function computeDemiJournees(saisie: {
  periode?: Saisie['periode']
  matinDebut?: string
  matinFin?: string
  apremDebut?: string
  apremFin?: string
}): number {
  const matin = slotMinutes(saisie.matinDebut, saisie.matinFin)
  const aprem = slotMinutes(saisie.apremDebut, saisie.apremFin)
  switch (saisie.periode) {
    case 'matin':
      return matin
    case 'apres_midi':
      return aprem
    case 'journee':
      return matin + aprem
    default:
      return 0
  }
}

// Décrit les horaires saisis en texte court, selon le mode de la saisie.
export function describeHoraires(saisie: Saisie): string {
  if (saisie.heureDebut && saisie.heureFin) {
    const pause = saisie.pauseMin ? ` (pause ${saisie.pauseMin} min)` : ''
    return `${saisie.heureDebut}–${saisie.heureFin}${pause}`
  }
  const parts: string[] = []
  if (saisie.matinDebut && saisie.matinFin) {
    parts.push(`matin ${saisie.matinDebut}–${saisie.matinFin}`)
  }
  if (saisie.apremDebut && saisie.apremFin) {
    parts.push(`après-midi ${saisie.apremDebut}–${saisie.apremFin}`)
  }
  return parts.join(' · ') || '—'
}

// Formate un nombre de minutes en "7h30" / "0h00".
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}h${String(m).padStart(2, '0')}`
}

// Total (minutes) des saisies d'un collaborateur sur la semaine courante.
export function totalSemaineMinutes(
  saisies: Saisie[],
  collaborateurId: string,
): number {
  return saisies
    .filter((s) => s.collaborateurId === collaborateurId && isInCurrentWeek(s.date))
    .reduce((acc, s) => acc + s.totalMinutes, 0)
}

// Total (minutes) sur la semaine (lundi->dimanche) contenant `dateStr`.
// Utile côté responsable pour situer une saisie rétroactive dans SA semaine.
export function totalSemaineMinutesForDate(
  saisies: Saisie[],
  collaborateurId: string,
  dateStr: string,
): number {
  const ref = new Date(dateStr + 'T12:00:00')
  const start = startOfWeek(ref)
  const end = endOfWeek(ref)
  return saisies
    .filter((s) => {
      if (s.collaborateurId !== collaborateurId) return false
      const d = new Date(s.date + 'T12:00:00')
      return d >= start && d <= end
    })
    .reduce((acc, s) => acc + s.totalMinutes, 0)
}

// Heures supplémentaires hebdo (minutes), SANS majoration :
// max(0, total_semaine - seuil_hebdo_du_contrat). Seuil en heures.
export function heuresSupMinutes(totalMinutesSemaine: number, contrat: Contrat): number {
  const seuilMin = contrat.seuilHebdo * 60
  return Math.max(0, totalMinutesSemaine - seuilMin)
}

// Répartition mensuelle normales / sup (minutes), pour l'export comptable.
// Les heures sup sont calculées PAR SEMAINE ISO (regroupées par lundi) :
// pour chaque semaine chevauchant le mois, sup = max(0, total_semaine - seuil),
// puis on somme sur le mois. normales = total_mois - sup_mois. Sans majoration.
export function repartitionMoisMinutes(
  saisiesMois: Saisie[],
  seuilHebdo: number,
): { totalMin: number; supMin: number; normalMin: number } {
  const totalMin = saisiesMois.reduce((acc, s) => acc + s.totalMinutes, 0)
  const seuilMin = seuilHebdo * 60

  const parSemaine = new Map<string, number>()
  for (const s of saisiesMois) {
    const lundi = startOfWeek(new Date(s.date + 'T12:00:00'))
      .toISOString()
      .slice(0, 10)
    parSemaine.set(lundi, (parSemaine.get(lundi) ?? 0) + s.totalMinutes)
  }

  let supMin = 0
  for (const totalSemaine of parSemaine.values()) {
    supMin += Math.max(0, totalSemaine - seuilMin)
  }
  return { totalMin, supMin, normalMin: totalMin - supMin }
}

// Convertit des minutes en heures décimales arrondies à 2 décimales.
export function minutesToDecimalHours(min: number): number {
  return Math.round((min / 60) * 100) / 100
}

// Formate des heures décimales à 2 décimales, en notation FR (virgule décimale).
// Utilisé par l'export comptable (aperçu + CSV) pour rester cohérent.
export function formatHeuresDecimal(h: number): string {
  return h.toFixed(2).replace('.', ',')
}

// Formate un nombre de jours (congés/absences) en notation FR (virgule décimale
// uniquement si nécessaire : "12" ou "0,5").
export function formatJours(j: number): string {
  return String(j).replace('.', ',')
}
