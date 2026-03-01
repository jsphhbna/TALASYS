import type React from "react"
import { Card } from "@/components/ui/card"
import type { AuthUser } from "@/lib/auth-context"

interface ProfileHeaderCardProps {
  user: AuthUser
  profilePicture: string | null
  isUploadingPicture: boolean
  onProfilePictureChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function ProfileHeaderCard({
  user,
  profilePicture,
  isUploadingPicture,
  onProfilePictureChange,
}: ProfileHeaderCardProps) {
  return (
    <Card className="p-8 mb-6">
      <div className="flex items-center gap-6">
        <div className="relative w-32 h-32 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {profilePicture ? (
            <img src={profilePicture || "/placeholder.svg"} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <span className="text-5xl text-slate-500">👤</span>
          )}

          <label
            htmlFor="profilePictureInput"
            className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-40 flex items-center justify-center cursor-pointer transition-all rounded-full"
          >
            <div className="text-center opacity-0 hover:opacity-100 transition-opacity">
              <svg className="w-6 h-6 text-white mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-white text-xs font-medium">Upload</span>
            </div>
          </label>

          <input
            id="profilePictureInput"
            type="file"
            accept="image/*"
            onChange={onProfilePictureChange}
            className="hidden"
          />

          {isUploadingPicture && (
            <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center rounded-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            </div>
          )}
        </div>

        <div className="flex-1">
          <h2 className="text-[22px] font-bold text-slate-900 mb-2">{user.name}</h2>
          <p className="text-sm text-slate-600 mb-3">{user.status ?? "Resident"}</p>
          <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
            Verified
          </span>
        </div>
      </div>
    </Card>
  )
}
