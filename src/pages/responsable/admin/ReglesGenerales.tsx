import { useState } from 'react'
import type { ReglesGenerales as Regles } from '../../../types'
import { useDataStore } from '../../../store/dataStore'
import Breadcrumb from '../../../components/Breadcrumb'
import { useToast } from '../../../components/Toast'

// Règles générales de l'application (config singleton `rh.regles`).
// Câblées réellement :
//  - saisieRetroJours borne la saisie rétroactive (SaisieForm) ;
//  - seuilHsupDefautHebdo sert de seuil h. sup de repli (nouveaux modèles +
//    agrégation d'export quand un contrat n'en définit pas) ;
//  - verrouillageApresExport pilote la proposition de verrouillage (Exports).
export default function ReglesGeneralesPage() {
  const regles = useDataStore((s) => s.regles)
  const setRegles = useDataStore((s) => s.setRegles)
  const toast = useToast()

  const [draft, setDraft] = useState<Regles>(regles)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  function set<K extends keyof Regles>(key: K, value: Regles[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (draft.saisieRetroJours < 0 || draft.seuilHsupDefautHebdo < 0) {
      setErrorMsg('Les valeurs numériques ne peuvent pas être négatives.')
      return
    }
    setRegles(draft)
    setErrorMsg(null)
    toast.success('Règles générales enregistrées.')
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Administration', to: '/responsable/admin' },
          { label: 'Règles générales' },
        ]}
      />
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Règles générales
      </h2>

      <form className="card" onSubmit={handleSave}>
        {errorMsg && <div className="alert error">{errorMsg}</div>}

        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="retro">Saisie rétroactive (jours)</label>
            <input
              id="retro"
              type="number"
              min={0}
              value={draft.saisieRetroJours}
              onChange={(e) => set('saisieRetroJours', Number(e.target.value))}
            />
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              Nombre de jours en arrière autorisés pour une saisie d'heures.
            </span>
          </div>
          <div className="form-row">
            <label htmlFor="seuil">Seuil h. sup hebdo par défaut (h)</label>
            <input
              id="seuil"
              type="number"
              min={0}
              value={draft.seuilHsupDefautHebdo}
              onChange={(e) => set('seuilHsupDefautHebdo', Number(e.target.value))}
            />
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              Utilisé quand un contrat ne définit pas son propre seuil.
            </span>
          </div>
          <div className="form-row">
            <label htmlFor="verrou">Verrouillage à l'export</label>
            <select
              id="verrou"
              value={draft.verrouillageApresExport ? 'oui' : 'non'}
              onChange={(e) =>
                set('verrouillageApresExport', e.target.value === 'oui')
              }
            >
              <option value="oui">Oui (proposer « verrouiller & envoyer »)</option>
              <option value="non">Non (export sans verrouillage)</option>
            </select>
            <span className="muted" style={{ fontSize: '0.8rem' }}>
              Fige les saisies validées du mois lors de l'export comptable.
            </span>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: '0.8rem' }}>
          <button className="btn" type="submit">
            Enregistrer
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setDraft(regles)
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
