// ---------------------------------------------------------------------------
// Bus d'erreurs applicatives — pont entre le code HORS React (repository
// write-through / RPC Supabase) et les toasts (contexte React).
//
// Le repository ne connaît pas React : il émet un message via `emitAppError`.
// Un petit composant-pont (`AppErrorBridge`) s'abonne au montage et relaie vers
// `useToast().error`. En mode local (localStorage), rien n'émet : bus inerte.
// ---------------------------------------------------------------------------

type Listener = (message: string) => void

let listener: Listener | null = null

// Abonne l'unique auditeur (le pont React). Retourne une fonction de désabonnement.
export function onAppError(l: Listener): () => void {
  listener = l
  return () => {
    if (listener === l) listener = null
  }
}

// Émet un message d'erreur vers l'auditeur courant (aucun effet si non branché).
export function emitAppError(message: string): void {
  listener?.(message)
}
