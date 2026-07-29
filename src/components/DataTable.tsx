import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

// ============================================================================
// DataTable — composant générique de tableau (tri + filtres + pagination).
//
// Objectif : un comportement HOMOGÈNE sur tous les tableaux de l'app RH.
// - Tri typé (texte FR / nombre / date ISO), stable, un seul critère actif.
// - Filtres : recherche texte globale + facettes `select`, avec chips actifs.
// - Pagination : lignes par page (25/50/100), « X–Y sur N », bornes gérées.
// - Persistance optionnelle (tri / filtres / taille) via `storageKey`.
// - Responsive : sous ~700px les facettes se replient derrière « Filtrer ».
// - Accessibilité : en-têtes triables focusables (Enter/Espace) + `aria-sort`.
//
// Toute la logique d'état vit dans le hook `useTableControls` ; `DataTable`
// n'est que la couche de présentation. Aucune couleur de marque n'est codée
// en dur : le rendu réutilise les classes CSS existantes (`table`, `btn`,
// `badge`, `card`…) + quelques règles neutres `.dt-*` (basées sur le thème).
// ============================================================================

export type SortDir = 'asc' | 'desc'
export type SortType = 'text' | 'number' | 'date'
export type Align = 'left' | 'right' | 'center'

// Valeur brute utilisée pour comparer deux lignes sur une colonne.
export type SortValue = string | number | Date | null | undefined

// Définition d'une colonne. `render` pilote l'affichage (cellules riches,
// badges, boutons d'action…) ; `sortAccessor` fournit la valeur de tri quand
// l'affichage ne correspond pas à une valeur triable simple.
export interface ColumnDef<T> {
  key: string
  label: ReactNode
  sortable?: boolean
  sortType?: SortType // défaut : 'text'
  align?: Align // défaut : 'left'
  // Valeur brute pour le tri. À défaut, on lit `row[key]` si présent.
  sortAccessor?: (row: T) => SortValue
  // Rendu de la cellule. À défaut, on affiche `row[key]` tel quel.
  render?: (row: T) => ReactNode
}

export interface FilterOption {
  value: string
  label: string
}

// Facette de filtrage (liste déroulante). `accessor` renvoie la valeur
// comparée à l'option sélectionnée (comparaison sur chaîne).
export interface FacetDef<T> {
  key: string
  label: string
  type: 'select'
  options: FilterOption[]
  accessor: (row: T) => string
}

// Recherche texte globale.
export interface SearchDef<T> {
  placeholder?: string
  accessor: (row: T) => string
}

export interface DataTableProps<T> {
  rows: T[]
  columns: ColumnDef<T>[]
  // Remonte les lignes APRÈS recherche et filtres (avant pagination). Permet à
  // l'écran d'agir exactement sur CE QUE L'UTILISATEUR VOIT — sans cela, une
  // action « tout valider » porte sur l'ensemble des données, filtres ignorés.
  onFilteredChange?: (rows: T[]) => void
  filters?: FacetDef<T>[]
  search?: SearchDef<T>
  defaultSort?: { key: string; dir: SortDir }
  pageSizes?: number[] // défaut : [25, 50, 100]
  initialPageSize?: number // défaut : 25
  storageKey?: string // persiste tri / filtres / taille si fourni
  emptyLabel?: string // message d'état vide
  rowKey?: (row: T) => string // clé React stable (défaut : index)
}

// ----------------------------------------------------------------------------
// Persistance localStorage
// ----------------------------------------------------------------------------

interface PersistState {
  search?: string
  facets?: Record<string, string>
  sort?: { key: string; dir: SortDir } | null
  pageSize?: number
}

const PERSIST_PREFIX = 'rh.table.'

function loadPersist(storageKey?: string): PersistState | null {
  if (!storageKey) return null
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + storageKey)
    return raw ? (JSON.parse(raw) as PersistState) : null
  } catch {
    return null
  }
}

// ----------------------------------------------------------------------------
// Utilitaires de tri / recherche
// ----------------------------------------------------------------------------

// Normalise une chaîne pour la recherche : minuscules + suppression des accents
// (permet de trouver « amelie » en tapant « amélie » et inversement).
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

