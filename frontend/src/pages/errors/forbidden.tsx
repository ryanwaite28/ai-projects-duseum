import { Link } from 'react-router-dom'

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center text-center px-8">
      <p className="text-[0.68rem] font-medium tracking-[0.2em] uppercase text-gold mb-4">
        Access Denied
      </p>
      <h1 className="font-display text-[3.5rem] font-semibold text-warm-white leading-none mb-4">
        403
      </h1>
      <div className="w-12 h-px bg-gold opacity-50 my-6 mx-auto" />
      <p className="text-parchment-dim text-[1rem] mb-8 max-w-sm">
        You don't have permission to view this page.
      </p>
      <Link
        to="/"
        className="text-gold border border-gold/40 hover:border-gold hover:bg-gold/10 font-body text-[0.8rem] font-medium uppercase tracking-[0.04em] px-[1.1rem] py-[0.45rem] rounded-md transition-all duration-200"
      >
        Back to home
      </Link>
    </div>
  )
}
