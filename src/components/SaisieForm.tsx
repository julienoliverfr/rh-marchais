import { useState } from 'react'
import type { Collaborateur, Famille, Periode, Saisie } from '../types'
import { useDataStore } from '../store/dataStore'
import { isoDaysAgo, todayISO } from '../lib/dates'
import {
  computeDemiJournees,
  computeJourneeContinue,
  formatMinutes,
} from '../lib/hours'
import HelpTip from './HelpTip'
import FieldError from './FieldError'
import { useToast } from './Toast'

interface Props {
  collaborateur: Collaborateur
  famille: Famille
  saisiPar: string // identifiant du compte qui saisit
  existing?: Saisie // édition d'une saisie existante
  onSaved: () => void
  onCancel?: () => void
}

const MAX_DATE = todayISO()

function uid(): string {
  return 'sai-' + Math.random().toString(36).slice(2, 10)
}

// Formulaire de saisie adapté à la famille. Réutilisé par l'employé et le
// responsable (saisie pour autrui).
export default function SaisieForm({
  collaborateur,
  famille,
  saisiPar,
  existing,
  onSaved,
  onCancel,
}: Props) {
  const saveSaisie = useDataStore((s) => s.saveSaisie)
  const corrigerSaisie = useDataStore((s) => s.corrigerSaisie)
  const toast = useToast()
  // Fenêtre de saisie rétroactive pilotée par les règles générales (Administration).
  const retroJours = useDataStore((s) => s.regles.saisieRetroJours)
  const MIN_DATE = isoDaysAgo(retroJours)
  const isContinu = famille.modeSaisie === 'journee_continue'

  const [date, setDate] = useState(existing?.date ?? MAX_DATE)
  // Erreurs affichées SOUS le champ concerné (validation en ligne).
  const [dateError, setDateError] = useState<string | null>(null)
  const [totalError, setTotalError] = useState<string | null>(null)

  // Champs journée continue
  const [heureDebut, setHeureDebut] = useState(existing?.heureDebut ?? '08:00')
  const [heureFin, setHeureFin] = useState(existing?.heureFin ?? '17:00')
  const [pauseMin, setPauseMin] = useState(
    existing?.pauseMin ?? famille.pauseDeduiteMin,
  )

  // Champs demi-journées
  const [periode, setPeriode] = useState<Periode>(existing?.periode ?? 'journee')
  const [matinDebut, setMatinDebut] = useState(existing?.matinDebut ?? '08:00')
  const [matinFin, setMatinFin] = useState(existing?.matinFin ?? '12:00')
  const [apremDebut, setApremDebut] = useState(existing?.apremDebut ?? '14:00')
  const [apremFin, setApremFin] = useState(existing?.apremFin ?? '17:00')

  const total = isContinu
    ? computeJourneeContinue(heureDebut, heureFin, pauseMin)
    : computeDemiJournees({ periode, matinDebut, matinFin, apremDebut, apremFin })

  const showMatin = periode === 'matin' || periode === 'journee'
  const showAprem = periode === 'apres_midi' || periode === 'journee'

  // Validation en ligne : renvoie true si tout est valide, sinon renseigne les
  // messages d'erreur sous les champs concernés.
  function validate(): boolean {
    let ok = true
    if (date < MIN_DATE) {
      setDateError(
        `Saisie rétroactive limitée à ${retroJours} jours. Date minimale autorisée : ${MIN_DATE}.`,
      )
      ok = false
    } else if (date > MAX_DATE) {
      setDateError('La date ne peut pas être dans le futur.')
      ok = false
    } else {
      setDateError(null)
    }
    if (total <= 0) {
      setTotalError('Le total calculé est nul : vérifiez les heures saisies.')
      ok = false
    } else {
      setTotalError(null)
    }
    return ok
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const base: Saisie = {
      id: existing?.id ?? uid(),
      collaborateurId: collaborateur.id,
      date,
      totalMinutes: total,
      statut: existing?.statut ?? 'en_attente',
      saisiPar,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }

    const saisie: Saisie = isContinu
      ? { ...base, heureDebut, heureFin, pauseMin }
      : {
          ...base,
          periode,
          matinDebut: showMatin ? matinDebut : undefined,
          matinFin: showMatin ? matinFin : undefined,
          apremDebut: showAprem ? apremDebut : undefined,
          apremFin: showAprem ? apremFin : undefined,
        }

    if (existing) {
      // Correction d'une saisie existante : journalisée + retour en attente.
      const res = corrigerSaisie(saisie, saisiPar)
      if (!res.ok) {
        toast.error(res.error ?? 'Correction impossible.')
        return
      }
      toast.success('Saisie corrigée (repassée « en attente »).')
    } else {
      saveSaisie(saisie)
      toast.success('Saisie enregistrée (statut « en attente »).')
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="date">Date (rétroactif jusqu'à {retroJours} jours)</label>
        <input
          id="date"
          type="date"
          value={date}
          min={MIN_DATE}
          max={MAX_DATE}
          aria-invalid={dateError ? true : undefined}
          aria-describedby={dateError ? 'date-err' : undefined}
          onChange={(e) => {
            setDate(e.target.value)
            if (dateError) setDateError(null)
          }}
        />
        <FieldError id="date-err" message={dateError} />
      </div>

      {isContinu ? (
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="hd">Heure début</label>
            <input
              id="hd"
              type="time"
              value={heureDebut}
              onChange={(e) => setHeureDebut(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="hf">Heure fin</label>
            <input
              id="hf"
              type="time"
              value={heureFin}
              onChange={(e) => setHeureFin(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="pause">
              Pause (min){' '}
              <HelpTip
                label="Pause"
                text="Le temps de pause à retirer de la journée (en minutes)."
              />
            </label>
            <input
              id="pause"
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              value={pauseMin}
              onChange={(e) => setPauseMin(Number(e.target.value))}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="form-row">
            <label>Période</label>
            <div className="seg">
              {(['matin', 'apres_midi', 'journee'] as Periode[]).map((p) => (
                <button
                  type="button"
                  key={p}
                  className={periode === p ? 'active' : ''}
                  onClick={() => setPeriode(p)}
                >
                  {p === 'matin'
                    ? 'Matin'
                    : p === 'apres_midi'
                      ? 'Après-midi'
                      : 'Journée'}
                </button>
              ))}
            </div>
          </div>

          {showMatin && (
            <div className="form-grid">
              <div className="form-row">
                <label htmlFor="md">Matin - début</label>
                <input
                  id="md"
                  type="time"
                  value={matinDebut}
                  onChange={(e) => setMatinDebut(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label htmlFor="mf">Matin - fin</label>
                <input
                  id="mf"
                  type="time"
                  value={matinFin}
                  onChange={(e) => setMatinFin(e.target.value)}
                />
              </div>
            </div>
          )}

          {showAprem && (
            <div className="form-grid">
              <div className="form-row">
                <label htmlFor="ad">Après-midi - début</label>
                <input
                  id="ad"
                  type="time"
                  value={apremDebut}
                  onChange={(e) => setApremDebut(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label htmlFor="af">Après-midi - fin</label>
                <input
                  id="af"
                  type="time"
                  value={apremFin}
                  onChange={(e) => setApremFin(e.target.value)}
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className="alert info">
        Total calculé : <strong>{formatMinutes(total)}</strong>
      </div>
      <FieldError id="total-err" message={totalError} />

      <div className="btn-row">
        <button type="submit" className="btn">
          {existing ? 'Enregistrer les modifications' : 'Enregistrer la saisie'}
        </button>
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}
