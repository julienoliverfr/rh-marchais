// ---------------------------------------------------------------------------
// Neutralisation de l'injection de formule dans les exports tableur
// (« CSV/Excel formula injection », CWE-1236).
//
// Un tableur (Excel, LibreOffice, Google Sheets…) interprète toute cellule
// commençant par = + - @ (ou une tabulation / un retour chariot) comme une
// FORMULE. Une donnée saisie par un utilisateur — un nom, un libellé de type
// d'absence… — de la forme `=CMD(...)` peut alors s'exécuter à l'ouverture du
// fichier chez le comptable. Pour empêcher cela on préfixe la cellule d'une
// apostrophe : le tableur l'affiche telle quelle et ne l'exécute jamais.
//
// À appliquer à TOUTE cellule TEXTE des exports CSV et Excel. Les cellules
// purement numériques (heures, jours) restent des nombres réels et ne sont pas
// concernées.
// ---------------------------------------------------------------------------

// Caractères déclencheurs de formule en tête de cellule.
const FORMULA_TRIGGER = /^[=+\-@\t\r\n]/

export function neutralizeFormula(value: string): string {
  if (value === '') return value
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value
}
