import type { CongeType, DecompteJours, DemiJour, TypeAbsence } from '../types'
import { estFerie } from './feries'

// Résout les quotas de congés PAR TYPE d'un modèle ou d'un contrat, en gérant la
// MIGRATION ascendante des données historiques : si `quotasParType` est absent
// mais qu'un ancien `congesSolde` (solde CP unique) est présent, on le replie sur
// `{ conge_paye: congesSolde }`. Renvoie un objet vide si rien n'est défini
// (→ le moteur retombe alors sur le quota par défaut de la politique de chaque
// type). Ne mute jamais la source.
export function quotasParTypeDe(source: {
  quotasParType?: Partial<Record<CongeType, number>>
  congesSolde?: number
}): Partial<Record<CongeType, number>> {
  if (source.quotasParType) return source.quotasParType
  if (typeof source.congesSolde === 'number') {
    return { conge_paye: source.congesSolde }
  }
  return {}
}

// Libellés de repli des types d'absence (utilisés si la config `typesAbsence`
// n'est pas disponible ; sinon on affiche le libellé paramétré par l'admin).
export const CONGE_TYPE_LABELS: Record<CongeType, string> = {
  conge_paye: 'Congé payé',
  maladie: 'Maladie',
  sans_solde: 'Sans solde',
  rtt: 'RTT',
  anciennete: 'Ancienneté',
}

// Un type d'absence porte-t-il un compteur de solde ? Gère la MIGRATION des
// données historiques : si `aSolde` est absent, on retombe sur l'ancien
// `decrementeCp` (les congés payés étaient alors le seul type à solde).
export function typeASolde(t: TypeAbsence): boolean {
  return t.aSolde ?? t.decrementeCp ?? false
}

// Legacy (Étape 3) : seul le congé payé décomptait le solde CP. Conservé pour
// compat ; le décompte est désormais générique et vise le solde DE CHAQUE type
// à solde (voir typeASolde + lib/soldes.ts).
export function decompteSoldeCp(type: CongeType): boolean {
  return type === 'conge_paye'
}

// Nombre de jours décomptés d'un congé sur [dateDebut ; dateFin], selon le mode :
//  - 'ouvres'    : lundi → vendredi
//  - 'ouvrables' : lundi → samedi (le samedi est décompté même s'il n'est pas
//                  travaillé)
// Les JOURS FÉRIÉS chômés ne sont JAMAIS décomptés (dans les deux modes).
// Une demi-journée (demiJour ≠ 'aucune', uniquement si dateDebut === dateFin)
// compte 0.5 si ce jour est décomptable. Retourne 0 si l'intervalle est invalide.
// `mode` absent (données historiques) = 'ouvres' (comportement antérieur).
export function computeNbJours(
  dateDebut: string,
  dateFin: string,
  demiJour: DemiJour,
  mode: DecompteJours = 'ouvres',
): number {
  if (!dateDebut || !dateFin) return 0
  const start = new Date(dateDebut + 'T12:00:00')
  const end = new Date(dateFin + 'T12:00:00')
  if (end < start) return 0

  // Demi-journée : uniquement sur une seule date, et si ce jour est décomptable.
  if (demiJour !== 'aucune' && dateDebut === dateFin) {
    return estJourDecompte(start, mode) ? 0.5 : 0
  }

  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    if (estJourDecompte(cur, mode)) count += 1
    cur.setDate(cur.getDate() + 1)
  }

  // --- Mode OUVRABLES : prolongation jusqu'à la veille de la reprise ---------
  // Règle légale : le décompte court du 1er jour ouvrable d'absence JUSQU'AU
  // DERNIER JOUR OUVRABLE PRÉCÉDANT LA REPRISE (service-public.gouv.fr F2258).
  // Si le congé se termine juste avant le repos hebdomadaire, le samedi tombe
  // donc DANS la période décomptée, même s'il n'est pas travaillé.
  //   · congé lun→mer, reprise jeudi  → 3 j (aucune prolongation)
  //   · congé mer→ven, reprise lundi  → 4 j (le samedi est décompté)
  // On avance après `dateFin` tant que les jours ne sont PAS travaillés
  // (samedi/dimanche/férié chômé) et on s'arrête au 1er jour de reprise ; seuls
  // les jours décomptables rencontrés (le samedi) s'ajoutent.
  if (mode === 'ouvrables') {
    const suite = new Date(end)
    suite.setDate(suite.getDate() + 1)
    // Garde-fou : 7 itérations max (une semaine suffit à retrouver la reprise).
    for (let i = 0; i < 7 && !estJourTravaille(suite); i++) {
      if (estJourDecompte(suite, mode)) count += 1
      suite.setDate(suite.getDate() + 1)
    }
  }
  return count
}

// Jour de travail habituel de l'entreprise : lundi→vendredi, hors férié chômé.
// Sert à repérer le jour de REPRISE (fin de la fenêtre de décompte).
function estJourTravaille(d: Date): boolean {
  const jour = d.getDay()
  if (jour < 1 || jour > 5) return false
  return !estFerie(isoLocal(d))
}

// Un jour est décomptable s'il tombe dans la semaine couverte par le mode
// (lun–ven ou lun–sam) ET qu'il n'est pas férié.
function estJourDecompte(d: Date, mode: DecompteJours): boolean {
  const jour = d.getDay() // 0 = dimanche … 6 = samedi
  const dernierJour = mode === 'ouvrables' ? 6 : 5
  if (jour < 1 || jour > dernierJour) return false
  return !estFerie(isoLocal(d))
}

// yyyy-mm-dd à partir des composants LOCAUX (les dates sont créées à midi local,
// donc getFullYear/Month/Date donnent bien la date calendaire voulue).
function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
