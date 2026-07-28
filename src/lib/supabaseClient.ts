import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Client Supabase — point d'accès unique au « cerveau partagé ».
//
// Le client n'est créé QUE si les deux variables d'environnement sont définies
// (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY). Sinon `supabase` vaut `null` et
// l'application retombe automatiquement sur le mode local (localStorage), sans
// aucune configuration : le mode démo actuel reste le comportement par défaut.
//
// La clé « anon » est PUBLIQUE par conception : elle n'autorise rien par
// elle-même. Toute la sécurité est imposée côté base par les politiques RLS
// (voir supabase/rls.sql). Aucune décision d'autorisation n'est confiée au
// client.
// ---------------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Mode Supabase actif si et seulement si les deux variables sont renseignées.
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

// Client partagé (ou null en mode local). La session est persistée et
// rafraîchie automatiquement par la librairie (JWT signé, jamais forgeable).
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null
