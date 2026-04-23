import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { PageLayout } from '../components/layout/PageLayout'

export default function AuthorsPage() {
  return (
    <PageLayout>
      <section className="min-h-screen py-32 px-8 bg-ink">
        <div className="max-w-[1100px] mx-auto text-center">
          <EyebrowLabel>Directory</EyebrowLabel>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white mb-4">
            Meet the <em className="italic text-gold-light">authors</em>
          </h1>
          <p className="text-[0.88rem] font-light text-stone-light">
            Coming soon — PROMPT-2.x
          </p>
        </div>
      </section>
    </PageLayout>
  )
}
