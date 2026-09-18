import { VerifReviewPage } from "@/components/admin/verif-review-page"

export default function NewRegistrationsPage() {
  return (
    <VerifReviewPage
      type="registration"
      title="New Registrations"
      subtitle="Review and approve pending account registration requests"
      accentColor="blue"
    />
  )
}
