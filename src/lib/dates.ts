// Utilitaires de dates (semaine ISO lundi->dimanche, bornes de saisie).

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Date ISO d'il y a n jours
export function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
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
export function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
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
