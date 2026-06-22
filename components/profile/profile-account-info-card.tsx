import { Card } from "@/components/ui/card"
import type { AuthUser } from "@/lib/auth-context"

interface ProfileAccountInfoCardProps {
  user: AuthUser
  onDeleteAccount?: () => void
}

function formatAccountCreated(createdAt?: number): string {
  if (!createdAt) return "N/A"
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(createdAt))
}

function computeDaysRemaining(accountExpiry: string): number {
  if (!accountExpiry) return 0
  // Parse the formatted date string (e.g. "Jun 23, 2028")
  const expiryDate = new Date(accountExpiry)
  if (isNaN(expiryDate.getTime())) return 0
  const now = new Date()
  const diff = expiryDate.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function ProfileAccountInfoCard({ user, onDeleteAccount }: ProfileAccountInfoCardProps) {
  const daysRemaining = computeDaysRemaining(user.accountExpiry)
  const isExpired = daysRemaining <= 0
  const isExpiring = daysRemaining > 0 && daysRemaining <= 30

  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold text-[#0C2340] mb-5">Account Information</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <p className="text-xs text-slate-600 mb-1">Account Created</p>
          <p className="text-sm text-slate-900">{formatAccountCreated(user.createdAt)}</p>
        </div>

        <div>
          <p className="text-xs text-slate-600 mb-1">Account Expiry</p>
          <p className="text-sm text-slate-900">{user.accountExpiry || "N/A"}</p>
        </div>

        <div>
          <p className="text-xs text-slate-600 mb-2">Verification Status</p>
          {user.isVerified ? (
            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
              Pending Verification
            </span>
          )}
        </div>

        <div>
          <p className="text-xs text-slate-600 mb-1">Days Remaining</p>
          <p className={`text-sm font-bold ${isExpired ? "text-red-500" : isExpiring ? "text-amber-500" : "text-green-500"}`}>
            {isExpired ? "Expired" : `${daysRemaining} days`}
          </p>
        </div>
      </div>

      {(isExpiring || isExpired) && (
        <div className="mt-8 border-t border-slate-100 pt-6">
          <h4 className="text-sm font-semibold text-[#0C2340] mb-4">Reactivation Process</h4>
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#0C2340] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-medium">1</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900">Re-upload Documents</p>
                  <p className="text-[11px] text-slate-500">Submit new proof of residency.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-slate-600 text-[10px]">2</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900">Admin Verification</p>
                  <p className="text-[11px] text-slate-500">Wait for admin approval.</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-center sm:justify-end min-w-[200px]">
              <div className="w-full relative group">
                <button
                  disabled={!isExpired}
                  className={`w-full py-2.5 px-4 text-sm font-medium rounded transition-colors ${
                    isExpired
                      ? "bg-[#0C2340] text-white hover:bg-[#1a3a5c]"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  Request Reactivation
                </button>
                {!isExpired && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-[11px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    Account must be expired to request
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Section */}
      <div className="mt-8 border-t border-slate-100 pt-6">
        <h4 className="text-sm font-semibold text-red-600 mb-2">Danger Zone</h4>
        <div className="flex flex-col sm:flex-row gap-6 items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-900">Delete Account</p>
            <p className="text-[11px] text-slate-500">Permanently remove your account and all data.</p>
          </div>
          <button
            onClick={onDeleteAccount}
            className="px-4 py-2 bg-red-50 text-red-600 text-xs font-semibold rounded hover:bg-red-100 transition-colors whitespace-nowrap"
          >
            Delete Account
          </button>
        </div>
      </div>
    </Card>
  )
}
