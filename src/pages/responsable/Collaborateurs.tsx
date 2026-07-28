import { useState } from 'react'
import type { Collaborateur } from '../../types'
import { useDataStore } from '../../store/dataStore'
import DataTable from '../../components/DataTable'
import type { ColumnDef, FacetDef } from '../../components/DataTable'
import { Link } from 'react-router-dom'
import Breadcrumb from '../../components/Breadcrumb'
import FieldError from '../../components/FieldError'
import { useToast } from '../../components/Toast'

function uid(): string {
  return 'col-' + Math.random().toString(36).slice(2, 10)
}

// Formulaire local d'édition/création d'un collaborateur.
interface Draft {
  id: string
  prenom: string
  nom: string
  familleId: string
  modeleId: string
  // contrat pré-rempli depuis le modèle, éditable
  base: number
  seuilHebdo: number
  congesSolde: number
  // Liste des collaborateurs pour lesquels cette personne peut saisir.
  peutSaisirPour: string[]
}

export default function Collaborateurs() {
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
  const modeles = useDataStore((s) => s.modeles)
  const saveCollaborateur = useDataStore((s) => s.saveCollaborateur)
  const toast = useToast()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<{ prenom?: string; nom?: string }>({})

  function newDraft(): Draft {
    const m = modeles[0]
    return {
      id: uid(),
      prenom: '',
      nom: '',
      familleId: familles[0]?.id ?? '',
      modeleId: m?.id ?? '',
      base: m?.base ?? 35,
      seuilHebdo: m?.seuilHebdo ?? 35,
      congesSolde: m?.congesSolde ?? 25,
      peutSaisirPour: [],
    }
  }

  function fromCollaborateur(c: Collaborateur): Draft {
    return {
      id: c.id,
      prenom: c.prenom,
      nom: c.nom,
      familleId: c.familleId,
      modeleId: c.contrat.modeleId,
      base: c.contrat.base,
      seuilHebdo: c.contrat.seuilHebdo,
      congesSolde: c.contrat.congesSolde,
      peutSaisirPour: c.peutSaisirPour ?? [],
    }
  }

  // Ajoute/retire une cible de délégation dans le brouillon courant.
  function toggleDelegation(cibleId: string) {
    if (!draft) return
    const has = draft.peutSaisirPour.includes(cibleId)
    setDraft({
      ...draft,
      peutSaisirPour: has
        ? draft.peutSaisirPour.filter((id) => id !== cibleId)
        : [...draft.peutSaisirPour, cibleId],
    })
  }

  // Le choix d'un modèle pré-remplit base / seuil / congés.
  function applyModele(modeleId: string) {
    if (!draft) return
    const m = modeles.find((x) => x.id === modeleId)
    if (!m) return
    setDraft({
      ...draft,
      modeleId,
      base: m.base,
      seuilHebdo: m.seuilHebdo,
      congesSolde: m.congesSolde,
    })
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    const nextErrors: { prenom?: string; nom?: string } = {}
    if (!draft.prenom.trim()) nextErrors.prenom = 'Le prénom est obligatoire.'
    if (!draft.nom.trim()) nextErrors.nom = 'Le nom est obligatoire.'
    if (nextErrors.prenom || nextErrors.nom) {
      setErrors(nextErrors)
      return
    }
    const m = modeles.find((x) => x.id === draft.modeleId)
    const collaborateur: Collaborateur = {
      id: draft.id,
      prenom: draft.prenom.trim(),
      nom: draft.nom.trim(),
      familleId: draft.familleId,
      contrat: {
        modeleId: draft.modeleId,
        unite: m?.unite ?? 'heures',
        base: draft.base,
        seuilHebdo: draft.seuilHebdo,
        congesSolde: draft.congesSolde,
      },
      // Auto-référence exclue par sécurité (on saisit déjà pour soi).
      peutSaisirPour: draft.peutSaisirPour.filter((id) => id !== draft.id),
    }
    saveCollaborateur(collaborateur)
    setDraft(null)
    setErrors({})
    toast.success('Collaborateur enregistré.')
  }

  const familleNom = (id: string) => familles.find((f) => f.id === id)?.nom ?? '?'
  const modeleNom = (id: string) => modeles.find((m) => m.id === id)?.nom ?? '?'

  // Colonnes (tri : nom, contrat).
  const columns: ColumnDef<Collaborateur>[] = [
    {
      key: 'collab',
      label: 'Collaborateur',
      sortable: true,
      sortAccessor: (c) => `${c.nom} ${c.prenom}`,
      render: (c) => `${c.prenom} ${c.nom}`,
    },
    {
      key: 'famille',
      label: 'Famille',
      sortable: true,
      sortAccessor: (c) => familleNom(c.familleId),
      render: (c) => familleNom(c.familleId),
    },
    {
      key: 'modele',
      label: 'Modèle',
      sortable: true,
      sortAccessor: (c) => modeleNom(c.contrat.modeleId),
      render: (c) => modeleNom(c.contrat.modeleId),
    },
    {
      key: 'base',
      label: 'Base',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (c) => c.contrat.base,
      render: (c) => `${c.contrat.base} ${c.contrat.unite === 'heures' ? 'h' : 'h/j'}`,
    },
    {
      key: 'seuil',
      label: 'Seuil',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (c) => c.contrat.seuilHebdo,
      render: (c) => `${c.contrat.seuilHebdo}h`,
    },
    {
      key: 'conges',
      label: 'Congés',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (c) => c.contrat.congesSolde,
      render: (c) => `${c.contrat.congesSolde} j`,
    },
    {
      key: 'delegation',
      label: 'Délégation',
      sortable: true,
      sortType: 'number',
      sortAccessor: (c) => c.peutSaisirPour?.length ?? 0,
      render: (c) => {
        const n = c.peutSaisirPour?.length ?? 0
        return n > 0 ? (
          `saisit pour ${n} collègue${n > 1 ? 's' : ''}`
        ) : (
          <span className="muted">—</span>
        )
      },
    },
    {
      key: 'actions',
      label: '',
      render: (c) => (
        <button
          className="btn secondary small"
          onClick={() => setDraft(fromCollaborateur(c))}
        >
          Éditer
        </button>
      ),
    },
  ]

  // Facettes : Famille + Type de contrat (modèle).
  const filters: FacetDef<Collaborateur>[] = [
    {
      key: 'famille',
      label: 'Famille',
      type: 'select',
      options: familles.map((f) => ({ value: f.id, label: f.nom })),
      accessor: (c) => c.familleId,
    },
    {
      key: 'contrat',
      label: 'Type de contrat',
      type: 'select',
      options: modeles.map((m) => ({ value: m.id, label: m.nom })),
      accessor: (c) => c.contrat.modeleId,
    },
  ]

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Administration', to: '/responsable/admin' },
          { label: 'Collaborateurs' },
        ]}
      />
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Collaborateurs
        </h2>
        {!draft && (
          <div className="btn-row">
            <Link
              to="/responsable/admin/import"
              className="btn secondary small"
            >
              Importer (CSV / Excel)
            </Link>
            <button className="btn ocre small" onClick={() => setDraft(newDraft())}>
              + Nouveau collaborateur
            </button>
          </div>
        )}
      </div>

      {draft && (
        <form className="card" onSubmit={handleSave} style={{ marginTop: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {collaborateurs.some((c) => c.id === draft.id) ? 'Éditer' : 'Créer'} un
            collaborateur
          </h3>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="prenom">Prénom</label>
              <input
                id="prenom"
                value={draft.prenom}
                aria-invalid={errors.prenom ? true : undefined}
                aria-describedby={errors.prenom ? 'collab-prenom-err' : undefined}
                onChange={(e) => {
                  setDraft({ ...draft, prenom: e.target.value })
                  if (errors.prenom) setErrors((p) => ({ ...p, prenom: undefined }))
                }}
                autoFocus
              />
              <FieldError id="collab-prenom-err" message={errors.prenom} />
            </div>
            <div className="form-row">
              <label htmlFor="nom">Nom</label>
              <input
                id="nom"
                value={draft.nom}
                aria-invalid={errors.nom ? true : undefined}
                aria-describedby={errors.nom ? 'collab-nom-err' : undefined}
                onChange={(e) => {
                  setDraft({ ...draft, nom: e.target.value })
                  if (errors.nom) setErrors((p) => ({ ...p, nom: undefined }))
                }}
              />
              <FieldError id="collab-nom-err" message={errors.nom} />
            </div>
            <div className="form-row">
              <label htmlFor="fam">Famille</label>
              <select
                id="fam"
                value={draft.familleId}
                onChange={(e) => setDraft({ ...draft, familleId: e.target.value })}
              >
                {familles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="mod">Modèle de contrat</label>
              <select
                id="mod"
                value={draft.modeleId}
                onChange={(e) => applyModele(e.target.value)}
              >
                {modeles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Contrat pré-rempli depuis le modèle (modifiable) :
          </p>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="base">Base</label>
              <input
                id="base"
                type="number"
                min={0}
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
              <label htmlFor="conges">Solde congés (j)</label>
              <input
                id="conges"
                type="number"
                min={0}
                value={draft.congesSolde}
                onChange={(e) =>
                  setDraft({ ...draft, congesSolde: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>
            Autorisé à saisir pour (délégation) :
          </p>
          {collaborateurs.filter((c) => c.id !== draft.id).length === 0 ? (
            <p className="muted">Aucun autre collaborateur disponible.</p>
          ) : (
            <div className="form-row">
              <div
                className="delegation-list"
                role="group"
                aria-label="Autorisé à saisir pour"
              >
                {collaborateurs
                  .filter((c) => c.id !== draft.id)
                  .map((c) => (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.15rem 0',
                        fontWeight: 'normal',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={draft.peutSaisirPour.includes(c.id)}
                        onChange={() => toggleDelegation(c.id)}
                      />
                      <span>
                        {c.prenom} {c.nom} — {familleNom(c.familleId)}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          )}

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
          rows={collaborateurs}
          columns={columns}
          filters={filters}
          rowKey={(c) => c.id}
          search={{
            accessor: (c) => `${c.prenom} ${c.nom}`,
            placeholder: 'Rechercher un collaborateur…',
          }}
          defaultSort={{ key: 'collab', dir: 'asc' }}
          storageKey="collaborateurs"
          emptyLabel="Aucun collaborateur."
        />
      </div>
    </div>
  )
}
