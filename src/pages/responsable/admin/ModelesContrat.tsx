import { useMemo, useState } from 'react'
import type {
  CongeType,
  DecompteJours,
  ModeleContrat,
  TypeContrat,
  UniteContrat,
} from '../../../types'
import { useDataStore } from '../../../store/dataStore'
import { typeASolde } from '../../../lib/conges'
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

const TYPE_LABELS: Record<TypeContrat, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  saisonnier: 'Saisonnier',
}

// Libellés courts pour le résumé de la colonne « Congés » (ex. « CP 25 · RTT 10 »).
const SHORT_LABELS: Partial<Record<CongeType, string>> = {
  conge_paye: 'CP',
  rtt: 'RTT',
  maladie: 'Mal.',
  sans_solde: 'SS',
  anciennete: 'Anc.',
}

// Somme des quotas définis (sert de clé de tri pour la colonne « Congés »).
function totalQuotas(q?: Partial<Record<CongeType, number>>): number {
  if (!q) return 0
  return Object.values(q).reduce((acc: number, v) => acc + (v ?? 0), 0)
}

// Résumé lisible des quotas par type (« CP 25 · RTT 10 »), ou « — » si vide.
function resumeQuotas(q?: Partial<Record<CongeType, number>>): string {
  if (!q) return '—'
  const parts = (Object.entries(q) as [CongeType, number | undefined][])
    .filter(([, v]) => v != null)
    .map(([code, v]) => `${SHORT_LABELS[code] ?? code} ${v}`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

// CRUD complet des modèles de contrat. Ces modèles pré-remplissent le contrat
// d'un collaborateur (page Collaborateurs) : on protège donc la suppression
// d'un modèle encore utilisé.
export default function ModelesContrat() {
  const modeles = useDataStore((s) => s.modeles)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const regles = useDataStore((s) => s.regles)
  const politiques = useDataStore((s) => s.politiques)
  const typesAbsence = useDataStore((s) => s.typesAbsence)
  const saveModele = useDataStore((s) => s.saveModele)
  const deleteModele = useDataStore((s) => s.deleteModele)
  const toast = useToast()
  const confirm = useConfirm()

  const [draft, setDraft] = useState<ModeleContrat | null>(null)
  const [nomError, setNomError] = useState<string | null>(null)

  // Types à solde à quota SAISISSABLE : acquisition forfait/mensuel. L'ancienneté
  // (paliers) en est exclue — elle reste calculée automatiquement, pas de quota.
  const typesQuota = useMemo(
    () =>
      typesAbsence.filter(
        (t) =>
          typeASolde(t) &&
          (politiques[t.code]?.modeAcquisition ?? 'forfait') !== 'anciennete',
      ),
    [typesAbsence, politiques],
  )

  function newDraft(): ModeleContrat {
    return {
      id: uid(),
      nom: '',
      typeContrat: 'CDI',
      unite: 'heures',
      base: 35,
      // Seuil h. sup par défaut piloté par les règles générales.
      seuilHebdo: regles.seuilHsupDefautHebdo,
      // Vide au départ : chaque type non renseigné suit le quota par défaut
      // de sa politique.
      quotasParType: {},
    }
  }

  // Met à jour (ou retire si vide) le quota d'un type dans le brouillon courant.
  function setQuota(code: CongeType, raw: string) {
    if (!draft) return
    const q: Partial<Record<CongeType, number>> = { ...(draft.quotasParType ?? {}) }
    if (raw.trim() === '') delete q[code]
    else q[code] = Number(raw)
    setDraft({ ...draft, quotasParType: q })
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
      sortAccessor: (m) => totalQuotas(m.quotasParType),
      render: (m) => resumeQuotas(m.quotasParType),
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
              <label htmlFor="decompte">Décompte des congés</label>
              <select
                id="decompte"
                value={draft.decompteJours ?? 'ouvres'}
                onChange={(e) =>
                  setDraft({ ...draft, decompteJours: e.target.value as DecompteJours })
                }
              >
                <option value="ouvres">Jours ouvrés (lun–ven)</option>
                <option value="ouvrables">Jours ouvrables (lun–sam)</option>
              </select>
            </div>
          </div>

          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>
            Congés (jours par type). Laisser vide = quota par défaut de la
            politique. L'ancienneté est calculée automatiquement par paliers.
          </p>
          {typesQuota.length === 0 ? (
            <p className="muted">Aucun type de congé à quota configuré.</p>
          ) : (
            <div className="form-grid">
              {typesQuota.map((t) => (
                <div className="form-row" key={t.code}>
                  <label htmlFor={`quota-${t.code}`}>{t.label} (j)</label>
                  <input
                    id={`quota-${t.code}`}
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="défaut"
                    value={draft.quotasParType?.[t.code] ?? ''}
                    onChange={(e) => setQuota(t.code, e.target.value)}
                  />
                </div>
              ))}
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
