import type { Repository } from './Repository'
import { LocalStorageRepository } from './LocalStorageRepository'
import { SupabaseRepository } from './SupabaseRepository'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

// SUPABASE SWAP POINT
// -------------------
// Fabrique unique du repository de l'application. La BASCULE est PAR
// CONFIGURATION : si les deux variables d'environnement Supabase sont définies
// (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY), on utilise `SupabaseRepository`
// (base + auth + RLS) ; sinon on reste sur `LocalStorageRepository` (mode démo
// actuel CONSERVÉ par défaut). C'est le SEUL endroit qui décide du backend.

// Instance Supabase typée (null en mode local) — sert à `init(session)` au login.
export const supabaseRepository: SupabaseRepository | null =
  isSupabaseConfigured() && supabase ? new SupabaseRepository(supabase) : null

export const repository: Repository = supabaseRepository ?? new LocalStorageRepository()

// Vrai si l'application tourne en mode « cerveau partagé » (Supabase actif).
export function isSupabaseMode(): boolean {
  return supabaseRepository !== null
}

export type { Repository } from './Repository'
