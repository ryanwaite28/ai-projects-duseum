import { cn } from '../../lib/utils'

type BadgeVariant = 'gold' | 'muted'

interface BadgeProps {
  variant?: BadgeVariant
  className?: string
  children: React.ReactNode
}

const variants: Record<BadgeVariant, string> = {
  gold:  'text-gold bg-gold/12',
  muted: 'text-stone-light bg-stone/15',
}

export const Badge = ({ variant = 'gold', className, children }: BadgeProps) => (
  <span
    className={cn(
      'inline-block text-[0.62rem] font-medium tracking-[0.16em] uppercase px-[0.6rem] py-[0.25rem] rounded-sm',
      variants[variant],
      className
    )}
  >
    {children}
  </span>
)