// Comparateur typé. Les valeurs vides (null/undefined/'') sont rejetées en fin
// de liste quel que soit le sens de tri.
function compareValues(a: SortValue, b: SortValue, type: SortType): number {
  const aNil = a == null || a === ''
  const bNil = b == null || b === ''
  if (aNil && bNil) return 0
  if (aNil) return 1
  if (bNil) return -1

  switch (type) {
    case 'number':
      return Number(a) - Number(b)
    case 'date':
      return dateMs(a) - dateMs(b)
    default:
      // Tri texte localisé FR, insensible à la casse, numériquement conscient
      // (« Item 2 » avant « Item 10 »).
      return String(a).localeCompare(String(b), 'fr', {
        sensitivity: 'base',
        numeric: true,
      })
  }
}

function dateMs(v: SortValue): number {
  if (v instanceof Date) return v.getTime()
  const t = new Date(String(v)).getTime()
  return Number.isNaN(t) ? 0 : t
}

// Valeur de tri d'une ligne pour une colonne (accessor prioritaire, sinon key).
function sortValueOf<T>(row: T, col: ColumnDef<T>): SortValue {
  if (col.sortAccessor) return col.sortAccessor(row)
  const raw = (row as unknown as Record<string, unknown>)[col.key]
  return raw as SortValue
}

// ----------------------------------------------------------------------------
// Hook useTableControls — état + pipeline (filtre → tri → pagination).
// Réutilisable seul si l'on veut un rendu de tableau sur mesure ; `DataTable`
// s'appuie dessus pour son affichage standard.
// ----------------------------------------------------------------------------

export interface TableControls<T> {
  // Données prêtes à afficher (page courante).
  pageRows: T[]
  total: number // nombre de lignes après filtrage
  // Recherche
  searchText: string
  setSearchText: (v: string) => void
  // Facettes
  facetValues: Record<string, string>
  setFacet: (key: string, value: string) => void
  removeFacet: (key: string) => void
  resetFilters: () => void
  // Tri (un seul critère actif)
  sort: { key: string; dir: SortDir } | null
  toggleSort: (key: string) => void
  // Pagination
  pageSize: number
  setPageSize: (n: number) => void
  page: number
  pageCount: number
  goPrev: () => void
  goNext: () => void
  from: number // borne basse affichée « X–Y sur N » (1-indexée, 0 si vide)
  to: number
}

interface UseTableControlsArgs<T> {
  rows: T[]
  columns: ColumnDef<T>[]
  onFilteredChange?: (rows: T[]) => void
  filters: FacetDef<T>[]
  search?: SearchDef<T>
  defaultSort?: { key: string; dir: SortDir }
  pageSizes: number[]
  initialPageSize: number
  storageKey?: string
}

export function useTableControls<T>({
  rows,
  columns,
  onFilteredChange,
  filters,
  search,
  defaultSort,
  pageSizes,
  initialPageSize,
  storageKey,
}: UseTableControlsArgs<T>): TableControls<T> {
  // Restauration éventuelle depuis localStorage (une seule lecture).
  const persisted = useMemo(() => loadPersist(storageKey), [storageKey])

  const [searchText, setSearchText] = useState<string>(persisted?.search ?? '')
  const [facetValues, setFacetValues] = useState<Record<string, string>>(
    persisted?.facets ?? {},
  )
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(
    persisted?.sort !== undefined ? persisted.sort : defaultSort ?? null,
  )
  const [pageSize, setPageSizeState] = useState<number>(() => {
    const wanted = persisted?.pageSize ?? initialPageSize
    return pageSizes.includes(wanted) ? wanted : pageSizes[0]
  })
  const [page, setPage] = useState(1)

  // Persistance (écrit à chaque changement d'un critère).
  useEffect(() => {
    if (!storageKey) return
    const payload: PersistState = { search: searchText, facets: facetValues, sort, pageSize }
    try {
      localStorage.setItem(PERSIST_PREFIX + storageKey, JSON.stringify(payload))
    } catch {
      /* quota / mode privé : on ignore silencieusement */
    }
  }, [storageKey, searchText, facetValues, sort, pageSize])

  // Retour page 1 dès qu'un filtre / tri / taille change (comportement attendu).
  useEffect(() => {
    setPage(1)
  }, [searchText, facetValues, sort, pageSize])

  // 1) Filtrage : recherche globale puis facettes.
  const filtered = useMemo(() => {
    let out = rows
    if (search && searchText.trim() !== '') {
      const q = normalize(searchText.trim())
      out = out.filter((r) => normalize(search.accessor(r)).includes(q))
    }
    for (const f of filters) {
      const val = facetValues[f.key]
      if (val != null && val !== '') {
        out = out.filter((r) => String(f.accessor(r)) === val)
      }
    }
    return out
  }, [rows, search, searchText, filters, facetValues])

  // Remonte les lignes visibles à l'écran appelant (voir onFilteredChange).
  useEffect(() => {
    onFilteredChange?.(filtered)
  }, [filtered, onFilteredChange])

  // 2) Tri STABLE : décoration par index d'origine (départage les égalités).
  const sorted = useMemo(() => {
    if (!sort) return filtered
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return filtered
    const type = col.sortType ?? 'text'
    return filtered
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const cmp = compareValues(sortValueOf(a.row, col), sortValueOf(b.row, col), type)
        if (cmp !== 0) return sort.dir === 'asc' ? cmp : -cmp
        return a.index - b.index
      })
      .map((d) => d.row)
  }, [filtered, sort, columns])

  // 3) Pagination (page bornée pour rester cohérente après filtrage).
  const total = sorted.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize
  const pageRows = sorted.slice(start, start + pageSize)
  const from = total === 0 ? 0 : start + 1
  const to = Math.min(start + pageSize, total)

  return {
    pageRows,
    total,
    searchText,
    setSearchText,
    facetValues,
    setFacet: (key, value) => setFacetValues((prev) => ({ ...prev, [key]: value })),
    removeFacet: (key) =>
      setFacetValues((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      }),
    resetFilters: () => {
      setSearchText('')
      setFacetValues({})
    },
    sort,
    toggleSort: (key) =>
      setSort((prev) =>
        prev?.key === key
          ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: 'asc' },
      ),
    pageSize,
    setPageSize: setPageSizeState,
    page: safePage,
    pageCount,
    goPrev: () => setPage((p) => Math.max(1, p - 1)),
    goNext: () => setPage((p) => Math.min(pageCount, p + 1)),
    from,
    to,
  }
}

