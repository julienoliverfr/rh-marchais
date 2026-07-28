import type { CongeType, DemiJour, TypeAbsence } from '../types'

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

// Nombre de jours ouvrés (lundi→vendredi) inclus dans [dateDebut ; dateFin].
// Une demi-journée (demiJour ≠ 'aucune', uniquement si dateDebut === dateFin)
// compte 0.5. Retourne 0 si l'intervalle est invalide (fin < début).
export function computeNbJours(
  dateDebut: string,
  dateFin: string,
  demiJour: DemiJour,
): number {
  if (!dateDebut || !dateFin) return 0
  const start = new Date(dateDebut + 'T12:00:00')
  const end = new Date(dateFin + 'T12:00:00')
  if (end < start) return 0

  // Demi-journée : uniquement sur une seule date, et si ce jour est ouvré.
  if (demiJour !== 'aucune' && dateDebut === dateFin) {
    return isWeekday(start) ? 0.5 : 0
  }

  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    if (isWeekday(cur)) count += 1
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function isWeekday(d: Date): boolean {
  const day = d.getDay() // 0 = dimanche, 6 = samedi
  return day >= 1 && day <= 5
}
