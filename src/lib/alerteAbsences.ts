// ============================================================================
// ALERTE des absences à venir.
//
// Répond à une question simple : « qui va manquer dans les jours qui viennent,
// et ai-je oublié de traiter une demande ? »
// ============================================================================

import type { Collaborateur, Conge } from '../types'
import { toISODate } from './dates'

export interface AbsenceAVenir {
  conge: Conge
  collab: Collaborateur
  // Nombre de jours entre aujourd'hui et le début (0 = commence aujourd'hui).
  dansJours: number
}

export interface AlerteAbsences {
  // Congés VALIDÉS commençant dans la fenêtre, du plus proche au plus lointain.
  aVenir: AbsenceAVenir[]
  // Demandes encore EN ATTENTE commençant dans la fenêtre. Signalées à part :
  // une absence non validée qui commence dans deux jours est précisément ce
  // qu'il ne faut pas rater, et la noyer parmi les validées la ferait passer
  // pour un dossier réglé.
  enAttente: AbsenceAVenir[]
}

// Nombre de jours calendaires entre deux dates ISO (b - a).
function ecartJours(a: string, b: string): number {
  const ms =
    new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()
  return Math.round(ms / 86_400_000)
}

// Construit l'alerte.
//
// La fenêtre couvre TOUT l'intervalle [aujourd'hui ; aujourd'hui + x] et non le
// seul jour J-x : un responsable qui ne se connecte pas le bon jour raterait
// sinon l'alerte définitivement.
//
// Un congé DÉJÀ COMMENCÉ mais non terminé est également retenu : sur le moment,
// « qui manque aujourd'hui » compte autant que « qui manquera jeudi ».
export function calculerAlerteAbsences(
  conges: Conge[],
  collaborateurs: Collaborateur[],
  aujourdhui: string,
  fenetreJours: number,
): AlerteAbsences {
  const vide: AlerteAbsences = { aVenir: [], enAttente: [] }
  if (fenetreJours <= 0) return vide

  const limite = new Date(aujourdhui + 'T12:00:00')
  limite.setDate(limite.getDate() + fenetreJours)
  // `toISODate` et non `toISOString` : ce dernier convertit en UTC et décale la
  // date d'un jour selon l'heure locale.
  const limiteISO = toISODate(limite)

  // Seuls les collaborateurs SUIVIS. `alerteAbsences` absent vaut `true` :
  // une fiche antérieure au réglage reste couverte.
  const suivis = new Map(
    collaborateurs
      .filter((c) => c.alerteAbsences !== false)
      .map((c) => [c.id, c]),
  )

  const retenir = (c: Conge): AbsenceAVenir | null => {
    const collab = suivis.get(c.collaborateurId)
    if (!collab) return null
    // Congé terminé : plus rien à annoncer.
    if (c.dateFin < aujourdhui) return null
    // Commence après la fenêtre : trop tôt pour en parler.
    if (c.dateDebut > limiteISO) return null
    return { conge: c, collab, dansJours: Math.max(0, ecartJours(aujourdhui, c.dateDebut)) }
  }

  const parProximite = (a: AbsenceAVenir, b: AbsenceAVenir) =>
    a.dansJours - b.dansJours ||
    `${a.collab.nom} ${a.collab.prenom}`.localeCompare(
      `${b.collab.nom} ${b.collab.prenom}`,
      'fr',
    )

  for (const c of conges) {
    const item = retenir(c)
    if (!item) continue
    if (c.statut === 'validee') vide.aVenir.push(item)
    else if (c.statut === 'demandee') vide.enAttente.push(item)
  }

  vide.aVenir.sort(parProximite)
  vide.enAttente.sort(parProximite)
  return vide
}

// Formulation lisible du délai. « dans 0 jour » ne se dit pas.
export function libelleDelai(dansJours: number, dateDebut: string, aujourdhui: string): string {
  if (dateDebut < aujourdhui) return 'en cours'
  if (dansJours === 0) return "aujourd'hui"
  if (dansJours === 1) return 'demain'
  return `dans ${dansJours} jours`
}
