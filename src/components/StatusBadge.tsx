import type { StatutSaisie } from '../types'

// Statut homogène : couleur (classe `.badge.<statut>`) + libellé + icône.
const META: Record<StatutSaisie, { label: string; icon: string }> = {
  en_attente: { label: 'En attente', icon: '⏳' },
  validee: { label: 'Validée', icon: '✓' },
  refusee: { label: 'Refusée', icon: '✕' },
  verrouillee: { label: 'Verrouillée', icon: '🔒' },
}

// Une saisie est modifiable tant qu'elle est en attente OU refusée
// (l'employé peut corriger un refus ; la correction la repasse en attente).
export function isEditable(statut: StatutSaisie): boolean {
  return statut === 'en_attente' || statut === 'refusee'
}

export default function StatusBadge({ statut }: { statut: StatutSaisie }) {
  const { label, icon } = META[statut]
  return (
    <span className={`badge ${statut}`}>
      <span className="badge-icon" aria-hidden="true">
        {icon}
      </span>
      {label}
    </span>
  )
}
