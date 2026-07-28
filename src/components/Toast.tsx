import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

// ============================================================================
// Toasts — retours d'action éphémères, empilables et accessibles.
//
// - `ToastProvider` monte une région `aria-live="polite"` en superposition.
// - `useToast()` expose `success` / `error` / `info` (+ `showToast`).
// - Auto-fermeture (~4 s), fermable à la main, plusieurs toasts empilés.
// - Règles NEUTRES : réutilise les variables de thème existantes (voir styles.css).
// ============================================================================

export type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  kind: ToastKind
  message: string
}

export interface ToastApi {
  showToast: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const AUTO_DISMISS_MS = 4000

const ICONS: Record<ToastKind, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

function toastId(): string {
  return 'toast-' + Math.random().toString(36).slice(2, 10)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = toastId()
      setToasts((prev) => [...prev, { id, kind, message }])
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  // Nettoyage des minuteries au démontage (évite les fuites).
  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach((t) => clearTimeout(t))
      map.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      showToast,
      success: (m: string) => showToast(m, 'success'),
      error: (m: string) => showToast(m, 'error'),
      info: (m: string) => showToast(m, 'info'),
    }),
    [showToast],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="toast-region"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            <span className="toast-icon" aria-hidden="true">
              {ICONS[t.kind]}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Fermer la notification"
              onClick={() => dismiss(t.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast doit être utilisé à l’intérieur d’un ToastProvider.')
  }
  return ctx
}
