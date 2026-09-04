import { Card } from "@/components/ui/card"
import type { AuthUser } from "@/lib/auth-context"

interface ProfileAccountStatusCardProps {
  user: AuthUser
}

export function ProfileAccountStatusCard({ user }: ProfileAccountStatusCardProps) {
  return (
    <Card className="p-6 shadow-sm flex flex-col items-center justify-center">
      <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50 text-center mb-6 w-full">Account Status</h3>

      <div className="flex flex-col items-center">
        {user?.status === "Expired" ? (
          <>
            <div className="w-32 h-32 rounded-full bg-red-50 flex items-center justify-center mb-6 border-2 border-red-200">
              <span className="text-5xl text-red-600">!</span>
            </div>
            <p className="text-xl font-bold text-red-600 mb-2">Deactivated</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1 text-center">Your account is currently inactive</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 text-center">Request reactivation below</p>
          </>
        ) : user?.isVerified === false ? (
          <>
            <div className="w-32 h-32 rounded-full bg-amber-50 flex items-center justify-center mb-6 border-2 border-amber-200">
              <span className="text-5xl text-amber-500">?</span>
            </div>
            <p className="text-xl font-bold text-amber-500 mb-2">Under Review</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1 text-center">Registration pending verification</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 text-center">You cannot request documents yet</p>
          </>
        ) : (
          <>
            <div className="w-32 h-32 rounded-full bg-green-50 flex items-center justify-center mb-6 border-2 border-green-200">
              <span className="text-5xl text-green-600">✓</span>
            </div>
            <p className="text-xl font-bold text-green-600 mb-2">Account Active</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-1 text-center">Valid until {user?.accountExpiry || "N/A"}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 text-center">You can request documents normally</p>
          </>
        )}
      </div>
    </Card>
  )
}
