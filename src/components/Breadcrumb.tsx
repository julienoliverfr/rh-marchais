import { Link } from 'react-router-dom'

// Fil d'Ariane simple et réutilisable pour les pages de configuration.
// Le dernier élément (sans `to`) représente la page courante.
export interface Crumb {
  label: string
  to?: string
}

export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumb" aria-label="Fil d'Ariane">
      {items.map((item, i) => {
        const last = i === items.length - 1
        return (
          <span key={`${item.label}-${i}`} style={{ display: 'inline-flex', gap: '0.4rem' }}>
            {item.to && !last ? (
              <Link to={item.to}>{item.label}</Link>
            ) : (
              <span className="breadcrumb-current" aria-current="page">
                {item.label}
              </span>
            )}
            {!last && (
              <span className="breadcrumb-sep" aria-hidden="true">
                /
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
