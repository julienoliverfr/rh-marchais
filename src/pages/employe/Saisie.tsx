import { useMemo, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import SaisieForm from '../../components/SaisieForm'
import HelpTip from '../../components/HelpTip'

export default function Saisie() {
  const session = useAuthStore((s) => s.session)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
  const [done, setDone] = useState(false)

  const collaborateur = useMemo(
    () => collaborateurs.find((c) => c.id === session?.collaborateurId),
    [collaborateurs, session],
  )
  const famille = useMemo(
    () => familles.find((f) => f.id === collaborateur?.familleId),
    [familles, collaborateur],
  )

  if (!collaborateur || !famille) {
    return (
      <div className="card">
        <p>Aucun collaborateur/équipe rattaché à ce compte.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Saisie des heures
      </h2>
      <p className="muted">
        Équipe <strong>{famille.nom}</strong> —{' '}
        {famille.modeSaisie === 'journee_continue' ? (
          'journée continue'
        ) : (
          <>
            demi-journées{' '}
            <HelpTip
              label="Demi-journée"
              text="Une matinée ou une après-midi seulement."
            />
          </>
        )}
      </p>

      {done && (
        <div className="alert info">
          Saisie enregistrée (statut « En attente »). Vous pouvez en ajouter une
          autre.
        </div>
      )}

      <div className="card">
        <SaisieForm
          key={done ? 'reset' : 'form'}
          collaborateur={collaborateur}
          famille={famille}
          saisiPar={session!.identifiant}
          onSaved={() => setDone(true)}
        />
      </div>
    </div>
  )
}
