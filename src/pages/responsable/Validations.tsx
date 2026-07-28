import { useMemo, useState } from 'react'
import type { AuditAction, Collaborateur, Famille, Saisie } from '../../types'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import { formatDateFr } from '../../lib/dates'
import {
  describeHoraires,
  formatMinutes,
  heuresSupMinutes,
  totalSemaineMinutesForDate,
} from '../../lib/hours'
import StatusBadge from '../../components/StatusBadge'
import DataTable from '../../components/DataTable'
import type { ColumnDef, FacetDef } from '../../components/DataTable'
import FieldError from '../../components/FieldError'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'

const AUDIT_LABELS: Record<AuditAction, string> = {
  validee: 'Validée',
  refusee: 'Refusée',
  debloquee: 'Débloquée',
  modifiee: 'Corrigée',
  demande_conge: 'Demande de congé',
  conge_validee: 'Congé validé',
  conge_refusee: 'Congé refusé',
  export: 'Export comptable',
}

function famillePillClass(nom: string): string {
  const key = nom.trim().toLowerCase()
  if (key === 'vignes') return 'pill-fam vignes'
  if (key === 'marchais') return 'pill-fam marchais'
  return 'pill-fam'
}

// Métadonnées calculées pour une saisie à valider (collab, famille, cumul, sup).
interface Meta {
  collab?: Collaborateur
  famille?: Famille
  cumul: number
  sup: number
}

