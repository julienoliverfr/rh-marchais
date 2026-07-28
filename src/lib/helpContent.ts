// ============================================================================
// Contenu de l'AIDE CONTEXTUELLE (panneau « ? Aide »).
//
// Une entrée par écran, retrouvée à partir de la route courante. Le ton est
// simple, rassurant et en vouvoiement : pensé pour des employés peu à l'aise
// avec les outils. Aucun jargon technique en surface.
// ============================================================================

export interface HelpContent {
  // Titre court affiché en haut du panneau.
  title: string
  // Une à trois phrases OU étapes. Chaque entrée est affichée sur sa ligne.
  lines: string[]
}

// Numéro d'assistance affiché en bas du panneau et sur la page d'aide.
export const HELP_PHONE = '05 46 04 10 30'

// Aide générique (route inconnue).
const FALLBACK: HelpContent = {
  title: 'Aide',
  lines: [
    'Touchez « ? Aide » sur chaque écran pour savoir quoi faire ici.',
  ],
}

// Table route → contenu. Les clés sont comparées au chemin courant.
const HELP_BY_PATH: Record<string, HelpContent> = {
  '/login': {
    title: 'Se connecter',
    lines: [
      'Entrez votre identifiant et votre mot de passe, puis touchez « Se connecter ».',
      'Si vous les avez oubliés, demandez à votre responsable.',
    ],
  },
  '/': {
    title: 'Votre accueil',
    lines: [
      'Voici votre résumé.',
      'En haut : vos heures de la semaine et vos congés restants.',
      'Pour noter vos heures, touchez « Saisir mes heures ».',
    ],
  },
  '/saisie': {
    title: 'Noter mes heures',
    lines: [
      '1) Choisissez le jour.',
      "2) Entrez l'heure de début et l'heure de fin.",
      '3) Vérifiez le total, puis touchez « Enregistrer ».',
      'Vous pouvez noter un jour oublié jusqu’à une semaine en arrière.',
    ],
  },
  '/historique': {
    title: 'Mon historique',
    lines: [
      'C’est la liste de vos journées.',
      'La pastille de couleur montre où en est chaque saisie.',
      'Touchez une journée non validée pour la corriger.',
    ],
  },
  '/conges': {
    title: 'Mes congés',
    lines: [
      'Chaque carte montre les jours qu’il vous reste, par type de congé.',
      'Pour poser des congés : touchez « Demander un congé », choisissez le type et les dates, puis envoyez.',
      'Votre responsable reçoit la demande.',
    ],
  },
  '/responsable/validations': {
    title: 'Validations',
    lines: ['Validez ou refusez les heures saisies par votre équipe.'],
  },
  '/responsable/conges': {
    title: 'Congés',
    lines: [
      'Approuvez ou refusez les demandes de congés ; le solde se met à jour tout seul.',
    ],
  },
  '/responsable/exports': {
    title: 'Exports',
    lines: ['Générez le fichier des heures pour le comptable.'],
  },
}

// Retrouve l'aide de l'écran courant à partir du chemin.
export function getHelpForPath(pathname: string): HelpContent {
  // Correspondance exacte prioritaire.
  const exact = HELP_BY_PATH[pathname]
  if (exact) return exact

  // Toutes les pages d'administration partagent une aide brève.
  if (pathname.startsWith('/responsable/admin')) {
    return { title: 'Administration', lines: ['Réglages de l’application.'] }
  }

  return FALLBACK
}
