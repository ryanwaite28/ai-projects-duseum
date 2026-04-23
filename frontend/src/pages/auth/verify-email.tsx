import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { Button } from '../../components/ui/Button'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { useAuthStore } from '../../store/auth.store'

export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const { confirmEmail, isLoading, error, clearError } = useAuthStore()
  const [code, setCode] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await confirmEmail(email, code.trim())
      navigate('/login?verified=1')
    } catch {
      // error set in store
    }
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-6 py-24">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(200,151,58,0.05) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <Link to="/" className="flex items-center justify-center gap-2 mb-12 no-underline">
          <div className="w-8 h-8 border-[1.5px] border-gold rounded-md flex items-center justify-center font-display text-[0.95rem] text-gold font-semibold">
            D
          </div>
          <span className="font-display text-[1.1rem] font-semibold text-warm-white tracking-[0.02em]">
            Duseum
          </span>
        </Link>

        <div className="text-center mb-8">
          <EyebrowLabel>Verify email</EyebrowLabel>
          <h1 className="font-display text-[2rem] font-normal text-warm-white leading-snug mb-3">
            Check your<br />
            <em className="italic text-gold-light">inbox</em>
          </h1>
          {email && (
            <p className="text-[0.82rem] font-light text-stone-light">
              We sent a code to <span className="text-parchment-dim">{email}</span>
            </p>
          )}
        </div>

        <GoldDivider />

        {error && (
          <div className="mb-6 px-4 py-3 border border-[#c0544a]/40 bg-[#c0544a]/10 rounded-sm">
            <p className="text-[0.82rem] text-[#c0544a] font-light">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
              Verification code
            </label>
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="bg-ink-soft border border-gold/20 focus:border-gold/50 rounded-sm px-4 py-3 text-[1.1rem] font-mono text-parchment placeholder:text-stone-light outline-none transition-colors duration-200 tracking-[0.3em] text-center"
              placeholder="000000"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isLoading || code.length < 6}
            className="w-full justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Verifying…' : 'Verify Email'}
          </Button>
        </form>

        <p className="mt-8 text-center text-[0.82rem] font-light text-stone-light">
          Wrong email?{' '}
          <Link to="/register" className="text-gold hover:text-gold-light transition-colors duration-200">
            Back to register
          </Link>
        </p>
      </div>
    </div>
  )
}
