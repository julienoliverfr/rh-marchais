import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
// L'application est servie SOUS un chemin (`/rh`), la racine du domaine étant
// réservée au site vitrine. Ce préfixe doit être déclaré à TROIS endroits qui
// doivent rester cohérents, sans quoi la page se charge mais rien ne suit :
//   1. `base` ici          → chemin des ressources (JS, CSS, icônes) ;
//   2. `basename` du routeur (App.tsx) → sinon toutes les routes tombent à côté ;
//   3. le Caddyfile        → sinon le serveur ne sait pas quoi servir.
const BASE = '/rh/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // Portée du service worker : limitée à l'application. Sans cela, il
      // intercepterait aussi les pages du site vitrine servi à la racine.
      scope: BASE,
      manifest: {
        name: 'RH · Suivi des heures',
        short_name: 'RH Heures',
        description: 'Suivi des heures - Domaine agricole (Vignes & Marchais)',
        theme_color: '#3B6B3A',
        background_color: '#FAF9F5',
        display: 'standalone',
        // Point d'entrée de l'application installée sur l'écran d'accueil.
        start_url: BASE,
        scope: BASE,
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5180,
  },
})
