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

import { newId } from '../../../lib/id'

function uid(): string {
  return newId()
}

const ROLE_LABELS: Record<Role, string> = {
  employe: 'Employé',
  responsable: 'Responsable',
}

// Brouillon de création OU d'édition.
// - `id === null` : création (le mot de passe est OBLIGATOIRE et n'existe qu'ici).
// - `id !== null` : édition d'un compte existant. L'identifiant est en LECTURE
//   SEULE (le changer côté auth est hors périmètre) ; le champ mot de passe est
//   alors OPTIONNEL (« nouveau mot de passe » ; vide = inchangé).
interface Draft {
  id: string | null
  identifiant: string
  motDePasse: string
  role: Role
  collaborateurId: string // '' = aucun
  // Contrats SUPPLEMENTAIRES rattachés au même compte (cumul de mi-temps).
  collaborateursSecondaires: string[]
  nomAffichage: string
}

interface FormErrors {
  identifiant?: string
  motDePasse?: string
  role?: string
}

// Gestion des comptes de connexion : liste + création + édition + suppression.
// On empêche la suppression de son propre compte et l'auto-rétrogradation.
export default function Utilisateurs() {
  const session = useAuthStore((s) => s.session)
  const comptes = useDataStore((s) => s.comptes)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const saveCompte = useDataStore((s) => s.saveCompte)
  const deleteCompte = useDataStore((s) => s.deleteCompte)
  const resetPassword = useDataStore((s) => s.resetPassword)
  const toast = useToast()
  const confirm = useConfirm()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})

  // Mode édition = brouillon rattaché à un compte existant.
  const isEdition = draft?.id != null

  function newDraft(): Draft {
    return {
      id: null,
      identifiant: '',
      motDePasse: '',
      role: 'employe',
      collaborateurId: '',
      collaborateursSecondaires: [],
      nomAffichage: '',
    }
  }

  // Brouillon pré-rempli à partir d'un compte existant (édition).
  function editDraft(c: Compte): Draft {
    return {
      id: c.id,
      identifiant: c.identifiant,
      // Jamais réaffiché : champ « nouveau mot de passe » optionnel, vide au départ.
      motDePasse: '',
      role: c.role,
      collaborateurId: c.collaborateurId ?? '',
      collaborateursSecondaires: c.collaborateursSecondaires ?? [],
      nomAffichage: c.nomAffichage,
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

    // ------------------------------- ÉDITION -------------------------------
    if (draft.id != null) {
      // Garde-fou : on ne se retire pas à soi-même le rôle responsable (on se
      // priverait de l'accès à l'administration).
      if (
        draft.id === session?.compteId &&
        session?.role === 'responsable' &&
        draft.role !== 'responsable'
      ) {
        setErrors({
          role: 'Vous ne pouvez pas retirer votre propre rôle responsable.',
        })
        return
      }

      const existant = comptes.find((c) => c.id === draft.id)
      const compte: Compte = {
        id: draft.id,
        // Identifiant NON modifiable en édition : on conserve la valeur d'origine.
        identifiant: existant?.identifiant ?? draft.identifiant,
        // On PRÉSERVE le mot de passe stocké (mode local) ; la réinitialisation
        // éventuelle passe par resetPassword ci-dessous. En mode Supabase, le
        // profil n'expose pas de mot de passe (chaîne vide, ignorée).
        motDePasse: existant?.motDePasse ?? '',
        role: draft.role,
        collaborateurId:
          draft.role === 'employe' && draft.collaborateurId
            ? draft.collaborateurId
            : undefined,
        collaborateursSecondaires:
          draft.role === 'employe' && draft.collaborateursSecondaires.length > 0
            ? draft.collaborateursSecondaires
            : undefined,
        nomAffichage: defautNomAffichage(draft),
      }
      // 1) Mise à jour du profil (chemin « édition » existant de saveCompte).
      saveCompte(compte)
      // 2) Réinitialisation du mot de passe seulement si un nouveau est saisi.
      if (draft.motDePasse) resetPassword(draft.id, draft.motDePasse)
      setDraft(null)
      setErrors({})
      toast.success(
        draft.motDePasse
          ? `Utilisateur « ${compte.identifiant} » modifié (mot de passe réinitialisé).`
          : `Utilisateur « ${compte.identifiant} » modifié.`,
      )
      return
    }

    // ------------------------------- CRÉATION ------------------------------
    const identifiant = draft.identifiant.trim().toLowerCase()
    const nextErrors: FormErrors = {}
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
      collaborateursSecondaires:
        draft.role === 'employe' && draft.collaborateursSecondaires.length > 0
          ? draft.collaborateursSecondaires
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
      align: 'right',
      render: (c) => (
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button
            className="btn secondary small"
            title="Modifier"
            onClick={() => {
              setErrors({})
              setDraft(editDraft(c))
            }}
          >
            Modifier
          </button>
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
        </div>
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
            {isEdition ? 'Modifier le compte' : 'Créer un compte'}
          </h3>
          <div className="form-grid">
            <div className="form-row">
              <label htmlFor="identifiant">Identifiant</label>
              <input
                id="identifiant"
                value={draft.identifiant}
                readOnly={isEdition}
                disabled={isEdition}
                aria-invalid={errors.identifiant ? true : undefined}
                aria-describedby={errors.identifiant ? 'user-id-err' : undefined}
                onChange={(e) => {
                  setDraft({ ...draft, identifiant: e.target.value })
                  if (errors.identifiant)
                    setErrors((p) => ({ ...p, identifiant: undefined }))
                }}
                autoFocus={!isEdition}
              />
              {isEdition && (
                <span className="muted" style={{ fontSize: '0.85em' }}>
                  L'identifiant d'un compte existant n'est pas modifiable.
                </span>
              )}
              <FieldError id="user-id-err" message={errors.identifiant} />
            </div>
            <div className="form-row">
              <label htmlFor="mdp">
                {isEdition ? 'Nouveau mot de passe' : 'Mot de passe'}
              </label>
              <input
                id="mdp"
                type="password"
                value={draft.motDePasse}
                autoComplete="new-password"
                placeholder={isEdition ? 'Laisser vide pour ne pas changer' : undefined}
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
                aria-invalid={errors.role ? true : undefined}
                aria-describedby={errors.role ? 'user-role-err' : undefined}
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
              <FieldError id="user-role-err" message={errors.role} />
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
            {/* CUMUL DE CONTRATS : une même personne peut avoir deux contrats
                (deux mi-temps). On rattache alors les deux au MÊME compte : une
                seule connexion, mais chaque contrat garde son solde de congés et
                son seuil d'heures supplémentaires. */}
            {draft.role === 'employe' && draft.collaborateurId && (
              <div className="form-row">
                <label>Autres contrats de cette personne</label>
                <div
                  className="delegation-list"
                  role="group"
                  aria-label="Autres contrats rattachés"
                >
                  {collaborateurs
                    .filter((c) => c.id !== draft.collaborateurId)
                    .map((c) => (
                      <label key={c.id} className="delegation-item">
                        <input
                          type="checkbox"
                          checked={draft.collaborateursSecondaires.includes(c.id)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              collaborateursSecondaires: e.target.checked
                                ? [...draft.collaborateursSecondaires, c.id]
                                : draft.collaborateursSecondaires.filter(
                                    (x) => x !== c.id,
                                  ),
                            })
                          }
                        />
                        {c.prenom} {c.nom}
                      </label>
                    ))}
                </div>
                <p className="muted" style={{ fontSize: '0.8rem' }}>
                  À n'utiliser que si la personne occupe <strong>plusieurs
                  contrats</strong> chez vous. Elle choisira son contrat au
                  moment de saisir ses heures.
                </p>
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
              {isEdition ? 'Enregistrer' : 'Créer le compte'}
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
