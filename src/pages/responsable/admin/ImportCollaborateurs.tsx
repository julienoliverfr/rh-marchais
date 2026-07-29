import { useMemo, useRef, useState } from 'react'
import { useDataStore } from '../../../store/dataStore'
import { typeASolde } from '../../../lib/conges'
import DataTable from '../../../components/DataTable'
import type { ColumnDef, FacetDef } from '../../../components/DataTable'
import Breadcrumb from '../../../components/Breadcrumb'
import { useToast } from '../../../components/Toast'
import type { ImportResult } from '../../../types'
import {
  downloadModeleCsv,
  downloadModeleXlsx,
  parseImportFile,
  validateImportRows,
  buildImportHeaders,
  MOT_DE_PASSE_DEFAUT,
} from '../../../lib/importCollaborateurs'
import type {
  TypeSoldeInfo,
  ValidatedImportRow,
} from '../../../lib/importCollaborateurs'

// Assistant d'import de collaborateurs en 3 étapes (une page, plusieurs états) :
//  1. Modèle & fichier   — télécharger le modèle, déposer un .csv / .xlsx
//  2. Aperçu & validation — tableau avec statut par ligne + compteur
//  3. Import & rapport    — matérialise les lignes valides, rapport détaillé
type Etape = 'fichier' | 'apercu' | 'rapport'

interface Rapport {
  result: ImportResult
  ignores: ValidatedImportRow[]
}

