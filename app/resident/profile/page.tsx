"use client"

import type React from "react"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { useAuthGuard } from "@/hooks/auth"
import { useResidentData } from "@/hooks/resident"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ProfileHeaderCard } from "@/components/resident/profile/profile-header-card"
import { ProfilePersonalInfoCard } from "@/components/resident/profile/profile-personal-info-card"
import { ProfileProofsCard } from "@/components/resident/profile/profile-proofs-card"
import { ProfileAccountInfoCard } from "@/components/resident/profile/profile-account-info-card"
import { ProfileDangerZoneCard } from "@/components/resident/profile/profile-danger-zone-card"
import type { ProfileEditFormData } from "@/components/resident/profile/profile-types"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { calculateAge, mergeWithAutoStatuses } from "@/lib/resident"
import { uploadFileToCloudinary } from "@/lib/resident"
import { getRequiredDocuments, type UploadField } from "@/lib/resident"

const ProfileEditRequestDialog = dynamic(
  () => import("@/components/resident/profile/profile-edit-request-dialog").then((mod) => mod.ProfileEditRequestDialog),
  {
    loading: () => <Card className="p-6 mt-4">Loading form...</Card>,
  },
)

const ProfileCameraModal = dynamic(
  () => import("@/components/resident/profile/profile-camera-modal").then((mod) => mod.ProfileCameraModal),
  { loading: () => null },
)

