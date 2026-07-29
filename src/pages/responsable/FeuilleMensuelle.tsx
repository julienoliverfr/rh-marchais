import { useMemo, useState } from 'react'
import type { CongeType } from '../../types'
import { useDataStore } from '../../store/dataStore'
import { CONGE_TYPE_LABELS } from '../../lib/conges'
import { feriesCalcules } from '../../lib/feries'
import { currentMonthKey, formatMonthFr } from '../../lib/dates'
import {
  describeHoraires,
  formatMinutes,
  minutesToDecimalHours,
  formatHeuresDecimal,
  repartitionMoisMinutes,
} from '../../lib/hours'
import Breadcrumb from '../../components/Breadcrumb'
import StatusBadge from '../../components/StatusBadge'
import EmptyState from '../../components/EmptyState'

// ============================================================================
// Feuille mensuelle — vue de CONTRÔLE avant export comptable.
//
// Une ligne par jour du mois pour UN collaborateur : heures saisies, statut,
// absence (congé) ou jour non travaillé (week-end / férié). Totaux en bas :
// heures normales, heures supplémentaires (calculées sur les SEMAINES
// COMPLÈTES, donc cohérentes avec l'export) et jours d'absence par type.
// ============================================================================

const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

// Liste des jours (ISO) d'un mois 'AAAA-MM'.
function joursDuMois(monthKey: string): string[] {
  const [y, m] = monthKey.split('-').map(Number)
  const nb = new Date(Date.UTC(y, m, 0)).getUTCDate() // jour 0 du mois suivant
  const out: string[] = []
  for (let d = 1; d <= nb; d++) {
    out.push(`${monthKey}-${String(d).padStart(2, '0')}`)
  }
  return out
}

