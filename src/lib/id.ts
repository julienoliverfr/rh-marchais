// Génération d'identifiants UUID v4 valides — y compris en contexte NON
// sécurisé (page servie en http://…), où `crypto.randomUUID` est INDISPONIBLE
// (l'API n'existe que dans un « secure context » : https ou localhost).
//
// `crypto.getRandomValues`, lui, EST disponible même en http : on l'utilise
// pour construire l'UUID à la main. Repli sur `Math.random` en tout dernier
// recours (crypto totalement absent — cas théorique).
//
// IMPORTANT : les colonnes `id` de la base (Supabase/Postgres) sont de type
// `uuid`. Un identifiant non conforme (ex. « sai-a3f9k2p1 ») provoque
// « invalid input syntax for type uuid » ; l'appel direct à `crypto.randomUUID`
// en http provoque « crypto.randomUUID is not a function ». Ce module évite les
// deux. Toute création d'entité persistée DOIT passer par `newId()`.
export function newId(): string {
  const c: Crypto | undefined = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()

  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  // Force la version (4) et le variant (10xx) conformes à l'UUID v4.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return (
    h.slice(0, 4).join('') +
    '-' +
    h.slice(4, 6).join('') +
    '-' +
    h.slice(6, 8).join('') +
    '-' +
    h.slice(8, 10).join('') +
    '-' +
    h.slice(10, 16).join('')
  )
}
