import { useMemo, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import SaisieForm from '../../components/SaisieForm'

// Responsable : saisir des heures pour le compte d'un collaborateur.
export default function SaisiePourAutrui() {
  const session = useAuthStore((s) => s.session)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
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
        <div className="form-row">
          <label htmlFor="collab">Collaborateur</label>
          <select
            id="collab"
            value={collabId}
            onChange={(e) => {
              setCollabId(e.target.value)
              setDone(false)
            }}
          >
            {collaborateurs.map((c) => {
              const f = familles.find((x) => x.id === c.familleId)
              return (
                <option key={c.id} value={c.id}>
                  {c.prenom} {c.nom} — {f?.nom ?? '?'}
                </option>
              )
            })}
          </select>
        </div>
      </div>

      {done && (
        <div className="alert info">Saisie enregistrée pour le collaborateur.</div>
      )}

      {collaborateur && famille ? (
        <div className="card">
          <p className="muted">
            Famille <strong>{famille.nom}</strong> —{' '}
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
