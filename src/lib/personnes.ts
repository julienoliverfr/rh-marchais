import type { Compte, Saisie } from '../types'
import { totalSemaineMinutesForDate } from './hours'

// ============================================================================
// Regroupement des CONTRATS appartenant à une MÊME PERSONNE.
//
// Une personne peut cumuler plusieurs contrats chez nous (deux mi-temps sur des
// activités différentes) : chacun a sa propre fiche collaborateur, son solde de
// congés et son seuil d'heures supplémentaires.
//
// MAIS les durées maximales de travail s'apprécient sur la PERSONNE, pas sur le
// contrat : deux mi-temps de 25 h font 50 h par semaine — au-delà du plafond
// légal — alors que chaque contrat, pris isolément, paraît parfaitement normal.
// Sans ce regroupement, le dépassement est INVISIBLE.
//
// Le lien entre contrats passe par le COMPTE de connexion
// (`collaborateurId` + `collaborateursSecondaires`).
// ============================================================================

// Plafond hebdomadaire légal (heures), toutes activités confondues.
export const PLAFOND_HEBDO_HEURES = 48

// Table `collaborateurId -> tous les contrats de la même personne`.
// Un collaborateur sans cumul n'y figure pas (cas courant, aucun surcoût).
export function contratsParPersonne(comptes: Compte[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const c of comptes) {
    const ids = [c.collaborateurId, ...(c.collaborateursSecondaires ?? [])].filter(
      (id): id is string => Boolean(id),
    )
    if (ids.length < 2) continue // pas de cumul : rien à signaler
    for (const id of ids) map.set(id, ids)
  }
  return map
}

export interface CumulPersonne {
  // Total de la semaine, TOUS CONTRATS confondus (minutes).
  totalMinutes: number
  // Nombre de contrats agrégés (> 1 sinon on ne calcule pas).
  nbContrats: number
  depassement: boolean
}

// Cumul hebdomadaire d'une personne pour la semaine contenant `date`, ou null
// si ce collaborateur n'a qu'un seul contrat (rien de particulier à afficher).
export function cumulSemainePersonne(
  saisies: Saisie[],
  collaborateurId: string,
  date: string,
  groupes: Map<string, string[]>,
): CumulPersonne | null {
  const contrats = groupes.get(collaborateurId)
  if (!contrats || contrats.length < 2) return null
  const totalMinutes = contrats.reduce(
    (acc, id) => acc + totalSemaineMinutesForDate(saisies, id, date),
    0,
  )
  return {
    totalMinutes,
    nbContrats: contrats.length,
    depassement: totalMinutes > PLAFOND_HEBDO_HEURES * 60,
  }
}
