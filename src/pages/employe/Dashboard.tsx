import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import {
  formatMinutes,
  heuresSupMinutes,
  totalSemaineMinutes,
} from '../../lib/hours'
import { formatDateFr } from '../../lib/dates'
import StatusBadge from '../../components/StatusBadge'
import HelpTip from '../../components/HelpTip'

export default function Dashboard() {
  const session = useAuthStore((s) => s.session)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const saisies = useDataStore((s) => s.saisies)
  const getSolde = useDataStore((s) => s.getSolde)

  const collaborateur = useMemo(
    () => collaborateurs.find((c) => c.id === session?.collaborateurId),
    [collaborateurs, session],
  )

  const derniers = useMemo(() => {
    if (!collaborateur) return []
    return saisies
      .filter((s) => s.collaborateurId === collaborateur.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5)
  }, [saisies, collaborateur])

  if (!collaborateur) {
    return (
      <div className="card">
        <p>Aucun collaborateur rattaché à ce compte.</p>
      </div>
    )
  }

  const totalSemaine = totalSemaineMinutes(saisies, collaborateur.id)
  const sup = heuresSupMinutes(totalSemaine, collaborateur.contrat)
  // Solde de congés payés restant sur la période de référence courante (calculé).
  const solde = getSolde(collaborateur.id, 'conge_paye')

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Bonjour {collaborateur.prenom}
      </h2>

      <Link className="btn dash-cta" to="/saisie">
        <span aria-hidden="true">🕒</span> Saisir mes heures
      </Link>

      <div className="grid">
        <div className="stat">
          <div className="label">
            Heures semaine{' '}
            <HelpTip
              label="Cumul semaine"
              text="Le total de vos heures depuis le début de la semaine."
            />
          </div>
          <div className="value">{formatMinutes(totalSemaine)}</div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            Seuil {collaborateur.contrat.seuilHebdo}h
          </div>
        </div>
        <div className="stat accent">
          <div className="label">
            Dont heures sup.{' '}
            <HelpTip
              label="Heures supplémentaires"
              text="Les heures faites en plus de votre horaire prévu."
            />
          </div>
          <div className="value">{formatMinutes(sup)}</div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            Sans majoration
          </div>
        </div>
        <div className="stat">
          <div className="label">
            Solde congés{' '}
            <HelpTip
              label="Solde"
              text="Le nombre de jours de congés qu'il vous reste."
            />
          </div>
          <div className="value">{solde.restant} j</div>
          <div className="muted" style={{ fontSize: '0.8rem' }}>
            restant · {solde.periode.label}
          </div>
        </div>
      </div>

      <h3 className="section-title">Derniers jours saisis</h3>
      {derniers.length === 0 ? (
        <div className="card">
          <p className="muted">Aucune saisie pour le moment.</p>
        </div>
      ) : (
        derniers.map((s) => (
          <div className="entry" key={s.id}>
            <div className="main">
              <span className="date">{formatDateFr(s.date)}</span>
              <span className="muted">{formatMinutes(s.totalMinutes)}</span>
            </div>
            <StatusBadge statut={s.statut} />
          </div>
        ))
      )}
    </div>
  )
}
