import { useState } from 'react'
import type { TypeAbsence } from '../../../types'
import { useDataStore } from '../../../store/dataStore'
import { typeASolde } from '../../../lib/conges'
import { typesAbsenceSeed } from '../../../repositories/seed'
import DataTable from '../../../components/DataTable'
import type { ColumnDef } from '../../../components/DataTable'
import Breadcrumb from '../../../components/Breadcrumb'
import FieldError from '../../../components/FieldError'
import { useToast } from '../../../components/Toast'
import { useConfirm } from '../../../components/ConfirmDialog'

// Types d'absence paramétrables (config `rh.typesAbsence`). Le `code` reste un
// CongeType du domaine (le moteur de solde en dépend), il n'est donc pas
// modifiable : l'admin règle le libellé, le drapeau « à solde » et le
// justificatif. Les règles d'acquisition d'un type À SOLDE se gèrent sur la page
// « Politique de congés ». Le menu déroulant de la demande de congé lit cette liste.
export default function TypesAbsence() {
  const typesAbsence = useDataStore((s) => s.typesAbsence)
  const conges = useDataStore((s) => s.conges)
  const saveTypeAbsence = useDataStore((s) => s.saveTypeAbsence)
  const deleteTypeAbsence = useDataStore((s) => s.deleteTypeAbsence)
  const toast = useToast()
  const confirm = useConfirm()

  const [draft, setDraft] = useState<TypeAbsence | null>(null)
  const [labelError, setLabelError] = useState<string | null>(null)

  // Types du domaine (fixés par les contraintes CHECK) PAS encore présents dans
  // la liste : ce sont les seuls qu'on peut (ré)ajouter, avec la config du seed.
  const codesAbsents = typesAbsenceSeed.filter(
    (s) => !typesAbsence.some((t) => t.code === s.code),
  )
  const isCreate = draft != null && !typesAbsence.some((t) => t.code === draft.code)

  function startCreate() {
    if (codesAbsents.length === 0) return
    setLabelError(null)
    setDraft({ ...codesAbsents[0] })
  }

  // Nombre de congés existants référençant ce type (garde anti-orphelin).
  function usedBy(code: TypeAbsence['code']): number {
    return conges.filter((c) => c.type === code).length
  }

  async function handleDelete(t: TypeAbsence) {
    const ok = await confirm({
      title: "Supprimer le type d'absence",
      message: `Voulez-vous supprimer le type « ${t.label} » ? Il n'apparaîtra plus dans les demandes de congé. Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    deleteTypeAbsence(t.code)
    toast.success("Type d'absence supprimé.")
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    if (!draft.label.trim()) {
      setLabelError('Le libellé est obligatoire.')
      return
    }
    saveTypeAbsence({ ...draft, label: draft.label.trim() })
    setDraft(null)
    setLabelError(null)
    toast.success("Type d'absence enregistré.")
  }

  const columns: ColumnDef<TypeAbsence>[] = [
    {
      key: 'label',
      label: 'Libellé',
      sortable: true,
      sortAccessor: (t) => t.label,
      render: (t) => t.label,
    },
    {
      key: 'code',
      label: 'Code',
      sortable: true,
      sortAccessor: (t) => t.code,
      render: (t) => <code>{t.code}</code>,
    },
    {
      key: 'aSolde',
      label: 'À solde',
      align: 'center',
      sortable: true,
      sortAccessor: (t) => (typeASolde(t) ? 1 : 0),
      render: (t) =>
        typeASolde(t) ? (
          <span className="badge validee">Oui</span>
        ) : (
          <span className="muted">Non</span>
        ),
    },
    {
      key: 'justificatif',
      label: 'Justificatif',
      align: 'center',
      sortable: true,
      sortAccessor: (t) => (t.justificatifRequis ? 1 : 0),
      render: (t) =>
        t.justificatifRequis ? (
          <span className="badge en_attente">Requis</span>
        ) : (
          <span className="muted">Non</span>
        ),
    },
    {
      key: 'actions',
      label: '',
      render: (t) => (
        <div className="btn-row">
          <button className="btn secondary small" onClick={() => setDraft({ ...t })}>
            Éditer
          </button>
          <button
            className="btn danger small"
            disabled={usedBy(t.code) > 0}
            title={
              usedBy(t.code) > 0
                ? 'Type utilisé par des congés existants'
                : 'Supprimer'
            }
            onClick={() => handleDelete(t)}
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
          { label: "Types d'absence" },
        ]}
      />
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Types d'absence
        </h2>
        {!draft && codesAbsents.length > 0 && (
          <button className="btn ocre small" onClick={startCreate}>
            + Ajouter un type
          </button>
        )}
      </div>
      <p className="muted">
        Ces types alimentent le menu déroulant de la demande de congé. Un type
        « à solde » porte son propre compteur (acquis / pris / restant) ; ses
        règles d'acquisition se règlent sur la page « Politique de congés ».
      </p>

      {draft && (
        <form className="card" onSubmit={handleSave} style={{ marginTop: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {isCreate ? 'Ajouter' : 'Éditer'} un type d'absence
          </h3>
          {isCreate && (
            <div className="form-row">
              <label htmlFor="code">Type (du domaine)</label>
              <select
                id="code"
                value={draft.code}
                onChange={(e) => {
                  const seed = typesAbsenceSeed.find((s) => s.code === e.target.value)
                  if (seed) setDraft({ ...seed })
                }}
              >
                {codesAbsents.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-row">
            <label htmlFor="label">
              Libellé (<code>{draft.code}</code>)
            </label>
            <input
              id="label"
              value={draft.label}
              aria-invalid={labelError ? true : undefined}
              aria-describedby={labelError ? 'type-label-err' : undefined}
              onChange={(e) => {
                setDraft({ ...draft, label: e.target.value })
                if (labelError) setLabelError(null)
              }}
              autoFocus
            />
            <FieldError id="type-label-err" message={labelError} />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="aSolde">Porte un solde (compteur)</label>
              <select
                id="aSolde"
                value={typeASolde(draft) ? 'oui' : 'non'}
                onChange={(e) =>
                  setDraft({ ...draft, aSolde: e.target.value === 'oui' })
                }
              >
                <option value="oui">Oui</option>
                <option value="non">Non</option>
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="justificatif">Justificatif requis</label>
              <select
                id="justificatif"
                value={draft.justificatifRequis ? 'oui' : 'non'}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    justificatifRequis: e.target.value === 'oui',
                  })
                }
              >
                <option value="oui">Oui</option>
                <option value="non">Non</option>
              </select>
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
          rows={typesAbsence}
          columns={columns}
          rowKey={(t) => t.code}
          search={{
            accessor: (t) => `${t.label} ${t.code}`,
            placeholder: 'Rechercher un type…',
          }}
          defaultSort={{ key: 'label', dir: 'asc' }}
          storageKey="types-absence"
          emptyLabel="Aucun type d'absence."
        />
      </div>
    </div>
  )
}
