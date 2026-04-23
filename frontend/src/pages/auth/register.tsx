import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { Button } from '../../components/ui/Button'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { useAuthStore } from '../../store/auth.store'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { signUp, isLoading, error, clearError } = useAuthStore()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [localError, setLocalError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    setLocalError('')

    if (password !== confirm) {
      setLocalError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.')
      return
    }

    try {
      await signUp(email, password)
      navigate(`/verify-email?email=${encodeURIComponent(email)}`)
    } catch {
      // error already set in store
    }
  }

  const displayError = localError || error

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 py-24">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(200,151,58,0.05) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2 mb-12 no-underline">
          <div className="w-8 h-8 border-[1.5px] border-gold rounded-md flex items-center justify-center font-display text-[0.95rem] text-gold font-semibold">
            D
          </div>
          <span className="font-display text-[1.1rem] font-semibold text-warm-white tracking-[0.02em]">
            Duseum
          </span>
        </Link>

        {/* Heading */}
        <div className="text-center mb-8">
          <EyebrowLabel>Create account</EyebrowLabel>
          <h1 className="font-display text-[2rem] font-normal text-warm-white leading-snug">
            Join the<br />
            <em className="italic text-gold-light">museum</em>
          </h1>
        </div>

        <GoldDivider />

        {/* Error */}
        {displayError && (
          <div className="mb-6 px-4 py-3 border border-[#c0544a]/40 bg-[#c0544a]/10 rounded-sm">
            <p className="text-[0.82rem] text-[#c0544a] font-light">{displayError}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-ink-soft border border-gold/20 focus:border-gold/50 rounded-sm px-4 py-3 text-[0.9rem] font-light text-parchment placeholder:text-stone-light outline-none transition-colors duration-200"
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-ink-soft border border-gold/20 focus:border-gold/50 rounded-sm px-4 py-3 text-[0.9rem] font-light text-parchment placeholder:text-stone-light outline-none transition-colors duration-200"
              placeholder="Min. 8 characters"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
              Confirm password
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="bg-ink-soft border border-gold/20 focus:border-gold/50 rounded-sm px-4 py-3 text-[0.9rem] font-light text-parchment placeholder:text-stone-light outline-none transition-colors duration-200"
              placeholder="••••••••"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isLoading}
            className="w-full justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating account…' : 'Create Account'}
          </Button>
        </form>

        <p className="mt-8 text-center text-[0.82rem] font-light text-stone-light">
          Already have an account?{' '}
          <Link to="/login" className="text-gold hover:text-gold-light transition-colors duration-200">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
