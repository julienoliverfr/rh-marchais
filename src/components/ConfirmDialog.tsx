import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

// ============================================================================
// ConfirmDialog — boîte de confirmation réutilisable pour actions sensibles.
//
// - `ConfirmProvider` monte une seule instance ; `useConfirm()` renvoie une
//   fonction `confirm(options)` qui résout un booléen (Confirmer / Annuler).
// - Accessible : `role="alertdialog"`, focus piégé, fermeture Échap / clic fond.
// - Le focus initial va sur « Annuler » quand l'action est destructive (`danger`),
//   sur « Confirmer » sinon (évite une validation destructive par mégarde).
// - Règles NEUTRES : réutilise les classes/variables de thème existantes.
// ============================================================================

export interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface Pending extends ConfirmOptions {
  resolve: (value: boolean) => void
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    lastFocused.current = document.activeElement as HTMLElement | null
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve })
    })
  }, [])

  const close = useCallback((result: boolean) => {
    setPending((prev) => {
      prev?.resolve(result)
      return null
    })
    // Rendu du focus à l'élément déclencheur.
    lastFocused.current?.focus?.()
  }, [])

  // Focus initial + piège clavier (Tab/Shift+Tab) + Échap.
  useEffect(() => {
    if (!pending) return
    const initial = pending.danger ? cancelRef.current : confirmRef.current
    initial?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
        return
      }
      if (e.key !== 'Tab') return
      const root = dialogRef.current
      if (!root) return
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="confirm-overlay" onClick={() => close(false)}>
          <div
            ref={dialogRef}
            className="card confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="confirm-title">
              {pending.title}
            </h2>
            <div id="confirm-desc" className="confirm-message">
              {pending.message}
            </div>
            <div className="btn-row confirm-actions">
              <button
                ref={confirmRef}
                type="button"
                className={`btn${pending.danger ? ' danger' : ''}`}
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? 'Confirmer'}
              </button>
              <button
                ref={cancelRef}
                type="button"
                className="btn secondary"
                onClick={() => close(false)}
              >
                {pending.cancelLabel ?? 'Annuler'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm doit être utilisé à l’intérieur d’un ConfirmProvider.')
  }
  return ctx
}
