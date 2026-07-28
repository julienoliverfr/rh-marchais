import { useMemo, useState } from 'react'
import type { Saisie, StatutSaisie } from '../../types'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import { formatDateFr, formatMonthFr } from '../../lib/dates'
import { describeHoraires, formatMinutes } from '../../lib/hours'
import StatusBadge, { isEditable } from '../../components/StatusBadge'
import SaisieForm from '../../components/SaisieForm'
import DataTable from '../../components/DataTable'
import type { ColumnDef, FacetDef } from '../../components/DataTable'
import HelpTip from '../../components/HelpTip'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { Link } from 'react-router-dom'

// Légende des pastilles de couleur, avec la phrase d'explication de chaque état.
const STATUT_AIDE: { statut: StatutSaisie; text: string }[] = [
  { statut: 'en_attente', text: 'Votre responsable doit encore valider.' },
  { statut: 'validee', text: 'C’est accepté et enregistré.' },
  { statut: 'refusee', text: 'À corriger : votre responsable a renvoyé la saisie.' },
  {
    statut: 'verrouillee',
    text: 'Enregistré définitivement (envoyé au comptable). Seul un responsable peut le rouvrir.',
  },
]

const STATUT_LABELS: Record<StatutSaisie, string> = {
  en_attente: 'En attente',
  validee: 'Validée',
  refusee: 'Refusée',
  verrouillee: 'Verrouillée',
}

export default function Historique() {
  const session = useAuthStore((s) => s.session)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
  const saisies = useDataStore((s) => s.saisies)
  const deleteSaisie = useDataStore((s) => s.deleteSaisie)
  const toast = useToast()
  const confirm = useConfirm()
  const [editId, setEditId] = useState<string | null>(null)

  async function handleDelete(s: Saisie) {
    const ok = await confirm({
      title: 'Supprimer cette saisie',
      message: `Voulez-vous supprimer la saisie du ${formatDateFr(s.date)} ? Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    deleteSaisie(s.id)
    toast.success('Saisie supprimée.')
  }

  const collaborateur = useMemo(
    () => collaborateurs.find((c) => c.id === session?.collaborateurId),
    [collaborateurs, session],
  )
  const famille = useMemo(
    () => familles.find((f) => f.id === collaborateur?.familleId),
    [familles, collaborateur],
  )

  // Toutes les saisies du collaborateur (la facette « Mois » remplace le filtre
  // implicite « mois courant » précédent).
  const mesSaisies = useMemo(() => {
    if (!collaborateur) return []
    return saisies.filter((s) => s.collaborateurId === collaborateur.id)
  }, [saisies, collaborateur])

  // Options de la facette Mois : mois présents dans les données (récents d'abord).
  const moisOptions = useMemo(() => {
    const keys = Array.from(new Set(mesSaisies.map((s) => s.date.slice(0, 7))))
    keys.sort((a, b) => (a < b ? 1 : -1))
    return keys.map((k) => ({ value: k, label: formatMonthFr(k) }))
  }, [mesSaisies])

  const editing = editId ? mesSaisies.find((s) => s.id === editId) : undefined

  const columns: ColumnDef<Saisie>[] = [
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
      label: 'Total',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (s) => s.totalMinutes,
      render: (s) => formatMinutes(s.totalMinutes),
    },
    {
      key: 'statut',
      label: 'Statut',
      render: (s) => (
        <>
          <StatusBadge statut={s.statut} />
          {s.statut === 'refusee' && s.refus_motif && (
            <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
              Motif : {s.refus_motif}
            </div>
          )}
        </>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (s) =>
        isEditable(s.statut) ? (
          <div className="btn-row">
            <button className="btn secondary small" onClick={() => setEditId(s.id)}>
              {s.statut === 'refusee' ? 'Corriger' : 'Modifier'}
            </button>
            <button className="btn danger small" onClick={() => handleDelete(s)}>
              Suppr.
            </button>
          </div>
        ) : (
          <span className="lock" title="Lecture seule" aria-label="Verrouillée">
            🔒
          </span>
        ),
    },
  ]

  const filters: FacetDef<Saisie>[] = [
    {
      key: 'mois',
      label: 'Mois',
      type: 'select',
      options: moisOptions,
      accessor: (s) => s.date.slice(0, 7),
    },
    {
      key: 'statut',
      label: 'Statut',
      type: 'select',
      options: (Object.keys(STATUT_LABELS) as StatutSaisie[]).map((k) => ({
        value: k,
        label: STATUT_LABELS[k],
      })),
      accessor: (s) => s.statut,
    },
  ]

  if (!collaborateur || !famille) {
    return (
      <div className="card">
        <p>Aucun collaborateur rattaché à ce compte.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Historique
      </h2>
      <p className="muted">
        Les saisies « En attente » sont modifiables. Une saisie validée est en
        lecture seule 🔒.
      </p>

      {/* Légende : ce que veut dire chaque pastille de couleur. */}
      <div className="statut-legende">
        {STATUT_AIDE.map(({ statut, text }) => (
          <span className="statut-legende-item" key={statut}>
            <StatusBadge statut={statut} />
            <HelpTip label={STATUT_LABELS[statut]} text={text} />
          </span>
        ))}
      </div>

      {/* Correction en cours : formulaire affiché au-dessus du tableau. */}
      {editing && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            Correction — {formatDateFr(editing.date)}
          </h3>
          <SaisieForm
            collaborateur={collaborateur}
            famille={famille}
            saisiPar={session!.identifiant}
            existing={editing}
            onSaved={() => setEditId(null)}
            onCancel={() => setEditId(null)}
          />
        </div>
      )}

      {mesSaisies.length === 0 ? (
        <EmptyState
          icon="🕒"
          text="Vous n'avez pas encore saisi d'heures. Touchez « Saisir mes heures » pour commencer."
          action={
            <Link className="btn" to="/saisie">
              Saisir mes heures
            </Link>
          }
        />
      ) : (
        <DataTable
          rows={mesSaisies}
          columns={columns}
          filters={filters}
          rowKey={(s) => s.id}
          defaultSort={{ key: 'date', dir: 'desc' }}
          storageKey="historique-employe"
          emptyLabel="Aucune saisie."
        />
      )}
    </div>
  )
}
