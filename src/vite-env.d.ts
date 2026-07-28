/// <reference types="vite/client" />

// Typage strict des variables d'environnement Vite exposées au client.
// Seules les variables préfixées par VITE_ sont injectées dans le bundle.
// Les deux ci-dessous activent le mode Supabase (voir repositories/index.ts) :
// si l'une est absente, l'application reste en mode local (démo localStorage).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
