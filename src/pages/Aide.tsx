import { Link } from 'react-router-dom'
import { HELP_PHONE } from '../lib/helpContent'
import { useAuthStore } from '../store/authStore'

// ============================================================================
// Page « Aide » — aide GLOBALE de l'application (route /aide).
//
// Deux niveaux, pour ne pas noyer les employés :
//  1. FAQ employé : questions courantes, phrases courtes, vouvoiement. Toujours
//     affichée.
//  2. Guide responsable / administrateur : affiché UNIQUEMENT aux responsables.
//     Couvre chaque écran d'administration + les règles de gestion appliquées
//     par l'application (celles qui expliquent les chiffres affichés).
// ============================================================================

interface Faq {
  q: string
  a: string
}

const FAQS: Faq[] = [
  {
    q: 'Comment noter mes heures ?',
    a: 'Ouvrez « Saisir mes heures ». Choisissez le jour, entrez l’heure de début et de fin, vérifiez le total, touchez « Enregistrer ».',
  },
  {
    q: 'J’ai oublié un jour.',
    a: 'Vous pouvez noter un jour passé jusqu’à une semaine en arrière : dans la saisie, choisissez simplement le bon jour.',
  },
  {
    q: 'Comment poser un congé ?',
    a: 'Ouvrez « Mes congés », touchez « Demander un congé », choisissez le type et les dates, puis envoyez.',
  },
  {
    q: 'Ma saisie est « refusée », que faire ?',
    a: 'Ouvrez-la, corrigez-la, et renvoyez-la : elle repart en validation.',
  },
  {
    q: 'Je ne peux plus modifier une journée.',
    a: 'Une fois validée (🔒), seul votre responsable peut la rouvrir. Demandez-lui.',
  },
  {
    q: 'Voir mes congés restants ?',
    a: 'Dans « Mes congés », chaque carte montre vos jours restants par type.',
  },
  {
    q: 'Puis-je saisir pour un collègue ?',
    a: 'Seulement si votre responsable vous y a autorisé. Dans ce cas, l’écran « Saisir pour un collègue » apparaît dans le menu.',
  },
]

// Signification des couleurs (pastilles), avec la même phrase que les bulles « ? ».
const COULEURS: { cls: string; label: string; texte: string }[] = [
  {
    cls: 'en_attente',
    label: 'En attente',
    texte: 'Votre responsable doit encore valider.',
  },
  { cls: 'validee', label: 'Validé', texte: 'C’est accepté et enregistré.' },
  {
    cls: 'refusee',
    label: 'Refusé',
    texte: 'À corriger : votre responsable a renvoyé la saisie.',
  },
  {
    cls: 'verrouillee',
    label: 'Verrouillé',
    texte:
      'Enregistré définitivement (envoyé au comptable). Seul un responsable peut le rouvrir.',
  },
]

// --- Guide responsable : un bloc par écran, avec le lien direct -------------
interface GuideEntry {
  titre: string
  to?: string
  lignes: string[]
}

const GUIDE_QUOTIDIEN: GuideEntry[] = [
  {
    titre: 'Validations',
    to: '/responsable/validations',
    lignes: [
      'Validez ou refusez les heures saisies. Un refus demande un motif : il est renvoyé au salarié pour correction.',
      'Le cumul de la semaine et les heures supplémentaires sont affichés en face de chaque saisie.',
      'Une saisie validée est verrouillée ; vous seul pouvez la rouvrir.',
    ],
  },
  {
    titre: 'Congés',
    to: '/responsable/conges',
    lignes: [
      'Approuvez ou refusez les demandes ; le solde du type concerné se met à jour automatiquement.',
      '« Restant après » montre le solde qu’il restera si vous approuvez (un solde négatif est signalé).',
      '« Ajuster les jours » corrige à la main le nombre décompté : un motif est obligatoire et l’opération est tracée dans le journal.',
      'La section « Soldes » permet d’allouer manuellement un acquis pour une période donnée.',
    ],
  },
  {
    titre: 'Exports comptables',
    to: '/responsable/exports',
    lignes: [
      'Choisissez le mois et l’équipe, vérifiez l’aperçu, puis exportez en CSV ou Excel.',
      'Le fichier contient les heures normales, les heures supplémentaires et les absences par type.',
      'Après export, les saisies sont verrouillées pour garantir la cohérence avec la paie.',
    ],
  },
]

