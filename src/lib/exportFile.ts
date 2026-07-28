import * as XLSX from 'xlsx'
import type { RecapExport } from '../types'
import { formatHeuresDecimal, formatJours } from './hours'
import { neutralizeFormula } from './csvSafe'

// ---------------------------------------------------------------------------
// Génération des fichiers d'export comptable (récapitulatif mensuel).
// Deux formats :
//  - CSV natif   : séparateur ';', UTF-8 AVEC BOM (compat Excel FR), via Blob.
//  - Excel .xlsx : SheetJS (`xlsx`), une feuille « Récap <mois> », nombres réels.
// Les libellés de colonnes et l'ordre sont partagés par les deux formats.
// ---------------------------------------------------------------------------

// Colonnes fixes de gauche. Les colonnes de types d'absence (une par type) sont
// insérées dynamiquement APRÈS, dans l'ordre de `recap.colonnesTypes`.
const HEADERS_FIXES = [
  'Collaborateur',
  'Équipe',
  'Contrat',
  'Heures normales',
  'Heures sup.',
] as const

// En-têtes complets = colonnes fixes + un libellé de type d'absence par colonne.
function buildHeaders(recap: RecapExport): string[] {
  return [...HEADERS_FIXES, ...recap.colonnesTypes.map((c) => c.label)]
}

// Base du nom de fichier : recap-2026-07[-perimetre].
function fileBase(recap: RecapExport, perimetreLabel?: string): string {
  const slug = perimetreLabel
    ? '-' +
      perimetreLabel
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // retire les accents (diacritiques)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    : ''
  return `recap-${recap.periode}${slug}`
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

// Échappe un champ CSV : neutralise d'abord l'injection de formule (préfixe
// apostrophe si la cellule commence par = + - @ / tab / saut), puis double les
// guillemets si la cellule contient séparateur, guillemet ou saut de ligne.
function csvField(value: string): string {
  const safe = neutralizeFormula(value)
  if (/[";\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

// Une ligne CSV (heures en décimal FR, jours en nombre FR) — virgule décimale,
// cohérente avec le séparateur ';'.
function csvRow(cells: string[]): string {
  return cells.map(csvField).join(';')
}

export function downloadRecapCsv(recap: RecapExport, perimetreLabel?: string): void {
  const lines: string[] = []
  lines.push(csvRow(buildHeaders(recap)))
  for (const l of recap.lignes) {
    lines.push(
      csvRow([
        l.collaborateur,
        l.famille,
        l.contrat,
        formatHeuresDecimal(l.heuresNormales),
        formatHeuresDecimal(l.heuresSup),
        ...recap.colonnesTypes.map((c) => formatJours(l.joursParType[c.code] ?? 0)),
      ]),
    )
  }
  // Ligne « Total équipe ».
  lines.push(
    csvRow([
      'Total équipe',
      '',
      '',
      formatHeuresDecimal(recap.totaux.heuresNormales),
      formatHeuresDecimal(recap.totaux.heuresSup),
      ...recap.colonnesTypes.map((c) =>
        formatJours(recap.totaux.joursParType[c.code] ?? 0),
      ),
    ]),
  )

  // BOM UTF-8 (﻿) pour qu'Excel FR détecte l'encodage + fins de ligne CRLF.
  const content = '﻿' + lines.join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `${fileBase(recap, perimetreLabel)}.csv`)
}

export function downloadRecapXlsx(recap: RecapExport, perimetreLabel?: string): void {
  // Matrice de valeurs : les nombres restent des NOMBRES réels (Excel les
  // formate selon la locale de l'utilisateur), les libellés des chaînes.
  const aoa: (string | number)[][] = [buildHeaders(recap)]
  for (const l of recap.lignes) {
    aoa.push([
      l.collaborateur,
      l.famille,
      l.contrat,
      l.heuresNormales,
      l.heuresSup,
      ...recap.colonnesTypes.map((c) => l.joursParType[c.code] ?? 0),
    ])
  }
  aoa.push([
    'Total équipe',
    '',
    '',
    recap.totaux.heuresNormales,
    recap.totaux.heuresSup,
    ...recap.colonnesTypes.map((c) => recap.totaux.joursParType[c.code] ?? 0),
  ])

  // Neutralise l'injection de formule sur les cellules TEXTE (les nombres
  // restent des nombres réels et ne sont pas concernés).
  const safeAoa = aoa.map((row) =>
    row.map((cell) =>
      typeof cell === 'string' ? neutralizeFormula(cell) : cell,
    ),
  )

  const ws = XLSX.utils.aoa_to_sheet(safeAoa)
  // Largeurs de colonnes lisibles : fixes à gauche + une par type d'absence.
  ws['!cols'] = [
    { wch: 22 },
    { wch: 12 },
    { wch: 20 },
    { wch: 15 },
    { wch: 12 },
    ...recap.colonnesTypes.map(() => ({ wch: 14 })),
  ]
  const wb = XLSX.utils.book_new()
  // Nom de feuille « Récap <mois> » (≤ 31 caractères, sans caractères interdits).
  XLSX.utils.book_append_sheet(wb, ws, `Récap ${recap.periode}`)
  XLSX.writeFile(wb, `${fileBase(recap, perimetreLabel)}.xlsx`)
}
