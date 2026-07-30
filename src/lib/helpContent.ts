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
      // N'apparaît à l'écran que pour les personnes concernées, mais l'aide le
      // mentionne : c'est le geste le plus facile à oublier.
      'Si vous avez deux contrats, choisissez d’abord « Pour quel contrat ? » en haut : vos heures seront comptées sur celui-là.',
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
      'Si vous avez deux contrats, choisissez d’abord « Pour quel contrat ? » : chaque contrat a ses propres jours de congés.',
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
    lines: [
      'Générez le récapitulatif mensuel des heures pour le comptable (CSV ou Excel).',
      'Choisissez le mois et l’équipe, vérifiez l’aperçu, puis exportez.',
      'Après export, les saisies sont verrouillées : seul un responsable peut les rouvrir.',
    ],
  },
  '/responsable/feuille': {
    title: 'Feuille mensuelle',
    lines: [
      'Choisissez un collaborateur et un mois : vous voyez chaque jour, ses heures et son statut.',
      'Les congés validés, les jours fériés et les week-ends sont indiqués.',
      'Les totaux en bas suivent exactement les règles de l’export comptable.',
    ],
  },
  '/saisie-collegue': {
    title: 'Saisir pour un collègue',
    lines: [
      'Vous êtes autorisé à noter les heures de certains collègues.',
      'Choisissez la personne, puis remplissez comme pour vous.',
      'Si un collègue manque dans la liste, demandez à votre responsable.',
    ],
  },
  '/responsable': {
    title: 'Saisir pour un collaborateur',
    lines: [
      'Notez les heures à la place d’un collaborateur (absence, oubli, pas de téléphone).',
      'La saisie garde votre nom comme auteur : la traçabilité est conservée.',
    ],
  },

  // ------------------------------ Administration ---------------------------
  '/responsable/familles': {
    title: 'Équipes',
    lines: [
      'Une équipe regroupe des collaborateurs qui saisissent de la même façon.',
      'Journée continue = une heure de début et de fin. Demi-journées = matin et après-midi.',
      'La pause déduite s’applique par défaut aux saisies de l’équipe.',
    ],
  },
  '/responsable/collaborateurs': {
    title: 'Collaborateurs',
    lines: [
      'Créez et modifiez les fiches : équipe, contrat, quotas de congés, délégations.',
      'La délégation autorise une personne à saisir les heures d’une autre.',
      'Une personne ayant DEUX contrats (deux mi-temps) a DEUX fiches ici, une par contrat. On les relie ensuite sur son compte, dans Utilisateurs.',
      '« Importer » permet de créer plusieurs collaborateurs depuis un fichier.',
    ],
  },
  '/responsable/politique-conges': {
    title: 'Politique de congés',
    lines: [
      'Réglez, pour chaque type à solde, la période de référence et l’acquisition.',
      'Le quota fixé ici sert de valeur par défaut si le contrat n’en précise pas.',
      'Pour l’ancienneté, définissez les paliers (à partir de X ans → Y jours).',
    ],
  },
  '/responsable/admin/modeles': {
    title: 'Modèles de contrat',
    lines: [
      'Un modèle pré-remplit les contrats : base horaire, seuil d’heures sup, congés.',
      '« Décompte des congés » choisit jours ouvrés (lun–ven) ou ouvrables (lun–sam).',
      'Modifier un modèle ne change pas les contrats déjà créés.',
    ],
  },
  '/responsable/admin/absences': {
    title: "Types d'absence",
    lines: [
      'Ces types alimentent le menu des demandes de congé.',
      'Un type « à solde » porte son propre compteur (acquis / pris / restant).',
      'Vous pouvez ajouter, modifier ou supprimer un type non utilisé.',
    ],
  },
  '/responsable/admin/feries': {
    title: 'Jours fériés',
    lines: [
      'Les fériés nationaux sont calculés automatiquement : jamais décomptés des congés.',
      'Ajoutez ici un pont chômé, ou marquez un férié comme travaillé pour qu’il soit décompté.',
    ],
  },
  '/responsable/admin/utilisateurs': {
    title: 'Utilisateurs',
    lines: [
      'Gérez les comptes de connexion : création, rôle, collaborateur rattaché.',
      '« Modifier » permet aussi de réinitialiser un mot de passe oublié.',
      'Un employé doit être rattaché à un collaborateur pour saisir ses heures.',
      'Deux contrats pour la même personne ? Créez DEUX fiches collaborateur, puis cochez la seconde dans « Autres contrats de cette personne » : elle n’aura qu’un seul mot de passe.',
    ],
  },
  '/responsable/admin/regles': {
    title: 'Règles générales',
    lines: [
      'Fenêtre de saisie rétroactive (par défaut 7 jours), seuil d’heures sup par défaut.',
      'Le verrouillage après export empêche toute modification des heures envoyées.',
    ],
  },
  '/responsable/admin/parametrage': {
    title: 'Paramétrage',
    lines: [
      'Exportez la configuration (équipes, contrats, congés, fériés, règles) dans un fichier.',
      'Ce fichier permet de retrouver vos réglages sur un nouveau serveur, sans tout ressaisir.',
      'À l’import, un aperçu s’affiche avant enregistrement ; rien n’est jamais supprimé.',
      '« Remise à zéro » efface toutes les données saisies, les collaborateurs et les comptes sauf le vôtre — le paramétrage est conservé. Exportez-le avant, par sécurité.',
    ],
  },
  '/responsable/admin/import': {
    title: 'Importer des collaborateurs',
    lines: [
      '1) Téléchargez le modèle de fichier. 2) Remplissez-le. 3) Déposez-le ici.',
      'Un aperçu montre les lignes valides et les erreurs AVANT tout enregistrement.',
      'Les colonnes Nom, Prénom, Identifiant, Équipe et Modèle de contrat sont obligatoires.',
    ],
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
