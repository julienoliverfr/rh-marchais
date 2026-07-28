import { useEffect, useMemo, useState } from 'react'
import type {
  CongeType,
  ModeAcquisition,
  ModeReport,
  PalierAnciennete,
  PolitiqueConges as Politique,
} from '../../types'
import { useDataStore } from '../../store/dataStore'
import { typeASolde } from '../../lib/conges'
import { POLITIQUE_DEFAUT, apercuPolitique, periodePour } from '../../lib/soldes'
import { formatDateFrNum, todayISO } from '../../lib/dates'
import Breadcrumb from '../../components/Breadcrumb'
import { useToast } from '../../components/Toast'

const MOIS_LABELS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

export default function PolitiqueCongesPage() {
  const politiques = useDataStore((s) => s.politiques)
  const typesAbsence = useDataStore((s) => s.typesAbsence)
  const setPolitique = useDataStore((s) => s.setPolitique)
  const toast = useToast()

  // Types à solde : chacun a sa propre politique (sélecteur en tête de page).
  const typesSolde = useMemo(
    () => typesAbsence.filter((t) => typeASolde(t)),
    [typesAbsence],
  )
  const [typeId, setTypeId] = useState<CongeType>('conge_paye')
  const politiqueCourante = politiques[typeId] ?? POLITIQUE_DEFAUT

  // Brouillon local édité par le formulaire (appliqué au clic sur Enregistrer).
  const [draft, setDraft] = useState<Politique>(politiqueCourante)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Réinitialise le brouillon quand on change de type (ou que la politique
  // stockée change), pour toujours éditer la bonne politique.
  useEffect(() => {
    setDraft(politiques[typeId] ?? POLITIQUE_DEFAUT)
    setErrorMsg(null)
  }, [typeId, politiques])

  const labelType =
    typesAbsence.find((t) => t.code === typeId)?.label ?? typeId

  // Aperçu de la période courante calculé sur le brouillon.
  const periode = useMemo(() => periodePour(todayISO(), draft), [draft])

  function set<K extends keyof Politique>(key: K, value: Politique[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  // ---- Édition des paliers d'ancienneté ----
  function setPalier(idx: number, patch: Partial<PalierAnciennete>) {
    setDraft((d) => ({
      ...d,
      paliersAnciennete: d.paliersAnciennete.map((p, i) =>
        i === idx ? { ...p, ...patch } : p,
      ),
    }))
  }
  function ajouterPalier() {
    setDraft((d) => ({
      ...d,
      paliersAnciennete: [...d.paliersAnciennete, { ansMin: 0, jours: 0 }],
    }))
  }
  function supprimerPalier(idx: number) {
    setDraft((d) => ({
      ...d,
      paliersAnciennete: d.paliersAnciennete.filter((_, i) => i !== idx),
    }))
  }

  // Nombre de jours possibles pour le mois de début choisi (borne le jour).
  const joursDuMois = useMemo(() => {
    const n = new Date(Date.UTC(2001, draft.debutMois, 0)).getUTCDate()
    return n
  }, [draft.debutMois])

  const estAnciennete = draft.modeAcquisition === 'anciennete'

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    // Validations simples.
    if (draft.quotaAnnuel < 0 || draft.tauxMensuel < 0 || draft.plafondReport < 0) {
      setErrorMsg('Les valeurs numériques ne peuvent pas être négatives.')
      return
    }
    if (draft.debutJour < 1 || draft.debutJour > joursDuMois) {
      setErrorMsg('Jour de début de période invalide pour le mois choisi.')
      return
    }
    if (
      draft.report !== 'perdu' &&
      (!Number.isInteger(draft.reportExpirationMois) ||
        draft.reportExpirationMois < 0)
    ) {
      setErrorMsg("L'expiration du report doit être un entier positif (en mois).")
      return
    }
    if (
      estAnciennete &&
      draft.paliersAnciennete.some((p) => p.ansMin < 0 || p.jours < 0)
    ) {
      setErrorMsg('Les paliers d’ancienneté ne peuvent pas être négatifs.')
      return
    }
    // Enregistre la politique DU TYPE sélectionné, paliers triés par ancienneté.
    const aEnregistrer: Politique = {
      ...draft,
      paliersAnciennete: [...draft.paliersAnciennete].sort(
        (a, b) => a.ansMin - b.ansMin,
      ),
    }
    setPolitique(typeId, aEnregistrer)
    setErrorMsg(null)
    toast.success(`Politique « ${labelType} » enregistrée.`)
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Administration', to: '/responsable/admin' },
          { label: 'Politique de congés' },
        ]}
      />
      <div className="page-head">
        <h2 className="section-title" style={{ marginTop: 0 }}>
          Politique de congés
        </h2>
      </div>

      {/* Sélecteur de type à solde : édite la politique de ce type. */}
      <div className="seg" style={{ marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        {typesSolde.map((t) => (
          <button
            key={t.code}
            className={t.code === typeId ? 'active' : ''}
            onClick={() => setTypeId(t.code)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="alert info">
        <strong>{labelType}</strong> · Période courante :{' '}
        <strong>{formatDateFrNum(periode.debut)}</strong> →{' '}
        <strong>{formatDateFrNum(periode.fin)}</strong> ({periode.label}) ·{' '}
        {apercuPolitique(draft)}
        {!estAnciennete && draft.prorataEntree ? ' · prorata à l’entrée' : ''}
      </div>

      <form className="card" onSubmit={handleSave}>
        {errorMsg && <div className="alert error">{errorMsg}</div>}

        {/* --- Période de référence --- */}
        <h3 className="section-title" style={{ marginTop: 0 }}>
          Période de référence
        </h3>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="debutJour">Jour de début</label>
            <input
              id="debutJour"
              type="number"
              min={1}
              max={joursDuMois}
              value={draft.debutJour}
              onChange={(e) => set('debutJour', Number(e.target.value))}
            />
          </div>
          <div className="form-row">
            <label htmlFor="debutMois">Mois de début</label>
            <select
              id="debutMois"
              value={draft.debutMois}
              onChange={(e) => set('debutMois', Number(e.target.value))}
            >
              {MOIS_LABELS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="muted" style={{ marginTop: '0.2rem' }}>
          La période dure 12 mois (fin = veille du même jour un an après).
        </p>

        {/* --- Acquisition --- */}
        <h3 className="section-title">Acquisition</h3>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="mode">Mode d'acquisition</label>
            <select
              id="mode"
              value={draft.modeAcquisition}
              onChange={(e) =>
                set('modeAcquisition', e.target.value as ModeAcquisition)
              }
            >
              <option value="forfait">Forfait (quota annuel plein)</option>
              <option value="mensuel">Mensuel (au fil des mois travaillés)</option>
              <option value="anciennete">Ancienneté (paliers)</option>
            </select>
          </div>
          {!estAnciennete && (
            <div className="form-row">
              <label htmlFor="quota">Quota par défaut (jours)</label>
              <input
                id="quota"
                type="number"
                min={0}
                step={0.5}
                value={draft.quotaAnnuel}
                onChange={(e) => set('quotaAnnuel', Number(e.target.value))}
              />
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Repli utilisé quand le contrat (ou son modèle) ne précise pas de
                quota pour ce type. Un quota défini sur le contrat prime.
              </span>
            </div>
          )}
          {draft.modeAcquisition === 'mensuel' && (
            <div className="form-row">
              <label htmlFor="taux">Taux mensuel (jours/mois)</label>
              <input
                id="taux"
                type="number"
                min={0}
                step={0.01}
                value={draft.tauxMensuel}
                onChange={(e) => set('tauxMensuel', Number(e.target.value))}
              />
            </div>
          )}
          {!estAnciennete && (
            <div className="form-row">
              <label htmlFor="prorata">Prorata à l'entrée</label>
              <select
                id="prorata"
                value={draft.prorataEntree ? 'oui' : 'non'}
                onChange={(e) => set('prorataEntree', e.target.value === 'oui')}
              >
                <option value="oui">Oui (proratiser si entrée en cours de période)</option>
                <option value="non">Non (quota plein)</option>
              </select>
            </div>
          )}
        </div>

        {/* --- Éditeur de paliers d'ancienneté --- */}
        {estAnciennete && (
          <>
            <h3 className="section-title">Paliers d'ancienneté</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              À partir de <em>N</em> ans d'ancienneté (révolus), le collaborateur
              acquiert <em>Y</em> jours. Le palier le plus élevé atteint prime.
              L'ancienneté est calculée depuis la date d'entrée du contrat.
            </p>
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>≥ ancienneté (ans)</th>
                    <th>Jours acquis</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {draft.paliersAnciennete.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        Aucun palier. Ajoutez-en un ci-dessous.
                      </td>
                    </tr>
                  ) : (
                    draft.paliersAnciennete.map((p, idx) => (
                      <tr key={idx}>
                        <td data-label="≥ ancienneté (ans)">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            style={{ width: '90px' }}
                            value={p.ansMin}
                            onChange={(e) =>
                              setPalier(idx, { ansMin: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td data-label="Jours acquis">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            style={{ width: '90px' }}
                            value={p.jours}
                            onChange={(e) =>
                              setPalier(idx, { jours: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn danger small"
                            onClick={() => supprimerPalier(idx)}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="btn-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn secondary small" onClick={ajouterPalier}>
                Ajouter un palier
              </button>
            </div>
          </>
        )}

        {/* --- Report --- */}
        <h3 className="section-title">Report d'une période sur l'autre</h3>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="report">Mode de report</label>
            <select
              id="report"
              value={draft.report}
              onChange={(e) => set('report', e.target.value as ModeReport)}
            >
              <option value="perdu">Perdu (solde remis à zéro)</option>
              <option value="integral">Intégral (tout le restant est reporté)</option>
              <option value="plafonne">Plafonné (report limité)</option>
            </select>
          </div>
          {draft.report === 'plafonne' && (
            <div className="form-row">
              <label htmlFor="plafond">Plafond de report (jours)</label>
              <input
                id="plafond"
                type="number"
                min={0}
                step={0.5}
                value={draft.plafondReport}
                onChange={(e) => set('plafondReport', Number(e.target.value))}
              />
            </div>
          )}
          {draft.report !== 'perdu' && (
            <div className="form-row">
              <label htmlFor="reportExp">Expiration du report (mois)</label>
              <input
                id="reportExp"
                type="number"
                min={0}
                step={1}
                value={draft.reportExpirationMois}
                onChange={(e) =>
                  set('reportExpirationMois', Number(e.target.value))
                }
              />
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Nombre de mois après le début de la période au-delà duquel les
                jours reportés non consommés sont perdus.
              </span>
            </div>
          )}
        </div>

        <div className="btn-row" style={{ marginTop: '0.8rem' }}>
          <button className="btn" type="submit">
            Enregistrer
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setDraft(politiques[typeId] ?? POLITIQUE_DEFAUT)
              setErrorMsg(null)
            }}
          >
            Réinitialiser le formulaire
          </button>
        </div>
      </form>
    </div>
  )
}
