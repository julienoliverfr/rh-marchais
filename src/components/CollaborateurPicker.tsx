import { useId, useMemo, useState } from 'react'
import type { Collaborateur, Famille } from '../types'

// ============================================================================
// CollaborateurPicker — choix d'un collaborateur EN TAPANT son nom.
//
// Une liste déroulante devient impraticable dès quelques dizaines de personnes
// (embauches saisonnières). Ici on saisit quelques lettres et les suggestions
// se filtrent (champ HTML natif `datalist` : fonctionne au clavier comme au
// doigt, sans dépendance). Dès qu'UNE SEULE personne correspond, elle est
// sélectionnée automatiquement.
//
// Les homonymes sont distingués par leur équipe, puis par un suffixe numéroté :
// sans libellé unique, le champ ne saurait pas laquelle choisir.
// ============================================================================

interface Props {
  collaborateurs: Collaborateur[]
  // Équipes, pour lever l'ambiguïté entre homonymes (optionnel).
  familles?: Famille[]
  value: string // id sélectionné ('' si aucun)
  onChange: (collaborateurId: string) => void
  label?: string
}

export default function CollaborateurPicker({
  collaborateurs,
  familles,
  value,
  onChange,
  label = 'Collaborateur',
}: Props) {
  const inputId = useId()
  const listId = `${inputId}-options`

  // Libellés d'affichage UNIQUES (équipe en complément, puis suffixe si besoin).
  const { labelParId, idParLabel } = useMemo(() => {
    const vus = new Map<string, number>()
    const labelParId = new Map<string, string>()
    const idParLabel = new Map<string, string>()
    for (const c of collaborateurs) {
      const equipe = familles?.find((f) => f.id === c.familleId)?.nom
      const base = `${c.prenom} ${c.nom}${equipe ? ` — ${equipe}` : ''}`.trim()
      const n = (vus.get(base) ?? 0) + 1
      vus.set(base, n)
      const affiche = n === 1 ? base : `${base} (${n})`
      labelParId.set(c.id, affiche)
      idParLabel.set(affiche.toLowerCase(), c.id)
    }
    return { labelParId, idParLabel }
  }, [collaborateurs, familles])

  const labelDe = (c: Collaborateur) =>
    labelParId.get(c.id) ?? `${c.prenom} ${c.nom}`

  // Texte saisi, initialisé sur la sélection courante.
  const [texte, setTexte] = useState<string>(() => {
    const initial = collaborateurs.find((c) => c.id === value)
    return initial ? labelParId.get(initial.id) ?? '' : ''
  })

  function saisir(v: string) {
    setTexte(v)
    const t = v.trim().toLowerCase()
    const exact = idParLabel.get(t)
    if (exact) {
      onChange(exact)
      return
    }
    const candidats = t
      ? collaborateurs.filter((c) => labelDe(c).toLowerCase().includes(t))
      : []
    onChange(candidats.length === 1 ? candidats[0].id : '')
  }

  const choisi = collaborateurs.some((c) => c.id === value)

  return (
    <div className="form-row">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type="search"
        list={listId}
        value={texte}
        placeholder="Tapez un nom…"
        autoComplete="off"
        onChange={(e) => saisir(e.target.value)}
      />
      <datalist id={listId}>
        {collaborateurs.map((c) => (
          <option key={c.id} value={labelDe(c)} />
        ))}
      </datalist>
      {!choisi && (
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          {texte.trim()
            ? 'Aucun collaborateur ne correspond.'
            : 'Commencez à taper un nom, ou effacez pour voir toute la liste.'}
        </p>
      )}
    </div>
  )
}
