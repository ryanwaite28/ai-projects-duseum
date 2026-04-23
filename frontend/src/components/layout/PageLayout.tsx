import { NavBar } from './NavBar'

interface SectionProps {
  children: React.ReactNode
  alt?: boolean
  className?: string
}

export const Section = ({ children, alt = false, className = '' }: SectionProps) => (
  <section
    className={`py-28 px-8 ${alt ? 'bg-ink-soft border-t border-gold/10' : 'bg-ink border-t border-gold/10'} ${className}`}
  >
    <div className="max-w-[1100px] mx-auto">{children}</div>
  </section>
)

interface PageLayoutProps {
  children: React.ReactNode
}

export const PageLayout = ({ children }: PageLayoutProps) => (
  <div className="min-h-screen bg-ink font-body">
    <NavBar />
    <main className="pt-[72px]">{children}</main>
  </div>
)
