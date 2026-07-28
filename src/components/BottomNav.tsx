import { NavLink } from 'react-router-dom'

// ============================================================================
// BottomNav — barre de navigation basse pour l'espace employé sur mobile.
//
// Quatre destinations essentielles (Accueil · Saisir · Congés · Aide), icône +
// libellé, grandes cibles (≥ 44px), item actif mis en évidence. Masquée sur
// desktop par CSS (voir styles.css) : la nav existante y reste seule.
// ============================================================================

interface Item {
  to: string
  label: string
  icon: string
  end?: boolean
}

const ITEMS: Item[] = [
  { to: '/', label: 'Accueil', icon: '🏠', end: true },
  { to: '/saisie', label: 'Saisir', icon: '🕒' },
  { to: '/conges', label: 'Congés', icon: '🌴' },
  { to: '/aide', label: 'Aide', icon: '💡' },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className="bottom-nav-item"
        >
          <span className="bottom-nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
