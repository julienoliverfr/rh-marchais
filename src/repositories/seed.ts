import type {
  Compte,
  Collaborateur,
  CongeType,
  Famille,
  ModeleContrat,
  PolitiqueConges,
  ReglesGenerales,
  Saisie,
  TypeAbsence,
} from '../types'
import { POLITIQUES_DEFAUT } from '../lib/soldes'

// Données seedées au 1er lancement (persistées ensuite dans localStorage).

export const famillesSeed: Famille[] = [
  {
    id: 'fam-vignes',
    nom: 'Vignes',
    modeSaisie: 'journee_continue',
    pauseDeduiteMin: 60,
  },
  {
    id: 'fam-marchais',
    nom: 'Marchais',
    modeSaisie: 'demi_journees',
    pauseDeduiteMin: 0,
  },
]

export const modelesSeed: ModeleContrat[] = [
  {
    id: 'mod-vignes-cdi35',
    nom: 'Vignes · CDI 35h',
    typeContrat: 'CDI',
    unite: 'heures',
    base: 35,
    seuilHebdo: 35,
    // CP 25 j + RTT 10 j (exemple de quota par type au niveau du modèle).
    quotasParType: { conge_paye: 25, rtt: 10 },
  },
  {
    id: 'mod-vignes-cdd',
    nom: 'Vignes · CDD saison',
    typeContrat: 'CDD',
    unite: 'heures',
    base: 39,
    seuilHebdo: 39,
    quotasParType: { conge_paye: 12 },
  },
  {
    id: 'mod-marchais-jour',
    nom: 'Marchais · CDI jour',
    typeContrat: 'CDI',
    unite: 'jours',
    base: 7,
    seuilHebdo: 35,
    quotasParType: { conge_paye: 25 },
  },
  {
    id: 'mod-saisonnier-jour',
    nom: 'Saisonnier · jour',
    typeContrat: 'saisonnier',
    unite: 'jours',
    base: 7,
    seuilHebdo: 35,
    quotasParType: { conge_paye: 8 },
  },
]

// Types d'absence seedés. Le `code` reste l'un des CongeType du domaine ;
// l'admin en règle libellé / à-solde / justificatif. Les types À SOLDE
// (conge_paye, rtt, anciennete) portent chacun leur compteur + leur politique.
export const typesAbsenceSeed: TypeAbsence[] = [
  { code: 'conge_paye', label: 'Congé payé', aSolde: true, justificatifRequis: false },
  { code: 'rtt', label: 'RTT', aSolde: true, justificatifRequis: false },
  { code: 'anciennete', label: 'Ancienneté', aSolde: true, justificatifRequis: false },
  { code: 'maladie', label: 'Maladie', aSolde: false, justificatifRequis: true },
  { code: 'sans_solde', label: 'Sans solde', aSolde: false, justificatifRequis: false },
]

// Politiques seedées par type à solde (map `typeId -> PolitiqueConges`).
// MIGRATION : sur une install existante, l'ancienne politique unique devient la
// politique du type `conge_paye` (voir LocalStorageRepository.migrate()).
export const politiquesSeed: Partial<Record<CongeType, PolitiqueConges>> = {
  conge_paye: POLITIQUES_DEFAUT.conge_paye,
  rtt: POLITIQUES_DEFAUT.rtt,
  anciennete: POLITIQUES_DEFAUT.anciennete,
}

// Règles générales par défaut (créées au seed ; repli si la clé est absente).
export const REGLES_DEFAUT: ReglesGenerales = {
  saisieRetroJours: 7,
  seuilHsupDefautHebdo: 35,
  verrouillageApresExport: true,
  alerteAbsenceJours: 7,
}

export const collaborateursSeed: Collaborateur[] = [
  {
    id: 'col-jean',
    prenom: 'Jean',
    nom: 'Ferrand',
    familleId: 'fam-vignes',
    contrat: {
      modeleId: 'mod-vignes-cdi35',
      unite: 'heures',
      base: 35,
      seuilHebdo: 35,
      // Hérité du modèle : CP 25 + RTT 10.
      quotasParType: { conge_paye: 25, rtt: 10 },
      // Ancienneté longue → illustre le palier le plus élevé (≥ 20 ans).
      dateDebut: '2005-03-01',
    },
    // Délégation de démo : Jean est autorisé à saisir les heures de Luc Bonnet
    // (même famille Vignes). Illustre l'écran « Saisie pour un collègue ».
    peutSaisirPour: ['col-luc'],
  },
  {
    id: 'col-amelie',
    prenom: 'Amélie',
    nom: 'Marchais',
    familleId: 'fam-marchais',
    contrat: {
      modeleId: 'mod-marchais-jour',
      unite: 'jours',
      base: 7,
      seuilHebdo: 35,
      quotasParType: { conge_paye: 25 },
      // Ancienneté intermédiaire → premier palier d'ancienneté (≥ 10 ans).
      dateDebut: '2013-09-01',
    },
  },
  {
    id: 'col-luc',
    prenom: 'Luc',
    nom: 'Bonnet',
    familleId: 'fam-vignes',
    contrat: {
      modeleId: 'mod-vignes-cdd',
      unite: 'heures',
      base: 39,
      seuilHebdo: 39,
      quotasParType: { conge_paye: 12 },
    },
  },
  {
    id: 'col-nadia',
    prenom: 'Nadia',
    nom: 'Roux',
    familleId: 'fam-marchais',
    contrat: {
      modeleId: 'mod-saisonnier-jour',
      unite: 'jours',
      base: 7,
      seuilHebdo: 35,
      quotasParType: { conge_paye: 8 },
      // Entrée en cours de période de référence → acquis proratisé (démo prorata).
      dateDebut: '2026-07-01',
    },
  },
]

export const comptesSeed: Compte[] = [
  {
    id: 'cpt-jean',
    identifiant: 'jean',
    motDePasse: 'demo',
    role: 'employe',
    collaborateurId: 'col-jean',
    nomAffichage: 'Jean Ferrand',
  },
  {
    id: 'cpt-amelie',
    identifiant: 'amelie',
    motDePasse: 'demo',
    role: 'employe',
    collaborateurId: 'col-amelie',
    nomAffichage: 'Amélie Marchais',
  },
  {
    id: 'cpt-sophie',
    identifiant: 'sophie',
    motDePasse: 'demo',
    role: 'responsable',
    nomAffichage: 'Sophie (Responsable)',
  },
]

// Quelques saisies d'exemple pour la semaine courante afin de peupler le tableau de bord.
function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export const saisiesSeed: Saisie[] = [
  {
    id: 'sai-1',
    collaborateurId: 'col-jean',
    date: isoDate(-2),
    heureDebut: '08:00',
    heureFin: '17:00',
    pauseMin: 60,
    totalMinutes: 480,
    statut: 'validee',
    saisiPar: 'jean',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sai-2',
    collaborateurId: 'col-jean',
    date: isoDate(-1),
    heureDebut: '08:00',
    heureFin: '18:00',
    pauseMin: 60,
    totalMinutes: 540,
    statut: 'en_attente',
    saisiPar: 'jean',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sai-3',
    collaborateurId: 'col-amelie',
    date: isoDate(-1),
    periode: 'journee',
    matinDebut: '08:00',
    matinFin: '12:00',
    apremDebut: '14:00',
    apremFin: '17:00',
    totalMinutes: 420,
    statut: 'en_attente',
    saisiPar: 'amelie',
    createdAt: new Date().toISOString(),
  },
]
