import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signInWithRedirect } from 'aws-amplify/auth'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { Button } from '../../components/ui/Button'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { useAuthStore } from '../../store/auth.store'

const IS_LOCAL_AUTH = import.meta.env.VITE_AUTH_STUB === 'true'

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('return') ?? '/dashboard'

  const { signIn, isLoading, error, clearError } = useAuthStore()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await signIn(email, password)
      navigate(returnTo, { replace: true })
    } catch {
      // error already set in store
    }
  }

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
          <EyebrowLabel>Welcome back</EyebrowLabel>
          <h1 className="font-display text-[2rem] font-normal text-warm-white leading-snug">
            Sign in to your<br />
            <em className="italic text-gold-light">account</em>
          </h1>
        </div>

        <GoldDivider />

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 border border-[#c0544a]/40 bg-[#c0544a]/10 rounded-sm">
            <p className="text-[0.82rem] text-[#c0544a] font-light">{error}</p>
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {isLoading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        {/* Google OAuth */}
        {!IS_LOCAL_AUTH && (
          <>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-gold/10" />
              <span className="text-[0.68rem] tracking-[0.14em] uppercase text-stone-light">or</span>
              <div className="flex-1 h-px bg-gold/10" />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-center"
              onClick={() => signInWithRedirect({ provider: 'Google' })}
            >
              Continue with Google
            </Button>
          </>
        )}

        {/* Footer links */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            to="/reset-password"
            className="text-[0.82rem] font-light text-stone-light hover:text-gold transition-colors duration-200"
          >
            Forgot your password?
          </Link>
          <p className="text-[0.82rem] font-light text-stone-light">
            Don't have an account?{' '}
            <Link to="/register" className="text-gold hover:text-gold-light transition-colors duration-200">
              Join Duseum
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
