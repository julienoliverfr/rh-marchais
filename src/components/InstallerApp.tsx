import { useEffect, useState } from 'react'

// ============================================================================
// Invitation à INSTALLER l'application sur l'écran d'accueil.
//
// Sans elle, la fonctionnalité reste inconnue : personne ne va chercher
// spontanément « ajouter à l'écran d'accueil » dans les menus de son
// navigateur. Or c'est justement ce qui évite d'avoir à retenir une adresse.
//
// Le bandeau n'apparaît QUE sur un terminal tactile : sur un ordinateur, il
// n'aurait aucun sens et occuperait de la place pour rien.
//
// Deux parcours très différents selon l'appareil :
//   • Android / Chrome — le navigateur propose lui-même l'installation via
//     l'événement `beforeinstallprompt`. On affiche un vrai bouton.
//   • iPhone / Safari — aucun événement de ce type n'existe. Le seul chemin
//     passe par le bouton Partager, que l'utilisateur doit trouver seul : il
//     faut donc le lui MONTRER, pas seulement le nommer.
// ============================================================================

const CLE_MASQUE = 'rh.installation.masquee'
// Réapparition après deux mois. Un rejet définitif enterrerait la
// fonctionnalité pour quelqu'un qui a simplement balayé le bandeau sans le
// lire ; le harceler chaque semaine serait pire.
const DELAI_RAPPEL_MS = 60 * 24 * 3600 * 1000

// L'événement n'est pas encore dans les types standards du DOM.
interface EvenementInstallation extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function dejaInstallee(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS n'expose pas `display-mode` : il a sa propre propriété, non standard.
  return (navigator as unknown as { standalone?: boolean }).standalone === true
}

function estIOS(): boolean {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return true
  // Depuis iPadOS 13, un iPad se déclare comme un Mac : seul le tactile le
  // distingue d'un ordinateur portable.
  return navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)
}

export default function InstallerApp() {
  const [invite, setInvite] = useState<EvenementInstallation | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Terminal tactile uniquement. `pointer: coarse` décrit le MOYEN de
    // pointage, pas la taille de l'écran : une fenêtre de navigateur réduite
    // sur un ordinateur reste pilotée à la souris et ne déclenche donc rien.
    const tactile = window.matchMedia('(pointer: coarse)').matches
    if (!tactile || dejaInstallee()) return

    const masqueLe = Number(localStorage.getItem(CLE_MASQUE) ?? 0)
    if (masqueLe && Date.now() - masqueLe < DELAI_RAPPEL_MS) return

    if (estIOS()) {
      setVisible(true)
      return
    }

    // Android : on attend la proposition du navigateur. Elle n'arrive que si
    // l'application est réellement installable (manifeste et service worker
    // valides) — inutile donc de promettre un bouton qui ne marcherait pas.
    const surInvite = (e: Event) => {
      e.preventDefault() // empêche la bannière native, qu'on remplace
      setInvite(e as EvenementInstallation)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', surInvite)
    return () => window.removeEventListener('beforeinstallprompt', surInvite)
  }, [])

  function masquer() {
    localStorage.setItem(CLE_MASQUE, String(Date.now()))
    setVisible(false)
  }

  async function installer() {
    if (!invite) return
    await invite.prompt()
    const { outcome } = await invite.userChoice
    // Refus explicite : on note le rejet, sinon le bandeau reviendrait au
    // rechargement suivant, ce qui serait franchement pénible.
    if (outcome === 'dismissed') masquer()
    else setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="installer-app" role="region" aria-label="Installer l'application">
      <div className="installer-app-texte">
        <strong>Installez l’application sur votre téléphone</strong>
        {invite ? (
          <p>Vous la retrouverez d’une seule touche, sans retaper l’adresse.</p>
        ) : (
          <p>
            Touchez <IconePartage /> en bas de l’écran, puis{' '}
            <strong>« Sur l’écran d’accueil »</strong>. Vous la retrouverez
            ensuite d’une seule touche.
          </p>
        )}
      </div>
      <div className="installer-app-actions">
        {invite && (
          <button className="btn small" onClick={installer}>
            Installer
          </button>
        )}
        <button className="btn secondary small" onClick={masquer}>
          Plus tard
        </button>
      </div>
    </div>
  )
}

// Icône « Partager » d'iOS, dessinée plutôt que nommée : l'utilisateur la
// cherche des yeux dans sa barre d'outils, un mot ne l'y aiderait pas.
function IconePartage() {
  return (
    <svg
      className="icone-partage"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-label="l’icône Partager"
      role="img"
    >
      <path
        d="M12 3v12M12 3l-3.5 3.5M12 3l3.5 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
