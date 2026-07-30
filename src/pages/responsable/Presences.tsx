import { useMemo, useState } from 'react'
import { useDataStore } from '../../store/dataStore'
import { CONGE_TYPE_LABELS } from '../../lib/conges'
import { feriesCalcules } from '../../lib/feries'
import {
  currentMonthKey,
  decalerMois,
  formatMonthFr,
  joursDuMois,
  toISODate,
} from '../../lib/dates'
import { formatMinutes } from '../../lib/hours'
import {
  CONGE_ABBR,
  etatJour,
  totauxLigne,
  type EtatJour,
} from '../../lib/presences'
import Breadcrumb from '../../components/Breadcrumb'
import EmptyState from '../../components/EmptyState'

// ============================================================================
// Présences du mois — vue d'ENSEMBLE : « qui est là, et où sont les trous ? »
//
// À ne pas confondre avec la Feuille mensuelle, qui répond à « combien d'heures
// pour CETTE personne ». Les heures ne sont donc pas affichées ici : sur 31
// colonnes, une grille de nombres devient illisible et ferait doublon. Elles
// restent accessibles en infobulle.
// ============================================================================

const JOURS_COURTS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

// Ce qu'on écrit dans la cellule, et la classe qui la colore.
function rendu(e: EtatJour): { texte: string; classe: string; titre: string } {
  switch (e.type) {
    case 'hors':
      return { texte: '·', classe: 'pr-hors', titre: 'Hors contrat' }
    case 'futur':
      return { texte: '', classe: 'pr-futur', titre: 'À venir' }
    case 'present':
      return {
        texte: '✓',
        classe: 'pr-present',
        titre: `Présent · ${formatMinutes(e.minutes)}`,
      }
    case 'conge':
      return {
        texte: CONGE_ABBR[e.code] + (e.demi ? '½' : ''),
        classe: `pr-conge pr-conge-${e.code}`,
        titre: CONGE_TYPE_LABELS[e.code] + (e.demi ? ' (demi-journée)' : ''),
      }
    case 'chome':
      return { texte: '', classe: 'pr-chome', titre: e.label }
    case 'aExpliquer':
      return {
        texte: '⚠',
        classe: 'pr-trou',
        // Volontairement neutre : un trou est le plus souvent un oubli de
        // saisie. Le qualifier d'absence injustifiée serait une accusation que
        // la donnée ne permet pas de porter.
        titre: 'Ni heures ni congé — à expliquer',
      }
  }
}

