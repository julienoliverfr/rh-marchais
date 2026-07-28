import { useState } from 'react'
import type { Compte, Role } from '../../../types'
import { useAuthStore } from '../../../store/authStore'
import { useDataStore } from '../../../store/dataStore'
import DataTable from '../../../components/DataTable'
import type { ColumnDef, FacetDef } from '../../../components/DataTable'
import Breadcrumb from '../../../components/Breadcrumb'
import FieldError from '../../../components/FieldError'
import { useToast } from '../../../components/Toast'
import { useConfirm } from '../../../components/ConfirmDialog'

function uid(): string {
  return 'cpt-' + Math.random().toString(36).slice(2, 10)
}

const ROLE_LABELS: Record<Role, string> = {
  employe: 'Employé',
  responsable: 'Responsable',
}

// Brouillon de création (le mot de passe n'existe qu'à la création ; il n'est
// jamais réaffiché ensuite).
interface Draft {
  identifiant: string
  motDePasse: string
  role: Role
  collaborateurId: string // '' = aucun
  nomAffichage: string
}

// Gestion des comptes de connexion : liste + création + suppression.
// On empêche la suppression de son propre compte.
export default function Utilisateurs() {
  const session = useAuthStore((s) => s.session)
  const comptes = useDataStore((s) => s.comptes)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const saveCompte = useDataStore((s) => s.saveCompte)
  const deleteCompte = useDataStore((s) => s.deleteCompte)
  const toast = useToast()
  const confirm = useConfirm()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<{ identifiant?: string; motDePasse?: string }>(
    {},
  )

  function newDraft(): Draft {
    return {
      identifiant: '',
      motDePasse: '',
      role: 'employe',
      collaborateurId: '',
      nomAffichage: '',
    }
  }

  const collabNom = (id?: string) => {
    const c = collaborateurs.find((x) => x.id === id)
    return c ? `${c.prenom} ${c.nom}` : '—'
  }

  // Nom affiché par défaut : celui du collaborateur rattaché, sinon l'identifiant.
  function defautNomAffichage(d: Draft): string {
    if (d.nomAffichage.trim()) return d.nomAffichage.trim()
    if (d.collaborateurId) return collabNom(d.collaborateurId)
    return d.identifiant.trim()
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    const identifiant = draft.identifiant.trim().toLowerCase()
    const nextErrors: { identifiant?: string; motDePasse?: string } = {}
    if (!identifiant) {
      nextErrors.identifiant = "L'identifiant est obligatoire."
    } else if (comptes.some((c) => c.identifiant === identifiant)) {
      nextErrors.identifiant = 'Cet identifiant existe déjà.'
    }
    if (!draft.motDePasse) {
      nextErrors.motDePasse = 'Le mot de passe est obligatoire.'
    }
    if (nextErrors.identifiant || nextErrors.motDePasse) {
      setErrors(nextErrors)
      return
    }
    const compte: Compte = {
      id: uid(),
      identifiant,
      motDePasse: draft.motDePasse,
      role: draft.role,
      collaborateurId:
        draft.role === 'employe' && draft.collaborateurId
          ? draft.collaborateurId
          : undefined,
      nomAffichage: defautNomAffichage(draft),
    }
    saveCompte(compte)
    setDraft(null)
    setErrors({})
    toast.success(`Utilisateur « ${compte.identifiant} » créé.`)
  }

  async function handleDelete(c: Compte) {
    if (c.id === session?.compteId) return // garde-fou : pas son propre compte
    const ok = await confirm({
      title: 'Supprimer le compte',
      message: `Voulez-vous supprimer le compte « ${c.identifiant} » ? Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    deleteCompte(c.id)
    toast.success(`Utilisateur « ${c.identifiant} » supprimé.`)
  }

  const columns: ColumnDef<Compte>[] = [
    {
      key: 'identifiant',
      label: 'Identifiant',
      sortable: true,
      sortAccessor: (c) => c.identifiant,
      render: (c) => (
        <span>
          <code>{c.identifiant}</code>
          {c.id === session?.compteId && (
            <span className="muted" style={{ marginLeft: '0.4rem' }}>
              (vous)
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'nom',
      label: 'Nom affiché',
      sortable: true,
      sortAccessor: (c) => c.nomAffichage,
      render: (c) => c.nomAffichage,
    },
    {
      key: 'role',
      label: 'Rôle',
      sortable: true,
      sortAccessor: (c) => ROLE_LABELS[c.role],
      render: (c) => ROLE_LABELS[c.role],
    },
    {
      key: 'collab',
      label: 'Collaborateur',
      sortable: true,
      sortAccessor: (c) => collabNom(c.collaborateurId),
      render: (c) => collabNom(c.collaborateurId),
    },
    {
      key: 'actions',
      label: '',
      render: (c) => (
        <button
          className="btn danger small"
          disabled={c.id === session?.compteId}
          title={
            c.id === session?.compteId
              ? 'Impossible de supprimer votre propre compte'
              : 'Supprimer'
          }
          onClick={() => handleDelete(c)}
        >
          Suppr.
        </button>
      ),
    },
  ]

  const filters: FacetDef<Compte>[] = [
    {
      key: 'role',
      label: 'Rôle',
      type: 'select',
      options: (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({
        value: r,
        label: ROLE_LABELS[r],
      })),
      accessor: (c) => c.role,
    },
  ]

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Administration', to: '/responsable/admin' },
          { label: 'Utilisateurs' },
        ]}
      />
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Utilisateurs
        </h2>
        {!draft && (
          <button
            className="btn ocre small"
            onClick={() => {
              setErrors({})
              setDraft(newDraft())
            }}
          >
            + Nouveau compte
          </button>
        )}
      </div>

      {draft && (
        <form className="card" onSubmit={handleSave} style={{ marginTop: '1rem' }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            Créer un compte
          </h3>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="identifiant">Identifiant</label>
              <input
                id="identifiant"
                value={draft.identifiant}
                aria-invalid={errors.identifiant ? true : undefined}
                aria-describedby={errors.identifiant ? 'user-id-err' : undefined}
                onChange={(e) => {
                  setDraft({ ...draft, identifiant: e.target.value })
                  if (errors.identifiant)
                    setErrors((p) => ({ ...p, identifiant: undefined }))
                }}
                autoFocus
              />
              <FieldError id="user-id-err" message={errors.identifiant} />
            </div>
            <div className="form-row">
              <label htmlFor="mdp">Mot de passe</label>
              <input
                id="mdp"
                type="password"
                value={draft.motDePasse}
                aria-invalid={errors.motDePasse ? true : undefined}
                aria-describedby={errors.motDePasse ? 'user-mdp-err' : undefined}
                onChange={(e) => {
                  setDraft({ ...draft, motDePasse: e.target.value })
                  if (errors.motDePasse)
                    setErrors((p) => ({ ...p, motDePasse: undefined }))
                }}
              />
              <FieldError id="user-mdp-err" message={errors.motDePasse} />
            </div>
            <div className="form-row">
              <label htmlFor="role">Rôle</label>
              <select
                id="role"
                value={draft.role}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    role: e.target.value as Role,
                    // Un responsable n'est pas rattaché à un collaborateur.
                    collaborateurId:
                      e.target.value === 'responsable' ? '' : draft.collaborateurId,
                  })
                }
              >
                <option value="employe">Employé</option>
                <option value="responsable">Responsable</option>
              </select>
            </div>
            {draft.role === 'employe' && (
              <div className="form-row">
                <label htmlFor="collab">Collaborateur rattaché</label>
                <select
                  id="collab"
                  value={draft.collaborateurId}
                  onChange={(e) =>
                    setDraft({ ...draft, collaborateurId: e.target.value })
                  }
                >
                  <option value="">— Aucun —</option>
                  {collaborateurs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.prenom} {c.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-row">
              <label htmlFor="nom">Nom affiché (optionnel)</label>
              <input
                id="nom"
                value={draft.nomAffichage}
                onChange={(e) => setDraft({ ...draft, nomAffichage: e.target.value })}
                placeholder="Par défaut : collaborateur ou identifiant"
              />
            </div>
          </div>
          <div className="btn-row">
            <button className="btn" type="submit">
              Créer le compte
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setDraft(null)
                setErrors({})
              }}
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: '1rem' }}>
        <DataTable
          rows={comptes}
          columns={columns}
          filters={filters}
          rowKey={(c) => c.id}
          search={{
            accessor: (c) => `${c.identifiant} ${c.nomAffichage}`,
            placeholder: 'Rechercher un compte…',
          }}
          defaultSort={{ key: 'identifiant', dir: 'asc' }}
          storageKey="utilisateurs"
          emptyLabel="Aucun compte."
        />
      </div>
    </div>
  )
}
