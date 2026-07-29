import { useMemo, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import SaisieForm from '../../components/SaisieForm'
import { estActif } from '../../types'
import { todayISO } from '../../lib/dates'

// Employé délégué : saisir des heures pour un COLLÈGUE de sa liste autorisée.
// Le périmètre est STRICTEMENT limité à `peutSaisirPour` du collaborateur
// connecté (défini par l'admin). La saisie est enregistrée avec
// `saisi_par = l'employé connecté` (audit). Réutilise `SaisieForm`.
export default function SaisiePourCollegue() {
  const session = useAuthStore((s) => s.session)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)

  // Collaborateur rattaché au compte connecté + sa liste de délégation.
  const moi = useMemo(
    () => collaborateurs.find((c) => c.id === session?.collaborateurId),
    [collaborateurs, session],
  )
  const autorises = useMemo(() => {
    const ids = new Set(moi?.peutSaisirPour ?? [])
    // Un collègue sorti des effectifs disparaît de la liste de saisie.
    return collaborateurs.filter((c) => ids.has(c.id) && estActif(c, todayISO()))
  }, [collaborateurs, moi])

  const [collabId, setCollabId] = useState<string>('')
  const [done, setDone] = useState(false)

  // Sélection courante bornée à la liste autorisée (repli sur le 1er autorisé).
  const collabActif = autorises.some((c) => c.id === collabId)
    ? collabId
    : autorises[0]?.id ?? ''

  const collaborateur = useMemo(
    () => autorises.find((c) => c.id === collabActif),
    [autorises, collabActif],
  )
  const famille = useMemo(
    () => familles.find((f) => f.id === collaborateur?.familleId),
    [familles, collaborateur],
  )

  // Aucune délégation : garde-fou (l'entrée de menu n'apparaît normalement pas).
  if (autorises.length === 0) {
    return (
      <div className="card">
        <p className="muted">
          Vous n'êtes autorisé à saisir pour aucun collègue.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Saisie pour un collègue
      </h2>
      <p className="muted">
        Périmètre limité aux collègues que l'administrateur vous a autorisés. La
        saisie est enregistrée avec <code>saisi_par = {session?.identifiant}</code>.
      </p>

      <div className="card">
        <div className="form-row">
          <label htmlFor="collab">Collègue</label>
          <select
            id="collab"
            value={collabActif}
            onChange={(e) => {
              setCollabId(e.target.value)
              setDone(false)
            }}
          >
            {autorises.map((c) => {
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
        <div className="alert info">Saisie enregistrée pour le collègue.</div>
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
            key={collabActif + (done ? '-done' : '')}
            collaborateur={collaborateur}
            famille={famille}
            saisiPar={session!.identifiant}
            onSaved={() => setDone(true)}
          />
        </div>
      ) : (
        <div className="card">
          <p className="muted">Sélectionnez un collègue.</p>
        </div>
      )}
    </div>
  )
}