const GUIDE_ADMIN: GuideEntry[] = [
  {
    titre: 'Équipes',
    to: '/responsable/familles',
    lignes: [
      'Une équipe définit la façon de saisir : journée continue (début/fin) ou demi-journées.',
      'La pause déduite s’applique par défaut aux saisies de l’équipe.',
      'Une équipe utilisée par des collaborateurs ne peut pas être supprimée.',
    ],
  },
  {
    titre: 'Collaborateurs',
    to: '/responsable/collaborateurs',
    lignes: [
      'Fiche par personne : équipe, contrat (base, seuil d’heures sup, décompte des congés), quotas par type.',
      'La délégation autorise une personne à saisir les heures d’une ou plusieurs autres.',
      '« Importer (CSV / Excel) » crée plusieurs collaborateurs d’un coup, avec un aperçu avant enregistrement.',
    ],
  },
  {
    titre: 'Modèles de contrat',
    to: '/responsable/admin/modeles',
    lignes: [
      'Un modèle pré-remplit les contrats (CDI, CDD, saisonnier) : base, seuil d’heures sup, quotas de congés.',
      '« Décompte des congés » choisit jours ouvrés (lun–ven) ou ouvrables (lun–sam).',
      'Modifier un modèle n’affecte pas les contrats déjà créés.',
    ],
  },
  {
    titre: 'Politique de congés',
    to: '/responsable/politique-conges',
    lignes: [
      'Par type à solde : période de référence, mode d’acquisition (forfait ou mensuel), prorata, report.',
      'Le quota défini ici est la valeur par défaut ; celui du contrat prime s’il est renseigné.',
      'Pour l’ancienneté, réglez les paliers (à partir de X ans → Y jours) : le calcul est ensuite automatique.',
    ],
  },
  {
    titre: "Types d'absence",
    to: '/responsable/admin/absences',
    lignes: [
      'Libellé, justificatif requis, et « à solde » (le type porte alors son propre compteur).',
      'Vous pouvez ajouter, modifier ou supprimer un type ; la suppression est bloquée s’il est déjà utilisé.',
    ],
  },
  {
    titre: 'Jours fériés',
    to: '/responsable/admin/feries',
    lignes: [
      'Les 11 fériés nationaux sont calculés automatiquement chaque année : ils ne sont jamais décomptés des congés.',
      'Ajoutez un pont chômé, ou marquez un férié comme « travaillé » pour qu’il soit décompté.',
    ],
  },
  {
    titre: 'Utilisateurs',
    to: '/responsable/admin/utilisateurs',
    lignes: [
      'Comptes de connexion : identifiant, rôle, collaborateur rattaché.',
      '« Modifier » permet de changer le rôle, le rattachement, ou de réinitialiser un mot de passe oublié.',
      'Un employé non rattaché à un collaborateur ne peut ni saisir ses heures ni poser de congés.',
    ],
  },
  {
    titre: 'Règles générales',
    to: '/responsable/admin/regles',
    lignes: [
      'Fenêtre de saisie rétroactive, seuil d’heures supplémentaires par défaut, verrouillage après export.',
    ],
  },
]