export default function Presences() {
  const collaborateurs = useDataStore((s) => s.collaborateurs)
  const saisies = useDataStore((s) => s.saisies)
  const conges = useDataStore((s) => s.conges)
  const familles = useDataStore((s) => s.familles)
  const joursFeries = useDataStore((s) => s.joursFeries)

  const [mois, setMois] = useState<string>(currentMonthKey())
  const [familleId, setFamilleId] = useState<string>('')
  const [avecSortis, setAvecSortis] = useState(false)

  const aujourdhui = toISODate(new Date())
  const jours = useMemo(() => joursDuMois(mois), [mois])

  // Fériés nationaux calculés + surcouche paramétrable (ponts, fériés travaillés).
  const feries = useMemo(() => {
    const annee = Number(mois.slice(0, 4))
    const m = new Map<string, { label: string; chome: boolean }>()
    for (const f of feriesCalcules(annee)) m.set(f.date, { label: f.label, chome: true })
    for (const j of joursFeries) m.set(j.date, { label: j.label, chome: j.chome })
    return m
  }, [mois, joursFeries])

  // Un collaborateur sorti AVANT le mois affiché n'a rien à y faire, même quand
  // on demande à voir les sortis : la case sert à retrouver quelqu'un parti en
  // cours de mois, pas à allonger la liste de personnes absentes partout.
  const debutDuMois = jours[0] ?? `${mois}-01`

  const lignes = useMemo(() => {
    const retenus = collaborateurs
      .filter((c) => !familleId || c.familleId === familleId)
      .filter((c) => {
        if (!c.dateSortie) return true
        if (c.dateSortie >= debutDuMois) return true // parti en cours de mois
        return avecSortis
      })
      .sort((a, b) =>
        `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'),
      )

    return retenus.map((c) => {
      const sesSaisies = new Map(
        saisies.filter((s) => s.collaborateurId === c.id).map((s) => [s.date, s]),
      )
      const sesConges = conges.filter(
        (g) => g.collaborateurId === c.id && g.statut === 'validee',
      )
      const etats = jours.map((d) =>
        etatJour(c, d, sesSaisies.get(d), sesConges, { feries, aujourdhui }),
      )
      return {
        collab: c,
        equipe: familles.find((f) => f.id === c.familleId)?.nom ?? '',
        etats,
        totaux: totauxLigne(etats),
      }
    })
  }, [
    collaborateurs,
    saisies,
    conges,
    familles,
    jours,
    feries,
    aujourdhui,
    familleId,
    avecSortis,
    debutDuMois,
  ])

  // Deux personnes peuvent porter le même nom (cas des deux contrats) : on
  // désambiguïse par l'équipe, sans quoi la grille serait indéchiffrable.
  const nomAffiche = (nom: string, equipe: string, idx: number): string => {
    const homonyme = lignes.some(
      (l, i) => i !== idx && `${l.collab.nom} ${l.collab.prenom}` === nom,
    )
    return homonyme && equipe ? `${nom} (${equipe})` : nom
  }

  const totalATraiter = lignes.reduce((n, l) => n + l.totaux.aExpliquer, 0)

  return (
    <section className="stack">
      <Breadcrumb items={[{ label: 'Présences' }]} />
      <div className="page-head">
        <h2 className="section-title" style={{ margin: 0 }}>
          Présences du mois
        </h2>
      </div>
      <p className="muted">
        Qui est présent, en congé, ou n’a rien déclaré. Pour le détail des heures
        d’une personne, voir la feuille mensuelle.
      </p>

      <div className="card">
        <div
          className="btn-row"
          style={{ alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}
        >
          <div className="btn-row" style={{ alignItems: 'center' }}>
            <button
              className="btn secondary small"
              onClick={() => setMois((m) => decalerMois(m, -1))}
              aria-label="Mois précédent"
            >
              ◀
            </button>
            <strong style={{ minWidth: '9rem', textAlign: 'center' }}>
              {formatMonthFr(mois)}
            </strong>
            <button
              className="btn secondary small"
              onClick={() => setMois((m) => decalerMois(m, 1))}
              aria-label="Mois suivant"
            >
              ▶
            </button>
            {mois !== currentMonthKey() && (
              <button
                className="btn secondary small"
                onClick={() => setMois(currentMonthKey())}
              >
                Mois en cours
              </button>
            )}
          </div>

          <label className="pr-filtre">
            <span>Équipe</span>
            <select
              value={familleId}
              onChange={(e) => setFamilleId(e.target.value)}
              aria-label="Filtrer par équipe"
            >
              <option value="">Toutes</option>
              {familles.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </label>

          <label className="pr-filtre">
            <input
              type="checkbox"
              checked={avecSortis}
              onChange={(e) => setAvecSortis(e.target.checked)}
            />
            <span>Afficher les sortis</span>
          </label>
        </div>

        {/* Légende : sans elle, les symboles sont indéchiffrables. */}
        <div className="pr-legende" aria-label="Légende">
          <span><i className="pr-chip pr-present">✓</i> présent</span>
          <span><i className="pr-chip pr-conge pr-conge-conge_paye">CP</i> congé validé</span>
          <span><i className="pr-chip pr-chome" /> week-end ou férié</span>
          <span><i className="pr-chip pr-trou">⚠</i> à expliquer</span>
          <span><i className="pr-chip pr-hors">·</i> hors contrat</span>
        </div>
      </div>

      {lignes.length === 0 ? (
        <EmptyState
          icon="🗓️"
          text="Aucun collaborateur à afficher. Changez d’équipe, ou affichez les collaborateurs sortis."
        />
      ) : (
        <>
          {totalATraiter > 0 && (
            <p className="muted">
              <strong>{totalATraiter}</strong> journée(s) sans heures ni congé sur
              ce mois.
            </p>
          )}
          <div className="pr-scroll">
            <table className="pr-table">
              <thead>
                <tr>
                  <th className="pr-nom" scope="col">
                    Collaborateur
                  </th>
                  {jours.map((d) => {
                    const j = new Date(d + 'T12:00:00')
                    const we = j.getDay() === 0 || j.getDay() === 6
                    const ferie = feries.get(d)?.chome
                    return (
                      <th
                        key={d}
                        scope="col"
                        className={`pr-jour${we || ferie ? ' pr-jour-chome' : ''}${
                          d === aujourdhui ? ' pr-jour-auj' : ''
                        }`}
                        title={feries.get(d)?.label}
                      >
                        <span className="pr-jour-lettre">
                          {JOURS_COURTS[j.getDay()]}
                        </span>
                        <span className="pr-jour-num">{j.getDate()}</span>
                      </th>
                    )
                  })}
                  <th className="pr-tot" scope="col" title="Jours présents">✓</th>
                  <th className="pr-tot" scope="col" title="Jours de congé">🌴</th>
                  <th className="pr-tot" scope="col" title="Journées à expliquer">⚠</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, idx) => (
                  <tr key={l.collab.id}>
                    <th scope="row" className="pr-nom">
                      {nomAffiche(`${l.collab.nom} ${l.collab.prenom}`, l.equipe, idx)}
                    </th>
                    {l.etats.map((e, i) => {
                      const r = rendu(e)
                      return (
                        <td
                          key={jours[i]}
                          className={`pr-cell ${r.classe}${
                            jours[i] === aujourdhui ? ' pr-jour-auj' : ''
                          }`}
                          title={`${l.collab.prenom} ${l.collab.nom} · ${jours[i]} — ${r.titre}`}
                        >
                          {r.texte}
                        </td>
                      )
                    })}
                    <td className="pr-tot">{l.totaux.presents}</td>
                    <td className="pr-tot">{l.totaux.conges}</td>
                    <td className={`pr-tot${l.totaux.aExpliquer > 0 ? ' pr-tot-alerte' : ''}`}>
                      {l.totaux.aExpliquer}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Un « ⚠ » signale une journée sans heures ni congé : le plus souvent un
            oubli de saisie. Passez la souris (ou appuyez longuement) sur une case
            pour le détail. Le mois de {formatMonthFr(mois)} n’est pas modifiable
            depuis cet écran — utilisez la saisie pour un collaborateur.
          </p>
        </>
      )}
    </section>
  )
}
