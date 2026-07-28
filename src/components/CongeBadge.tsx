import type { StatutConge } from '../types'

// Réutilise les classes `.badge.*` existantes (pas de nouvelle couleur).
// `demandee` emprunte le style "en attente" (jaune). Statut homogène avec
// StatusBadge : couleur + libellé + icône.
const META: Record<StatutConge, { cls: string; label: string; icon: string }> = {
  demandee: { cls: 'en_attente', label: 'Demandée', icon: '⏳' },
  validee: { cls: 'validee', label: 'Validée', icon: '✓' },
  refusee: { cls: 'refusee', label: 'Refusée', icon: '✕' },
}

export default function CongeBadge({ statut }: { statut: StatutConge }) {
  const { cls, label, icon } = META[statut]
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-icon" aria-hidden="true">
        {icon}
      </span>
      {label}
    </span>
  )
}
