import * as XLSX from 'xlsx'
import type {
  CongeType,
  Famille,
  ImportCollaborateurRow,
  ModeleContrat,
} from '../types'
import { neutralizeFormula } from './csvSafe'

// Taille maximale d'un fichier importé (garde-fou anti-DoS / anti-fichier
// binaire volumineux avant parsing). 5 Mo couvre très largement un import RH.
const MAX_IMPORT_BYTES = 5 * 1024 * 1024

// ---------------------------------------------------------------------------
// Assistant d'import de collaborateurs — parsing (CSV / Excel), validation du
// modèle standard, et génération du fichier modèle (CSV + Excel).
//
// Le modèle STANDARD attend l'en-tête suivant (dans cet ordre) :
//   Nom · Prénom · Identifiant · Équipe · Modèle de contrat · Date d'entrée ·
//   [Solde initial — <type à solde> …] · Mot de passe
//
// Requis     : Nom, Prénom, Identifiant, Équipe, Modèle de contrat.
// Optionnels : Date d'entrée (AAAA-MM-JJ ou JJ/MM/AAAA), une colonne « Solde
//              initial — <libellé> » par type à solde (nombre, virgule FR),
//              Mot de passe (défaut « changeme » si vide).
//
// Rétrocompatibilité : l'ancienne colonne unique « Solde congés initial » est
// toujours comprise comme le solde du type CONGÉ PAYÉ (repli si aucune colonne
// « Solde initial — Congé payé » n'est présente).
//
// Aucune couleur de marque ni logique métier dupliquée : la résolution
// famille/modèle et la matérialisation vivent côté repository/store.
// ---------------------------------------------------------------------------

// Mot de passe par défaut appliqué si la colonne est vide.
export const MOT_DE_PASSE_DEFAUT = 'changeme'

// Un type à solde décrit pour l'import (code du domaine + libellé paramétrable).
export interface TypeSoldeInfo {
  code: CongeType
  label: string
}

// Colonnes fixes précédant les colonnes de solde par type.
const HEADERS_AVANT_SOLDES = [
  'Nom',
  'Prénom',
  'Identifiant',
  'Équipe',
  'Modèle de contrat',
  "Date d'entrée",
] as const

// Colonnes finales.
const HEADER_MOT_DE_PASSE = 'Mot de passe'
// Colonne OPTIONNELLE : « non » = collaborateur sans accès à l'application.
// Absente ou vide = on crée le compte (cas courant).
const HEADER_CREER_COMPTE = 'Créer un compte'

// Legacy : ancienne colonne unique de solde CP (reconnue en lecture uniquement).
const HEADER_SOLDE_LEGACY = 'Solde congés initial'

// Colonnes requises (bloquantes si absentes).
const HEADERS_REQUIS = [
  'Nom',
  'Prénom',
  'Identifiant',
  'Équipe',
  'Modèle de contrat',
] as const

// En-tête d'une colonne de solde par type : « Solde initial — <libellé> ».
export function soldeHeader(label: string): string {
  return `Solde initial — ${label}`
}

// En-têtes complets du modèle, dans l'ordre d'affichage (colonnes de solde
// DYNAMIQUES : une par type à solde configuré).
export function buildImportHeaders(typesSolde: TypeSoldeInfo[]): string[] {
  return [
    ...HEADERS_AVANT_SOLDES,
    ...typesSolde.map((t) => soldeHeader(t.label)),
    HEADER_MOT_DE_PASSE,
    HEADER_CREER_COMPTE,
  ]
}

// Valeurs d'exemple de solde par type (référence les seeds pour rester "clé en
// main" ; les autres types restent vides = optionnels).
const EXEMPLE_SOLDE: Partial<Record<CongeType, string>> = {
  conge_paye: '25',
  rtt: '10',
}

// Ligne d'exemple fournie dans le fichier modèle.
function exempleRow(typesSolde: TypeSoldeInfo[]): string[] {
  return [
    'Marchais',
    'Camille',
    'camille',
    'Vignes',
    'Vignes · CDI 35h',
    '01/06/2026',
    ...typesSolde.map((t) => EXEMPLE_SOLDE[t.code] ?? ''),
    MOT_DE_PASSE_DEFAUT,
    'oui',
  ]
}

// Ligne brute lue dans le fichier (valeurs texte, non validées).
export interface RawImportRow {
  ligne: number // numéro de ligne de données (1-based, l'en-tête étant la ligne 1)
  nom: string
  prenom: string
  identifiant: string
  famille: string
  modele: string
  dateEntree: string
  // Valeurs texte de solde par type à solde (clé = CongeType), résolues depuis
  // les colonnes « Solde initial — <libellé> » (+ repli legacy pour le CP).
  soldes: Partial<Record<CongeType, string>>
  // Rendu lisible des soldes fournis (pour l'aperçu), ex. « Congé payé : 25 ».
  soldeAffichage: string
  motDePasse: string
  // Colonne optionnelle « Créer un compte » (oui/non). Vide = oui.
  creerCompte: boolean
}

