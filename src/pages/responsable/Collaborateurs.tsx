import { useMemo, useState } from 'react'
import type { Collaborateur, CongeType, DecompteJours } from '../../types'
import { estActif } from '../../types'
import { todayISO } from '../../lib/dates'
import { useDataStore } from '../../store/dataStore'
import { quotasParTypeDe, typeASolde } from '../../lib/conges'
import DataTable from '../../components/DataTable'
import type { ColumnDef, FacetDef } from '../../components/DataTable'
import { Link } from 'react-router-dom'
import Breadcrumb from '../../components/Breadcrumb'
import FieldError from '../../components/FieldError'
import { useToast } from '../../components/Toast'

import { newId } from '../../lib/id'

function uid(): string {
  return newId()
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
  // Mode de décompte des congés (hérité du modèle, éditable).
  decompteJours: DecompteJours
  // Date d'entrée (ISO yyyy-mm-dd), '' si inconnue. Pilote le PRORATA d'acquisition
  // des congés et le calcul de l'ancienneté (voir lib/soldes.ts).
  dateDebut: string
  // Date de sortie des effectifs, '' si toujours présent.
  dateSortie: string
  // Quotas de congés PAR TYPE (jours/type). Un type absent = défaut politique.
  quotasParType: Partial<Record<CongeType, number>>
  // Liste des collaborateurs pour lesquels cette personne peut saisir.
  peutSaisirPour: string[]
}

// Libellés courts pour le résumé de la colonne « Congés » (« CP 25 · RTT 10 »).
const SHORT_LABELS: Partial<Record<CongeType, string>> = {
  conge_paye: 'CP',
  rtt: 'RTT',
  maladie: 'Mal.',
  sans_solde: 'SS',
  anciennete: 'Anc.',
}

function totalQuotas(q?: Partial<Record<CongeType, number>>): number {
  if (!q) return 0
  return Object.values(q).reduce((acc: number, v) => acc + (v ?? 0), 0)
}

