import type React from "react"
import { Card } from "@/components/ui/card"
import type { AuthUser } from "@/lib/auth-context"

interface ProfileHeaderCardProps {
  user: AuthUser
  profilePicture: string | null
  onProfilePictureChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function ProfileHeaderCard({
  user,
  profilePicture,
  isUploadingPicture,
  onSetupProfilePicture,
}: ProfileHeaderCardProps & { onSetupProfilePicture?: () => void }) {
  return (
    <Card className="p-8 mb-6">
      <div className="flex items-center gap-6">
        <div className="relative w-32 h-32 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden group">
          {profilePicture ? (
            <img src={profilePicture || "/placeholder.svg"} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <button 
              onClick={onSetupProfilePicture}
              className="absolute inset-0 flex flex-col items-center justify-center bg-slate-200 hover:bg-slate-300 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-[#0C2340] focus:ring-offset-2"
              title="Setup Profile Picture"
            >
              <span className="text-4xl text-slate-400 mb-1">📷</span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Take Photo</span>
            </button>
          )}

          {isUploadingPicture && (
            <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          )}
        </div>

        <div className="flex-1">
          <h2 className="text-[22px] font-bold text-slate-900 mb-2">{user.name}</h2>
          <p className="text-sm text-slate-600 mb-3">{user.status ?? "Resident"}</p>
          {user.isVerified ? (
            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
              ✓ Verified
            </span>
          ) : (
            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
              ⏳ Pending Verification
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
