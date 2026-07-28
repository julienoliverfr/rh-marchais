import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getHelpForPath, HELP_PHONE } from '../lib/helpContent'

// ============================================================================
// ContextualHelp — bouton « ? Aide » permanent + panneau d'aide de l'écran.
//
// - Bouton flottant, grande cible (≥ 44px), toujours visible.
// - Un clic ouvre un panneau : tiroir latéral (desktop) / plein écran (mobile).
// - Le contenu dépend de la route courante (voir lib/helpContent.ts).
// - Fermeture facile : croix, clic sur le fond, touche Échap.
// - Accessible : rôle dialog, focus déplacé à l'ouverture, `aria-label`.
// ============================================================================

export default function ContextualHelp() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const help = getHelpForPath(location.pathname)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)

  // Le panneau se referme quand on change d'écran.
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Fermeture au clavier (Échap) + focus déplacé sur la croix à l'ouverture.
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Au retour à l'état fermé, on redonne le focus au bouton déclencheur.
  function close() {
    setOpen(false)
    openerRef.current?.focus()
  }

  return (
    <>
      <button
        type="button"
        ref={openerRef}
        className="help-fab"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="help-fab-mark" aria-hidden="true">
          ?
        </span>
        Aide
      </button>

      {open && (
        <div className="help-overlay" onClick={close}>
          <aside
            className="help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-panel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="help-panel-head">
              <h2 id="help-panel-title" className="help-panel-title">
                {help.title}
              </h2>
              <button
                type="button"
                ref={closeRef}
                className="help-panel-close"
                aria-label="Fermer l'aide"
                onClick={close}
              >
                ✕
              </button>
            </div>

            <div className="help-panel-body">
              {help.lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>

            <div className="help-panel-foot">
              <Link className="btn secondary help-panel-link" to="/aide" onClick={close}>
                Voir toute l'aide
              </Link>
              <p className="help-phone">
                Besoin d'aide ? Appelez votre responsable :{' '}
                <a href={`tel:${HELP_PHONE.replace(/\s/g, '')}`}>{HELP_PHONE}</a>
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
