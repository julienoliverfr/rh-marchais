import { useRef, useState } from 'react'
import { useDataStore } from '../../../store/dataStore'
import Breadcrumb from '../../../components/Breadcrumb'
import { useToast } from '../../../components/Toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import { todayISO } from '../../../lib/dates'
import {
  PARAM_FORMAT,
  PARAM_VERSION,
  lireParametrage,
  nomFichierParametrage,
  resumeDe,
  serialiserParametrage,
  telechargerJson,
} from '../../../lib/parametrage'
import type { ParametrageBundle, ParametrageResume } from '../../../lib/parametrage'

// Administration → Paramétrage. Exporte la CONFIGURATION dans un fichier JSON
// et permet de la rejouer sur un autre serveur (ou après réinstallation).
// L'import est volontairement ADDITIF (ajout/mise à jour) : il ne supprime
// jamais un élément existant, pour éviter toute perte accidentelle.
export default function Parametrage() {
  const familles = useDataStore((s) => s.familles)
  const modeles = useDataStore((s) => s.modeles)
  const typesAbsence = useDataStore((s) => s.typesAbsence)
  const politiques = useDataStore((s) => s.politiques)
  const regles = useDataStore((s) => s.regles)
  const joursFeries = useDataStore((s) => s.joursFeries)

  const saveFamille = useDataStore((s) => s.saveFamille)
  const saveModele = useDataStore((s) => s.saveModele)
  const saveTypeAbsence = useDataStore((s) => s.saveTypeAbsence)
  const setPolitique = useDataStore((s) => s.setPolitique)
  const setRegles = useDataStore((s) => s.setRegles)
  const saveJourFerie = useDataStore((s) => s.saveJourFerie)

  const toast = useToast()
  const confirm = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)

  const [bundle, setBundle] = useState<ParametrageBundle | null>(null)
  const [resume, setResume] = useState<ParametrageResume | null>(null)
  const [fileName, setFileName] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  // ------------------------------- Export -----------------------------------
  function handleExport() {
    const b: ParametrageBundle = {
      format: PARAM_FORMAT,
      version: PARAM_VERSION,
      exporteLe: new Date().toISOString(),
      equipes: familles,
      modeles,
      typesAbsence,
      politiques,
      regles,
      joursFeries,
    }
    telechargerJson(serialiserParametrage(b), nomFichierParametrage(todayISO()))
    toast.success('Paramétrage exporté.')
  }

  // ------------------------------- Import -----------------------------------
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // autorise la re-sélection du même fichier
    if (!file) return
    setErreur(null)
    setBundle(null)
    setResume(null)
    setFileName(file.name)

    const texte = await file.text()
    const res = lireParametrage(texte)
    if (!res.ok) {
      setErreur(res.error)
      return
    }
    setBundle(res.bundle)
    setResume(resumeDe(res.bundle))
  }

  async function appliquer() {
    if (!bundle) return
    const ok = await confirm({
      title: 'Appliquer ce paramétrage ?',
      message:
        'Les éléments du fichier seront ajoutés ou mis à jour. Aucun élément existant ne sera supprimé. Continuer ?',
      confirmLabel: 'Appliquer',
    })
    if (!ok) return

    // Ordre volontaire : les modèles peuvent être référencés par les contrats,
    // les types d'absence par les politiques.
    bundle.equipes.forEach(saveFamille)
    bundle.modeles.forEach(saveModele)
    bundle.typesAbsence.forEach(saveTypeAbsence)
    Object.entries(bundle.politiques).forEach(([typeId, p]) => {
      if (p) setPolitique(typeId as Parameters<typeof setPolitique>[0], p)
    })
    if (bundle.regles) setRegles(bundle.regles)
    bundle.joursFeries.forEach(saveJourFerie)

    setBundle(null)
    setResume(null)
    setFileName('')
    toast.success('Paramétrage importé.')
  }

  const lignesResume = (r: ParametrageResume) => [
    { label: 'Équipes', n: r.equipes },
    { label: 'Modèles de contrat', n: r.modeles },
    { label: "Types d'absence", n: r.typesAbsence },
    { label: 'Politiques de congés', n: r.politiques },
    { label: 'Jours fériés personnalisés', n: r.joursFeries },
  ]

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Administration', to: '/responsable/admin' },
          { label: 'Paramétrage' },
        ]}
      />
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Paramétrage (sauvegarde &amp; transfert)
      </h2>
      <p className="muted">
        Exportez la configuration de l'application dans un fichier, pour la
        sauvegarder ou la rejouer sur un autre serveur. Les collaborateurs, les
        comptes et les données de saisie <strong>ne sont pas concernés</strong>
        {' '}(les collaborateurs ont leur propre import).
      </p>

      <div className="card">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          Exporter
        </h3>
        <p className="muted">
          Contenu actuel : {familles.length} équipe(s) · {modeles.length} modèle(s)
          · {typesAbsence.length} type(s) d'absence ·{' '}
          {Object.keys(politiques).length} politique(s) · {joursFeries.length} jour(s)
          férié(s) personnalisé(s) · règles générales.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={handleExport}>
            Exporter le paramétrage (JSON)
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          Importer
        </h3>
        <p className="muted">
          Choisissez un fichier exporté depuis cette application. Un aperçu
          s'affiche <strong>avant</strong> tout enregistrement.
        </p>
        <div className="btn-row">
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>
            Choisir un fichier…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          {fileName && <span className="muted">{fileName}</span>}
        </div>

        {erreur && (
          <p className="badge refusee" style={{ marginTop: '0.75rem' }}>
            {erreur}
          </p>
        )}

        {resume && bundle && (
          <div style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Élément</th>
                  <th style={{ textAlign: 'right' }}>Dans le fichier</th>
                </tr>
              </thead>
              <tbody>
                {lignesResume(resume).map((l) => (
                  <tr key={l.label}>
                    <td>{l.label}</td>
                    <td style={{ textAlign: 'right' }}>{l.n}</td>
                  </tr>
                ))}
                <tr>
                  <td>Règles générales</td>
                  <td style={{ textAlign: 'right' }}>{resume.regles ? 'oui' : '—'}</td>
                </tr>
              </tbody>
            </table>
            {resume.exporteLe && (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                Fichier exporté le {resume.exporteLe.slice(0, 10)}.
              </p>
            )}
            <div className="btn-row" style={{ marginTop: '0.75rem' }}>
              <button className="btn" onClick={appliquer}>
                Appliquer ce paramétrage
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  setBundle(null)
                  setResume(null)
                  setFileName('')
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
