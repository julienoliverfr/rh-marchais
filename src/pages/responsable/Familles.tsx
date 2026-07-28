import { useState } from 'react'
import type { Famille, ModeSaisie } from '../../types'
import { useDataStore } from '../../store/dataStore'
import DataTable from '../../components/DataTable'
import type { ColumnDef } from '../../components/DataTable'
import Breadcrumb from '../../components/Breadcrumb'
import FieldError from '../../components/FieldError'
import { useToast } from '../../components/Toast'
import { useConfirm } from '../../components/ConfirmDialog'

function uid(): string {
  return 'fam-' + Math.random().toString(36).slice(2, 10)
}

const empty: Famille = {
  id: '',
  nom: '',
  modeSaisie: 'journee_continue',
  pauseDeduiteMin: 60,
}

// Paramétrage des familles : liste + création + édition (CRUD localStorage).
export default function Familles() {
  const familles = useDataStore((s) => s.familles)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const saveFamille = useDataStore((s) => s.saveFamille)
  const deleteFamille = useDataStore((s) => s.deleteFamille)
  const toast = useToast()
  const confirm = useConfirm()

  const [draft, setDraft] = useState<Famille | null>(null)
  const [nomError, setNomError] = useState<string | null>(null)

  function startCreate() {
    setNomError(null)
    setDraft({ ...empty, id: uid() })
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    if (!draft.nom.trim()) {
      setNomError("Le nom de l'équipe est obligatoire.")
      return
    }
    saveFamille(draft)
    setDraft(null)
    setNomError(null)
    toast.success('Équipe enregistrée.')
  }

  async function handleDelete(f: Famille) {
    const ok = await confirm({
      title: "Supprimer l'équipe",
      message: `Voulez-vous supprimer l'équipe « ${f.nom} » ? Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    deleteFamille(f.id)
    toast.success('Équipe supprimée.')
  }

  function usedBy(familleId: string): number {
    return collaborateurs.filter((c) => c.familleId === familleId).length
  }

  // Colonnes du tableau des familles (tri : nom).
  const columns: ColumnDef<Famille>[] = [
    {
      key: 'nom',
      label: 'Nom',
      sortable: true,
      sortAccessor: (f) => f.nom,
      render: (f) => f.nom,
    },
    {
      key: 'mode',
      label: 'Mode',
      sortable: true,
      sortAccessor: (f) => f.modeSaisie,
      render: (f) =>
        f.modeSaisie === 'journee_continue' ? 'Journée continue' : 'Demi-journées',
    },
    {
      key: 'pause',
      label: 'Pause déduite',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (f) => f.pauseDeduiteMin,
      render: (f) => `${f.pauseDeduiteMin} min`,
    },
    {
      key: 'nb',
      label: 'Collaborateurs',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (f) => usedBy(f.id),
      render: (f) => usedBy(f.id),
    },
    {
      key: 'actions',
      label: '',
      render: (f) => (
        <div className="btn-row">
          <button className="btn secondary small" onClick={() => setDraft({ ...f })}>
            Éditer
          </button>
          <button
            className="btn danger small"
            disabled={usedBy(f.id) > 0}
            title={
              usedBy(f.id) > 0
                ? 'Équipe utilisée par des collaborateurs'
                : 'Supprimer'
            }
            onClick={() => handleDelete(f)}
          >
            Suppr.
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Administration', to: '/responsable/admin' },
          { label: 'Équipes' },
        ]}
      />
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Équipes
        </h2>
        {!draft && (
          <button className="btn ocre small" onClick={startCreate}>
            + Nouvelle équipe
          </button>
        )}
      </div>

      {draft && (
        <form className="card" onSubmit={handleSave} style={{ marginTop: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {familles.some((f) => f.id === draft.id) ? 'Éditer' : 'Créer'} une équipe
          </h3>
          <div className="form-row">
            <label htmlFor="nom">Nom</label>
            <input
              id="nom"
              value={draft.nom}
              aria-invalid={nomError ? true : undefined}
              aria-describedby={nomError ? 'fam-nom-err' : undefined}
              onChange={(e) => {
                setDraft({ ...draft, nom: e.target.value })
                if (nomError) setNomError(null)
              }}
              autoFocus
            />
            <FieldError id="fam-nom-err" message={nomError} />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="mode">Mode de saisie</label>
              <select
                id="mode"
                value={draft.modeSaisie}
                onChange={(e) =>
                  setDraft({ ...draft, modeSaisie: e.target.value as ModeSaisie })
                }
              >
                <option value="journee_continue">Journée continue</option>
                <option value="demi_journees">Demi-journées</option>
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="pause">Pause déduite (min)</label>
              <input
                id="pause"
                type="number"
                min={0}
                step={5}
                value={draft.pauseDeduiteMin}
                onChange={(e) =>
                  setDraft({ ...draft, pauseDeduiteMin: Number(e.target.value) })
                }
              />
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

      <div style={{ marginTop: '1rem' }}>
        <DataTable
          rows={familles}
          columns={columns}
          rowKey={(f) => f.id}
          search={{ accessor: (f) => f.nom, placeholder: 'Rechercher une équipe…' }}
          defaultSort={{ key: 'nom', dir: 'asc' }}
          storageKey="familles"
          emptyLabel="Aucune équipe."
        />
      </div>
    </div>
  )
}
