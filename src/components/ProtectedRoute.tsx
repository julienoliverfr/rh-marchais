import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Role } from '../types'
import { useAuthStore } from '../store/authStore'

interface Props {
  children: ReactNode
  // Rôles autorisés. Si absent, tout utilisateur connecté est accepté.
  roles?: Role[]
}

// Garde de route selon la session et le rôle.
export default function ProtectedRoute({ children, roles }: Props) {
  const session = useAuthStore((s) => s.session)
  const bootstrapping = useAuthStore((s) => s.bootstrapping)

  // Mode Supabase : pendant la restauration de session au démarrage, on n'affiche
  // rien (évite un passage éclair par /login). En mode local, `bootstrapping` est
  // toujours faux : comportement inchangé.
  if (bootstrapping && !session) {
    return null
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (roles && !roles.includes(session.role)) {
    // Rôle insuffisant : on renvoie vers l'accueil adapté.
    const home = session.role === 'responsable' ? '/responsable' : '/'
    return <Navigate to={home} replace />
  }
  return <>{children}</>
}
