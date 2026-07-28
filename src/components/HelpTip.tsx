import { useEffect, useId, useRef, useState } from 'react'

// ============================================================================
// HelpTip — petite bulle « ? » cliquable qui explique UN mot difficile.
//
// Pensé pour des employés peu à l'aise : grande cible tactile, une seule
// phrase, ton simple. Accessible : bouton focusable, `aria-label`, fermeture
// au clavier (Échap) et au clic en dehors.
// ============================================================================

interface HelpTipProps {
  // Le mot expliqué (sert à l'étiquette d'accessibilité, ex. « Solde »).
  label: string
  // La phrase d'explication (une seule).
  text: string
}

export default function HelpTip({ label, text }: HelpTipProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const popId = useId()

  // Fermeture au clic en dehors + touche Échap.
  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="help-tip" ref={wrapRef}>
      <button
        type="button"
        className="help-tip-btn"
        aria-label={`Aide : ${label}`}
        aria-expanded={open}
        aria-describedby={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        ?
      </button>
      {open && (
        <span className="help-tip-pop" id={popId} role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
