// Utilitaires de dates (semaine ISO lundi->dimanche, bornes de saisie).

// yyyy-mm-dd depuis les composants LOCAUX de la date.
//
// `toISOString()` convertit en UTC : en France (UTC+1/+2) il renvoie la VEILLE
// entre minuit et 2 h du matin, et décale d'un jour toute date ramenée à minuit
// local. La fenêtre de saisie annoncée (« 7 jours ») en valait donc 8, et une
// équipe de nuit ne pouvait pas saisir « aujourd'hui ».
export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

// Date ISO d'il y a n jours
export function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return toISODate(d)
}

// Lundi de la semaine contenant `ref` (par défaut aujourd'hui)
export function startOfWeek(ref: Date = new Date()): Date {
  const d = new Date(ref)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=dim, 1=lun...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function endOfWeek(ref: Date = new Date()): Date {
  const d = startOfWeek(ref)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

// La date ISO `dateStr` est-elle dans la semaine courante ?
export function isInCurrentWeek(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00')
  return d >= startOfWeek() && d <= endOfWeek()
}

// La date ISO `dateStr` est-elle dans le mois courant ?
export function isInCurrentMonth(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

// La date ISO `dateStr` appartient-elle au mois `YYYY-MM` ?
export function isInMonthKey(dateStr: string, monthKey: string): boolean {
  return dateStr.slice(0, 7) === monthKey
}

// Clé du mois courant au format 'YYYY-MM'.
// Construite sur les composantes LOCALES : `toISOString` convertit en UTC, et le
// 1er du mois avant 2 h du matin (heure d'été française) elle renvoyait encore
// le mois précédent — un écran censé s'ouvrir sur le mois en cours affichait
// alors le mauvais mois.
export function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Liste des jours (ISO) d'un mois 'AAAA-MM', du 1er au dernier.
export function joursDuMois(monthKey: string): string[] {
  const [y, m] = monthKey.split('-').map(Number)
  const nb = new Date(Date.UTC(y, m, 0)).getUTCDate() // jour 0 du mois suivant
  const out: string[] = []
  for (let d = 1; d <= nb; d++) {
    out.push(`${monthKey}-${String(d).padStart(2, '0')}`)
  }
  return out
}

// Décale un mois 'AAAA-MM' de n mois (n négatif = vers le passé).
export function decalerMois(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Libellé lisible d'un mois 'YYYY-MM' (ex: "juillet 2026").
export function formatMonthFr(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

export function formatDateFr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}

// Format numérique dd/mm/yyyy (ex. bornes d'une période de congés).
export function formatDateFrNum(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
