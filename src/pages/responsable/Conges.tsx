import { useMemo, useState } from 'react'
import type { Collaborateur, Conge, CongeType, Famille } from '../../types'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import { CONGE_TYPE_LABELS, typeASolde } from '../../lib/conges'
import { formatDateFr, formatDateFrNum, todayISO } from '../../lib/dates'
import { POLITIQUE_DEFAUT, apercuPolitique, periodePour } from '../../lib/soldes'
import DataTable from '../../components/DataTable'
import type { ColumnDef, FacetDef } from '../../components/DataTable'
import FieldError from '../../components/FieldError'
import { useToast } from '../../components/Toast'

function famillePillClass(nom: string): string {
  const key = nom.trim().toLowerCase()
  if (key === 'vignes') return 'pill-fam vignes'
  if (key === 'marchais') return 'pill-fam marchais'
  return 'pill-fam'
}

export default function Conges() {
  const session = useAuthStore((s) => s.session)
  const conges = useDataStore((s) => s.conges)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
  const politiques = useDataStore((s) => s.politiques)
  const typesAbsence = useDataStore((s) => s.typesAbsence)
  const getSolde = useDataStore((s) => s.getSolde)
  const validerConge = useDataStore((s) => s.validerConge)
  const refuserConge = useDataStore((s) => s.refuserConge)
  const ajusterJoursConge = useDataStore((s) => s.ajusterJoursConge)
  const setAllocation = useDataStore((s) => s.setAllocation)
  const toast = useToast()

  const [refusId, setRefusId] = useState<string | null>(null)
  const [motif, setMotif] = useState('')
  const [refusError, setRefusError] = useState<string | null>(null)
  const [allocDraft, setAllocDraft] = useState<Record<string, string>>({})
  // Ajustement manuel du nombre de jours (id du congé en cours d'ajustement).
  const [ajustId, setAjustId] = useState<string | null>(null)
  const [ajustJours, setAjustJours] = useState('')
  const [ajustMotif, setAjustMotif] = useState('')
  const [ajustError, setAjustError] = useState<string | null>(null)

  // Types à solde disponibles (sélecteur de la section « Soldes »).
  const typesSolde = useMemo(
    () => typesAbsence.filter((t) => typeASolde(t)),
    [typesAbsence],
  )
  const [typeSolde, setTypeSolde] = useState<CongeType>('conge_paye')
  const politiqueType = politiques[typeSolde] ?? POLITIQUE_DEFAUT

  // Un type porte-t-il un solde ? (pour le décompte des demandes).
  const aSoldeDe = (code: CongeType): boolean => {
    const t = typesAbsence.find((x) => x.code === code)
    return t ? typeASolde(t) : false
  }
  // Libellé lisible d'un type (config admin, repli sur les libellés du domaine).
  const labelDe = (code: CongeType): string =>
    typesAbsence.find((t) => t.code === code)?.label ?? CONGE_TYPE_LABELS[code]

  // Date de référence pilotant la période affichée (soldes/allocation).
  // La période dépend de la politique DU TYPE sélectionné.
  const [refDate, setRefDate] = useState(todayISO())
  const periode = useMemo(
    () => periodePour(refDate, politiqueType),
    [refDate, politiqueType],
  )

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

  const demandes = useMemo(
    () => conges.filter((c) => c.statut === 'demandee'),
    [conges],
  )

  // Nom de la famille d'un congé (pour facette + recherche).
  const familleNomDe = (c: Conge): string => {
    const col = collabById.get(c.collaborateurId)
    return col ? familleById.get(col.familleId)?.nom ?? '' : ''
  }
  const collabNomDe = (c: Conge): string => {
    const col = collabById.get(c.collaborateurId)
    return col ? `${col.prenom} ${col.nom}` : ''
  }

  // Bascule vers la période précédente / suivante en déplaçant la date de
  // référence hors des bornes courantes (le moteur recalcule la période).
  function periodePrecedente() {
    setRefDate(dateVeille(periode.debut)) // veille du début → période N−1
  }
  function periodeSuivante() {
    setRefDate(dateLendemain(periode.fin)) // lendemain de la fin → période N+1
  }
  const estCourante = periode.label === periodePour(todayISO(), politiqueType).label

  function notify(res: { ok: boolean; error?: string }, okMsg: string) {
    if (res.ok) toast.success(okMsg)
    else toast.error(res.error ?? 'Action impossible.')
  }

  function handleValider(c: Conge) {
    notify(validerConge(c.id, parUser), 'Congé approuvé.')
  }

  function confirmRefus() {
    if (!refusId) return
    const res = refuserConge(refusId, parUser, motif)
    if (res.ok) {
      setRefusId(null)
      setMotif('')
      setRefusError(null)
      toast.success('Congé refusé.')
    } else {
      setRefusError(res.error ?? 'Refus impossible.')
    }
  }

  // Ouvre le formulaire d'ajustement pré-rempli avec la valeur courante.
  function startAjust(c: Conge) {
    setAjustId(c.id)
    setAjustJours(String(c.nbJours))
    setAjustMotif('')
    setAjustError(null)
  }

  function confirmAjust() {
    if (!ajustId) return
    const val = Number(ajustJours.replace(',', '.'))
    if (ajustJours.trim() === '' || Number.isNaN(val) || val < 0) {
      setAjustError('Nombre de jours invalide (positif ou nul).')
      return
    }
    if (!ajustMotif.trim()) {
      setAjustError('Le motif est obligatoire (il est enregistré dans le journal).')
      return
    }
    const res = ajusterJoursConge(ajustId, val, parUser, ajustMotif)
    if (res.ok) {
      setAjustId(null)
      setAjustError(null)
      toast.success('Nombre de jours ajusté (tracé dans le journal).')
    } else {
      setAjustError(res.error ?? 'Ajustement impossible.')
    }
  }

  // Allocation = override manuel de l'acquis pour le TYPE + la période sélectionnés.
  function handleAllocation(collaborateurId: string) {
    const raw = allocDraft[collaborateurId]
    const val = Number(raw)
    if (raw == null || raw === '' || Number.isNaN(val) || val < 0) {
      toast.error('Allocation invalide : saisissez un nombre positif.')
      return
    }
    setAllocation(collaborateurId, typeSolde, periode.label, val)
    toast.success(`Allocation ${labelDe(typeSolde)} · ${periode.label} enregistrée.`)
  }

  // Restant après validation d'une demande, évalué pour SON type dans SA période.
  function restantApres(c: Conge): number {
    if (!aSoldeDe(c.type)) return 0
    const solde = getSolde(c.collaborateurId, c.type, c.dateDebut)
    return solde.restant - c.nbJours
  }

  // ---- Colonnes « Demandes à traiter » (facettes Type + Famille ; tri période, jours)
  const demandesColumns: ColumnDef<Conge>[] = [
    {
      key: 'collab',
      label: 'Collaborateur',
      sortable: true,
      sortAccessor: (c) => {
        const col = collabById.get(c.collaborateurId)
        return col ? `${col.nom} ${col.prenom}` : ''
      },
      render: (c) => collabNomDe(c) || '—',
    },
    {
      key: 'famille',
      label: 'Équipe',
      render: (c) => {
        const nom = familleNomDe(c)
        return nom ? <span className={famillePillClass(nom)}>{nom}</span> : null
      },
    },
    {
      key: 'periode',
      label: 'Période',
      sortable: true,
      sortType: 'date',
      sortAccessor: (c) => c.dateDebut,
      render: (c) => (
        <>
          {formatDateFr(c.dateDebut)}
          {c.dateFin !== c.dateDebut && ` → ${formatDateFr(c.dateFin)}`}
          {c.demiJour !== 'aucune' && ' (½)'}
        </>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      sortAccessor: (c) => labelDe(c.type),
      render: (c) => labelDe(c.type),
    },
    {
      key: 'jours',
      label: 'Jours',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (c) => c.nbJours,
      // Un congé ajusté à la main affiche la valeur d'origine (calcul auto).
      render: (c) =>
        c.nbJoursCalcule != null && c.nbJoursCalcule !== c.nbJours ? (
          <>
            {c.nbJours}{' '}
            <span className="badge en_attente" title={`Calcul automatique : ${c.nbJoursCalcule} j`}>
              ajusté
            </span>
          </>
        ) : (
          c.nbJours
        ),
    },
    {
      key: 'restant',
      label: 'Restant après',
      align: 'right',
      render: (c) => {
        if (!aSoldeDe(c.type)) return <span className="muted">n/a</span>
        const reste = restantApres(c)
        return (
          <>
            {reste} j {reste < 0 && <span className="badge refusee">négatif</span>}
          </>
        )
      },
    },
    {
      key: 'actions',
      label: '',
      render: (c) => (
        <>
          <div className="btn-row">
            <button className="btn small" onClick={() => handleValider(c)}>
              Approuver
            </button>
            <button
              className="btn danger small"
              onClick={() => {
                setRefusId(c.id)
                setMotif('')
                setRefusError(null)
              }}
            >
              Refuser
            </button>
            <button className="btn secondary small" onClick={() => startAjust(c)}>
              Ajuster les jours
            </button>
          </div>
          {ajustId === c.id && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className="form-grid">
                <div className="form-row">
                  <label htmlFor={`ajust-j-${c.id}`}>
                    Jours décomptés
                    {c.nbJoursCalcule != null && ` (calcul : ${c.nbJoursCalcule} j)`}
                  </label>
                  <input
                    id={`ajust-j-${c.id}`}
                    type="number"
                    min={0}
                    step={0.5}
                    autoFocus
                    value={ajustJours}
                    onChange={(e) => {
                      setAjustJours(e.target.value)
                      if (ajustError) setAjustError(null)
                    }}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor={`ajust-m-${c.id}`}>Motif (obligatoire)</label>
                  <input
                    id={`ajust-m-${c.id}`}
                    placeholder="Ex. samedi non décompté (accord)"
                    value={ajustMotif}
                    onChange={(e) => {
                      setAjustMotif(e.target.value)
                      if (ajustError) setAjustError(null)
                    }}
                  />
                </div>
              </div>
              <FieldError id={`ajust-conge-err-${c.id}`} message={ajustError} />
              <div className="btn-row" style={{ marginTop: '0.4rem' }}>
                <button className="btn small" onClick={confirmAjust}>
                  Enregistrer l'ajustement
                </button>
                <button
                  className="btn secondary small"
                  onClick={() => {
                    setAjustId(null)
                    setAjustError(null)
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
          {refusId === c.id && (
            <div style={{ marginTop: '0.5rem' }}>
              <input
                autoFocus
                placeholder="Motif du refus (obligatoire)"
                value={motif}
                aria-invalid={refusError ? true : undefined}
                aria-describedby={refusError ? `refus-conge-err-${c.id}` : undefined}
                onChange={(e) => {
                  setMotif(e.target.value)
                  if (refusError) setRefusError(null)
                }}
              />
              <FieldError id={`refus-conge-err-${c.id}`} message={refusError} />
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
        </>
      ),
    },
  ]

  const demandesFilters: FacetDef<Conge>[] = [
    {
      key: 'type',
      label: "Type d'absence",
      type: 'select',
      options: typesAbsence.map((t) => ({ value: t.code, label: t.label })),
      accessor: (c) => c.type,
    },
    {
      key: 'famille',
      label: 'Équipe',
      type: 'select',
      options: familles.map((f) => ({ value: f.nom, label: f.nom })),
      accessor: (c) => familleNomDe(c),
    },
  ]

  // ---- Colonnes « Soldes & allocation » (facette Famille ; tri restant, nom) ----
  const soldesColumns: ColumnDef<Collaborateur>[] = [
    {
      key: 'collab',
      label: 'Collaborateur',
      sortable: true,
      sortAccessor: (col) => `${col.nom} ${col.prenom}`,
      render: (col) => `${col.prenom} ${col.nom}`,
    },
    {
      key: 'famille',
      label: 'Équipe',
      render: (col) => {
        const nom = familleById.get(col.familleId)?.nom
        return nom ? <span className={famillePillClass(nom)}>{nom}</span> : null
      },
    },
    {
      key: 'acquis',
      label: 'Acquis',
      align: 'right',
      render: (col) => `${getSolde(col.id, typeSolde, refDate).acquis} j`,
    },
    {
      key: 'report',
      label: 'dont report',
      align: 'right',
      render: (col) => {
        const s = getSolde(col.id, typeSolde, refDate)
        if (s.reportRestant <= 0) return <span className="muted">—</span>
        return (
          <>
            {s.reportRestant} j
            {s.dateExpirationReport && (
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                expire le {formatDateFrNum(s.dateExpirationReport)}
              </div>
            )}
          </>
        )
      },
    },
    {
      key: 'pris',
      label: 'Pris',
      align: 'right',
      render: (col) => `${getSolde(col.id, typeSolde, refDate).pris} j`,
    },
    {
      key: 'restantSolde',
      label: 'Restant',
      align: 'right',
      sortable: true,
      sortType: 'number',
      sortAccessor: (col) => getSolde(col.id, typeSolde, refDate).restant,
      render: (col) => {
        const restant = getSolde(col.id, typeSolde, refDate).restant
        return (
          <>
            {restant} j {restant < 0 && <span className="badge refusee">négatif</span>}
          </>
        )
      },
    },
    {
      key: 'alloc',
      label: 'Allocation manuelle',
      render: (col) => (
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <input
            type="number"
            min={0}
            step={0.5}
            style={{ width: '90px' }}
            placeholder={String(getSolde(col.id, typeSolde, refDate).acquis)}
            value={allocDraft[col.id] ?? ''}
            onChange={(e) =>
              setAllocDraft({ ...allocDraft, [col.id]: e.target.value })
            }
          />
          <button
            className="btn secondary small"
            onClick={() => handleAllocation(col.id)}
          >
            Enregistrer
          </button>
        </div>
      ),
    },
  ]

  const soldesFilters: FacetDef<Collaborateur>[] = [
    {
      key: 'famille',
      label: 'Équipe',
      type: 'select',
      options: familles.map((f) => ({ value: f.id, label: f.nom })),
      accessor: (col) => col.familleId,
    },
  ]

  return (
    <div>
      {/* En-tête homogène : compteur « à traiter » non répété (badge menu + titre
          de section « Demandes à traiter (N) » ci-dessous le portent déjà). */}
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Congés
        </h2>
      </div>

      {/* ---------- Demandes à traiter ---------- */}
      <h3 className="section-title">Demandes à traiter ({demandes.length})</h3>
      {demandes.length === 0 ? (
        <div className="card">
          <p className="muted">Aucune demande en attente. 🎉</p>
        </div>
      ) : (
        <DataTable
          rows={demandes}
          columns={demandesColumns}
          filters={demandesFilters}
          rowKey={(c) => c.id}
          search={{
            accessor: (c) => collabNomDe(c),
            placeholder: 'Rechercher un collaborateur…',
          }}
          defaultSort={{ key: 'periode', dir: 'asc' }}
          storageKey="conges-demandes"
          emptyLabel="Aucune demande pour ce filtre."
        />
      )}

      {/* ---------- Soldes & allocation (par type à solde + période) ---------- */}
      <h3 className="section-title">Soldes &amp; allocation</h3>

      {/* Sélecteur de type à solde (recalcule acquis/pris/restant + période). */}
      <div className="seg" style={{ marginBottom: '0.6rem', flexWrap: 'wrap' }}>
        {typesSolde.map((t) => (
          <button
            key={t.code}
            className={t.code === typeSolde ? 'active' : ''}
            onClick={() => setTypeSolde(t.code)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sélecteur de période de référence (propre au type sélectionné). */}
      <div className="seg" style={{ marginBottom: '0.6rem' }}>
        <button onClick={periodePrecedente}>◀ Période précédente</button>
        <button className="active" disabled>
          {periode.label}
          {estCourante ? ' (courante)' : ''}
        </button>
        <button onClick={periodeSuivante}>Période suivante ▶</button>
      </div>

      <div className="alert info">
        <strong>{labelDe(typeSolde)}</strong> · Période{' '}
        <strong>{periode.label}</strong> : {formatDateFrNum(periode.debut)} →{' '}
        {formatDateFrNum(periode.fin)} · {apercuPolitique(politiqueType)}
      </div>

      <DataTable
        rows={collaborateurs}
        columns={soldesColumns}
        filters={soldesFilters}
        rowKey={(col) => col.id}
        search={{
          accessor: (col) => `${col.prenom} ${col.nom}`,
          placeholder: 'Rechercher un collaborateur…',
        }}
        defaultSort={{ key: 'collab', dir: 'asc' }}
        storageKey="conges-soldes"
        emptyLabel="Aucun collaborateur."
      />
    </div>
  )
}

// Veille d'une date ISO (utilitaire local, sûr vis-à-vis du fuseau via UTC).
function dateVeille(dateISO: string): string {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}
// Lendemain d'une date ISO.
function dateLendemain(dateISO: string): string {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}
