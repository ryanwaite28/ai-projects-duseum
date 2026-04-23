import { cn } from '../../lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'inline-flex items-center gap-2 bg-gold hover:bg-gold-light text-ink font-body text-sm font-medium uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-colors duration-150 hover:-translate-y-px',
  secondary:
    'inline-flex items-center gap-2 bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-all duration-200 hover:-translate-y-px',
  ghost:
    'text-gold border border-gold/40 hover:border-gold hover:bg-gold/10 font-body text-[0.8rem] font-medium uppercase tracking-[0.04em] px-[1.1rem] py-[0.45rem] rounded-md transition-all duration-200',
}

export const Button = ({ variant = 'primary', className, children, ...props }: ButtonProps) => (
  <button className={cn(variants[variant], className)} {...props}>
    {children}
  </button>
)
