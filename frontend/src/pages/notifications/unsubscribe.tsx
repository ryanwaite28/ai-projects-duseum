import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { followsService } from '../../services/follows.service'
import type { UnsubscribeResponse } from '../../services/follows.service'

export default function UnsubscribePage() {
  const [params]  = useSearchParams()
  const token     = params.get('token') ?? ''

  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [data, setData]   = useState<UnsubscribeResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setState('error')
      setErrorMsg('No token provided.')
      return
    }
    followsService.unsubscribeByToken(token)
      .then((res) => { setData(res); setState('success') })
      .catch((err: { message?: string }) => {
        setErrorMsg(err?.message ?? 'This link has expired or is invalid.')
        setState('error')
      })
  }, [token])

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-8">
      <div className="max-w-md w-full text-center">
        {/* Logo mark */}
        <div className="w-10 h-10 border border-[1.5px] border-gold rounded-md flex items-center justify-center font-display text-[1rem] text-gold font-semibold mx-auto mb-10">
          D
        </div>

        {state === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-1.5 h-1.5 rounded-full bg-gold animate-float" />
            <p className="text-[0.85rem] font-light text-stone-light">Processing…</p>
          </div>
        )}

        {state === 'success' && data && (
          <>
            <div className="w-10 h-10 rounded-full border border-[#5a9e6e]/40 bg-[#5a9e6e]/10 flex items-center justify-center mx-auto mb-6">
              <span className="text-[#5a9e6e] text-lg">✓</span>
            </div>
            <h1 className="font-display text-[1.5rem] font-normal text-warm-white mb-3">
              You're unsubscribed
            </h1>
            <p className="text-[0.88rem] font-light text-stone-light leading-relaxed mb-8">
              You will no longer receive new-piece email notifications from{' '}
              <span className="text-parchment-dim">{data.authorDisplayName}</span>.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                to="/settings/notifications"
                className="text-[0.78rem] font-light text-gold hover:text-gold-light transition-colors"
              >
                Manage all notification preferences →
              </Link>
              <Link
                to="/browse"
                className="text-[0.72rem] font-light text-stone-light hover:text-parchment-dim transition-colors"
              >
                Browse the gallery
              </Link>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="w-10 h-10 rounded-full border border-[#c0544a]/30 bg-[#c0544a]/8 flex items-center justify-center mx-auto mb-6">
              <span className="text-[#c0544a]">✕</span>
            </div>
            <h1 className="font-display text-[1.5rem] font-normal text-warm-white mb-3">
              Link expired
            </h1>
            <p className="text-[0.88rem] font-light text-stone-light leading-relaxed mb-8">
              {errorMsg}
            </p>
            <Link
              to="/settings/notifications"
              className="text-[0.78rem] font-light text-gold hover:text-gold-light transition-colors"
            >
              Log in to manage your preferences →
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