export default function ImportCollaborateurs() {
  const familles = useDataStore((s) => s.familles)
  const modeles = useDataStore((s) => s.modeles)
  const comptes = useDataStore((s) => s.comptes)
  const typesAbsence = useDataStore((s) => s.typesAbsence)
  const importerCollaborateurs = useDataStore((s) => s.importerCollaborateurs)
  const toast = useToast()

  // Types à solde configurés → une colonne « Solde initial — <libellé> » chacun.
  const typesSolde = useMemo<TypeSoldeInfo[]>(
    () =>
      typesAbsence
        .filter((t) => typeASolde(t))
        .map((t) => ({ code: t.code, label: t.label })),
    [typesAbsence],
  )

  const [etape, setEtape] = useState<Etape>('fichier')
  const [fileName, setFileName] = useState<string>('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [validated, setValidated] = useState<ValidatedImportRow[]>([])
  const [rapport, setRapport] = useState<Rapport | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const nbValides = useMemo(
    () => validated.filter((v) => v.valid).length,
    [validated],
  )
  const nbErreurs = validated.length - nbValides

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Réinitialise l'input pour autoriser la re-sélection du même fichier.
    e.target.value = ''
    if (!file) return
    setParseError(null)

    const parsed = await parseImportFile(file, typesSolde)
    if (!parsed.ok) {
      setParseError(parsed.error)
      setValidated([])
      setFileName(file.name)
      return
    }

    const rows = validateImportRows(parsed.rows, {
      familles,
      modeles,
      existingIdentifiants: comptes.map((c) => c.identifiant),
      typesSolde,
    })
    setValidated(rows)
    setFileName(file.name)
    setEtape('apercu')
  }

  function handleImport() {
    const payloads = validated
      .filter((v) => v.valid && v.payload)
      .map((v) => v.payload!)
    if (payloads.length === 0 || importing) return
    setImporting(true)
    // Laisse le navigateur peindre l'état « occupé » avant l'import synchrone.
    setTimeout(() => {
      const result = importerCollaborateurs(payloads)
      setRapport({ result, ignores: validated.filter((v) => !v.valid) })
      setEtape('rapport')
      toast.success(
        `Import terminé : ${result.importes} importé${result.importes > 1 ? 's' : ''}.`,
      )
      setImporting(false)
    }, 30)
  }

  function reset() {
    setEtape('fichier')
    setFileName('')
    setParseError(null)
    setValidated([])
    setRapport(null)
  }

  // Colonnes de l'aperçu (étape 2). Statut = badge ✅ / ❌ + détail des erreurs.
  const columns: ColumnDef<ValidatedImportRow>[] = [
    {
      key: 'ligne',
      label: 'Ligne',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (r) => r.raw.ligne,
      render: (r) => r.raw.ligne,
    },
    {
      key: 'statut',
      label: 'Statut',
      sortable: true,
      sortAccessor: (r) => (r.valid ? 0 : 1),
      sortType: 'number',
      render: (r) =>
        r.valid ? (
          <span className="badge validee">✅ Valide</span>
        ) : (
          <span className="badge refusee">❌ Erreur</span>
        ),
    },
    {
      key: 'nom',
      label: 'Nom',
      sortable: true,
      sortAccessor: (r) => `${r.raw.nom} ${r.raw.prenom}`,
      render: (r) => `${r.raw.prenom} ${r.raw.nom}`.trim() || '—',
    },
    {
      key: 'identifiant',
      label: 'Identifiant',
      sortable: true,
      sortAccessor: (r) => r.raw.identifiant,
      render: (r) => (r.raw.identifiant ? <code>{r.raw.identifiant}</code> : '—'),
    },
    {
      key: 'famille',
      label: 'Équipe',
      sortable: true,
      sortAccessor: (r) => r.raw.famille,
      render: (r) => r.raw.famille || '—',
    },
    {
      key: 'compte',
      label: 'Compte',
      align: 'center',
      sortable: true,
      sortAccessor: (r) => (r.raw.creerCompte ? 1 : 0),
      render: (r) =>
        r.raw.creerCompte ? (
          <span className="badge validee">Créé</span>
        ) : (
          <span className="muted">Sans accès</span>
        ),
    },
    {
      key: 'modele',
      label: 'Modèle',
      sortable: true,
      sortAccessor: (r) => r.raw.modele,
      render: (r) => r.raw.modele || '—',
    },
    {
      key: 'date',
      label: "Date d'entrée",
      render: (r) => r.raw.dateEntree || '—',
    },
    {
      key: 'solde',
      label: 'Solde initial',
      render: (r) => r.raw.soldeAffichage || '—',
    },
    {
      key: 'erreurs',
      label: 'Détail',
      render: (r) =>
        r.valid ? (
          <span className="muted">—</span>
        ) : (
          <span className="alert error" style={{ margin: 0, display: 'inline-block', padding: '0.2rem 0.5rem' }}>
            {r.errors.join(' ')}
          </span>
        ),
    },
  ]

  const filters: FacetDef<ValidatedImportRow>[] = [
    {
      key: 'statut',
      label: 'Statut',
      type: 'select',
      options: [
        { value: 'ok', label: 'Valides' },
        { value: 'ko', label: 'En erreur' },
      ],
      accessor: (r) => (r.valid ? 'ok' : 'ko'),
    },
  ]

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Administration', to: '/responsable/admin' },
          { label: 'Import de données' },
        ]}
      />
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Import de données · collaborateurs
        </h2>
        {etape !== 'fichier' && (
          <button className="btn secondary small" onClick={reset}>
            Recommencer
          </button>
        )}
      </div>

      {/* Rappel des étapes */}
      <p className="muted" style={{ marginTop: '0.2rem' }}>
        Étape {etape === 'fichier' ? 1 : etape === 'apercu' ? 2 : 3} / 3 —{' '}
        {etape === 'fichier'
          ? 'Modèle & fichier'
          : etape === 'apercu'
            ? 'Aperçu & validation'
            : 'Import & rapport'}
      </p>

      {/* ---------- Étape 1 : Modèle & fichier ---------- */}
      {etape === 'fichier' && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            1. Télécharger le modèle
          </h3>
          <p className="muted">
            Colonnes attendues :{' '}
            <strong>{buildImportHeaders(typesSolde).join(' · ')}</strong>.
            <br />
            Requis : Nom, Prénom, Identifiant, Équipe, Modèle de contrat.
            La colonne « Créer un compte » (oui/non, vide = oui) permet
            d'importer un collaborateur <strong>sans accès</strong> à
            l'application : ses heures seront saisies par un responsable ou un
            collègue délégué.
            Optionnels : Date d'entrée (AAAA-MM-JJ ou JJ/MM/AAAA), un solde
            initial par type à solde (nombre, virgule FR), Mot de passe (défaut
            «&nbsp;{MOT_DE_PASSE_DEFAUT}&nbsp;» si vide).
          </p>
          <div className="btn-row">
            <button
              className="btn secondary"
              onClick={() => downloadModeleCsv(typesSolde)}
            >
              Télécharger le modèle (CSV)
            </button>
            <button
              className="btn secondary"
              onClick={() => downloadModeleXlsx(typesSolde)}
            >
              Télécharger le modèle (Excel)
            </button>
          </div>

          <h3 className="section-title">2. Déposer votre fichier</h3>
          <p className="muted">Formats acceptés : .csv, .xlsx</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFile}
          />

          {parseError && (
            <div className="alert error" style={{ marginTop: '1rem' }}>
              {parseError}
            </div>
          )}
        </div>
      )}

      {/* ---------- Étape 2 : Aperçu & validation ---------- */}
      {etape === 'apercu' && (
        <div style={{ marginTop: '1rem' }}>
          <div className="alert info">
            Fichier «&nbsp;<strong>{fileName}</strong>&nbsp;» —{' '}
            <strong>{nbValides}</strong> valide{nbValides > 1 ? 's' : ''} /{' '}
            <strong>{nbErreurs}</strong> en erreur sur {validated.length} ligne
            {validated.length > 1 ? 's' : ''}.
            {nbValides === 0 &&
              ' Aucune ligne valide : corrigez le fichier puis réimportez.'}
          </div>

          <DataTable
            rows={validated}
            columns={columns}
            filters={filters}
            rowKey={(r) => String(r.raw.ligne)}
            search={{
              accessor: (r) =>
                `${r.raw.nom} ${r.raw.prenom} ${r.raw.identifiant}`,
              placeholder: 'Rechercher une ligne…',
            }}
            defaultSort={{ key: 'ligne', dir: 'asc' }}
            emptyLabel="Aucune ligne."
          />

          <div className="btn-row" style={{ marginTop: '1rem' }}>
            <button
              className={`btn${importing ? ' is-busy' : ''}`}
              disabled={nbValides === 0 || importing}
              title={
                nbValides === 0
                  ? 'Aucune ligne valide à importer'
                  : `Importer ${nbValides} collaborateur(s)`
              }
              onClick={handleImport}
            >
              {importing
                ? 'Import en cours…'
                : `Importer ${nbValides} collaborateur${nbValides > 1 ? 's' : ''}`}
            </button>
            <button className="btn secondary" onClick={reset}>
              Choisir un autre fichier
            </button>
          </div>
        </div>
      )}

      {/* ---------- Étape 3 : Import & rapport ---------- */}
      {etape === 'rapport' && rapport && (
        <div style={{ marginTop: '1rem' }}>
          <div className="alert info">
            Import terminé : <strong>{rapport.result.importes}</strong> importé
            {rapport.result.importes > 1 ? 's' : ''},{' '}
            <strong>{rapport.ignores.length}</strong> ignoré
            {rapport.ignores.length > 1 ? 's' : ''}.
          </div>

          {rapport.ignores.length > 0 && (
            <div className="card">
              <h3 className="section-title" style={{ marginTop: 0 }}>
                Lignes ignorées ({rapport.ignores.length})
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="dt-right">Ligne</th>
                      <th>Identifiant</th>
                      <th>Raison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rapport.ignores.map((r) => (
                      <tr key={r.raw.ligne}>
                        <td className="dt-right">{r.raw.ligne}</td>
                        <td>
                          {r.raw.identifiant ? (
                            <code>{r.raw.identifiant}</code>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{r.errors.join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: '1rem' }}>
            <button className="btn" onClick={reset}>
              Nouvel import
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
