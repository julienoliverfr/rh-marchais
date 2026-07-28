import { useEffect } from 'react'
import { onAppError } from '../lib/errorBus'
import { useToast } from './Toast'

// Pont sans rendu : relaie les erreurs applicatives émises hors React (RPC
// Supabase du repository) vers un toast d'erreur. Monté sous ToastProvider.
export default function AppErrorBridge() {
  const toast = useToast()
  useEffect(() => onAppError((message) => toast.error(message)), [toast])
  return null
}
