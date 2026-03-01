import { Card } from "@/components/ui/card"
import type { AuthUser } from "@/lib/auth-context"

interface ProfileAccountInfoCardProps {
  user: AuthUser
}

export function ProfileAccountInfoCard({ user }: ProfileAccountInfoCardProps) {
  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold text-[#0C2340] mb-5">Account Information</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <p className="text-xs text-slate-600 mb-1">Account Created</p>
          <p className="text-sm text-slate-900">November 1, 2025</p>
        </div>

        <div>
          <p className="text-xs text-slate-600 mb-1">Account Expiry</p>
          <p className="text-sm text-slate-900">{user.accountExpiry}</p>
        </div>

        <div>
          <p className="text-xs text-slate-600 mb-2">Status</p>
          <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
            Active
          </span>
        </div>

        <div>
          <p className="text-xs text-slate-600 mb-1">Days Remaining</p>
          <p className="text-sm font-bold text-green-500">180 days</p>
        </div>
      </div>
    </Card>
  )
}
