import { useState } from "react"
import { DocumentUploadCard } from "@/components/forms/document-upload-card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
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
  const [showTerms, setShowTerms] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)

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
            I agree to the{" "}
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowTerms(true); }} className="text-[#0C2340] font-semibold hover:underline">
              Terms and Conditions
            </button>
            {" "}and{" "}
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPrivacy(true); }} className="text-[#0C2340] font-semibold hover:underline">
              Privacy Policy
            </button>
            , and certify that all information provided is true and accurate.
          </label>
        </div>

        <Dialog open={showTerms} onOpenChange={setShowTerms}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Terms of Service</DialogTitle>
              <DialogDescription>Please read our terms of service carefully.</DialogDescription>
            </DialogHeader>
            <div className="prose prose-sm max-w-none text-slate-600">
              <h2 className="text-lg font-semibold text-[#0C2340] mt-4 mb-2">1. Acceptance of Terms</h2>
              <p className="text-sm text-slate-600">By registering for and using TALASYS (Barangay Digital Services Platform), you agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.</p>
              <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">2. Account Registration</h2>
              <p className="text-sm text-slate-600">You must provide accurate and complete information during registration. You are responsible for maintaining the confidentiality of your account credentials.</p>
              <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">3. Use of Services</h2>
              <p className="text-sm text-slate-600">The platform is intended for legitimate barangay residents to request official documents and manage their resident profiles. Any misuse or provision of false information may result in account suspension.</p>
              <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">4. Account Validity</h2>
              <p className="text-sm text-slate-600">Resident accounts are valid for a period of two (2) years from registration. Accounts must be reactivated upon expiry by re-submitting required documents for verification.</p>
              <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">5. Document Requests</h2>
              <p className="text-sm text-slate-600">Processing times may vary. The barangay reserves the right to reject any request that does not meet the required criteria. Fees may apply as determined by the barangay.</p>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showPrivacy} onOpenChange={setShowPrivacy}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Privacy Policy</DialogTitle>
              <DialogDescription>How we collect and protect your information.</DialogDescription>
            </DialogHeader>
            <div className="prose prose-sm max-w-none text-slate-600">
              <h2 className="text-lg font-semibold text-[#0C2340] mt-4 mb-2">1. Information We Collect</h2>
              <p className="text-sm text-slate-600">We collect personal information such as your name, date of birth, address, and contact details during registration. We also collect official documents (e.g., ID, Proof of Address) to verify your residency status.</p>
              <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">2. How We Use Your Information</h2>
              <p className="text-sm text-slate-600">Your information is used strictly for official barangay purposes, including processing document requests (clearances, certificates) and maintaining an accurate resident registry.</p>
              <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">3. Data Protection and Security</h2>
              <p className="text-sm text-slate-600">We implement strict security measures to protect your personal data from unauthorized access. Your uploaded documents and personal information are encrypted and securely stored.</p>
              <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">4. Data Sharing</h2>
              <p className="text-sm text-slate-600">We do not sell or share your personal information with third parties. Your data is only accessible to authorized barangay officials for administrative purposes.</p>
              <h2 className="text-lg font-semibold text-[#0C2340] mt-6 mb-2">5. Your Rights</h2>
              <p className="text-sm text-slate-600">You have the right to access, update, and request correction of your personal information through your resident dashboard. If you wish to delete your account, please contact the barangay hall directly.</p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Button
        onClick={onComplete}
        disabled={!canComplete || isCompleting}
        className="w-full bg-[#0C2340] hover:bg-[#1a3a5c] h-11 text-sm font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed"
      >
        {isCompleting ? "Saving Documents..." : "Complete Registration"}
      </Button>

      <button onClick={onBack} className="w-full text-sm text-slate-600 hover:text-slate-900" disabled={isCompleting}>
        ← Back to Personal Information
      </button>
    </div>
  )
}
