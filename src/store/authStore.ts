import { create } from 'zustand'
import type { Session } from '../types'
import { repository, supabaseRepository, isSupabaseMode } from '../repositories'
import { supabase } from '../lib/supabaseClient'
import { useDataStore } from './dataStore'

// SUPABASE SWAP POINT — SÉCURITÉ
// ---------------------------------------------------------------------------
// Deux modes coexistent, choisis PAR CONFIGURATION (voir repositories/index.ts) :
//
//  • MODE LOCAL (défaut, démo) : authentification MOCKÉE. Les comptes et leurs
//    mots de passe vivent en localStorage (seed.ts) et sont comparés EN CLAIR.
//    Cela ne protège RIEN — c'est un prototype front. Conservé tel quel pour la
//    démo hors-ligne.
//
//  • MODE SUPABASE : authentification RÉELLE côté serveur (Supabase Auth). Les
//    mots de passe sont hachés côté base (jamais stockés côté appli), la session
//    est un JWT signé, et TOUTE l'autorisation est imposée par les policies RLS
//    (voir supabase/rls.sql). Le rôle est lu depuis la table `profiles`.
//
// `login` est ASYNCHRONE dans les deux modes (le mock résout immédiatement) pour
// une seule et même signature côté UI.
// ---------------------------------------------------------------------------

const SESSION_KEY = 'rh.session'

// Mode local uniquement : session persistée en clair (mock).
function loadLocalSession(): Session | null {
  if (isSupabaseMode()) return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export interface LoginResult {
  ok: boolean
  error?: string
}

interface AuthState {
  session: Session | null
  // Vrai pendant la restauration de session au démarrage (mode Supabase).
  bootstrapping: boolean
  login: (identifiant: string, motDePasse: string) => Promise<LoginResult>
  logout: () => void
}

// En mode Supabase, l'identifiant saisi est traité comme un e-mail. Par
// convention de démo, un identifiant sans « @ » est complété en
// « <identifiant>@demo.local » (voir supabase/README.md).
function toEmail(identifiant: string): string {
  const id = identifiant.trim().toLowerCase()
  return id.includes('@') ? id : `${id}@demo.local`
}

// Reconstruit la Session applicative à partir de l'utilisateur Auth + son profil,
// charge le cache du repository (RLS) puis resynchronise le store de données.
async function hydrateFromAuth(userId: string): Promise<Session | null> {
  if (!supabase || !supabaseRepository) return null
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error || !profile) return null

  const session: Session = {
    compteId: userId,
    identifiant: profile.identifiant,
    role: profile.role,
    collaborateurId: profile.collaborateur_id ?? undefined,
    nomAffichage: profile.nom_affichage,
  }
  await supabaseRepository.init(session)
  // Le repository a rempli son cache : on rafraîchit les données affichées.
  useDataStore.getState().refresh()
  return session
}

export const useAuthStore = create<AuthState>((set) => ({
  session: loadLocalSession(),
  bootstrapping: isSupabaseMode(),

  login: async (identifiant, motDePasse) => {
    // ---- MODE SUPABASE : authentification serveur + chargement du cache ----
    if (isSupabaseMode() && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: toEmail(identifiant),
        password: motDePasse,
      })
      if (error || !data.user) {
        return { ok: false, error: 'Identifiant ou mot de passe incorrect.' }
      }
      const session = await hydrateFromAuth(data.user.id)
      if (!session) {
        await supabase.auth.signOut()
        return { ok: false, error: 'Profil introuvable pour ce compte.' }
      }
      set({ session })
      return { ok: true }
    }

    // ---- MODE LOCAL : mock (comparaison en clair, prototype) ----
    const compte = repository
      .getComptes()
      .find((c) => c.identifiant === identifiant.trim().toLowerCase())
    if (!compte || compte.motDePasse !== motDePasse) {
      return { ok: false, error: 'Identifiant ou mot de passe incorrect.' }
    }
    const session: Session = {
      compteId: compte.id,
      identifiant: compte.identifiant,
      role: compte.role,
      collaborateurId: compte.collaborateurId,
      nomAffichage: compte.nomAffichage,
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    set({ session })
    return { ok: true }
  },

  logout: () => {
    if (isSupabaseMode() && supabase) {
      // Révoque le JWT côté serveur (fire-and-forget : l'UI se ferme aussitôt).
      void supabase.auth.signOut()
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
    set({ session: null })
  },
}))

// --- Restauration de session au démarrage (mode Supabase uniquement) ---------
// La librairie Supabase persiste le JWT : au rechargement de la page, on
// reconstruit la Session applicative et on recharge le cache du repository.
if (isSupabaseMode() && supabase) {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user.id
      if (userId) {
        const session = await hydrateFromAuth(userId)
        if (session) useAuthStore.setState({ session })
      }
    } catch {
      // Silencieux : en cas d'échec, l'utilisateur sera redirigé vers /login.
    } finally {
      useAuthStore.setState({ bootstrapping: false })
    }
  })()
}
