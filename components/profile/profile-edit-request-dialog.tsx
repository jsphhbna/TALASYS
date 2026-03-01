import { DocumentUploadCard } from "@/components/forms/document-upload-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { RequiredDocumentConfig, UploadField } from "@/lib/resident-documents"
import type { ProfileEditFormData } from "@/components/profile/profile-types"

interface ProfileEditRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  formData: ProfileEditFormData
  requiredDocuments: RequiredDocumentConfig[]
  uploadedFiles: Record<UploadField, File | null>
  uploadingFiles: Record<UploadField, boolean>
  isSubmitting: boolean
  onFormChange: (field: keyof ProfileEditFormData, value: string) => void
  onStatusToggle: (status: string) => void
  onFileUpload: (field: UploadField, file: File | null) => void
  onSubmit: () => void
}

export function ProfileEditRequestDialog({
  open,
  onOpenChange,
  formData,
  requiredDocuments,
  uploadedFiles,
  uploadingFiles,
  isSubmitting,
  onFormChange,
  onStatusToggle,
  onFileUpload,
  onSubmit,
}: ProfileEditRequestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Request Profile Edit</DialogTitle>
          <DialogDescription>
            Review your information and specify what you'd like to change. An administrator will review your request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
            <Input id="fullName" value={formData.fullName} onChange={(e) => onFormChange("fullName", e.target.value)} className="w-full" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth" className="text-sm font-medium">Date of Birth</Label>
            <Input id="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={(e) => onFormChange("dateOfBirth", e.target.value)} className="w-full" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactNumber" className="text-sm font-medium">Contact Number</Label>
            <Input id="contactNumber" value={formData.contactNumber} onChange={(e) => onFormChange("contactNumber", e.target.value)} className="w-full" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
            <Input id="email" type="email" value={formData.email} onChange={(e) => onFormChange("email", e.target.value)} className="w-full" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address" className="text-sm font-medium">Complete Address</Label>
            <Textarea id="address" value={formData.address} onChange={(e) => onFormChange("address", e.target.value)} className="w-full min-h-[80px]" />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Resident Status (Select all that apply)</Label>
            <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
              <div className="flex items-start gap-3 opacity-50">
                <Checkbox checked={formData.statuses.includes("Underage")} disabled={true} />
                <div className="flex-1">
                  <label className="text-sm text-slate-500 cursor-not-allowed">Underage (Under 18) - Auto-calculated from date of birth</label>
                  <p className="text-[11px] text-slate-400">(Requires: Parent's Valid ID)</p>
                </div>
              </div>
              <div className="flex items-start gap-3 opacity-50">
                <Checkbox checked={formData.statuses.includes("Adult")} disabled={true} />
                <div className="flex-1">
                  <label className="text-sm text-slate-500 cursor-not-allowed">Adult (18-59) - Auto-calculated from date of birth</label>
                  <p className="text-[11px] text-slate-400">(Requires: Valid Government ID)</p>
                </div>
              </div>
              <div className="flex items-start gap-3 opacity-50">
                <Checkbox checked={formData.statuses.includes("Senior Citizen")} disabled={true} />
                <div className="flex-1">
                  <label className="text-sm text-slate-500 cursor-not-allowed">Senior Citizen (60+) - Auto-calculated from date of birth</label>
                  <p className="text-[11px] text-slate-400">(Requires: Senior Citizen ID)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox checked={formData.statuses.includes("Registered Voter")} onCheckedChange={() => onStatusToggle("Registered Voter")} />
                <div className="flex-1">
                  <label className="text-sm text-slate-700 cursor-pointer">Registered Voter</label>
                  <p className="text-[11px] text-slate-500">(Requires: Voter's ID / Cert)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Required Documents (if changing status)</Label>
            {requiredDocuments.map((doc) => (
              <DocumentUploadCard
                key={doc.field}
                title={doc.title}
                description={doc.description}
                file={uploadedFiles[doc.field]}
                isLoading={uploadingFiles[doc.field]}
                inputId={`profile-${doc.field}`}
                onFileChange={(file) => onFileUpload(doc.field, file)}
                theme={doc.theme}
                emptyHint="Click to upload (PDF, JPG, PNG - Max 5MB)"
              />
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium">
              Reason for Edit Request <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Please explain what information needs to be changed and why..."
              value={formData.reason}
              onChange={(e) => onFormChange("reason", e.target.value)}
              className="w-full min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={!formData.reason.trim() || isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? "Submitting Request..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
