import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyebrowLabel } from '../../components/ui/EyebrowLabel'
import { Button } from '../../components/ui/Button'
import { GoldDivider } from '../../components/ui/GoldDivider'
import { useAuthStore } from '../../store/auth.store'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { forgotPassword, confirmForgotPassword, isLoading, error, clearError } = useAuthStore()

  const [step, setStep]         = useState<'request' | 'confirm'>('request')
  const [email, setEmail]       = useState('')
  const [code, setCode]         = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [localError, setLocalError] = useState('')

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    setLocalError('')
    try {
      await forgotPassword(email)
      setStep('confirm')
    } catch {
      // error set in store
    }
  }

  const handleConfirm = async (e: FormEvent) => {
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
      await confirmForgotPassword(email, code.trim(), password)
      navigate('/login?reset=1')
    } catch {
      // error set in store
    }
  }

  const displayError = localError || error

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
          <EyebrowLabel>{step === 'request' ? 'Reset password' : 'New password'}</EyebrowLabel>
          <h1 className="font-display text-[2rem] font-normal text-warm-white leading-snug">
            {step === 'request' ? (
              <>Recover your<br /><em className="italic text-gold-light">account</em></>
            ) : (
              <>Check your<br /><em className="italic text-gold-light">inbox</em></>
            )}
          </h1>
          {step === 'confirm' && (
            <p className="mt-3 text-[0.82rem] font-light text-stone-light">
              We sent a reset code to <span className="text-parchment-dim">{email}</span>
            </p>
          )}
        </div>

        <GoldDivider />

        {displayError && (
          <div className="mb-6 px-4 py-3 border border-[#c0544a]/40 bg-[#c0544a]/10 rounded-sm">
            <p className="text-[0.82rem] text-[#c0544a] font-light">{displayError}</p>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequest} className="flex flex-col gap-5">
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

            <Button
              type="submit"
              variant="primary"
              disabled={isLoading}
              className="w-full justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending…' : 'Send Reset Code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleConfirm} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
                Reset code
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

            <div className="flex flex-col gap-2">
              <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
                New password
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
              disabled={isLoading || code.length < 6}
              className="w-full justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Resetting…' : 'Reset Password'}
            </Button>
          </form>
        )}

        <p className="mt-8 text-center text-[0.82rem] font-light text-stone-light">
          <Link to="/login" className="text-gold hover:text-gold-light transition-colors duration-200">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