const defaultFormData: ProfileEditFormData = {
  firstName: "",
  middleName: "",
  lastName: "",
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
  const searchParams = useSearchParams()
  const { 
    proofs, 
    verification, 
    addRequest, 
    requestProfileEdit, 
    requestReactivation, 
    isLoaded, 
    saveProfilePicture, 
    deleteAccount 
  } = useResidentData()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isOpeningDialog, setIsOpeningDialog] = useState(false)
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false)
  const [isRequestSubmitted, setIsRequestSubmitted] = useState(false)
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState<"setup" | "edit">("setup")
  const [profilePicture, setProfilePicture] = useState<string | null>(null)
  const [isUploadingPicture, setIsUploadingPicture] = useState(false)
  const [formData, setFormData] = useState<ProfileEditFormData>(defaultFormData)
  const [uploadedFiles, setUploadedFiles] = useState<Record<UploadField, File | null>>(defaultUploadState)
  const [uploadingFiles, setUploadingFiles] = useState<Record<UploadField, boolean>>(defaultUploadingState)
  
  // Finding #49: Reactivation request state
  const [isReactivateModalOpen, setIsReactivateModalOpen] = useState(searchParams?.get("action") === "reactivate")
  const [reactivationReason, setReactivationReason] = useState("")
  const [reactivationFile, setReactivationFile] = useState<File | null>(null)
  const [isSubmittingReactivation, setIsSubmittingReactivation] = useState(false)

  // Finding #43: Initialize from complete user.statuses array so voter category is preserved
  useEffect(() => {
    if (user && isDialogOpen) {
      let initialStatuses: string[] = []
      if (Array.isArray(user.statuses) && user.statuses.length > 0) {
        initialStatuses = [...user.statuses]
      } else if (user.status) {
        initialStatuses = [user.status]
      } else {
        initialStatuses = ["Adult"]
      }

      if ((user as any).isVoter && !initialStatuses.includes("Registered Voter")) {
        initialStatuses.push("Registered Voter")
      }

      setFormData({
        firstName: user.firstName || user.name.split(" ")[0] || "",
        middleName: user.middleInitial || "",
        lastName: user.lastName || user.name.split(" ").slice(1).join(" ") || "",
        dateOfBirth: user.dateOfBirth,
        contactNumber: user.contactNumber,
        email: user.email,
        address: user.address,
        statuses: initialStatuses,
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

  const handleSaveProfilePicture = async (base64Image: string) => {
    try {
      setIsUploadingPicture(true)
      // Convert base64 to File
      const arr = base64Image.split(",")
      const mime = arr[0].match(/:(.*?);/)![1]
      const bstr = atob(arr[1])
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      const file = new File([u8arr], "profile_picture.jpg", { type: mime })

      const url = await uploadFileToCloudinary(file)
      
      if (cameraMode === "edit") {
        handleFormChange("newProfilePicture", url)
      } else {
        await saveProfilePicture(url)
        showToastPreset("registrationCompleted")
      }
    } catch (err) {
      console.error(err)
      showToastPreset("uploadFailedSize")
    } finally {
      setIsUploadingPicture(false)
    }
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
    
    const oldFirstName = user.firstName || user.name.split(" ")[0] || ""
    if (oldFirstName !== formData.firstName) changes.push({ field: "First Name", oldValue: oldFirstName, newValue: formData.firstName })
    
    const oldMiddleName = user.middleInitial || ""
    if (oldMiddleName !== formData.middleName) changes.push({ field: "Middle Name", oldValue: oldMiddleName, newValue: formData.middleName })

    const oldLastName = user.lastName || user.name.split(" ").slice(1).join(" ") || ""
    if (oldLastName !== formData.lastName) changes.push({ field: "Last Name", oldValue: oldLastName, newValue: formData.lastName })

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

    if (formData.newProfilePicture && formData.newProfilePicture !== user.profilePicture) {
      changes.push({ field: "Profile Picture", oldValue: user.profilePicture || "None", newValue: formData.newProfilePicture })
    }

    // Finding #47: Validate required documents for added categories or unverified registration resubmission
    const addedStatuses = formData.statuses.filter((s) => !(user.statuses || []).includes(s))
    const requiredForAdded = getRequiredDocuments(addedStatuses, "profile")
    
    const mandatoryDocs = (!user.isVerified) 
      ? getRequiredDocuments(formData.statuses, "profile")
      : requiredForAdded

    for (const reqDoc of mandatoryDocs) {
      if (!uploadedFiles[reqDoc.field]) {
        alert(`Supporting document for "${reqDoc.title}" is required. Please upload it before submitting.`)
        setIsSubmittingRequest(false)
        return
      }
    }

    const hasUploadedFiles = Object.values(uploadedFiles).some(file => file !== null)

    if (changes.length === 0 && !hasUploadedFiles && !formData.newProfilePicture) {
      setIsSubmittingRequest(false)
      setIsDialogOpen(false)
      return
    }

    try {
      await requestProfileEdit(changes, formData.reason, uploadedFiles, formData.newProfilePicture)
      setIsDialogOpen(false)
      setIsRequestSubmitted(true)
      setUploadedFiles(defaultUploadState)
      showToastPreset("profileRequestSubmitted")
      
      setTimeout(() => {
        setIsRequestSubmitted(false)
      }, 3000)
    } catch (error) {
      console.error("Failed to submit profile edit:", error)
      showToastPreset("uploadFailedSize")
    } finally {
      setIsSubmittingRequest(false)
    }
  }

  const handleReactivateSubmit = async () => {
    if (!reactivationReason.trim()) {
      alert("Please provide a reason or note for account reactivation.")
      return
    }
    if (!reactivationFile) {
      alert("Please upload at least one valid ID or supporting document for reactivation.")
      return
    }
    try {
      setIsSubmittingReactivation(true)
      await requestReactivation(reactivationReason, { validId: reactivationFile })
      setIsReactivateModalOpen(false)
      setReactivationReason("")
      setReactivationFile(null)
      showToastPreset("profileRequestSubmitted")
    } catch (err) {
      console.error("Failed to submit reactivation:", err)
      alert("Failed to submit reactivation request. Please verify your document and try again.")
    } finally {
      setIsSubmittingReactivation(false)
    }
  }

  if (!isAuthorized || !user) {
    return null
  }

  const requiredDocuments = getRequiredDocuments(formData.statuses, "profile")

  return (
    <ResidentPageShell>
      <div className="space-y-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 mb-1 tracking-tight">My Profile</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">View and manage your personal information</p>
        </div>

        {/* Finding #49: Expired account notification banner */}
        {((user.status as string) === "Expired" || (user.accountExpiry && new Date(user.accountExpiry).getTime() < Date.now())) && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Account Expired / Inactive</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">Your account validity has lapsed. Submit a reactivation request with updated proof to renew your account.</p>
            </div>
            <Button 
              size="sm" 
              onClick={() => setIsReactivateModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            >
              Request Reactivation
            </Button>
          </div>
        )}

        <ProfileHeaderCard
          user={user}
          profilePicture={profilePicture}
          isUploadingPicture={isUploadingPicture}
          onSetupProfilePicture={() => {
            setCameraMode("setup")
            setIsCameraModalOpen(true)
          }}
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

        <ProfileAccountInfoCard user={user} />
        
        <ProfileDangerZoneCard onDeleteAccount={async () => {
          if (await deleteAccount()) {
            window.location.href = "/auth/login"
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
        onRequestCamera={() => {
          setCameraMode("edit")
          setIsCameraModalOpen(true)
        }}
        onSubmit={handleSubmitRequest}
      />

      <ProfileCameraModal 
        isOpen={isCameraModalOpen} 
        onClose={() => setIsCameraModalOpen(false)} 
        onSave={handleSaveProfilePicture} 
      />

      {/* Finding #49: Reactivation Modal */}
      <Dialog open={isReactivateModalOpen} onOpenChange={setIsReactivateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Account Reactivation</DialogTitle>
            <DialogDescription>
              Your account has expired. Please provide a reason and upload a current valid ID or proof of residency to request reactivation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Reason / Remarks
              </label>
              <Textarea
                placeholder="e.g. Account renewal with updated Barangay clearance or valid ID"
                value={reactivationReason}
                onChange={(e) => setReactivationReason(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Supporting Document (Valid ID or Proof)
              </label>
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  setReactivationFile(file)
                }}
              />
              {reactivationFile && (
                <p className="text-xs text-green-600 mt-1">Selected: {reactivationFile.name}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setIsReactivateModalOpen(false)}
              disabled={isSubmittingReactivation}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReactivateSubmit}
              disabled={isSubmittingReactivation || !reactivationFile || !reactivationReason.trim()}
              className="bg-[#0C2340] text-white hover:bg-[#153a66]"
            >
              {isSubmittingReactivation ? "Submitting..." : "Submit Reactivation Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </ResidentPageShell>
  )
}
