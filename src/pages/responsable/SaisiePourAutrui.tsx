import { useMemo, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import SaisieForm from '../../components/SaisieForm'
import CollaborateurPicker from '../../components/CollaborateurPicker'
import { estActif } from '../../types'
import { todayISO } from '../../lib/dates'

// Responsable : saisir des heures pour le compte d'un collaborateur.
export default function SaisiePourAutrui() {
  const session = useAuthStore((s) => s.session)
  const tousCollaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
  // Saisie possible uniquement pour les collaborateurs PRÉSENTS.
  const collaborateurs = useMemo(
    () => tousCollaborateurs.filter((c) => estActif(c, todayISO())),
    [tousCollaborateurs],
  )
  const [collabId, setCollabId] = useState<string>(collaborateurs[0]?.id ?? '')
  const [done, setDone] = useState(false)

  const collaborateur = useMemo(
    () => collaborateurs.find((c) => c.id === collabId),
    [collaborateurs, collabId],
  )
  const famille = useMemo(
    () => familles.find((f) => f.id === collaborateur?.familleId),
    [familles, collaborateur],
  )

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Saisie pour un collaborateur
      </h2>
      <p className="muted">
        La saisie est enregistrée avec <code>saisi_par = {session?.identifiant}</code>.
      </p>

      <div className="card">
        <CollaborateurPicker
          collaborateurs={collaborateurs}
          familles={familles}
          value={collabId}
          onChange={(id) => {
            setCollabId(id)
            setDone(false)
          }}
        />
      </div>

      {done && (
        <div className="alert info">Saisie enregistrée pour le collaborateur.</div>
      )}

      {collaborateur && famille ? (
        <div className="card">
          <p className="muted">
            Équipe <strong>{famille.nom}</strong> —{' '}
            {famille.modeSaisie === 'journee_continue'
              ? 'journée continue'
              : 'demi-journées'}
          </p>
          <SaisieForm
            key={collabId + (done ? '-done' : '')}
            collaborateur={collaborateur}
            famille={famille}
            saisiPar={session!.identifiant}
            onSaved={() => setDone(true)}
          />
        </div>
      ) : (
        <div className="card">
          <p className="muted">Sélectionnez un collaborateur.</p>
        </div>
      )}
    </div>
  )
}
