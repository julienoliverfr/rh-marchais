import { useState } from 'react'
import type { ModeleContrat, TypeContrat, UniteContrat } from '../../../types'
import { useDataStore } from '../../../store/dataStore'
import DataTable from '../../../components/DataTable'
import type { ColumnDef, FacetDef } from '../../../components/DataTable'
import Breadcrumb from '../../../components/Breadcrumb'
import FieldError from '../../../components/FieldError'
import { useToast } from '../../../components/Toast'
import { useConfirm } from '../../../components/ConfirmDialog'

function uid(): string {
  return 'mod-' + Math.random().toString(36).slice(2, 10)
}

const TYPE_LABELS: Record<TypeContrat, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  saisonnier: 'Saisonnier',
}

// CRUD complet des modèles de contrat. Ces modèles pré-remplissent le contrat
// d'un collaborateur (page Collaborateurs) : on protège donc la suppression
// d'un modèle encore utilisé.
export default function ModelesContrat() {
  const modeles = useDataStore((s) => s.modeles)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const regles = useDataStore((s) => s.regles)
  const saveModele = useDataStore((s) => s.saveModele)
  const deleteModele = useDataStore((s) => s.deleteModele)
  const toast = useToast()
  const confirm = useConfirm()

  const [draft, setDraft] = useState<ModeleContrat | null>(null)
  const [nomError, setNomError] = useState<string | null>(null)

  function newDraft(): ModeleContrat {
    return {
      id: uid(),
      nom: '',
      typeContrat: 'CDI',
      unite: 'heures',
      base: 35,
      // Seuil h. sup par défaut piloté par les règles générales.
      seuilHebdo: regles.seuilHsupDefautHebdo,
      congesSolde: 25,
    }
  }

  function usedBy(modeleId: string): number {
    return collaborateurs.filter((c) => c.contrat.modeleId === modeleId).length
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    if (!draft.nom.trim()) {
      setNomError('Le libellé du modèle est obligatoire.')
      return
    }
    saveModele({ ...draft, nom: draft.nom.trim() })
    setDraft(null)
    setNomError(null)
    toast.success('Modèle de contrat enregistré.')
  }

  async function handleDelete(m: ModeleContrat) {
    const ok = await confirm({
      title: 'Supprimer le modèle',
      message: `Voulez-vous supprimer le modèle « ${m.nom} » ? Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    deleteModele(m.id)
    toast.success('Modèle de contrat supprimé.')
  }

  const columns: ColumnDef<ModeleContrat>[] = [
    {
      key: 'nom',
      label: 'Libellé',
      sortable: true,
      sortAccessor: (m) => m.nom,
      render: (m) => m.nom,
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      sortAccessor: (m) => (m.typeContrat ? TYPE_LABELS[m.typeContrat] : ''),
      render: (m) => (m.typeContrat ? TYPE_LABELS[m.typeContrat] : '—'),
    },
    {
      key: 'unite',
      label: 'Décompte',
      sortable: true,
      sortAccessor: (m) => m.unite,
      render: (m) => (m.unite === 'heures' ? 'Heures' : 'Jours'),
    },
    {
      key: 'base',
      label: 'Base',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (m) => m.base,
      render: (m) => `${m.base} ${m.unite === 'heures' ? 'h' : 'h/j'}`,
    },
    {
      key: 'seuil',
      label: 'Seuil h. sup',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (m) => m.seuilHebdo,
      render: (m) => `${m.seuilHebdo}h`,
    },
    {
      key: 'conges',
      label: 'Congés',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (m) => m.congesSolde,
      render: (m) => `${m.congesSolde} j`,
    },
    {
      key: 'nb',
      label: 'Utilisé par',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (m) => usedBy(m.id),
      render: (m) => usedBy(m.id),
    },
    {
      key: 'actions',
      label: '',
      render: (m) => (
        <div className="btn-row">
          <button className="btn secondary small" onClick={() => setDraft({ ...m })}>
            Éditer
          </button>
          <button
            className="btn danger small"
            disabled={usedBy(m.id) > 0}
            title={
              usedBy(m.id) > 0
                ? 'Modèle utilisé par des collaborateurs'
                : 'Supprimer'
            }
            onClick={() => handleDelete(m)}
          >
            Suppr.
          </button>
        </div>
      ),
    },
  ]

  const filters: FacetDef<ModeleContrat>[] = [
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      options: (Object.keys(TYPE_LABELS) as TypeContrat[]).map((t) => ({
        value: t,
        label: TYPE_LABELS[t],
      })),
      accessor: (m) => m.typeContrat ?? '',
    },
    {
      key: 'unite',
      label: 'Décompte',
      type: 'select',
      options: [
        { value: 'heures', label: 'Heures' },
        { value: 'jours', label: 'Jours' },
      ],
      accessor: (m) => m.unite,
    },
  ]

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Administration', to: '/responsable/admin' },
          { label: 'Modèles de contrat' },
        ]}
      />
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Modèles de contrat
        </h2>
        {!draft && (
          <button className="btn ocre small" onClick={() => setDraft(newDraft())}>
            + Nouveau modèle
          </button>
        )}
      </div>

      {draft && (
        <form className="card" onSubmit={handleSave} style={{ marginTop: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {modeles.some((m) => m.id === draft.id) ? 'Éditer' : 'Créer'} un modèle
          </h3>
          <div className="form-row">
            <label htmlFor="nom">Libellé</label>
            <input
              id="nom"
              value={draft.nom}
              aria-invalid={nomError ? true : undefined}
              aria-describedby={nomError ? 'mod-nom-err' : undefined}
              onChange={(e) => {
                setDraft({ ...draft, nom: e.target.value })
                if (nomError) setNomError(null)
              }}
              autoFocus
            />
            <FieldError id="mod-nom-err" message={nomError} />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="type">Type de contrat</label>
              <select
                id="type"
                value={draft.typeContrat ?? 'CDI'}
                onChange={(e) =>
                  setDraft({ ...draft, typeContrat: e.target.value as TypeContrat })
                }
              >
                {(Object.keys(TYPE_LABELS) as TypeContrat[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="unite">Décompte</label>
              <select
                id="unite"
                value={draft.unite}
                onChange={(e) =>
                  setDraft({ ...draft, unite: e.target.value as UniteContrat })
                }
              >
                <option value="heures">Heures</option>
                <option value="jours">Jours</option>
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="base">Base</label>
              <input
                id="base"
                type="number"
                min={0}
                step={0.5}
                value={draft.base}
                onChange={(e) => setDraft({ ...draft, base: Number(e.target.value) })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="seuil">Seuil h. sup hebdo (h)</label>
              <input
                id="seuil"
                type="number"
                min={0}
                value={draft.seuilHebdo}
                onChange={(e) =>
                  setDraft({ ...draft, seuilHebdo: Number(e.target.value) })
                }
              />
            </div>
            <div className="form-row">
              <label htmlFor="conges">Congés par défaut (j)</label>
              <input
                id="conges"
                type="number"
                min={0}
                step={0.5}
                value={draft.congesSolde}
                onChange={(e) =>
                  setDraft({ ...draft, congesSolde: Number(e.target.value) })
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
          rows={modeles}
          columns={columns}
          filters={filters}
          rowKey={(m) => m.id}
          search={{
            accessor: (m) => m.nom,
            placeholder: 'Rechercher un modèle…',
          }}
          defaultSort={{ key: 'nom', dir: 'asc' }}
          storageKey="modeles"
          emptyLabel="Aucun modèle de contrat."
        />
      </div>
    </div>
  )
}
