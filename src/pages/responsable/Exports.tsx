import { useMemo, useState } from 'react'
import type { ExportFormat, Perimetre, RecapLigne } from '../../types'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import { currentMonthKey, formatMonthFr } from '../../lib/dates'
import { formatHeuresDecimal, formatJours } from '../../lib/hours'
import { downloadRecapCsv, downloadRecapXlsx } from '../../lib/exportFile'
import DataTable from '../../components/DataTable'
import type { ColumnDef, FacetDef } from '../../components/DataTable'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'

// Sentinelle « toutes familles » (alignée sur le repository).
const PERIMETRE_TOUTES: Perimetre = 'toutes'

function famillePillClass(nom: string): string {
  const key = nom.trim().toLowerCase()
  if (key === 'vignes') return 'pill-fam vignes'
  if (key === 'marchais') return 'pill-fam marchais'
  return 'pill-fam'
}

export default function Exports() {
  const session = useAuthStore((s) => s.session)
  const familles = useDataStore((s) => s.familles)
  // `saisies` / `conges` sont lus pour invalider l'aperçu quand les données
  // changent (validation, verrouillage...).
  const saisies = useDataStore((s) => s.saisies)
  const conges = useDataStore((s) => s.conges)
  const exports = useDataStore((s) => s.exports)
  // Règle générale : proposer (ou non) le verrouillage à l'export.
  const verrouillageActif = useDataStore((s) => s.regles.verrouillageApresExport)
  const buildRecapExport = useDataStore((s) => s.buildRecapExport)
  const verrouillerPeriode = useDataStore((s) => s.verrouillerPeriode)
  const toast = useToast()
  const confirm = useConfirm()

  const [periode, setPeriode] = useState(currentMonthKey())
  const [perimetre, setPerimetre] = useState<Perimetre>(PERIMETRE_TOUTES)
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [apercuVisible, setApercuVisible] = useState(false)
  // Bouton « occupé » pendant la génération synchrone du fichier.
  const [busy, setBusy] = useState<null | 'csv' | 'xlsx' | 'verrou'>(null)

  const parUser = session?.identifiant ?? '?'

  // Aperçu recalculé à chaque changement de sélection ou de données sous-jacentes.
  const recap = useMemo(
    () => buildRecapExport(periode, perimetre),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periode, perimetre, saisies, conges, buildRecapExport],
  )

  const aDesDonnees = recap.lignes.length > 0

  // Libellé lisible du périmètre (pour messages + nom de fichier).
  const perimetreLabel = useMemo(() => {
    if (perimetre === PERIMETRE_TOUTES) return 'Toutes familles'
    return familles.find((f) => f.id === perimetre)?.nom ?? perimetre
  }, [perimetre, familles])

  function handleApercu() {
    setApercuVisible(true)
  }

  function handleExportCsv() {
    if (!aDesDonnees || busy) return
    setBusy('csv')
    // Laisse le navigateur peindre l'état occupé avant la génération synchrone.
    setTimeout(() => {
      downloadRecapCsv(recap, perimetreLabel)
      toast.success(`Export CSV généré (${formatMonthFr(periode)}).`)
      setBusy(null)
    }, 30)
  }

  function handleExportXlsx() {
    if (!aDesDonnees || busy) return
    setBusy('xlsx')
    setTimeout(() => {
      downloadRecapXlsx(recap, perimetreLabel)
      toast.success(`Export Excel généré (${formatMonthFr(periode)}).`)
      setBusy(null)
    }, 30)
  }

  // Génère le fichier PUIS verrouille la période (saisies validée -> verrouillée)
  // et journalise l'export. Confirmation préalable (action sensible). En cas
  // d'échec du verrouillage, aucune donnée n'est modifiée (le repository lève
  // avant toute écriture si rien à verrouiller).
  async function handleVerrouiller() {
    if (!aDesDonnees || busy) return
    const ok = await confirm({
      title: 'Verrouiller la période',
      message: (
        <>
          Le fichier {format.toUpperCase()} de {formatMonthFr(periode)} (
          {perimetreLabel}) va être généré, puis les saisies validées du mois
          seront <strong>figées</strong> et transmises au service comptable.
          Elles ne seront plus modifiables par les collaborateurs. Souhaitez-vous
          continuer ?
        </>
      ),
      confirmLabel: 'Verrouiller et envoyer',
    })
    if (!ok) return

    setBusy('verrou')
    setTimeout(() => {
      // 1) Génère le fichier dans le format choisi.
      if (format === 'csv') downloadRecapCsv(recap, perimetreLabel)
      else downloadRecapXlsx(recap, perimetreLabel)

      // 2) Verrouille + journalise.
      const res = verrouillerPeriode(periode, perimetre, parUser, format)
      if (res.ok && res.export) {
        toast.success(
          `Période ${formatMonthFr(periode)} verrouillée : ` +
            `${res.export.nbSaisiesVerrouillees} saisie(s) figée(s), ` +
            `fichier ${format.toUpperCase()} transmis au service comptable.`,
        )
      } else {
        toast.error(res.error ?? 'Verrouillage impossible.')
      }
      setBusy(null)
    }, 30)
  }

  // Colonnes de l'aperçu (tri : heures, nom). Les colonnes de types d'absence
  // sont DYNAMIQUES (une par type configuré), dans l'ordre de `colonnesTypes`.
  const apercuColumns: ColumnDef<RecapLigne>[] = useMemo(() => {
    const fixes: ColumnDef<RecapLigne>[] = [
      {
        key: 'collaborateur',
        label: 'Collaborateur',
        sortable: true,
        sortAccessor: (l) => l.collaborateur,
        render: (l) => l.collaborateur,
      },
      {
        key: 'famille',
        label: 'Famille',
        sortable: true,
        sortAccessor: (l) => l.famille,
        render: (l) => (
          <span className={famillePillClass(l.famille)}>{l.famille}</span>
        ),
      },
      {
        key: 'contrat',
        label: 'Contrat',
        sortable: true,
        sortAccessor: (l) => l.contrat,
        render: (l) => l.contrat,
      },
      {
        key: 'heuresNormales',
        label: 'Heures normales',
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortAccessor: (l) => l.heuresNormales,
        render: (l) => formatHeuresDecimal(l.heuresNormales),
      },
      {
        key: 'heuresSup',
        label: 'Heures sup.',
        align: 'right',
        sortable: true,
        sortType: 'number',
        sortAccessor: (l) => l.heuresSup,
        render: (l) => formatHeuresDecimal(l.heuresSup),
      },
    ]
    const typeCols: ColumnDef<RecapLigne>[] = recap.colonnesTypes.map((c) => ({
      key: `type-${c.code}`,
      label: c.label,
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (l) => l.joursParType[c.code] ?? 0,
      render: (l) => formatJours(l.joursParType[c.code] ?? 0),
    }))
    return [...fixes, ...typeCols]
  }, [recap.colonnesTypes])

  const apercuFilters: FacetDef<RecapLigne>[] = [
    {
      key: 'famille',
      label: 'Famille',
      type: 'select',
      options: familles.map((f) => ({ value: f.nom, label: f.nom })),
      accessor: (l) => l.famille,
    },
  ]

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Exports comptables
      </h2>

      {/* ---------- Sélecteurs ---------- */}
      <div className="card">
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="periode">Période (mois)</label>
            <input
              id="periode"
              type="month"
              value={periode}
              onChange={(e) => setPeriode(e.target.value || currentMonthKey())}
            />
          </div>
          <div className="form-row">
            <label htmlFor="perimetre">Périmètre</label>
            <select
              id="perimetre"
              value={perimetre}
              onChange={(e) => setPerimetre(e.target.value)}
            >
              <option value={PERIMETRE_TOUTES}>Toutes familles</option>
              {familles.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="format">Format de verrouillage</label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: '0.4rem' }}>
          <button className="btn" onClick={handleApercu}>
            Aperçu
          </button>
          <button
            className={`btn secondary${busy === 'csv' ? ' is-busy' : ''}`}
            onClick={handleExportCsv}
            disabled={!aDesDonnees || busy !== null}
          >
            {busy === 'csv' ? 'Génération…' : 'Exporter CSV'}
          </button>
          <button
            className={`btn secondary${busy === 'xlsx' ? ' is-busy' : ''}`}
            onClick={handleExportXlsx}
            disabled={!aDesDonnees || busy !== null}
          >
            {busy === 'xlsx' ? 'Génération…' : 'Exporter Excel'}
          </button>
          {verrouillageActif && (
            <button
              className={`btn ocre${busy === 'verrou' ? ' is-busy' : ''}`}
              onClick={handleVerrouiller}
              disabled={!aDesDonnees || busy !== null}
            >
              {busy === 'verrou'
                ? 'Verrouillage…'
                : 'Exporter, verrouiller & envoyer'}
            </button>
          )}
        </div>
      </div>

      {/* ---------- Bandeau d'explication du verrouillage ---------- */}
      {verrouillageActif ? (
        <div className="alert info">
          <strong>Verrouillage comptable.</strong> « Exporter, verrouiller &amp;
          envoyer » génère le fichier ({format.toUpperCase()}) puis fige les
          saisies <em>validées</em> du mois au statut{' '}
          <strong>verrouillée</strong> : elles ne sont plus modifiables par le
          collaborateur et sont rattachées à cet export. Seul le responsable peut
          ensuite les débloquer (depuis l'écran Validations). Les saisies déjà
          verrouillées ne sont jamais re-verrouillées.
        </div>
      ) : (
        <div className="alert info">
          <strong>Verrouillage désactivé.</strong> Le verrouillage à l'export est
          désactivé dans les règles générales (Administration). Les exports
          restent disponibles sans figer les saisies.
        </div>
      )}

      {/* ---------- Aperçu ---------- */}
      {apercuVisible && (
        <>
          <h3 className="section-title">
            Aperçu — {formatMonthFr(periode)} · {perimetreLabel}
          </h3>
          {!aDesDonnees ? (
            <div className="card">
              <p className="muted">
                Aucune donnée exploitable pour ce mois et ce périmètre (seules
                les saisies validées ou verrouillées sont comptabilisées).
              </p>
            </div>
          ) : (
            <>
              <DataTable
                rows={recap.lignes}
                columns={apercuColumns}
                filters={apercuFilters}
                rowKey={(l) => l.collaborateurId}
                search={{
                  accessor: (l) => l.collaborateur,
                  placeholder: 'Rechercher un collaborateur…',
                }}
                defaultSort={{ key: 'collaborateur', dir: 'asc' }}
                storageKey="exports-apercu"
                emptyLabel="Aucune ligne pour ce filtre."
              />
              {/* Totaux équipe (sur l'ensemble du périmètre bâti). */}
              <div className="card" style={{ marginTop: '0.6rem' }}>
                <div className="btn-row" style={{ gap: '1.5rem', flexWrap: 'wrap' }}>
                  <span>
                    <strong>Total équipe</strong>
                  </span>
                  <span className="muted">
                    Normales :{' '}
                    <strong>{formatHeuresDecimal(recap.totaux.heuresNormales)}</strong>
                  </span>
                  <span className="muted">
                    Sup. :{' '}
                    <strong>{formatHeuresDecimal(recap.totaux.heuresSup)}</strong>
                  </span>
                  {recap.colonnesTypes.map((c) => (
                    <span className="muted" key={c.code}>
                      {c.label} :{' '}
                      <strong>
                        {formatJours(recap.totaux.joursParType[c.code] ?? 0)}
                      </strong>{' '}
                      j
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ---------- Historique des exports ---------- */}
      <h3 className="section-title">Exports verrouillés</h3>
      {exports.length === 0 ? (
        <div className="card">
          <p className="muted">Aucune période verrouillée pour l'instant.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mois</th>
                <th>Périmètre</th>
                <th>Format</th>
                <th>Saisies figées</th>
                <th>Généré le</th>
                <th>Par</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((e) => {
                const perimNom =
                  e.perimetre === PERIMETRE_TOUTES
                    ? 'Toutes familles'
                    : familles.find((f) => f.id === e.perimetre)?.nom ??
                      e.perimetre
                return (
                  <tr key={e.id}>
                    <td>{formatMonthFr(e.periode)}</td>
                    <td>{perimNom}</td>
                    <td>
                      <span className="badge verrouillee">
                        {e.format.toUpperCase()}
                      </span>
                    </td>
                    <td>{e.nbSaisiesVerrouillees}</td>
                    <td>{new Date(e.genereLe).toLocaleString('fr-FR')}</td>
                    <td>
                      <code>{e.genereParUserId}</code>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
