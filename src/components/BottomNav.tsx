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

// « Aide » n'y figure pas : le bouton flottant « ? » est présent sur TOUS les
// écrans, la place est mieux employée par « Mes journées » — sans quoi, la
// barre du haut étant masquée sur mobile, l'employé n'aurait AUCUN chemin pour
// corriger une saisie refusée.
const ITEMS: Item[] = [
  { to: '/', label: 'Accueil', icon: '🏠', end: true },
  { to: '/saisie', label: 'Saisir', icon: '🕒' },
  { to: '/historique', label: 'Mes journées', icon: '📋' },
  { to: '/conges', label: 'Congés', icon: '🌴' },
]

// Entrée supplémentaire pour un employé ayant reçu une délégation de saisie.
const ITEM_COLLEGUE: Item = { to: '/saisie-collegue', label: 'Collègue', icon: '👥' }

export default function BottomNav({ avecCollegue = false }: { avecCollegue?: boolean }) {
  const items = avecCollegue ? [...ITEMS, ITEM_COLLEGUE] : ITEMS
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {items.map((item) => (
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
