import { EyebrowLabel } from '../components/ui/EyebrowLabel'
import { PageLayout } from '../components/layout/PageLayout'
import { ProtectedRoute } from '../components/layout/ProtectedRoute'
import { UploadForm } from '../components/artwork/UploadForm'

export default function UploadPage() {
  return (
    <ProtectedRoute>
      <PageLayout>
        <section className="min-h-screen py-32 px-8 bg-ink">
          <div className="max-w-[720px] mx-auto">
            <div className="mb-12">
              <EyebrowLabel>Publish</EyebrowLabel>
              <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-normal text-warm-white leading-[1.12]">
                Share your<br />
                <em className="italic text-gold-light">work</em>
              </h1>
            </div>

            <UploadForm />
          </div>
        </section>
      </PageLayout>
    </ProtectedRoute>
  )
}
