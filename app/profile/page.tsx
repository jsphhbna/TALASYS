"use client"

import type React from "react"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useResidentData } from "@/hooks/use-resident-data"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { ProfileHeaderCard } from "@/components/profile/profile-header-card"
import { ProfilePersonalInfoCard } from "@/components/profile/profile-personal-info-card"
import { ProfileProofsCard } from "@/components/profile/profile-proofs-card"
import { ProfileAccountInfoCard } from "@/components/profile/profile-account-info-card"
import type { ProfileEditFormData } from "@/components/profile/profile-types"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { getRequiredDocuments, type UploadField } from "@/lib/resident-documents"
import { calculateAge, mergeWithAutoStatuses } from "@/lib/resident-status"

const ProfileEditRequestDialog = dynamic(
  () => import("@/components/profile/profile-edit-request-dialog").then((mod) => mod.ProfileEditRequestDialog),
  {
    loading: () => <Card className="p-6 mt-4">Loading form...</Card>,
  },
)

const defaultFormData: ProfileEditFormData = {
  fullName: "",
  dateOfBirth: "",
  contactNumber: "",
  email: "",
  address: "",
  statuses: [],
  reason: "",
}

const defaultUploadState: Record<UploadField, File | null> = {
  validId: null,
  parentId: null,
  seniorId: null,
  votersId: null,
}

const defaultUploadingState: Record<UploadField, boolean> = {
  validId: false,
  parentId: false,
  seniorId: false,
  votersId: false,
}

