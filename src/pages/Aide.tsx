import { Link } from 'react-router-dom'
import { HELP_PHONE } from '../lib/helpContent'

// ============================================================================
// Page « Aide » — FAQ simple, accessible à tous (route /aide).
//
// Grandes questions, réponses courtes, vouvoiement. Pensée pour rassurer des
// employés peu à l'aise avec les outils.
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

export default function Aide() {
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
