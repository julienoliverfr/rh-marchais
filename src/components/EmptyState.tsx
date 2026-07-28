import type { ReactNode } from 'react'

// ============================================================================
// EmptyState — écran vide qui GUIDE au lieu de dérouter.
//
// Une grande icône, une phrase rassurante et, si besoin, un bouton d'action.
// Réutilise les classes existantes (`card`, `btn`).
// ============================================================================

interface EmptyStateProps {
  // Emoji / icône décorative (purement visuelle).
  icon?: string
  // Phrase d'explication (vouvoiement).
  text: string
  // Bouton d'action optionnel.
  action?: ReactNode
}

export default function EmptyState({ icon = '📝', text, action }: EmptyStateProps) {
  return (
    <div className="card empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="empty-state-text">{text}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
