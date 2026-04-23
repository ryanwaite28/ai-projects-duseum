export const EyebrowLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-2 text-[0.72rem] font-medium tracking-[0.18em] uppercase text-gold mb-7">
    <span className="block w-7 h-px bg-gold opacity-60" />
    {children}
    <span className="block w-7 h-px bg-gold opacity-60" />
  </div>
)
