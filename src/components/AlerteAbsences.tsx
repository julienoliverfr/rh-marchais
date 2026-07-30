import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDataStore } from '../store/dataStore'
import { useAuthStore } from '../store/authStore'
import { toISODate, formatDateFrNum } from '../lib/dates'
import { CONGE_TYPE_LABELS } from '../lib/conges'
import {
  calculerAlerteAbsences,
  libelleDelai,
  type AbsenceAVenir,
} from '../lib/alerteAbsences'

// ============================================================================
// Bandeau « absences à venir », affiché au responsable.
//
// Le canal est volontairement INTERNE à l'application : il n'existe aucune
// infrastructure d'envoi (ni courriel, ni SMS), et une notification poussée
// demanderait un serveur de push. Un bandeau visible à chaque connexion couvre
// le besoin sans dépendance.
//
// Il se referme pour la session en cours seulement : au prochain démarrage,
// l'information revient. Une alerte qu'on peut faire taire définitivement
// finit toujours par être tue.
// ============================================================================

function Ligne({ a, aujourdhui }: { a: AbsenceAVenir; aujourdhui: string }) {
  const fin = a.conge.dateFin !== a.conge.dateDebut
  return (
    <li>
      <strong>
        {a.collab.prenom} {a.collab.nom}
      </strong>{' '}
      — {CONGE_TYPE_LABELS[a.conge.type]},{' '}
      {libelleDelai(a.dansJours, a.conge.dateDebut, aujourdhui)}{' '}
      <span className="muted">
        ({formatDateFrNum(a.conge.dateDebut)}
        {fin ? ` → ${formatDateFrNum(a.conge.dateFin)}` : ''}
        {a.conge.nbJours ? ` · ${a.conge.nbJours} j` : ''})
      </span>
    </li>
  )
}

export default function AlerteAbsences() {
  const session = useAuthStore((s) => s.session)
  const conges = useDataStore((s) => s.conges)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const regles = useDataStore((s) => s.regles)
  const [ferme, setFerme] = useState(false)

  const aujourdhui = toISODate(new Date())
  const alerte = useMemo(
    () =>
      calculerAlerteAbsences(
        conges,
        collaborateurs,
        aujourdhui,
        regles.alerteAbsenceJours,
      ),
    [conges, collaborateurs, aujourdhui, regles.alerteAbsenceJours],
  )

  if (session?.role !== 'responsable') return null
  if (ferme) return null
  if (alerte.aVenir.length === 0 && alerte.enAttente.length === 0) return null

  return (
    <div className="alerte-absences" role="status">
      <div className="alerte-absences-head">
        <strong>
          Absences dans les {regles.alerteAbsenceJours} prochains jours
        </strong>
        <button
          className="btn secondary small"
          onClick={() => setFerme(true)}
          aria-label="Masquer jusqu’à la prochaine connexion"
        >
          Masquer
        </button>
      </div>

      {alerte.aVenir.length > 0 && (
        <ul className="alerte-absences-liste">
          {alerte.aVenir.map((a) => (
            <Ligne key={a.conge.id} a={a} aujourdhui={aujourdhui} />
          ))}
        </ul>
      )}

      {/* Bloc distinct, et volontairement plus visible : une demande non
          traitée qui commence bientôt est le vrai risque. */}
      {alerte.enAttente.length > 0 && (
        <div className="alerte-absences-attente">
          <strong>
            {alerte.enAttente.length} demande
            {alerte.enAttente.length > 1 ? 's' : ''} encore en attente
          </strong>
          <ul className="alerte-absences-liste">
            {alerte.enAttente.map((a) => (
              <Ligne key={a.conge.id} a={a} aujourdhui={aujourdhui} />
            ))}
          </ul>
          <Link className="btn small" to="/responsable/conges">
            Traiter les demandes
          </Link>
        </div>
      )}
    </div>
  )
}