// Ligne après validation : statut + détail des erreurs + charge utile si valide.
export interface ValidatedImportRow {
  raw: RawImportRow
  errors: string[]
  valid: boolean
  payload?: ImportCollaborateurRow
}

// Contexte de validation (référentiels existants + identifiants déjà pris).
export interface ValidationContext {
  familles: Famille[]
  modeles: ModeleContrat[]
  existingIdentifiants: string[]
  // Types à solde configurés (pour libeller les erreurs de solde). Optionnel.
  typesSolde?: TypeSoldeInfo[]
}

// Résultat du parsing d'un fichier.
export type ParseResult =
  | { ok: true; rows: RawImportRow[] }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Normalisation & petits parseurs
// ---------------------------------------------------------------------------

// Minuscules + suppression des accents + trim (comparaison libellés/en-têtes).
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

// Parse une date d'import (AAAA-MM-JJ ou JJ/MM/AAAA) → ISO yyyy-mm-dd, ou null
// si le format est invalide OU la date inexistante (ex. 31/02). Chaîne vide =
// "non fournie" et doit être gérée par l'appelant (renvoie null ici).
export function parseDateImport(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return toISO(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (m) return toISO(Number(m[3]), Number(m[2]), Number(m[1]))
  return null
}

// Construit une date ISO en vérifiant qu'elle existe réellement (rejette les
// débordements du type 31/02 via un aller-retour Date.UTC).
function toISO(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null
  }
  return dt.toISOString().slice(0, 10)
}

// Parse un solde numérique (accepte la virgule décimale FR). null si invalide.
function parseSolde(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}

// ---------------------------------------------------------------------------
// Lecture des fichiers (CSV / Excel) → matrice de cellules texte
// ---------------------------------------------------------------------------

// Détecte le séparateur CSV le plus probable (';' ou ',') sur la ligne d'en-tête.
function detectSeparator(headerLine: string): string {
  const semi = (headerLine.match(/;/g) ?? []).length
  const comma = (headerLine.match(/,/g) ?? []).length
  return comma > semi ? ',' : ';'
}

// Parse une ligne CSV en gérant les guillemets (et guillemets doublés).
function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === sep) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function readCsvMatrix(text: string): string[][] {
  const clean = text.replace(/^﻿/, '') // retire le BOM UTF-8 éventuel
  const lines = clean.split(/\r\n|\n|\r/)
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return []
  const sep = detectSeparator(lines[0])
  return lines.map((l) => parseCsvLine(l, sep))
}

function readXlsxMatrix(buf: ArrayBuffer): string[][] {
  const wb = XLSX.read(buf, { type: 'array' })
  const first = wb.SheetNames[0]
  if (!first) return []
  const ws = wb.Sheets[first]
  // header:1 → tableau de tableaux ; raw:false → valeurs formatées (dates en
  // texte) ; defval:'' → cellules vides normalisées.
  const aoa = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: '',
  }) as unknown[][]
  return aoa.map((r) => r.map((c) => (c == null ? '' : String(c))))
}

