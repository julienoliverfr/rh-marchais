// FieldError — message d'erreur affiché SOUS le champ concerné.
// Rendu conditionnel : rien si pas d'erreur. `id` permet de relier le message
// au champ via `aria-describedby` ; `role="alert"` l'annonce aux lecteurs d'écran.
export default function FieldError({
  id,
  message,
}: {
  id: string
  message?: string | null
}) {
  if (!message) return null
  return (
    <span id={id} className="field-error" role="alert">
      {message}
    </span>
  )
}
