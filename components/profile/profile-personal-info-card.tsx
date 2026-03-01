import { Card } from "@/components/ui/card"
import type { AuthUser } from "@/lib/auth-context"

interface ProfilePersonalInfoCardProps {
  user: AuthUser
}

export function ProfilePersonalInfoCard({ user }: ProfilePersonalInfoCardProps) {
  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold text-[#0C2340] mb-5">Personal Information</h3>

      <div className="space-y-5">
        <div>
          <p className="text-xs text-slate-600 mb-1">Full Name</p>
          <p className="text-sm text-slate-900">{user.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate-600 mb-1">Date of Birth</p>
          <p className="text-sm text-slate-900">{user.dateOfBirth}</p>
        </div>
        <div>
          <p className="text-xs text-slate-600 mb-1">Contact Number</p>
          <p className="text-sm text-slate-900">{user.contactNumber}</p>
        </div>
        <div>
          <p className="text-xs text-slate-600 mb-1">Email Address</p>
          <p className="text-sm text-slate-900">{user.email}</p>
        </div>
        <div>
          <p className="text-xs text-slate-600 mb-1">Complete Address</p>
          <p className="text-sm text-slate-900">{user.address}</p>
        </div>
      </div>
    </Card>
  )
}