// Transforme une matrice (1re ligne = en-tête) en lignes brutes exploitables.
// `typesSolde` pilote la résolution des colonnes de solde par type.
function matrixToRows(
  matrix: string[][],
  typesSolde: TypeSoldeInfo[],
): ParseResult {
  const nonEmpty = matrix.filter((r) => r.some((c) => String(c).trim() !== ''))
  if (nonEmpty.length === 0) return { ok: false, error: 'Le fichier est vide.' }

  const headerNorm = nonEmpty[0].map((c) => norm(String(c)))
  const colOf = (h: string): number => headerNorm.indexOf(norm(h))
  // Cherche la 1re colonne présente parmi plusieurs libellés acceptés
  // (compat ascendante : « Équipe » ou l'ancien « Famille »).
  const colOfAny = (...hs: string[]): number => {
    for (const h of hs) {
      const i = colOf(h)
      if (i >= 0) return i
    }
    return -1
  }

  // Colonnes requises manquantes → message clair, import bloqué.
  const missing = HEADERS_REQUIS.filter((h) =>
    h === 'Équipe' ? colOfAny('Équipe', 'Famille') < 0 : colOf(h) < 0,
  )
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Colonnes requises manquantes : ${missing.join(', ')}.`,
    }
  }

  const idxNom = colOf('Nom')
  const idxPrenom = colOf('Prénom')
  const idxIdentifiant = colOf('Identifiant')
  const idxFamille = colOfAny('Équipe', 'Famille')
  const idxModele = colOf('Modèle de contrat')
  const idxDate = colOf("Date d'entrée")
  const idxMdp = colOf(HEADER_MOT_DE_PASSE)
  const idxCreer = colOf(HEADER_CREER_COMPTE)
  const idxLegacy = colOf(HEADER_SOLDE_LEGACY)
  // Index de la colonne de solde par type (−1 si absente du fichier).
  const idxSolde = new Map<CongeType, number>()
  for (const t of typesSolde) idxSolde.set(t.code, colOf(soldeHeader(t.label)))

  const cell = (cells: string[], idx: number): string =>
    idx >= 0 ? String(cells[idx] ?? '').trim() : ''

  const rows: RawImportRow[] = nonEmpty.slice(1).map((cells, i) => {
    const soldes: Partial<Record<CongeType, string>> = {}
    for (const t of typesSolde) {
      const v = cell(cells, idxSolde.get(t.code) ?? -1)
      if (v) soldes[t.code] = v
    }
    // Repli legacy : ancienne colonne unique « Solde congés initial » → CP,
    // seulement si aucune colonne dédiée « Solde initial — Congé payé » remplie.
    if (soldes.conge_paye == null && idxLegacy >= 0) {
      const v = cell(cells, idxLegacy)
      if (v) soldes.conge_paye = v
    }
    const soldeAffichage = typesSolde
      .filter((t) => soldes[t.code] != null)
      .map((t) => `${t.label} : ${soldes[t.code]}`)
      .join(' · ')

    return {
      ligne: i + 1,
      nom: cell(cells, idxNom),
      prenom: cell(cells, idxPrenom),
      identifiant: cell(cells, idxIdentifiant),
      famille: cell(cells, idxFamille),
      modele: cell(cells, idxModele),
      dateEntree: cell(cells, idxDate),
      soldes,
      soldeAffichage,
      motDePasse: cell(cells, idxMdp),
      // Colonne absente ou vide = on crée le compte. Seul un « non » explicite
      // (ou 0 / false) crée le collaborateur SANS accès à l'application.
      creerCompte: !/^(non|no|n|0|false)$/i.test(cell(cells, idxCreer)),
    }
  })

  if (rows.length === 0) {
    return { ok: false, error: 'Aucune ligne de données à importer.' }
  }
  return { ok: true, rows }
}

// Parse un fichier `.csv` ou `.xlsx` en lignes brutes. `typesSolde` détermine
// les colonnes de solde par type attendues.
export async function parseImportFile(
  file: File,
  typesSolde: TypeSoldeInfo[],
): Promise<ParseResult> {
  const name = file.name.toLowerCase()
  const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls')
  const isCsv = name.endsWith('.csv')

  // Contrôle de TYPE : seuls .csv / .xlsx (.xls) sont acceptés. Empêche le
  // parsing d'un fichier arbitraire (ex. exécutable renommé).
  if (!isXlsx && !isCsv) {
    return {
      ok: false,
      error: 'Format non pris en charge. Utilisez un fichier .csv ou .xlsx.',
    }
  }
  // Contrôle de TAILLE : rejette un fichier vide ou trop volumineux avant
  // parsing (garde-fou mémoire / anti-fichier binaire).
  if (file.size === 0) {
    return { ok: false, error: 'Le fichier est vide.' }
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { ok: false, error: 'Fichier trop volumineux (max 5 Mo).' }
  }

  try {
    if (isXlsx) {
      const buf = await file.arrayBuffer()
      return matrixToRows(readXlsxMatrix(buf), typesSolde)
    }
    const text = await file.text()
    return matrixToRows(readCsvMatrix(text), typesSolde)
  } catch {
    return { ok: false, error: 'Fichier illisible ou format non pris en charge.' }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateImportRows(
  rows: RawImportRow[],
  ctx: ValidationContext,
): ValidatedImportRow[] {
  // Les comptes existants sont stockés sous forme d'e-mail (« camille@demo.local »)
  // alors que le fichier contient l'identifiant nu (« camille ») : sans cette
  // normalisation, AUCUN doublon n'était détecté et un ré-import dupliquait tout.
  const idNu = (s: string): string => {
    const v = s.trim().toLowerCase()
    const at = v.indexOf('@')
    return at > 0 ? v.slice(0, at) : v
  }
  const existing = new Set(ctx.existingIdentifiants.map(idNu))

  // Comptage des identifiants dans le fichier (détection des doublons internes).
  const counts = new Map<string, number>()
  for (const r of rows) {
    const id = r.identifiant.trim().toLowerCase()
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  // Référentiels indexés par libellé normalisé (insensible à la casse/accents).
  const famByNom = new Map(ctx.familles.map((f) => [norm(f.nom), f]))
  const modByNom = new Map(ctx.modeles.map((m) => [norm(m.nom), m]))
  const labelDe = (code: CongeType): string =>
    ctx.typesSolde?.find((t) => t.code === code)?.label ?? code

  return rows.map((r) => {
    const errors: string[] = []
    const nom = r.nom.trim()
    const prenom = r.prenom.trim()
    const identifiant = r.identifiant.trim().toLowerCase()

    if (!nom) errors.push('Nom manquant.')
    if (!prenom) errors.push('Prénom manquant.')
    if (!identifiant) errors.push('Identifiant manquant.')

    // Équipe : doit correspondre à une équipe existante.
    const famille = r.famille.trim() ? famByNom.get(norm(r.famille)) : undefined
    if (!r.famille.trim()) errors.push('Équipe manquante.')
    else if (!famille) errors.push(`Équipe « ${r.famille} » inconnue.`)

    // Modèle de contrat : doit correspondre à un modèle existant (par libellé).
    const modele = r.modele.trim() ? modByNom.get(norm(r.modele)) : undefined
    if (!r.modele.trim()) errors.push('Modèle de contrat manquant.')
    else if (!modele) errors.push(`Modèle « ${r.modele} » inconnu.`)

    // Identifiant unique : ni déjà en base, ni dupliqué dans le fichier.
    if (identifiant) {
      if (existing.has(idNu(identifiant))) {
        errors.push(`Identifiant « ${identifiant} » déjà utilisé en base.`)
      } else if ((counts.get(identifiant) ?? 0) > 1) {
        errors.push(`Identifiant « ${identifiant} » en double dans le fichier.`)
      }
    }

    // Date d'entrée (optionnelle) : parseable si fournie.
    let dateDebut: string | undefined
    if (r.dateEntree.trim()) {
      const iso = parseDateImport(r.dateEntree)
      if (!iso) {
        errors.push(
          `Date d'entrée « ${r.dateEntree} » invalide (AAAA-MM-JJ ou JJ/MM/AAAA).`,
        )
      } else {
        dateDebut = iso
      }
    }

    // Solde initial PAR TYPE (optionnel) : numérique (virgule FR) si fourni.
    let soldesInitiaux: Partial<Record<CongeType, number>> | undefined
    for (const [code, raw] of Object.entries(r.soldes) as [
      CongeType,
      string,
    ][]) {
      const n = parseSolde(raw)
      if (n == null) {
        errors.push(`Solde « ${labelDe(code)} » (« ${raw} ») non numérique.`)
      } else {
        if (!soldesInitiaux) soldesInitiaux = {}
        soldesInitiaux[code] = n
      }
    }
    // Compat ascendante : le solde CP alimente aussi `soldeInitial`.
    const soldeInitial = soldesInitiaux?.conge_paye

    const valid = errors.length === 0
    const payload: ImportCollaborateurRow | undefined =
      valid && famille && modele
        ? {
            nom,
            prenom,
            identifiant,
            familleId: famille.id,
            modeleId: modele.id,
            motDePasse: r.motDePasse.trim() || MOT_DE_PASSE_DEFAUT,
            creerCompte: r.creerCompte,
            dateDebut,
            soldeInitial,
            soldesInitiaux,
          }
        : undefined

    return { raw: r, errors, valid, payload }
  })
}

