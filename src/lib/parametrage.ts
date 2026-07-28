import type {
  Famille,
  JourFerie,
  ModeleContrat,
  PolitiquesConges,
  ReglesGenerales,
  TypeAbsence,
} from '../types'

// ============================================================================
// Export / import du PARAMÉTRAGE de l'application (fichier JSON).
//
// But : rejouer une configuration sur un NOUVEAU serveur (ou sauvegarder les
// réglages avant une réinstallation) sans ressaisir les écrans un par un.
//
// PÉRIMÈTRE VOLONTAIREMENT LIMITÉ à la configuration :
//   équipes · modèles de contrat · types d'absence · politiques de congés ·
//   règles générales · jours fériés personnalisés.
// Sont EXCLUS : collaborateurs, comptes, saisies, congés, journal d'audit —
// c'est-à-dire toute donnée personnelle ou opérationnelle. Les collaborateurs
// disposent de leur propre import CSV/Excel (Administration → Collaborateurs).
// ============================================================================

// Marqueur de format : évite d'importer un fichier qui n'a rien à voir.
export const PARAM_FORMAT = 'rh-marchais/parametrage'
export const PARAM_VERSION = 1

export interface ParametrageBundle {
  format: string
  version: number
  exporteLe: string // date ISO
  equipes: Famille[]
  modeles: ModeleContrat[]
  typesAbsence: TypeAbsence[]
  politiques: PolitiquesConges
  regles: ReglesGenerales
  joursFeries: JourFerie[]
}

// Ce que contient un fichier, pour l'aperçu AVANT import.
export interface ParametrageResume {
  equipes: number
  modeles: number
  typesAbsence: number
  politiques: number
  joursFeries: number
  regles: boolean
  exporteLe?: string
}

export function resumeDe(b: ParametrageBundle): ParametrageResume {
  return {
    equipes: b.equipes.length,
    modeles: b.modeles.length,
    typesAbsence: b.typesAbsence.length,
    politiques: Object.keys(b.politiques ?? {}).length,
    joursFeries: b.joursFeries.length,
    regles: Boolean(b.regles),
    exporteLe: b.exporteLe,
  }
}

// Nom de fichier daté : parametrage-rh-2026-07-28.json
export function nomFichierParametrage(dateISO: string): string {
  return `parametrage-rh-${dateISO.slice(0, 10)}.json`
}

// Sérialise le paramétrage en JSON lisible (indenté).
export function serialiserParametrage(b: ParametrageBundle): string {
  return JSON.stringify(b, null, 2)
}

export type LectureParametrage =
  | { ok: true; bundle: ParametrageBundle }
  | { ok: false; error: string }

// Lit et VALIDE un fichier de paramétrage. On refuse tôt et avec un message
// clair plutôt que d'écrire une configuration à moitié valide dans la base.
export function lireParametrage(texte: string): LectureParametrage {
  let brut: unknown
  try {
    brut = JSON.parse(texte)
  } catch {
    return { ok: false, error: "Ce fichier n'est pas un JSON valide." }
  }
  if (typeof brut !== 'object' || brut === null) {
    return { ok: false, error: 'Fichier de paramétrage illisible.' }
  }
  const o = brut as Partial<ParametrageBundle>
  if (o.format !== PARAM_FORMAT) {
    return {
      ok: false,
      error:
        "Ce fichier n'est pas un export de paramétrage RH (marqueur de format absent).",
    }
  }
  if (typeof o.version !== 'number' || o.version > PARAM_VERSION) {
    return {
      ok: false,
      error: `Version de fichier non prise en charge (${String(o.version)}). Mettez l'application à jour.`,
    }
  }
  const liste = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const bundle: ParametrageBundle = {
    format: PARAM_FORMAT,
    version: o.version,
    exporteLe: typeof o.exporteLe === 'string' ? o.exporteLe : '',
    equipes: liste<Famille>(o.equipes),
    modeles: liste<ModeleContrat>(o.modeles),
    typesAbsence: liste<TypeAbsence>(o.typesAbsence),
    politiques: (o.politiques ?? {}) as PolitiquesConges,
    regles: o.regles as ReglesGenerales,
    joursFeries: liste<JourFerie>(o.joursFeries),
  }
  const vide =
    bundle.equipes.length === 0 &&
    bundle.modeles.length === 0 &&
    bundle.typesAbsence.length === 0 &&
    bundle.joursFeries.length === 0 &&
    Object.keys(bundle.politiques).length === 0 &&
    !bundle.regles
  if (vide) return { ok: false, error: 'Ce fichier ne contient aucun paramétrage.' }

  return { ok: true, bundle }
}

// Déclenche le téléchargement d'un contenu texte (lien <a download> éphémère).
export function telechargerJson(contenu: string, filename: string): void {
  const blob = new Blob([contenu], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
