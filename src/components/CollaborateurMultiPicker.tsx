import { useId, useMemo, useState } from 'react'
import type { Collaborateur, Famille } from '../types'
import { libellesUniques } from '../lib/personnes'

// ============================================================================
// Choix de PLUSIEURS collaborateurs, en tapant leur nom.
//
// Une liste à cases à cocher devient impraticable dès quelques dizaines de
// personnes (embauches saisonnières) : il faut faire défiler pour trouver, et
// on ne voit plus d'un coup d'œil qui est retenu. Ici, on tape quelques
// lettres, on valide, et chaque personne retenue apparaît comme une étiquette
// que l'on peut retirer d'un geste.
//
// Sélection VIDE = tout le monde. C'est l'état de départ le plus utile : on
// ouvre l'écran pour voir l'ensemble, puis on restreint.
// ============================================================================

interface Props {
  collaborateurs: Collaborateur[]
  familles?: Famille[]
  // ids retenus ; tableau vide = aucun filtre.
  value: string[]
  onChange: (ids: string[]) => void
  label?: string
}

export default function CollaborateurMultiPicker({
  collaborateurs,
  familles,
  value,
  onChange,
  label = 'Collaborateurs',
}: Props) {
  const inputId = useId()
  const listId = `${inputId}-options`
  const [texte, setTexte] = useState('')

  const { labelParId, idParLabel } = useMemo(
    () => libellesUniques(collaborateurs, familles),
    [collaborateurs, familles],
  )

  const labelDe = (id: string) => labelParId.get(id) ?? id

  // On ne propose QUE les personnes non encore retenues : reproposer un nom
  // déjà choisi n'a aucun sens et allonge la liste inutilement.
  const disponibles = collaborateurs.filter((c) => !value.includes(c.id))

  function ajouter(saisi: string) {
    const t = saisi.trim().toLowerCase()
    if (!t) return
    let id = idParLabel.get(t)
    if (!id) {
      // Pas de correspondance exacte : on accepte si UNE SEULE personne
      // correspond au texte tapé, ce qui évite d'avoir à saisir le nom entier.
      const candidats = disponibles.filter((c) =>
        labelDe(c.id).toLowerCase().includes(t),
      )
      if (candidats.length !== 1) return
      id = candidats[0].id
    }
    if (value.includes(id)) return
    onChange([...value, id])
    setTexte('')
  }

  function retirer(id: string) {
    onChange(value.filter((x) => x !== id))
  }

  return (
    <div className="multi-picker">
      <label htmlFor={inputId}>{label}</label>
      <div className="multi-picker-champ">
        <input
          id={inputId}
          type="search"
          list={listId}
          value={texte}
          placeholder={value.length ? 'Ajouter…' : 'Tous — tapez un nom'}
          autoComplete="off"
          onChange={(e) => {
            setTexte(e.target.value)
            // Choix dans la liste de suggestions : on ajoute sans attendre
            // « Entrée », le geste attendu étant terminé.
            if (idParLabel.has(e.target.value.trim().toLowerCase())) {
              ajouter(e.target.value)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ajouter(texte)
            } else if (e.key === 'Backspace' && !texte && value.length) {
              // Retour arrière sur un champ vide : retire la dernière étiquette,
              // comme dans un champ de destinataires de courriel.
              retirer(value[value.length - 1])
            }
          }}
        />
        <datalist id={listId}>
          {disponibles.map((c) => (
            <option key={c.id} value={labelDe(c.id)} />
          ))}
        </datalist>
        {value.length > 0 && (
          <button
            type="button"
            className="btn secondary small"
            onClick={() => onChange([])}
          >
            Tout effacer
          </button>
        )}
      </div>

      {value.length > 0 && (
        <ul className="multi-picker-etiquettes" aria-label="Collaborateurs retenus">
          {value.map((id) => (
            <li key={id}>
              <span>{labelDe(id)}</span>
              <button
                type="button"
                onClick={() => retirer(id)}
                aria-label={`Retirer ${labelDe(id)}`}
                title="Retirer"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