// ---------------------------------------------------------------------------
// Génération du fichier modèle (CSV + Excel)
// ---------------------------------------------------------------------------

// Échappe un champ CSV : neutralise l'injection de formule (préfixe apostrophe
// si nécessaire) puis double les guillemets si séparateur / guillemet / saut.
function csvField(value: string): string {
  const safe = neutralizeFormula(value)
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// Déclenche le téléchargement d'un Blob via un lien <a download> éphémère.
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Modèle CSV : séparateur ';', UTF-8 AVEC BOM (compat Excel FR), en-tête + exemple.
export function downloadModeleCsv(typesSolde: TypeSoldeInfo[]): void {
  const rows: readonly string[][] = [
    buildImportHeaders(typesSolde),
    exempleRow(typesSolde),
  ]
  const content =
    '﻿' + rows.map((r) => r.map(csvField).join(';')).join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, 'modele-import-collaborateurs.csv')
}

// Modèle Excel : une feuille « Modèle import », en-tête + ligne d'exemple.
export function downloadModeleXlsx(typesSolde: TypeSoldeInfo[]): void {
  const headers = buildImportHeaders(typesSolde)
  const aoa: string[][] = [headers, exempleRow(typesSolde)]
  // Neutralise l'injection de formule sur toutes les cellules texte (les
  // libellés de type d'absence sont paramétrables donc potentiellement hostiles).
  const safeAoa = aoa.map((row) => row.map(neutralizeFormula))
  const ws = XLSX.utils.aoa_to_sheet(safeAoa)
  ws['!cols'] = headers.map(() => ({ wch: 18 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Modèle import')
  XLSX.writeFile(wb, 'modele-import-collaborateurs.xlsx')
}
