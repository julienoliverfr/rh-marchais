// Jours fériés français (métropole) — calculés, y compris les fériés MOBILES
// liés à Pâques (lundi de Pâques, Ascension, lundi de Pentecôte). Ils sont
// traités comme CHÔMÉS : jamais décomptés d'un congé, quel que soit le mode de
// décompte (jours ouvrés ou ouvrables). Un cache par année évite de recalculer.
//
// Note : l'Alsace-Moselle a 2 fériés supplémentaires (Vendredi saint, 26/12) —
// hors périmètre (ETS Marchais est en Charente-Maritime). On pourra plus tard
// ajouter des jours spécifiques (ponts, fériés locaux) via un paramétrage.

const cacheParAnnee = new Map<number, Set<string>>()

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

// yyyy-mm-dd d'une date construite en UTC (composants calendaires directs).
function isoUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function feriesDeLAnnee(annee: number): Set<string> {
  const existant = cacheParAnnee.get(annee)
  if (existant) return existant

  const set = new Set<string>()
  // Fériés à date fixe : Jour de l'An, Fête du Travail, Victoire 1945, Fête
  // Nationale, Assomption, Toussaint, Armistice, Noël.
  const fixes: ReadonlyArray<readonly [number, number]> = [
    [1, 1], [5, 1], [5, 8], [7, 14], [8, 15], [11, 1], [11, 11], [12, 25],
  ]
  for (const [mo, jo] of fixes) set.add(`${annee}-${pad2(mo)}-${pad2(jo)}`)

  // Fériés mobiles, comptés à partir du dimanche de Pâques.
  const p = paques(annee)
  const base = new Date(Date.UTC(annee, p.mois - 1, p.jour))
  for (const delta of [1, 39, 50]) {
    // 1 = lundi de Pâques · 39 = Ascension (jeudi) · 50 = lundi de Pentecôte
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + delta)
    set.add(isoUTC(d))
  }

  cacheParAnnee.set(annee, set)
  return set
}

// La date ISO (yyyy-mm-dd) est-elle un jour férié français chômé ?
export function estFerie(dateISO: string): boolean {
  const jour = dateISO.slice(0, 10)
  const annee = Number(jour.slice(0, 4))
  if (!annee) return false
  return feriesDeLAnnee(annee).has(jour)
}