// Décale un mois 'AAAA-MM' de n mois.
function decalerMois(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function FeuilleMensuelle() {
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const saisies = useDataStore((s) => s.saisies)
  const conges = useDataStore((s) => s.conges)
  const typesAbsence = useDataStore((s) => s.typesAbsence)
  const joursFeries = useDataStore((s) => s.joursFeries)
  const regles = useDataStore((s) => s.regles)

  const [collabId, setCollabId] = useState<string>(collaborateurs[0]?.id ?? '')
  const [mois, setMois] = useState<string>(currentMonthKey())

  const collab = collaborateurs.find((c) => c.id === collabId)

  const labelDe = (code: CongeType): string =>
    typesAbsence.find((t) => t.code === code)?.label ?? CONGE_TYPE_LABELS[code]

  // Fériés de l'année (nationaux) + surcouche personnalisée (ponts / travaillés).
  const feriesDuMois = useMemo(() => {
    const annee = Number(mois.slice(0, 4))
    const m = new Map<string, { label: string; chome: boolean }>()
    for (const f of feriesCalcules(annee)) m.set(f.date, { label: f.label, chome: true })
    for (const j of joursFeries) m.set(j.date, { label: j.label, chome: j.chome })
    return m
  }, [mois, joursFeries])

  // Lignes du tableau : un jour = une ligne.
  const lignes = useMemo(() => {
    if (!collab) return []
    const mesSaisies = saisies.filter((s) => s.collaborateurId === collab.id)
    const mesConges = conges.filter(
      (c) => c.collaborateurId === collab.id && c.statut === 'validee',
    )
    return joursDuMois(mois).map((date) => {
      const d = new Date(date + 'T12:00:00')
      const saisie = mesSaisies.find((s) => s.date === date)
      const conge = mesConges.find((c) => date >= c.dateDebut && date <= c.dateFin)
      const ferie = feriesDuMois.get(date)
      return {
        date,
        jourLabel: `${JOURS[d.getDay()]} ${d.getDate()}`,
        weekend: d.getDay() === 0 || d.getDay() === 6,
        saisie,
        conge,
        ferie: ferie?.chome ? ferie : undefined,
      }
    })
  }, [collab, saisies, conges, mois, feriesDuMois])

  // Totaux du mois (mêmes règles que l'export : semaines complètes).
  const totaux = useMemo(() => {
    if (!collab) return null
    const retenues = saisies.filter(
      (s) =>
        s.collaborateurId === collab.id &&
        (s.statut === 'validee' || s.statut === 'verrouillee'),
    )
    const { totalMin, supMin, normalMin } = repartitionMoisMinutes(
      retenues,
      collab.contrat.seuilHebdo || regles.seuilHsupDefautHebdo,
      mois,
    )
    // Heures saisies mais PAS ENCORE validées (hors export) — signalées à part.
    const enAttenteMin = saisies
      .filter(
        (s) =>
          s.collaborateurId === collab.id &&
          s.date.slice(0, 7) === mois &&
          s.statut === 'en_attente',
      )
      .reduce((acc, s) => acc + s.totalMinutes, 0)

    // Jours d'absence par type, part réellement située dans le mois.
    const parType = new Map<CongeType, number>()
    for (const l of lignes) {
      if (l.conge) parType.set(l.conge.type, (parType.get(l.conge.type) ?? 0) + 1)
    }
    return { totalMin, supMin, normalMin, enAttenteMin, parType }
  }, [collab, saisies, mois, regles, lignes])

  return (
    <div>
      <Breadcrumb items={[{ label: 'Feuille mensuelle' }]} />
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Feuille mensuelle
        </h2>
      </div>
      <p className="muted">
        Vue jour par jour d'un collaborateur : heures saisies, statut et
        absences. Sert à contrôler un mois avant de l'envoyer au comptable.
      </p>

      <div className="card">
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="collab">Collaborateur</label>
            <select
              id="collab"
              value={collabId}
              onChange={(e) => setCollabId(e.target.value)}
            >
              {collaborateurs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.prenom} {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="mois">Mois</label>
            <div className="btn-row" style={{ alignItems: 'center' }}>
              <button
                className="btn secondary small"
                onClick={() => setMois((m) => decalerMois(m, -1))}
                aria-label="Mois précédent"
              >
                ◀
              </button>
              <strong style={{ minWidth: '9rem', textAlign: 'center' }}>
                {formatMonthFr(mois)}
              </strong>
              <button
                className="btn secondary small"
                onClick={() => setMois((m) => decalerMois(m, 1))}
                aria-label="Mois suivant"
              >
                ▶
              </button>
            </div>
          </div>
        </div>
      </div>

      {!collab ? (
        <EmptyState icon="👥" text="Aucun collaborateur à afficher." />
      ) : (
        <>
          <div className="card table-wrap" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Jour</th>
                  <th>Horaires</th>
                  <th style={{ textAlign: 'right' }}>Heures</th>
                  <th>Statut / Absence</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.date} className={l.weekend ? 'muted' : undefined}>
                    <td>{l.jourLabel}</td>
                    <td>
                      {l.saisie ? (
                        describeHoraires(l.saisie)
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {l.saisie ? (
                        formatMinutes(l.saisie.totalMinutes)
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {l.saisie && <StatusBadge statut={l.saisie.statut} />}
                      {l.conge && (
                        <span className="badge validee">
                          🌴 {labelDe(l.conge.type)}
                        </span>
                      )}
                      {l.ferie && !l.saisie && (
                        <span className="badge en_attente">Férié — {l.ferie.label}</span>
                      )}
                      {!l.saisie && !l.conge && !l.ferie && l.weekend && (
                        <span className="muted">week-end</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totaux && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 className="section-title" style={{ marginTop: 0 }}>
                Totaux du mois
              </h3>
              <div className="form-grid">
                <div>
                  <div className="muted">Heures normales</div>
                  <div className="value">
                    {formatHeuresDecimal(minutesToDecimalHours(totaux.normalMin))}
                  </div>
                </div>
                <div>
                  <div className="muted">Heures supplémentaires</div>
                  <div className="value">
                    {formatHeuresDecimal(minutesToDecimalHours(totaux.supMin))}
                  </div>
                </div>
                <div>
                  <div className="muted">Total retenu</div>
                  <div className="value">
                    {formatHeuresDecimal(minutesToDecimalHours(totaux.totalMin))}
                  </div>
                </div>
              </div>
              {totaux.enAttenteMin > 0 && (
                <p className="alert error" style={{ marginTop: '0.75rem' }}>
                  {formatMinutes(totaux.enAttenteMin)} encore <strong>en attente
                  de validation</strong> : ces heures ne sont pas comptées dans les
                  totaux ci-dessus ni dans l'export.
                </p>
              )}
              <p className="muted" style={{ marginTop: '0.75rem' }}>
                Absences :{' '}
                {totaux.parType.size === 0
                  ? 'aucune'
                  : [...totaux.parType.entries()]
                      .map(([code, n]) => `${labelDe(code)} : ${n} j`)
                      .join(' · ')}
              </p>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                Les heures supplémentaires sont calculées par semaine complète
                (seuil {collab.contrat.seuilHebdo || regles.seuilHsupDefautHebdo} h),
                puis réparties entre les mois : une semaine à cheval est donc
                comptée au prorata.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
