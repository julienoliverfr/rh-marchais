import { useMemo, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import SaisieForm from '../../components/SaisieForm'
import { formatDateFr } from '../../lib/dates'
import HelpTip from '../../components/HelpTip'

export default function Saisie() {
  const session = useAuthStore((s) => s.session)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
  // Compteur d'enregistrements (remonte le formulaire à chaque fois) + date de
  // la dernière journée saisie, pour une confirmation qui change à chaque envoi.
  const [nbEnregistrees, setNbEnregistrees] = useState(0)
  const [derniere, setDerniere] = useState<string | null>(null)

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

      {derniere && (
        <div className="alert info">
          Journée du <strong>{formatDateFr(derniere)}</strong> enregistrée — en
          attente de validation. Vous pouvez en ajouter une autre.
        </div>
      )}

      <div className="card">
        <SaisieForm
          // Compteur (et non un booléen) : avec `done ? 'reset' : 'form'`, la
          // clé ne changeait qu'AU PREMIER enregistrement — dès la 2e saisie
          // d'affilée le formulaire gardait les valeurs précédentes et laissait
          // croire que rien n'était parti.
          key={nbEnregistrees}
          collaborateur={collaborateur}
          famille={famille}
          saisiPar={session!.identifiant}
          onSaved={(date) => {
            setNbEnregistrees((n) => n + 1)
            setDerniere(date)
          }}
        />
      </div>
    </div>
  )
}
