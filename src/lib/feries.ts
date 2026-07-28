import type { JourFerie } from '../types'

// Jours fériés français (métropole) — calculés, y compris les fériés MOBILES
// liés à Pâques (lundi de Pâques, Ascension, lundi de Pentecôte). Ils sont
// traités comme CHÔMÉS : jamais décomptés d'un congé, quel que soit le mode de
// décompte (jours ouvrés ou ouvrables).
//
// SURCOUCHE PERSONNALISÉE (Administration → Jours fériés) : une liste de dates
// paramétrées prime sur le calcul. Chaque entrée porte `chome` :
//   - true  → date non décomptée (pont, férié local, jour offert)
//   - false → date décomptée même si c'est un férié national (jour travaillé)
//
// Note : l'Alsace-Moselle a 2 fériés supplémentaires (Vendredi saint, 26/12) —
// hors périmètre national ; ils s'ajoutent au besoin via la surcouche.

export interface FerieCalcule {
  date: string // yyyy-mm-dd
  label: string
}

const cacheListe = new Map<number, FerieCalcule[]>()
const cacheSet = new Map<number, Set<string>>()
// Surcouche : date -> chômé ? (renseignée par setJoursFeriesCustom).
let custom = new Map<string, boolean>()

const pad2 = (n: number): string => String(n).padStart(2, '0')

// Dimanche de Pâques (algorithme grégorien anonyme / Meeus-Jones-Butcher).
function paques(annee: number): { mois: number; jour: number } {
  const a = annee % 19
  const b = Math.floor(annee / 100)
  const c = annee % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31) // 3 = mars, 4 = avril
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return { mois, jour }
}

function isoUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

// Liste (triée) des fériés NATIONAUX calculés pour une année, avec libellés.
export function feriesCalcules(annee: number): FerieCalcule[] {
  const existant = cacheListe.get(annee)
  if (existant) return existant

  const liste: FerieCalcule[] = [
    { date: `${annee}-01-01`, label: "Jour de l'An" },
    { date: `${annee}-05-01`, label: 'Fête du Travail' },
    { date: `${annee}-05-08`, label: 'Victoire 1945' },
    { date: `${annee}-07-14`, label: 'Fête Nationale' },
    { date: `${annee}-08-15`, label: 'Assomption' },
    { date: `${annee}-11-01`, label: 'Toussaint' },
    { date: `${annee}-11-11`, label: 'Armistice 1918' },
    { date: `${annee}-12-25`, label: 'Noël' },
  ]
  const p = paques(annee)
  const base = new Date(Date.UTC(annee, p.mois - 1, p.jour))
  const ajoute = (delta: number, label: string) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + delta)
    liste.push({ date: isoUTC(d), label })
  }
  ajoute(1, 'Lundi de Pâques')
  ajoute(39, 'Ascension')
  ajoute(50, 'Lundi de Pentecôte')

  liste.sort((a, b) => a.date.localeCompare(b.date))
  cacheListe.set(annee, liste)
  return liste
}

function ferieSet(annee: number): Set<string> {
  let s = cacheSet.get(annee)
  if (!s) {
    s = new Set(feriesCalcules(annee).map((f) => f.date))
    cacheSet.set(annee, s)
  }
  return s
}

// Renseigne la surcouche personnalisée (appelée au chargement/màj de la config).
export function setJoursFeriesCustom(entries: JourFerie[]): void {
  custom = new Map(entries.map((e) => [e.date.slice(0, 10), e.chome]))
}

// La date ISO (yyyy-mm-dd) est-elle chômée (non décomptée) ?
// La surcouche personnalisée PRIME sur le calcul national.
export function estFerie(dateISO: string): boolean {
  const jour = dateISO.slice(0, 10)
  const surcouche = custom.get(jour)
  if (surcouche !== undefined) return surcouche
  const annee = Number(jour.slice(0, 4))
  if (!annee) return false
  return ferieSet(annee).has(jour)
}