// Règles de gestion appliquées par l'application (expliquent les chiffres).
const REGLES: { q: string; a: string }[] = [
  {
    q: 'Comment sont calculées les heures supplémentaires ?',
    a: 'À la semaine, au-delà du seuil du contrat (35 h par défaut), et SANS majoration : c’est le comptable qui applique la majoration. Elles sont visibles dans les validations et dans l’export mensuel.',
  },
  {
    q: 'Jours ouvrés ou jours ouvrables ?',
    a: 'Ouvrés = lundi à vendredi (≈ 25 j/an). Ouvrables = lundi à samedi (30 j/an) : le samedi est décompté même s’il n’est pas travaillé. Le mode est défini sur le contrat.',
  },
  {
    q: 'Pourquoi un congé du mercredi au vendredi compte 4 jours ?',
    a: 'En jours ouvrables, le décompte va jusqu’au dernier jour ouvrable avant la reprise : si le salarié revient le lundi, le samedi est décompté. En jours ouvrés, il compterait 3 jours.',
  },
  {
    q: 'Et les jours fériés pendant un congé ?',
    a: 'Un férié chômé n’est jamais décompté. S’il est travaillé dans l’entreprise, indiquez-le dans « Jours fériés » : il sera alors décompté.',
  },
  {
    q: 'Jusqu’à quand un salarié peut-il saisir en retard ?',
    a: 'Jusqu’à une semaine en arrière (réglable dans « Règles générales »). Au-delà, seul un responsable peut intervenir.',
  },
  {
    q: 'Qui peut modifier une saisie validée ou exportée ?',
    a: 'Uniquement un responsable. Chaque déverrouillage, correction ou ajustement est enregistré dans le journal d’audit, qui ne peut être ni modifié ni effacé.',
  },
]

export default function Aide() {
  const session = useAuthStore((s) => s.session)
  const estResponsable = session?.role === 'responsable'

  return (
    <div className="aide-page">
      <header className="aide-head">
        <h1 className="aide-title">
          <span aria-hidden="true">💡</span> Aide
        </h1>
        <Link className="btn secondary" to="/">
          Retour
        </Link>
      </header>

      <p className="muted aide-intro">
        Voici les réponses aux questions les plus fréquentes. Prenez votre temps.
        Sur chaque écran, le bouton « ? Aide » explique quoi faire à cet endroit.
      </p>

      <div className="card">
        {FAQS.map((f, i) => (
          <div className="faq-item" key={i}>
            <h2 className="faq-q">{f.q}</h2>
            <p className="faq-a">{f.a}</p>
          </div>
        ))}

        <div className="faq-item">
          <h2 className="faq-q">Que veulent dire les couleurs ?</h2>
          <ul className="faq-couleurs">
            {COULEURS.map((c) => (
              <li key={c.cls}>
                <span className={`badge ${c.cls}`}>{c.label}</span>
                <span className="faq-couleur-texte">{c.texte}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* -------- Guide réservé aux responsables / administrateurs -------- */}
      {estResponsable && (
        <>
          <h2 className="section-title" style={{ marginTop: '1.5rem' }}>
            Guide du responsable
          </h2>
          <p className="muted">
            Votre compte est également administrateur : vous réglez le
            fonctionnement de l’application.
          </p>

          <h3 className="section-title" style={{ marginTop: '1rem' }}>
            Au quotidien
          </h3>
          <div className="card">
            {GUIDE_QUOTIDIEN.map((g) => (
              <div className="faq-item" key={g.titre}>
                <h4 className="faq-q">
                  {g.to ? <Link to={g.to}>{g.titre}</Link> : g.titre}
                </h4>
                {g.lignes.map((l, i) => (
                  <p className="faq-a" key={i}>
                    {l}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <h3 className="section-title" style={{ marginTop: '1rem' }}>
            Paramétrage (Administration)
          </h3>
          <div className="card">
            {GUIDE_ADMIN.map((g) => (
              <div className="faq-item" key={g.titre}>
                <h4 className="faq-q">
                  {g.to ? <Link to={g.to}>{g.titre}</Link> : g.titre}
                </h4>
                {g.lignes.map((l, i) => (
                  <p className="faq-a" key={i}>
                    {l}
                  </p>
                ))}
              </div>
            ))}
          </div>

          <h3 className="section-title" style={{ marginTop: '1rem' }}>
            Règles appliquées par l’application
          </h3>
          <div className="card">
            {REGLES.map((r, i) => (
              <div className="faq-item" key={i}>
                <h4 className="faq-q">{r.q}</h4>
                <p className="faq-a">{r.a}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="card aide-contact">
        Besoin d'aide ? Appelez votre responsable :{' '}
        <a href={`tel:${HELP_PHONE.replace(/\s/g, '')}`}>
          <strong>{HELP_PHONE}</strong>
        </a>
        .
      </div>
    </div>
  )
}