// ----------------------------------------------------------------------------
// Présentation
// ----------------------------------------------------------------------------

// Icône loupe (SVG inline, hérite de currentColor — pas de couleur figée).
function SearchIcon() {
  return (
    <svg
      className="dt-search-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <line
        x1="16.5"
        y1="16.5"
        x2="21"
        y2="21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function alignClass(align?: Align): string | undefined {
  return align === 'right' ? 'dt-right' : align === 'center' ? 'dt-center' : undefined
}

// La colonne d'actions (convention `key === 'actions'`) est collée à droite pour
// rester visible même en cas de scroll horizontal résiduel.
function isActionsColumn<T>(col: ColumnDef<T>): boolean {
  return col.key === 'actions'
}

// Libellé texte réutilisé comme `data-label` en mode cartes (mobile). On ne le
// pose que si le libellé de colonne est une simple chaîne (pas un nœud riche).
function dataLabelOf<T>(col: ColumnDef<T>): string | undefined {
  return typeof col.label === 'string' && col.label !== '' ? col.label : undefined
}

export default function DataTable<T>({
  rows,
  columns,
  onFilteredChange,
  filters = [],
  search,
  defaultSort,
  pageSizes = [25, 50, 100],
  initialPageSize = 25,
  storageKey,
  emptyLabel = 'Aucun résultat.',
  rowKey,
}: DataTableProps<T>) {
  const ctrl = useTableControls<T>({
    rows,
    columns,
    onFilteredChange,
    filters,
    search,
    defaultSort,
    pageSizes,
    initialPageSize,
    storageKey,
  })

  const [facetsOpen, setFacetsOpen] = useState(false) // repli mobile

  // Chips des filtres actifs (recherche + facettes), cliquables pour retirer.
  const activeChips: { id: string; label: string; onRemove: () => void }[] = []
  if (search && ctrl.searchText.trim() !== '') {
    activeChips.push({
      id: 'search',
      label: `« ${ctrl.searchText.trim()} »`,
      onRemove: () => ctrl.setSearchText(''),
    })
  }
  for (const f of filters) {
    const val = ctrl.facetValues[f.key]
    if (val != null && val !== '') {
      const opt = f.options.find((o) => o.value === val)
      activeChips.push({
        id: f.key,
        label: `${f.label} : ${opt?.label ?? val}`,
        onRemove: () => ctrl.removeFacet(f.key),
      })
    }
  }

  const hasFilters = Boolean(search) || filters.length > 0
  const nbActiveFacets = filters.reduce((n, f) => n + (ctrl.facetValues[f.key] ? 1 : 0), 0)

  return (
    <div className="dt">
      {/* ---------- Barre de filtres ---------- */}
      {hasFilters && (
        <div className="dt-toolbar">
          {search && (
            <div className="dt-search">
              <SearchIcon />
              <input
                type="search"
                value={ctrl.searchText}
                onChange={(e) => ctrl.setSearchText(e.target.value)}
                placeholder={search.placeholder ?? 'Rechercher…'}
                aria-label={search.placeholder ?? 'Rechercher'}
              />
            </div>
          )}

          {/* Bouton de repli des facettes (visible uniquement en petit écran). */}
          {filters.length > 0 && (
            <button
              type="button"
              className="btn secondary small dt-filter-toggle"
              aria-expanded={facetsOpen}
              onClick={() => setFacetsOpen((o) => !o)}
            >
              Filtrer{nbActiveFacets > 0 ? ` (${nbActiveFacets})` : ''}
            </button>
          )}

          {filters.length > 0 && (
            <div className={`dt-facets${facetsOpen ? ' dt-open' : ''}`}>
              {filters.map((f) => (
                <label key={f.key} className="dt-facet">
                  <span className="dt-facet-label">{f.label}</span>
                  <select
                    value={ctrl.facetValues[f.key] ?? ''}
                    onChange={(e) => ctrl.setFacet(f.key, e.target.value)}
                  >
                    <option value="">Tous</option>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          <div className="dt-spacer" />

          <span className="dt-count muted">
            {ctrl.total} résultat{ctrl.total > 1 ? 's' : ''}
          </span>
          {activeChips.length > 0 && (
            <button
              type="button"
              className="btn secondary small"
              onClick={ctrl.resetFilters}
            >
              Réinitialiser
            </button>
          )}
        </div>
      )}

      {/* ---------- Chips des filtres actifs ---------- */}
      {activeChips.length > 0 && (
        <div className="dt-chips">
          {activeChips.map((c) => (
            <button
              key={c.id}
              type="button"
              className="dt-chip"
              onClick={c.onRemove}
              aria-label={`Retirer le filtre ${c.label}`}
            >
              {c.label} <span aria-hidden="true">✕</span>
            </button>
          ))}
        </div>
      )}

      {/* ---------- Tableau ---------- */}
      {/* `dt-cards` : bascule en cartes empilées sous ~720px (voir styles.css). */}
      <div className="card table-wrap dt-cards">
        <table>
          <thead>
            <tr>
              {columns.map((col) => {
                const active = ctrl.sort?.key === col.key
                const ariaSort = !col.sortable
                  ? undefined
                  : active
                    ? ctrl.sort?.dir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                return (
                  <th
                    key={col.key}
                    className={
                      [
                        col.sortable ? 'dt-sortable' : '',
                        alignClass(col.align) ?? '',
                        isActionsColumn(col) ? 'dt-sticky-right' : '',
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    aria-sort={ariaSort}
                    tabIndex={col.sortable ? 0 : undefined}
                    role={col.sortable ? 'button' : undefined}
                    onClick={() => col.sortable && ctrl.toggleSort(col.key)}
                    onKeyDown={(e) => {
                      if (col.sortable && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        ctrl.toggleSort(col.key)
                      }
                    }}
                  >
                    <span className="dt-th-inner">
                      {col.label}
                      {col.sortable && (
                        <span className="dt-arrow" aria-hidden="true">
                          {active ? (ctrl.sort?.dir === 'asc' ? '↑' : '↓') : ''}
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {ctrl.pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="dt-empty muted">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              ctrl.pageRows.map((row, i) => (
                <tr key={rowKey ? rowKey(row) : String(i)}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={
                        [
                          alignClass(col.align) ?? '',
                          isActionsColumn(col) ? 'dt-sticky-right' : '',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                      data-label={dataLabelOf(col)}
                    >
                      {col.render
                        ? col.render(row)
                        : ((row as unknown as Record<string, ReactNode>)[col.key] ??
                          null)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Pagination ---------- */}
      <div className="dt-pagination">
        <label className="dt-pagesize">
          <span className="muted">Lignes par page</span>
          <select
            value={ctrl.pageSize}
            onChange={(e) => ctrl.setPageSize(Number(e.target.value))}
          >
            {pageSizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="dt-pager">
          <span className="dt-range muted">
            {ctrl.from}–{ctrl.to} sur {ctrl.total}
          </span>
          <button
            type="button"
            className="btn secondary small"
            disabled={ctrl.page <= 1}
            onClick={ctrl.goPrev}
          >
            Précédent
          </button>
          <button
            type="button"
            className="btn secondary small"
            disabled={ctrl.page >= ctrl.pageCount}
            onClick={ctrl.goNext}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  )
}
