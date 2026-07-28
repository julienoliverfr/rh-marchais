import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useDataStore } from '../store/dataStore'
import ContextualHelp from './ContextualHelp'
import BottomNav from './BottomNav'

// Coquille commune : barre de titre + navigation selon le rôle.
export default function Layout() {
  const session = useAuthStore((s) => s.session)
  const logout = useAuthStore((s) => s.logout)
  const saisies = useDataStore((s) => s.saisies)
  const conges = useDataStore((s) => s.conges)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const navigate = useNavigate()

  const isResponsable = session?.role === 'responsable'
  // Employé délégué : a-t-il au moins un collègue à saisir (liste définie par
  // l'admin) ? Conditionne l'entrée de menu « Saisie pour un collègue ».
  const peutSaisirPourCollegue =
    !isResponsable &&
    (collaborateurs.find((c) => c.id === session?.collaborateurId)?.peutSaisirPour
      ?.length ?? 0) > 0
  const nbEnAttente = saisies.filter((s) => s.statut === 'en_attente').length
  const nbCongesDemandes = conges.filter((c) => c.statut === 'demandee').length

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`app-shell${!isResponsable ? ' has-bottomnav' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span aria-hidden>🍇</span> RH · Suivi des heures
        </div>
        <div className="user">
          <span>{session?.nomAffichage}</span>
          <button className="btn secondary small" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </header>

      <nav className="nav">
        {!isResponsable && (
          <>
            <NavLink to="/" end>
              Tableau de bord
            </NavLink>
            <NavLink to="/saisie">Saisie</NavLink>
            {peutSaisirPourCollegue && (
              <NavLink to="/saisie-collegue">Saisie pour un collègue</NavLink>
            )}
            <NavLink to="/historique">Historique</NavLink>
            <NavLink to="/conges">Mes congés</NavLink>
          </>
        )}
        {isResponsable && (
          <>
            <NavLink to="/responsable" end>
              Saisie collaborateur
            </NavLink>
            <NavLink to="/responsable/validations">
              Validations
              {nbEnAttente > 0 && (
                <span className="badge en_attente" style={{ marginLeft: '0.4rem' }}>
                  {nbEnAttente}
                </span>
              )}
            </NavLink>
            <NavLink to="/responsable/conges">
              Congés
              {nbCongesDemandes > 0 && (
                <span className="badge en_attente" style={{ marginLeft: '0.4rem' }}>
                  {nbCongesDemandes}
                </span>
              )}
            </NavLink>
            <NavLink to="/responsable/exports">Exports</NavLink>
            <NavLink to="/responsable/admin">Administration</NavLink>
          </>
        )}
      </nav>

      {/* Largeur adaptée au contexte : colonne étroite pour l'espace employé,
          conteneur large et fluide pour l'espace responsable / admin (data-heavy). */}
      <main className={`content${isResponsable ? ' is-wide' : ''}`}>
        <Outlet />
      </main>

      {/* Aide contextuelle : bouton permanent + panneau selon l'écran courant. */}
      <ContextualHelp />

      {/* Navigation basse (employé, mobile uniquement — masquée sur desktop). */}
      {!isResponsable && <BottomNav />}
    </div>
  )
}
