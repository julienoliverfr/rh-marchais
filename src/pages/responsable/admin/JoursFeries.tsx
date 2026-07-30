import { useMemo, useState } from 'react'
import type { JourFerie } from '../../../types'
import { useDataStore } from '../../../store/dataStore'
import { feriesCalcules } from '../../../lib/feries'
import { formatDateFr, todayISO } from '../../../lib/dates'
import Breadcrumb from '../../../components/Breadcrumb'
import FieldError from '../../../components/FieldError'
import { useToast } from '../../../components/Toast'
import { useConfirm } from '../../../components/ConfirmDialog'

// Administration → Jours fériés. Les fériés NATIONAUX sont calculés
// automatiquement (voir lib/feries.ts) et affichés à titre indicatif. On gère
// ici une SURCOUCHE de jours personnalisés : ajouter un « pont » chômé, ou
// marquer un férié national comme TRAVAILLÉ (il sera alors décompté).
export default function JoursFeries() {
  const joursFeries = useDataStore((s) => s.joursFeries)
  const saveJourFerie = useDataStore((s) => s.saveJourFerie)
  const deleteJourFerie = useDataStore((s) => s.deleteJourFerie)
  const toast = useToast()
  const confirm = useConfirm()

  const [annee, setAnnee] = useState<number>(Number(todayISO().slice(0, 4)))
  const [draft, setDraft] = useState<JourFerie | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)

  const customParDate = useMemo(
    () => new Map(joursFeries.map((j) => [j.date, j])),
    [joursFeries],
  )
  const feriesNationaux = feriesCalcules(annee)

  function startCreate() {
    setDateError(null)
    setDraft({ date: '', label: '', chome: true })
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    if (!draft.date) {
      setDateError('La date est obligatoire.')
      return
    }
    saveJourFerie({ ...draft, label: draft.label.trim() || 'Jour chômé' })
    setDraft(null)
    setDateError(null)
    toast.success('Jour enregistré.')
  }

  async function handleDelete(j: JourFerie) {
    const ok = await confirm({
      title: 'Supprimer ce jour',
      message: `Supprimer « ${j.label} » du ${formatDateFr(j.date)} ? Le calcul reviendra à la règle nationale pour cette date.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    deleteJourFerie(j.date)
    toast.success('Jour supprimé.')
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Administration', to: '/responsable/admin' },
          { label: 'Jours fériés' },
        ]}
      />
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Jours fériés
        </h2>
        {!draft && (
          <button className="btn ocre small" onClick={startCreate}>
            + Ajouter un jour
          </button>
        )}
      </div>
      <p className="muted">
        Les fériés nationaux sont gérés automatiquement (jamais décomptés des
        congés). Ajoutez ici un <strong>pont chômé</strong>, ou marquez un férié
        comme <strong>travaillé</strong> pour qu'il soit décompté.
      </p>

      {draft && (
        <form className="card" onSubmit={handleSave} style={{ marginTop: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            Ajouter un jour
          </h3>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="date">Date</label>
              <input
                id="date"
                type="date"
                value={draft.date}
                onChange={(e) => {
                  setDraft({ ...draft, date: e.target.value })
                  if (dateError) setDateError(null)
                }}
                autoFocus
              />
              <FieldError id="ferie-date-err" message={dateError} />
            </div>
            <div className="form-row">
              <label htmlFor="label">Libellé</label>
              <input
                id="label"
                value={draft.label}
                placeholder="Ex. Pont de l'Ascension"
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="chome">Ce jour est</label>
              <select
                id="chome"
                value={draft.chome ? 'chome' : 'travaille'}
                onChange={(e) =>
                  setDraft({ ...draft, chome: e.target.value === 'chome' })
                }
              >
                <option value="chome">Chômé (non décompté)</option>
                <option value="travaille">Travaillé (décompté)</option>
              </select>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn" type="submit">
              Enregistrer
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => setDraft(null)}
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <h3 className="section-title" style={{ marginTop: '1.5rem' }}>
        Jours personnalisés
      </h3>
      {joursFeries.length === 0 ? (
        <p className="muted">Aucun jour personnalisé.</p>
      ) : (
        <div className="table-wrap">
          <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Libellé</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...joursFeries]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((j) => (
                <tr key={j.date}>
                  <td>{formatDateFr(j.date)}</td>
                  <td>{j.label}</td>
                  <td>
                    {j.chome ? (
                      <span className="badge validee">Chômé</span>
                    ) : (
                      <span className="badge en_attente">Travaillé</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn danger small"
                      onClick={() => handleDelete(j)}
                    >
                      Suppr.
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
          </table>
        </div>
      )}

      <div className="page-head" style={{ marginTop: '1.5rem' }}>
        <h3 className="section-title" style={{ margin: 0 }}>
          Fériés nationaux {annee}
        </h3>
        <div className="btn-row">
          <button
            className="btn secondary small"
            onClick={() => setAnnee((a) => a - 1)}
          >
            ◀ {annee - 1}
          </button>
          <button
            className="btn secondary small"
            onClick={() => setAnnee((a) => a + 1)}
          >
            {annee + 1} ▶
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Férié</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {feriesNationaux.map((f) => {
            const over = customParDate.get(f.date)
            const chome = over ? over.chome : true
            return (
              <tr key={f.date}>
                <td>{formatDateFr(f.date)}</td>
                <td>{f.label}</td>
                <td>
                  {chome ? (
                    <span className="badge validee">Chômé</span>
                  ) : (
                    <span className="badge en_attente">Travaillé (forcé)</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}
