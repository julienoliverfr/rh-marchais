import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import ContextualHelp from '../components/ContextualHelp'
import FieldError from '../components/FieldError'

export default function Login() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ identifiant?: string; motDePasse?: string }>(
    {},
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Validation en ligne : champs requis signalés sous chaque champ.
    const nextErrors: { identifiant?: string; motDePasse?: string } = {}
    if (!identifiant.trim()) {
      nextErrors.identifiant = 'Veuillez saisir votre identifiant.'
    }
    if (!motDePasse) {
      nextErrors.motDePasse = 'Veuillez saisir votre mot de passe.'
    }
    if (nextErrors.identifiant || nextErrors.motDePasse) {
      setErrors(nextErrors)
      setError(null)
      return
    }
    setErrors({})
    // Login asynchrone (immédiat en mode démo, réseau en mode Supabase).
    setSubmitting(true)
    const res = await login(identifiant, motDePasse)
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error ?? 'Connexion impossible.')
      return
    }
    // Redirection selon le rôle.
    const session = useAuthStore.getState().session
    navigate(session?.role === 'responsable' ? '/responsable' : '/', {
      replace: true,
    })
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>🍇 RH · Suivi des heures</h1>
        <p className="muted">Domaine agricole — Vignes &amp; Marchais</p>

        <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
          {error && <div className="alert error">{error}</div>}
          <div className="form-row">
            <label htmlFor="id">Identifiant</label>
            <input
              id="id"
              autoFocus
              autoComplete="username"
              value={identifiant}
              aria-invalid={errors.identifiant ? true : undefined}
              aria-describedby={errors.identifiant ? 'login-id-err' : undefined}
              onChange={(e) => {
                setIdentifiant(e.target.value)
                if (errors.identifiant)
                  setErrors((p) => ({ ...p, identifiant: undefined }))
              }}
            />
            <FieldError id="login-id-err" message={errors.identifiant} />
          </div>
          <div className="form-row">
            <label htmlFor="pw">Mot de passe</label>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              value={motDePasse}
              aria-invalid={errors.motDePasse ? true : undefined}
              aria-describedby={errors.motDePasse ? 'login-pw-err' : undefined}
              onChange={(e) => {
                setMotDePasse(e.target.value)
                if (errors.motDePasse)
                  setErrors((p) => ({ ...p, motDePasse: undefined }))
              }}
            />
            <FieldError id="login-pw-err" message={errors.motDePasse} />
          </div>
          <button
            type="submit"
            className="btn"
            style={{ width: '100%' }}
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>

      {/* Aide contextuelle disponible dès l'écran de connexion. */}
      <ContextualHelp />
    </div>
  )
}