function resumeQuotas(q?: Partial<Record<CongeType, number>>): string {
  if (!q) return '—'
  const parts = (Object.entries(q) as [CongeType, number | undefined][])
    .filter(([, v]) => v != null)
    .map(([code, v]) => `${SHORT_LABELS[code] ?? code} ${v}`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export default function Collaborateurs() {
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
  const modeles = useDataStore((s) => s.modeles)
  const politiques = useDataStore((s) => s.politiques)
  const typesAbsence = useDataStore((s) => s.typesAbsence)
  const saveCollaborateur = useDataStore((s) => s.saveCollaborateur)
  const toast = useToast()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<{ prenom?: string; nom?: string }>({})

  // Types à solde à quota saisissable (forfait/mensuel ; ancienneté exclue).
  const typesQuota = useMemo(
    () =>
      typesAbsence.filter(
        (t) =>
          typeASolde(t) &&
          (politiques[t.code]?.modeAcquisition ?? 'forfait') !== 'anciennete',
      ),
    [typesAbsence, politiques],
  )

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
      decompteJours: m?.decompteJours ?? 'ouvres',
      dateDebut: '',
      dateSortie: '',
      // Pré-rempli depuis le modèle (quotas par type).
      quotasParType: m ? { ...quotasParTypeDe(m) } : {},
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
      decompteJours: c.contrat.decompteJours ?? 'ouvres',
      // Relue puis réécrite telle quelle : sans cela, une simple édition
      // EFFACERAIT la date d'entrée (et donc le prorata + l'ancienneté).
      dateDebut: c.contrat.dateDebut ?? '',
      dateSortie: c.dateSortie ?? '',
      quotasParType: { ...quotasParTypeDe(c.contrat) },
      peutSaisirPour: c.peutSaisirPour ?? [],
    }
  }

  // Met à jour (ou retire si vide) le quota d'un type dans le brouillon courant.
  function setQuota(code: CongeType, raw: string) {
    if (!draft) return
    const q: Partial<Record<CongeType, number>> = { ...draft.quotasParType }
    if (raw.trim() === '') delete q[code]
    else q[code] = Number(raw)
    setDraft({ ...draft, quotasParType: q })
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

  // Le choix d'un modèle pré-remplit base / seuil / quotas par type.
  function applyModele(modeleId: string) {
    if (!draft) return
    const m = modeles.find((x) => x.id === modeleId)
    if (!m) return
    setDraft({
      ...draft,
      modeleId,
      base: m.base,
      seuilHebdo: m.seuilHebdo,
      decompteJours: m.decompteJours ?? 'ouvres',
      quotasParType: { ...quotasParTypeDe(m) },
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
      dateSortie: draft.dateSortie || undefined,
      contrat: {
        modeleId: draft.modeleId,
        unite: m?.unite ?? 'heures',
        base: draft.base,
        seuilHebdo: draft.seuilHebdo,
        decompteJours: draft.decompteJours,
        dateDebut: draft.dateDebut || undefined,
        quotasParType: draft.quotasParType,
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
      render: (c) => (
        <>
          {c.prenom} {c.nom}
          {!estActif(c, todayISO()) && (
            <span
              className="badge refusee"
              style={{ marginLeft: '0.4rem' }}
              title={`Sorti des effectifs le ${c.dateSortie}`}
            >
              Sorti
            </span>
          )}
        </>
      ),
    },
    {
      key: 'famille',
      label: 'Équipe',
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
      sortAccessor: (c) => totalQuotas(quotasParTypeDe(c.contrat)),
      render: (c) => resumeQuotas(quotasParTypeDe(c.contrat)),
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

  // Facettes : Présence + Équipe + Type de contrat (modèle).
  const filters: FacetDef<Collaborateur>[] = [
    {
      key: 'presence',
      label: 'Présence',
      type: 'select',
      options: [
        { value: 'actif', label: 'Actifs' },
        { value: 'sorti', label: 'Sortis' },
      ],
      accessor: (c) => (estActif(c, todayISO()) ? 'actif' : 'sorti'),
    },
    {
      key: 'famille',
      label: 'Équipe',
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
              <label htmlFor="fam">Équipe</label>
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
              <label htmlFor="decompte">Décompte des congés</label>
              <select
                id="decompte"
                value={draft.decompteJours}
                onChange={(e) =>
                  setDraft({ ...draft, decompteJours: e.target.value as DecompteJours })
                }
              >
                <option value="ouvres">Jours ouvrés (lun–ven)</option>
                <option value="ouvrables">Jours ouvrables (lun–sam)</option>
              </select>
            </div>
            <div className="form-row">
              <label htmlFor="dateDebut">Date d'entrée</label>
              <input
                id="dateDebut"
                type="date"
                value={draft.dateDebut}
                onChange={(e) => setDraft({ ...draft, dateDebut: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label htmlFor="dateSortie">Date de sortie</label>
              <input
                id="dateSortie"
                type="date"
                value={draft.dateSortie}
                onChange={(e) => setDraft({ ...draft, dateSortie: e.target.value })}
              />
            </div>
          </div>
          {draft.dateSortie && (
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: '-0.25rem' }}>
              À partir de cette date, ce collaborateur n'apparaîtra plus dans les
              listes de saisie et de délégation. Son historique (heures, congés,
              exports) reste <strong>intégralement conservé</strong>.
            </p>
          )}
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: '-0.25rem' }}>
            {draft.dateDebut ? (
              <>
                Les congés seront calculés <strong>au prorata</strong> à partir de cette
                date, et l'ancienneté en découle.
              </>
            ) : (
              <>
                Sans date d'entrée, le collaborateur reçoit le{' '}
                <strong>quota annuel complet</strong> (aucun prorata) et{' '}
                <strong>aucun congé d'ancienneté</strong>. Renseignez-la pour une
                embauche en cours d'année.
              </>
            )}
          </p>

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
                    value={draft.quotasParType[t.code] ?? ''}
                    onChange={(e) => setQuota(t.code, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

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
                  // On ne délègue pas pour quelqu'un qui a quitté l'entreprise.
                  .filter((c) => c.id !== draft.id && estActif(c, todayISO()))
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