export default function ProfilePage() {
  const { user, isAuthorized } = useAuthGuard()
  const { proofs, verification, addRequest, requestProfileEdit, isLoaded, saveProfilePicture, deleteAccount } = useResidentData()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isOpeningDialog, setIsOpeningDialog] = useState(false)
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false)
  const [isRequestSubmitted, setIsRequestSubmitted] = useState(false)
  const [profilePicture, setProfilePicture] = useState<string | null>(null)
  const [isUploadingPicture, setIsUploadingPicture] = useState(false)
  const [formData, setFormData] = useState<ProfileEditFormData>(defaultFormData)
  const [uploadedFiles, setUploadedFiles] = useState<Record<UploadField, File | null>>(defaultUploadState)
  const [uploadingFiles, setUploadingFiles] = useState<Record<UploadField, boolean>>(defaultUploadingState)

  useEffect(() => {
    if (user && isDialogOpen) {
      const derivedStatuses =
        user.status === "Senior Citizen"
          ? ["Senior Citizen"]
          : user.status === "Under 18"
            ? ["Underage"]
            : user.status === "Registered Voter"
              ? ["Adult", "Registered Voter"]
              : ["Adult"]

      setFormData({
        fullName: user.name,
        dateOfBirth: user.dateOfBirth,
        contactNumber: user.contactNumber,
        email: user.email,
        address: user.address,
        statuses: derivedStatuses,
        reason: "",
      })
    }
  }, [user, isDialogOpen])

  useEffect(() => {
    setProfilePicture(user?.profilePicture ?? null)
  }, [user?.profilePicture])

  useEffect(() => {
    if (!isDialogOpen || !formData.dateOfBirth) {
      return
    }

    const calculatedAge = calculateAge(formData.dateOfBirth)
    if (calculatedAge === null) {
      return
    }

    setFormData((prev) => ({
      ...prev,
      statuses: mergeWithAutoStatuses(prev.statuses, calculatedAge),
    }))
  }, [formData.dateOfBirth, isDialogOpen])

  const handleFormChange = (field: keyof ProfileEditFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleRequestProfileEdit = async () => {
    setIsOpeningDialog(true)
    await delay(500)
    setIsDialogOpen(true)
    setIsOpeningDialog(false)
  }

  const handleStatusToggle = (status: string) => {
    if (status === "Senior Citizen" || status === "Adult" || status === "Underage") return

    setFormData((prev) => {
      const statuses = prev.statuses.includes(status)
        ? prev.statuses.filter((s) => s !== status)
        : [...prev.statuses, status]
      return { ...prev, statuses }
    })
  }

  const handleFileUpload = async (field: UploadField, file: File | null) => {
    if (!file) {
      setUploadedFiles((prev) => ({ ...prev, [field]: null }))
      return
    }

    setUploadingFiles((prev) => ({ ...prev, [field]: true }))
    await delay(700)
    setUploadedFiles((prev) => ({ ...prev, [field]: file }))
    setUploadingFiles((prev) => ({ ...prev, [field]: false }))
  }

  const handleSubmitRequest = async () => {
    if (!formData.reason.trim()) {
      showToastPreset("reasonRequired")
      return
    }

    if (!user) return

    setIsSubmittingRequest(true)
    
    const changes: { field: string; oldValue: string; newValue: string }[] = []
    if (user.name !== formData.fullName) changes.push({ field: "Full Name", oldValue: user.name, newValue: formData.fullName })
    if (user.dateOfBirth !== formData.dateOfBirth) changes.push({ field: "Date of Birth", oldValue: user.dateOfBirth, newValue: formData.dateOfBirth })
    if (user.contactNumber !== formData.contactNumber) changes.push({ field: "Contact Number", oldValue: user.contactNumber, newValue: formData.contactNumber })
    if (user.email !== formData.email) changes.push({ field: "Email Address", oldValue: user.email, newValue: formData.email })
    if (user.address !== formData.address) changes.push({ field: "Address", oldValue: user.address, newValue: formData.address })
    
    // Check statuses
    const oldStatuses = [...(user.statuses || [])].sort().join(", ")
    const newStatuses = [...(formData.statuses || [])].sort().join(", ")
    if (oldStatuses !== newStatuses) {
      changes.push({ field: "Resident Statuses", oldValue: oldStatuses || "None", newValue: newStatuses || "None" })
    }

    if (changes.length === 0) {
      setIsSubmittingRequest(false)
      setIsDialogOpen(false)
      return
    }

    try {
      await requestProfileEdit(changes, formData.reason, uploadedFiles)
      setIsDialogOpen(false)
      setIsRequestSubmitted(true)
      setUploadedFiles(defaultUploadState)
      showToastPreset("profileRequestSubmitted")
      
      setTimeout(() => {
        setIsRequestSubmitted(false)
      }, 3000)
    } catch (error) {
      console.error("Failed to submit profile edit:", error)
      showToastPreset("uploadFailedSize") // Temporary error toast
    } finally {
      setIsSubmittingRequest(false)
    }
  }

  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      showToastPreset("uploadFailedSize")
      return
    }

    if (!file.type.startsWith("image/")) {
      showToastPreset("uploadFailedType")
      return
    }

    const reader = new FileReader()
    reader.onload = async (event) => {
      setIsUploadingPicture(true)
      await delay(1200)
      const nextProfilePicture = event.target?.result as string
      setProfilePicture(nextProfilePicture) // Optimistic update

      if (user) {
        // Upload to Firebase Storage
        import("@/lib/firebase").then(async ({ storage, db }) => {
          const { ref, uploadString, getDownloadURL } = await import("firebase/storage")
          const { doc, updateDoc } = await import("firebase/firestore")
          
          try {
            const storageRef = ref(storage, `profiles/${user.id}`)
            await uploadString(storageRef, nextProfilePicture, 'data_url')
            const downloadUrl = await getDownloadURL(storageRef)
            
            await updateDoc(doc(db, "users", user.id), { profilePicture: downloadUrl })
            saveProfilePicture(downloadUrl)
            showToastPreset("profileUpdated")
          } catch (error) {
            console.error("Failed to upload profile picture:", error)
            showToastPreset("uploadFailedSize") // Re-use an existing preset instead of importing toast
          } finally {
            setIsUploadingPicture(false)
          }
        })
      } else {
         setIsUploadingPicture(false)
      }
    }
    reader.readAsDataURL(file)
  }

  if (!isAuthorized || !user) {
    return null
  }

  const requiredDocuments = getRequiredDocuments(formData.statuses, "profile")

  return (
    <ResidentPageShell>
      <div className="space-y-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0C2340] mb-1 tracking-tight">My Profile</h1>
          <p className="text-sm text-slate-600">View and manage your personal information</p>
        </div>

        <ProfileHeaderCard
          user={user}
          profilePicture={profilePicture}
          isUploadingPicture={isUploadingPicture}
          onProfilePictureChange={handleProfilePictureChange}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ProfilePersonalInfoCard user={user} />
          <ProfileProofsCard
            proofs={proofs}
            verification={verification}
            isRequestSubmitted={isRequestSubmitted}
            isOpeningDialog={isOpeningDialog}
            onRequestProfileEdit={handleRequestProfileEdit}
          />
        </div>

        <ProfileAccountInfoCard user={user} onDeleteAccount={async () => {
          if (confirm("Are you sure you want to permanently delete your account and all associated records? This cannot be undone.")) {
            if (await deleteAccount()) {
              window.location.href = "/login"
            }
          }
        }} />
      </div>

      <ProfileEditRequestDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        formData={formData}
        requiredDocuments={requiredDocuments}
        uploadedFiles={uploadedFiles}
        uploadingFiles={uploadingFiles}
        isSubmitting={isSubmittingRequest}
        onFormChange={handleFormChange}
        onStatusToggle={handleStatusToggle}
        onFileUpload={handleFileUpload}
        onSubmit={handleSubmitRequest}
      />
    </ResidentPageShell>
  )
}