export default function Validations() {
  const session = useAuthStore((s) => s.session)
  const saisies = useDataStore((s) => s.saisies)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
  const validerSaisie = useDataStore((s) => s.validerSaisie)
  const refuserSaisie = useDataStore((s) => s.refuserSaisie)
  const debloquerSaisie = useDataStore((s) => s.debloquerSaisie)
  const listAudit = useDataStore((s) => s.listAudit)
  const toast = useToast()
  const confirm = useConfirm()

  const [refusId, setRefusId] = useState<string | null>(null)
  const [motif, setMotif] = useState('')
  const [refusError, setRefusError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const parUser = session?.identifiant ?? '?'

  const collabById = useMemo(() => {
    const m = new Map<string, Collaborateur>()
    collaborateurs.forEach((c) => m.set(c.id, c))
    return m
  }, [collaborateurs])
  const familleById = useMemo(() => {
    const m = new Map<string, Famille>()
    familles.forEach((f) => m.set(f.id, f))
    return m
  }, [familles])

  const aValider = useMemo(
    () => saisies.filter((s) => s.statut === 'en_attente'),
    [saisies],
  )
  // Section « Validées & verrouillées » : inclut les saisies figées par un
  // export comptable (statut `verrouillee`) pour que le responsable puisse les
  // débloquer si nécessaire (le déblocage accepte validee OU verrouillee).
  const validees = useMemo(
    () => saisies.filter((s) => s.statut === 'validee' || s.statut === 'verrouillee'),
    [saisies],
  )

  // Cumul semaine + heures sup pré-calculés par saisie (utilisés en tri + rendu).
  const metaById = useMemo(() => {
    const m = new Map<string, Meta>()
    for (const s of saisies) {
      const collab = collabById.get(s.collaborateurId)
      const famille = collab ? familleById.get(collab.familleId) : undefined
      const cumul = collab
        ? totalSemaineMinutesForDate(saisies, collab.id, s.date)
        : 0
      const sup = collab ? heuresSupMinutes(cumul, collab.contrat) : 0
      m.set(s.id, { collab, famille, cumul, sup })
    }
    return m
  }, [saisies, collabById, familleById])

  function metaOf(s: Saisie): Meta {
    return metaById.get(s.id) ?? { collab: undefined, famille: undefined, cumul: 0, sup: 0 }
  }
  function collabNom(s: Saisie): string {
    const c = metaOf(s).collab
    return c ? `${c.prenom} ${c.nom}` : ''
  }

  function notify(res: { ok: boolean; error?: string }, okMsg: string) {
    if (res.ok) toast.success(okMsg)
    else toast.error(res.error ?? 'Action impossible.')
  }

  function handleValider(s: Saisie) {
    notify(validerSaisie(s.id, parUser), 'Saisie validée.')
  }

  function handleToutValider() {
    let ok = 0
    for (const s of aValider) {
      if (validerSaisie(s.id, parUser).ok) ok++
    }
    toast.success(`${ok} saisie(s) validée(s).`)
  }

  function openRefus(id: string) {
    setRefusId(id)
    setMotif('')
    setRefusError(null)
  }

  function confirmRefus() {
    if (!refusId) return
    const res = refuserSaisie(refusId, parUser, motif)
    if (res.ok) {
      setRefusId(null)
      setMotif('')
      setRefusError(null)
      toast.success('Saisie refusée.')
    } else {
      // Motif obligatoire : on garde le champ ouvert avec l'erreur sous le champ.
      setRefusError(res.error ?? 'Refus impossible.')
    }
  }

  async function handleDebloquer(s: Saisie) {
    const ok = await confirm({
      title: 'Débloquer la saisie',
      message:
        'Cette saisie repassera « en attente » et redeviendra modifiable par le collaborateur. Souhaitez-vous continuer ?',
      confirmLabel: 'Débloquer',
    })
    if (!ok) return
    notify(debloquerSaisie(s.id, parUser), 'Saisie débloquée (repassée en attente).')
  }

  // Journal d'audit dépliable, rendu DANS la cellule d'actions (pas de sous-ligne
  // séparée : DataTable rend une ligne par enregistrement).
  function renderAuditBlock(saisieId: string) {
    if (expanded !== saisieId) return null
    const entries = listAudit(saisieId)
    return (
      <div
        style={{
          marginTop: '0.5rem',
          background: 'var(--surface-2)',
          padding: '0.5rem 0.6rem',
          borderRadius: '8px',
          whiteSpace: 'normal',
        }}
      >
        {entries.length === 0 ? (
          <span className="muted">Aucune action enregistrée.</span>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {entries.map((a) => (
              <li key={a.id} style={{ marginBottom: '0.2rem' }}>
                <strong>{AUDIT_LABELS[a.action]}</strong> par{' '}
                <code>{a.parUserId}</code> —{' '}
                {new Date(a.horodatage).toLocaleString('fr-FR')}
                {a.detail ? ` · ${a.detail}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Facettes communes : Famille (par nom).
  const familleFacet = (rows: Saisie[]): FacetDef<Saisie> => ({
    key: 'famille',
    label: 'Équipe',
    type: 'select',
    options: familles
      .filter((f) => rows.some((s) => metaOf(s).famille?.id === f.id))
      .map((f) => ({ value: f.nom, label: f.nom })),
    accessor: (s) => metaOf(s).famille?.nom ?? '',
  })

  // ---- Colonnes « À valider » (tri : date, collaborateur, cumul semaine) ----
  const aValiderColumns: ColumnDef<Saisie>[] = [
    {
      key: 'collab',
      label: 'Collaborateur',
      sortable: true,
      sortAccessor: (s) => {
        const c = metaOf(s).collab
        return c ? `${c.nom} ${c.prenom}` : ''
      },
      render: (s) => collabNom(s) || '—',
    },
    {
      key: 'famille',
      label: 'Équipe',
      render: (s) => {
        const f = metaOf(s).famille
        return f ? <span className={famillePillClass(f.nom)}>{f.nom}</span> : null
      },
    },
    {
      key: 'date',
      label: 'Jour',
      sortable: true,
      sortType: 'date',
      sortAccessor: (s) => s.date,
      render: (s) => formatDateFr(s.date),
    },
    {
      key: 'horaires',
      label: 'Horaires',
      render: (s) => describeHoraires(s),
    },
    {
      key: 'total',
      label: 'Total jour',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (s) => s.totalMinutes,
      render: (s) => formatMinutes(s.totalMinutes),
    },
    {
      key: 'cumul',
      label: 'Cumul semaine',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (s) => metaOf(s).cumul,
      render: (s) => {
        const m = metaOf(s)
        return (
          <>
            {formatMinutes(m.cumul)}{' '}
            {m.sup > 0 && (
              <span className="badge en_attente">+{formatMinutes(m.sup)} sup</span>
            )}
          </>
        )
      },
    },
    {
      key: 'saisiPar',
      label: 'Saisi par',
      render: (s) => <code>{s.saisiPar}</code>,
    },
    {
      key: 'actions',
      label: '',
      render: (s) => (
        <>
          <div className="btn-row">
            <button className="btn small" onClick={() => handleValider(s)}>
              Valider
            </button>
            <button className="btn danger small" onClick={() => openRefus(s.id)}>
              Refuser
            </button>
            <button
              className="btn secondary small"
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
            >
              Historique
            </button>
          </div>
          {refusId === s.id && (
            <div style={{ marginTop: '0.5rem' }}>
              <input
                autoFocus
                placeholder="Motif du refus (obligatoire)"
                value={motif}
                aria-invalid={refusError ? true : undefined}
                aria-describedby={refusError ? `refus-err-${s.id}` : undefined}
                onChange={(e) => {
                  setMotif(e.target.value)
                  if (refusError) setRefusError(null)
                }}
              />
              <FieldError id={`refus-err-${s.id}`} message={refusError} />
              <div className="btn-row" style={{ marginTop: '0.4rem' }}>
                <button className="btn danger small" onClick={confirmRefus}>
                  Confirmer le refus
                </button>
                <button
                  className="btn secondary small"
                  onClick={() => {
                    setRefusId(null)
                    setRefusError(null)
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
          {renderAuditBlock(s.id)}
        </>
      ),
    },
  ]

  const aValiderFilters: FacetDef<Saisie>[] = [
    familleFacet(aValider),
    {
      key: 'saisiPar',
      label: 'Saisi par',
      type: 'select',
      options: Array.from(new Set(aValider.map((s) => s.saisiPar))).map((v) => ({
        value: v,
        label: v,
      })),
      accessor: (s) => s.saisiPar,
    },
  ]

  // ---- Colonnes « Validées & verrouillées » (tri : date, collaborateur) ----
  const valideesColumns: ColumnDef<Saisie>[] = [
    {
      key: 'collab',
      label: 'Collaborateur',
      sortable: true,
      sortAccessor: (s) => {
        const c = metaOf(s).collab
        return c ? `${c.nom} ${c.prenom}` : ''
      },
      render: (s) => collabNom(s) || '—',
    },
    {
      key: 'famille',
      label: 'Équipe',
      render: (s) => {
        const f = metaOf(s).famille
        return f ? <span className={famillePillClass(f.nom)}>{f.nom}</span> : null
      },
    },
    {
      key: 'date',
      label: 'Jour',
      sortable: true,
      sortType: 'date',
      sortAccessor: (s) => s.date,
      render: (s) => formatDateFr(s.date),
    },
    {
      key: 'total',
      label: 'Total jour',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (s) => s.totalMinutes,
      render: (s) => formatMinutes(s.totalMinutes),
    },
    {
      key: 'statut',
      label: 'Statut',
      render: (s) => <StatusBadge statut={s.statut} />,
    },
    {
      key: 'validee',
      label: 'Validée par',
      render: (s) => (
        <>
          <code>{s.validee_par ?? '—'}</code>
          {s.validee_le && (
            <div className="muted" style={{ fontSize: '0.72rem' }}>
              {new Date(s.validee_le).toLocaleDateString('fr-FR')}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (s) => (
        <>
          <div className="btn-row">
            <button className="btn secondary small" onClick={() => handleDebloquer(s)}>
              Débloquer
            </button>
            <button
              className="btn secondary small"
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
            >
              Historique
            </button>
          </div>
          {renderAuditBlock(s.id)}
        </>
      ),
    },
  ]

  const valideesFilters: FacetDef<Saisie>[] = [familleFacet(validees)]

  return (
    <div>
      {/* En-tête homogène : le compteur « à valider » n'est PAS répété ici — il
          est déjà porté par le badge du menu et par le titre de section ci-dessous. */}
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Validations
        </h2>
      </div>

      {/* ---------- Section À valider ---------- */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 className="section-title">À valider ({aValider.length})</h3>
        {aValider.length > 0 && (
          <button className="btn small" onClick={handleToutValider}>
            Tout valider
          </button>
        )}
      </div>

      {aValider.length === 0 ? (
        <div className="card">
          <p className="muted">Aucune saisie en attente. 🎉</p>
        </div>
      ) : (
        <DataTable
          rows={aValider}
          columns={aValiderColumns}
          filters={aValiderFilters}
          rowKey={(s) => s.id}
          search={{
            accessor: (s) => collabNom(s),
            placeholder: 'Rechercher un collaborateur…',
          }}
          defaultSort={{ key: 'date', dir: 'desc' }}
          storageKey="validations-a-valider"
          emptyLabel="Aucune saisie pour ce filtre."
        />
      )}

      {/* ---------- Section Validées & verrouillées ---------- */}
      <h3 className="section-title">Validées &amp; verrouillées ({validees.length})</h3>
      {validees.length === 0 ? (
        <div className="card">
          <p className="muted">Aucune saisie validée pour l'instant.</p>
        </div>
      ) : (
        <DataTable
          rows={validees}
          columns={valideesColumns}
          filters={valideesFilters}
          rowKey={(s) => s.id}
          search={{
            accessor: (s) => collabNom(s),
            placeholder: 'Rechercher un collaborateur…',
          }}
          defaultSort={{ key: 'date', dir: 'desc' }}
          storageKey="validations-validees"
          emptyLabel="Aucune saisie pour ce filtre."
        />
      )}
    </div>
  )
}
