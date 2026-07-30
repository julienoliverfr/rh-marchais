// ============================================================================
// Vue des PRÉSENCES — état d'un collaborateur, jour par jour.
//
// Cette bibliothèque ne fait qu'une chose : dire dans quel état se trouve une
// personne un jour donné. L'écran s'occupe de l'affichage.
//
// L'ORDRE de résolution des états est le cœur du sujet, et il n'est pas
// intuitif — voir `etatJour`.
// ============================================================================

import type { Collaborateur, Conge, CongeType, Saisie } from '../types'

// Abréviations affichées dans les cellules. Un tableau de 31 colonnes n'a pas
// la place d'un libellé complet ; le nom entier reste dans l'infobulle.
export const CONGE_ABBR: Record<CongeType, string> = {
  conge_paye: 'CP',
  rtt: 'RTT',
  anciennete: 'ANC',
  maladie: 'MAL',
  sans_solde: 'SS',
}

export type EtatJour =
  // Hors contrat : avant l'embauche ou après la sortie des effectifs.
  | { type: 'hors' }
  // À venir : le jour n'est pas encore arrivé, il n'y a rien à reprocher.
  | { type: 'futur' }
  // Heures saisies (quel que soit leur statut de validation).
  | { type: 'present'; minutes: number; statut: Saisie['statut'] }
  // Congé VALIDÉ couvrant ce jour.
  | { type: 'conge'; code: CongeType; demi: boolean }
  // Week-end ou jour férié chômé.
  | { type: 'chome'; label: string }
  // Ni heures, ni congé, sur un jour ouvert et déjà passé.
  | { type: 'aExpliquer' }

export interface ContexteJour {
  // Jours fériés du mois : date ISO → { label, chome }.
  feries: Map<string, { label: string; chome: boolean }>
  // Date du jour (ISO), pour distinguer le passé de l'avenir.
  aujourdhui: string
}

// Le collaborateur est-il sous contrat à cette date ?
function sousContrat(c: Collaborateur, date: string): boolean {
  const debut = c.contrat.dateDebut
  if (debut && date < debut) return false
  if (c.dateSortie && date > c.dateSortie) return false
  return true
}

// État d'UN collaborateur un jour donné.
//
// L'ordre de priorité est délibéré :
//   1. hors contrat  — ne rien reprocher à quelqu'un qui n'était pas là ;
//   2. heures saisies — elles PRIMENT sur le week-end et sur le férié. Un
//      samedi de vendanges est une journée travaillée, pas une case grise ;
//      l'inverse aurait effacé du travail réellement effectué ;
//   3. congé validé ;
//   4. week-end / férié chômé ;
//   5. jour à venir — personne n'a encore pu travailler ;
//   6. sinon : à expliquer.
//
// Le dernier état ne dit PAS « absent injustifié ». Un trou est le plus souvent
// un simple oubli de saisie ; trancher à la place du responsable serait une
// accusation que la donnée ne permet pas de porter.
export function etatJour(
  collab: Collaborateur,
  date: string,
  saisieDuJour: Saisie | undefined,
  congesValides: Conge[],
  ctx: ContexteJour,
): EtatJour {
  if (!sousContrat(collab, date)) return { type: 'hors' }

  if (saisieDuJour) {
    return {
      type: 'present',
      minutes: saisieDuJour.totalMinutes,
      statut: saisieDuJour.statut,
    }
  }

  const conge = congesValides.find((c) => date >= c.dateDebut && date <= c.dateFin)
  if (conge) {
    return {
      type: 'conge',
      code: conge.type,
      demi: conge.demiJour !== 'aucune' && conge.dateDebut === conge.dateFin,
    }
  }

  const ferie = ctx.feries.get(date)
  if (ferie?.chome) return { type: 'chome', label: ferie.label }
  const jour = new Date(date + 'T12:00:00').getDay()
  if (jour === 0 || jour === 6) return { type: 'chome', label: 'Week-end' }

  if (date > ctx.aujourdhui) return { type: 'futur' }

  return { type: 'aExpliquer' }
}

// Compteurs de fin de ligne.
export interface TotauxLigne {
  presents: number
  conges: number
  aExpliquer: number
}

export function totauxLigne(etats: EtatJour[]): TotauxLigne {
  const t: TotauxLigne = { presents: 0, conges: 0, aExpliquer: 0 }
  for (const e of etats) {
    if (e.type === 'present') t.presents++
    else if (e.type === 'conge') t.conges++
    else if (e.type === 'aExpliquer') t.aExpliquer++
  }
  return t
}
