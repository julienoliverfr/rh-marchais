import { useMemo, useState } from 'react'
import type { CongeType, DemiJour } from '../../types'
import { useAuthStore } from '../../store/authStore'
import { useDataStore } from '../../store/dataStore'
import { CONGE_TYPE_LABELS, computeNbJours, typeASolde } from '../../lib/conges'
import { formatDateFr, formatDateFrNum, todayISO } from '../../lib/dates'
import { apercuPolitique } from '../../lib/soldes'
import CongeBadge from '../../components/CongeBadge'
import HelpTip from '../../components/HelpTip'
import EmptyState from '../../components/EmptyState'
import FieldError from '../../components/FieldError'
import { useToast } from '../../components/Toast'

export default function MesConges() {
  const session = useAuthStore((s) => s.session)
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const familles = useDataStore((s) => s.familles)
  const conges = useDataStore((s) => s.conges)
  const politiques = useDataStore((s) => s.politiques)
  // Types d'absence paramétrables (Administration) : alimentent le menu déroulant.
  const typesAbsence = useDataStore((s) => s.typesAbsence)
  const getSolde = useDataStore((s) => s.getSolde)
  const getSoldesTousTypes = useDataStore((s) => s.getSoldesTousTypes)
  const creerDemandeConge = useDataStore((s) => s.creerDemandeConge)
  const toast = useToast()

  // Contrats de la personne (cumul de mi-temps possible). Les congés sont
  // acquis et décomptés PAR CONTRAT : elle choisit lequel est concerné.
  const mesContrats = useMemo(
    () =>
      (session?.collaborateurIds ?? []).flatMap((id) => {
        const c = collaborateurs.find((x) => x.id === id)
        return c ? [c] : []
      }),
    [collaborateurs, session],
  )
  const [contratId, setContratId] = useState<string | null>(null)
  const collaborateur = useMemo(
    () =>
      mesContrats.find((c) => c.id === contratId) ??
      mesContrats.find((c) => c.id === session?.collaborateurId) ??
      mesContrats[0],
    [mesContrats, contratId, session],
  )
  const equipeNomDe = (c: (typeof mesContrats)[number]) =>
    familles.find((f) => f.id === c.familleId)?.nom ?? '?'

  // Libellé lisible d'un type (config admin, repli sur les libellés du domaine).
  const labelDe = (code: CongeType): string =>
    typesAbsence.find((t) => t.code === code)?.label ?? CONGE_TYPE_LABELS[code]

  // Premier type disponible pour initialiser le formulaire (à solde en priorité).
  const premierType: CongeType =
    typesAbsence.find((t) => typeASolde(t))?.code ??
    typesAbsence[0]?.code ??
    'conge_paye'

  // Champs du formulaire
  const [type, setType] = useState<CongeType>(premierType)
  const [dateDebut, setDateDebut] = useState(todayISO())
  const [dateFin, setDateFin] = useState(todayISO())
  const [demiJour, setDemiJour] = useState<DemiJour>('aucune')
  const [motif, setMotif] = useState('')

  const mesConges = useMemo(() => {
    if (!collaborateur) return []
    return conges.filter((c) => c.collaborateurId === collaborateur.id)
  }, [conges, collaborateur])

  if (!collaborateur) {
    return (
      <div className="card">
        <p>Aucun collaborateur rattaché à ce compte.</p>
      </div>
    )
  }

  // Un solde par type à solde (CP, RTT, Ancienneté…), période/règle propres.
  const soldes = getSoldesTousTypes(collaborateur.id, todayISO())

  const memeJour = dateDebut === dateFin
  const demiEffective: DemiJour = memeJour ? demiJour : 'aucune'
  const nbJours = computeNbJours(
    dateDebut,
    dateFin,
    demiEffective,
    collaborateur.contrat.decompteJours,
  )
  const datesInvalides = dateFin < dateDebut

  // Type d'absence sélectionné dans la liste paramétrable.
  const typeConfig = typesAbsence.find((t) => t.code === type)
  const impacteSolde = typeConfig ? typeASolde(typeConfig) : false
  const justificatifRequis = typeConfig?.justificatifRequis ?? false
  // Solde du type sélectionné (uniquement s'il porte un compteur).
  const soldeType = impacteSolde ? getSolde(collaborateur.id, type, todayISO()) : null
  const restantApres = soldeType ? soldeType.restant - nbJours : null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = creerDemandeConge({
      collaborateurId: collaborateur!.id,
      type,
      dateDebut,
      dateFin,
      demiJour: demiEffective,
      demandeParUserId: session!.identifiant,
      motif,
    })
    if (res.ok) {
      toast.success('Demande de congé envoyée (statut « Demandée »).')
      setMotif('')
    } else {
      toast.error(res.error ?? 'Demande impossible.')
    }
  }

  return (
    <div>
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Mes congés
      </h2>

      {/* Cumul de contrats : les congés s'acquièrent et se décomptent PAR
          CONTRAT. Le sélecteur n'apparaît que pour les personnes concernées. */}
      {mesContrats.length > 1 && (
        <div className="card">
          <div className="form-row">
            <label htmlFor="contrat-conges">Pour quel contrat ?</label>
            <select
              id="contrat-conges"
              value={collaborateur.id}
              onChange={(e) => setContratId(e.target.value)}
            >
              {mesContrats.map((c) => (
                <option key={c.id} value={c.id}>
                  {equipeNomDe(c)} — {c.contrat.base}{' '}
                  {c.contrat.unite === 'heures' ? 'h' : 'j'}
                </option>
              ))}
            </select>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Vous avez {mesContrats.length} contrats : chacun a son propre solde
              de congés.
            </p>
          </div>
        </div>
      )}

      {/* ---------- Une carte de solde par type à solde ---------- */}
      {soldes.length === 0 ? (
        <div className="card">
          <p className="muted">Aucun type de congé à solde configuré.</p>
        </div>
      ) : (
        soldes.map(({ typeId, label, solde }) => {
          const politique = politiques[typeId]
          return (
            <div className="card" key={typeId} style={{ marginBottom: '0.8rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                }}
              >
                <h3 className="section-title" style={{ margin: 0 }}>
                  {label} · {solde.periode.label}
                </h3>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  {formatDateFrNum(solde.periode.debut)} →{' '}
                  {formatDateFrNum(solde.periode.fin)}
                  {politique ? ` · ${apercuPolitique(politique)}` : ''}
                </span>
              </div>

              {solde.avertissement && (
                <div className="alert error" style={{ marginTop: '0.5rem' }}>
                  {solde.avertissement}
                </div>
              )}

              <div className="grid" style={{ marginTop: '0.6rem' }}>
                <div className="stat">
                  <div className="label">
                    Acquis{' '}
                    <HelpTip
                      label="Acquis"
                      text="Les jours de congés gagnés sur cette période."
                    />
                  </div>
                  <div className="value">{solde.acquis} j</div>
                  {solde.reportBrut > 0 && (
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      dont report {solde.reportBrut} j
                    </div>
                  )}
                  {solde.ancienneteAns != null && (
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      ancienneté {solde.ancienneteAns} an(s)
                    </div>
                  )}
                </div>
                <div className="stat accent">
                  <div className="label">
                    Pris{' '}
                    <HelpTip label="Pris" text="Les jours déjà utilisés." />
                  </div>
                  <div className="value">{solde.pris} j</div>
                </div>
                <div className="stat">
                  <div className="label">
                    Restant{' '}
                    <HelpTip
                      label="Restant"
                      text="Les jours encore disponibles."
                    />
                  </div>
                  <div className="value">{solde.restant} j</div>
                  {solde.reportRestant > 0 && solde.dateExpirationReport && (
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      dont report : {solde.reportRestant} j (expire le{' '}
                      {formatDateFrNum(solde.dateExpirationReport)})
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })
      )}

      <h3 className="section-title">Demander un congé</h3>
      <form className="card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-row">
            <label htmlFor="type">Type d'absence</label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as CongeType)}
            >
              {typesAbsence.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                  {typeASolde(t) ? ' (à solde)' : ''}
                </option>
              ))}
            </select>
            {justificatifRequis && (
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Un justificatif sera demandé pour ce type d'absence.
              </span>
            )}
          </div>
          <div className="form-row">
            <label htmlFor="dd">Date début</label>
            <input
              id="dd"
              type="date"
              value={dateDebut}
              onChange={(e) => {
                setDateDebut(e.target.value)
                if (dateFin < e.target.value) setDateFin(e.target.value)
              }}
            />
          </div>
          <div className="form-row">
            <label htmlFor="df">Date fin</label>
            <input
              id="df"
              type="date"
              value={dateFin}
              min={dateDebut}
              aria-invalid={datesInvalides ? true : undefined}
              aria-describedby={datesInvalides ? 'df-err' : undefined}
              onChange={(e) => setDateFin(e.target.value)}
            />
            <FieldError
              id="df-err"
              message={
                datesInvalides
                  ? 'La date de fin ne peut pas précéder la date de début.'
                  : null
              }
            />
          </div>
          {memeJour && (
            <div className="form-row">
              <label htmlFor="demi">
                Demi-journée{' '}
                <HelpTip
                  label="Demi-journée"
                  text="Une matinée ou une après-midi seulement."
                />
              </label>
              <select
                id="demi"
                value={demiJour}
                onChange={(e) => setDemiJour(e.target.value as DemiJour)}
              >
                <option value="aucune">Journée complète</option>
                <option value="debut">Demi-journée (matin)</option>
                <option value="fin">Demi-journée (après-midi)</option>
              </select>
            </div>
          )}
        </div>

        <div className="form-row">
          <label htmlFor="motif">Motif (optionnel)</label>
          <input
            id="motif"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Précision éventuelle"
          />
        </div>

        {datesInvalides ? (
          <div className="alert error">
            La date de fin ne peut pas précéder la date de début.
          </div>
        ) : (
          <div className="alert info">
            Durée calculée : <strong>{nbJours} jour(s) ouvré(s)</strong>.{' '}
            {soldeType ? (
              <>
                Solde {labelDe(type)} : <strong>{soldeType.restant} j</strong> ·
                restant après validation : <strong>{restantApres} j</strong>
                {restantApres != null && restantApres < 0 && ' (solde dépassé)'}
              </>
            ) : (
              'Ce type ne décompte aucun solde.'
            )}
          </div>
        )}
        {soldeType && restantApres != null && restantApres < 0 && !datesInvalides && (
          <div className="alert error">
            Attention : le solde {labelDe(type)} deviendrait négatif. La demande
            reste possible mais nécessitera un arbitrage.
          </div>
        )}

        <button className="btn" type="submit" disabled={datesInvalides || nbJours <= 0}>
          Envoyer la demande
        </button>
      </form>

      <h3 className="section-title">Mes demandes</h3>
      {mesConges.length === 0 ? (
        <EmptyState
          icon="🌴"
          text="Vous n'avez pas encore de demande. Touchez « Demander un congé » quand vous le souhaitez."
        />
      ) : (
        mesConges.map((c) => (
          <div key={c.id}>
            <div className="entry">
              <div className="main">
                <span className="date">
                  {formatDateFr(c.dateDebut)}
                  {c.dateFin !== c.dateDebut && ` → ${formatDateFr(c.dateFin)}`}
                  {c.demiJour !== 'aucune' && ' (½)'}
                </span>
                <span className="muted">
                  {labelDe(c.type)} · {c.nbJours} j
                </span>
              </div>
              <CongeBadge statut={c.statut} />
            </div>
            {c.statut === 'refusee' && c.refusMotif && (
              <div className="alert error" style={{ marginTop: '0.4rem' }}>
                <strong>Refusée</strong> — motif : {c.refusMotif}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
