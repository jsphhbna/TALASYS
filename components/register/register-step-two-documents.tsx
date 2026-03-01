import { DocumentUploadCard } from "@/components/forms/document-upload-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { RequiredDocumentConfig, UploadField } from "@/lib/resident-documents"

interface RegisterStepTwoDocumentsProps {
  requiredDocuments: RequiredDocumentConfig[]
  uploadedFiles: Record<UploadField, File | null>
  uploadingFiles: Record<UploadField, boolean>
  termsAccepted: boolean
  onTermsChange: (checked: boolean) => void
  onFileUpload: (field: UploadField, file: File | null) => void
  canComplete: boolean
  isCompleting: boolean
  onComplete: () => void
  onBack: () => void
}

export function RegisterStepTwoDocuments({
  requiredDocuments,
  uploadedFiles,
  uploadingFiles,
  termsAccepted,
  onTermsChange,
  onFileUpload,
  canComplete,
  isCompleting,
  onComplete,
  onBack,
}: RegisterStepTwoDocumentsProps) {
  return (
    <div className="space-y-4">
      {requiredDocuments.map((doc, index) => (
        <DocumentUploadCard
          key={doc.field}
          title={`${index + 1}. ${doc.title} *`}
          description={doc.description}
          file={uploadedFiles[doc.field]}
          isLoading={uploadingFiles[doc.field]}
          inputId={doc.field}
          onFileChange={(file) => onFileUpload(doc.field, file)}
          theme={doc.theme}
          emptyHint="Drag and drop or click to upload (PDF, JPG, PNG - Max 5MB)"
        />
      ))}

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-6">
        <div className="flex items-start gap-2">
          <Checkbox checked={termsAccepted} onCheckedChange={(checked) => onTermsChange(checked as boolean)} />
          <label className="text-xs text-slate-600 cursor-pointer">
            I agree to the terms and conditions and certify that all information provided is true and accurate.
          </label>
        </div>
      </div>

      <Button
        onClick={onComplete}
        disabled={!canComplete || isCompleting}
        className="w-full bg-[#0C2340] hover:bg-[#1a3a5c] h-11 text-sm font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed"
      >
        {isCompleting ? "Submitting Registration..." : "Complete Registration"}
      </Button>

      <button onClick={onBack} className="w-full text-sm text-slate-600 hover:text-slate-900" disabled={isCompleting}>
        ← Back to Personal Information
      </button>
    </div>
  )
}
