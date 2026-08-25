"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { useResidentData } from "@/hooks/use-resident-data"

type DocumentType = "funeral" | "pwd_adult" | "pwd_minor" | "indigency" | "residency" | "business" | "business_homeowner" | "business_contractor" | "osca"
type RequestFor = "myself" | "other"

interface DocumentOption {
  id: DocumentType
  icon: string
  title: string
  description: string
  fee: number
}

const documentTypes: DocumentOption[] = [
  { id: "funeral", icon: "🕊️", title: "Funeral Certification", description: "Certification for funeral assistance", fee: 0 },
  { id: "pwd_adult", icon: "♿", title: "PWD Certification (Adult)", description: "For PWD application purposes (Adult)", fee: 0 },
  { id: "pwd_minor", icon: "🚸", title: "PWD Certification (Minor)", description: "For PWD application purposes (Minor)", fee: 0 },
  { id: "indigency", icon: "📋", title: "Certificate of Indigency", description: "For medical or financial assistance", fee: 0 },
  { id: "residency", icon: "🏠", title: "Proof of Residency", description: "Proof of residence for various purposes", fee: 50 },
  { id: "business", icon: "🏢", title: "Business Clearance", description: "General business clearance or activity", fee: 150 },
  { id: "business_homeowner", icon: "🏡", title: "Business Clearance (Homeowner)", description: "Business clearance for homeowners", fee: 150 },
  { id: "business_contractor", icon: "👷", title: "Business Clearance (Contractor)", description: "Business clearance for contractors", fee: 150 },
  { id: "osca", icon: "👵", title: "OSCA Certification", description: "For Senior Citizen ID application", fee: 0 },
]

const purposeOptions: Record<DocumentType, string[]> = {
  funeral: ["Funeral Assistance", "Other"],
  pwd_adult: ["PWD Application", "Other"],
  pwd_minor: ["PWD Application", "Other"],
  indigency: ["Medical Assistance", "Financial Aid", "Educational Support", "Other"],
  residency: ["Bank Transaction", "Employment", "School Requirement", "Other"],
  business: ["Business Application", "Activity/Event", "Other"],
  business_homeowner: ["Business Application", "Other"],
  business_contractor: ["Contractor Registration", "Other"],
  osca: ["OSCA ID Application", "Other"],
}

function RequestDocumentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addRequest, systemConfig, requests } = useResidentData()
  const typeParam = searchParams.get("type") as DocumentType | null

  const [selectedType, setSelectedType] = useState<DocumentType | null>(typeParam || null)
  const [requestFor, setRequestFor] = useState<RequestFor>("myself")
  const [purpose, setPurpose] = useState("")
  const [customPurpose, setCustomPurpose] = useState("")
  const [additionalDetails, setAdditionalDetails] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [otherPersonName, setOtherPersonName] = useState("")
  const [otherPersonContact, setOtherPersonContact] = useState("")
  const [relationship, setRelationship] = useState("")
  const [authorizationLetter, setAuthorizationLetter] = useState<File | null>(null)
  const [isUploadingAuthorization, setIsUploadingAuthorization] = useState(false)
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

  const handleSubmit = async () => {
    if (isSubmittingRequest) return

    const finalPurpose = purpose === "Other" ? customPurpose : purpose
    const newErrors: Record<string, string> = {}

    if (!selectedType) {
      newErrors.selectedType = "Please select a document type"
    }

    if (!finalPurpose) {
      newErrors.purpose = "Please select a purpose"
    }

    if (requestFor === "other") {
      if (!otherPersonName) newErrors.otherPersonName = "Full name is required"
      if (!otherPersonContact) newErrors.otherPersonContact = "Contact number is required"
      else if (otherPersonContact.length !== 11) newErrors.otherPersonContact = "Contact number must be exactly 11 digits"
      if (!relationship) newErrors.relationship = "Relationship is required"
      if (!authorizationLetter) newErrors.authorizationLetter = "Authorization letter is required"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (selectedDoc && requestFor === "myself") {
      const hasDuplicatePending = requests.some(
        (r) => r.documentType === selectedDoc.title && r.status === "Pending" && r.requestFor !== "other"
      )
      if (hasDuplicatePending) {
        setErrors({ submitError: `You already have a pending request for ${selectedDoc.title}.` })
        return
      }
    }

    setErrors({})
    setIsSubmittingRequest(true)
    await delay(1000)

    if (selectedDoc) {
      addRequest({
        documentType: selectedDoc.title,
        purpose: finalPurpose,
        requestFor,
        ...(requestFor === "other" && {
          requestedByName: otherPersonName,
          requestedByContact: otherPersonContact,
          relationship,
          authorizationLetter: authorizationLetter?.name,
        }),
      })
    }

    showToastPreset("documentRequestSubmitted")
    router.push("/history")
  }

  // Inject dynamic fees from SystemConfig and filter by enabled types
  const baseDocTypes = documentTypes.map(doc => {
    const dynamicFee = systemConfig?.documentFees?.[doc.title]
    return {
      ...doc,
      fee: dynamicFee !== undefined ? dynamicFee : doc.fee
    }
  })

  // Append custom doc types from superadmin
  const customDocOptions: DocumentOption[] = (systemConfig?.customDocumentTypes || []).map((c: any) => ({
    id: c.id as DocumentType,
    icon: c.icon || "📄",
    title: c.name,
    description: "Custom document type",
    fee: systemConfig?.documentFees?.[c.name] ?? c.fee ?? 0,
  }))

  const allAvailableDocTypes = [...baseDocTypes, ...customDocOptions]

  const dynamicDocumentTypes = allAvailableDocTypes.map(doc => {
    let enabled = true;
    // If systemConfig is explicitly loaded and documentTypes is set, use it for filtering
    if (systemConfig && systemConfig.documentTypes !== undefined) {
      enabled = systemConfig.documentTypes.includes(doc.title)
    }
    return { ...doc, enabled }
  })

  const selectedDoc = dynamicDocumentTypes.find((doc) => doc.id === selectedType)

  return (
    <>
      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0C2340] mb-1 tracking-tight">Request Document</h1>
        <p className="text-sm text-slate-500">Select a document type and fill in the required details</p>
      </div>

      {/* Document Type Selection */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-[#0C2340] mb-4">Select Document Type</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {dynamicDocumentTypes.map((doc) => (
            <Card
              key={doc.id}
              onClick={() => doc.enabled && setSelectedType(doc.id)}
              className={`p-6 transition-all border-2 ${doc.enabled ? "cursor-pointer hover:shadow-md hover:border-slate-300" : "opacity-60 cursor-not-allowed bg-slate-50"} ${selectedType === doc.id
                ? "border-[#0C2340] bg-[#0C2340]/[0.02] shadow-sm"
                : "border-transparent"
                }`}
            >
              <div className="relative h-full flex flex-col">
                <div className="text-3xl mb-4" style={{ filter: doc.enabled ? 'none' : 'grayscale(100%)' }}>{doc.icon}</div>
                <p className="text-sm font-semibold text-[#0C2340] mb-1">{doc.title}</p>
                <p className="text-[11px] text-slate-600 leading-relaxed flex-grow">{doc.description}</p>
                {!doc.enabled && (
                  <div className="mt-4 self-start inline-flex items-center px-2 py-1 rounded bg-slate-200 text-slate-600 text-[10px] font-semibold">
                    Temporarily Unavailable
                  </div>
                )}
                {selectedType === doc.id && doc.enabled && (
                  <div className="absolute top-0 right-0 w-6 h-6 bg-[#0C2340] rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Request Form */}
      {selectedType && selectedDoc && (
        <Card className="p-6 shadow-sm">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">{selectedDoc.title} Request</h2>
              <p className="text-sm text-slate-600">Please fill in the required information below</p>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={isSubmittingRequest}
              className="w-64 h-12 bg-[#0C2340] hover:bg-[#1a3a5c] text-sm font-semibold"
            >
              {isSubmittingRequest ? "Processing..." : (paymentMethod === "gcash" && selectedDoc.fee > 0) ? `Pay ₱${selectedDoc.fee.toFixed(2)} & Submit` : "Submit Request"}
            </Button>
          </div>

          <div className="space-y-6">
            {errors.submitError && (
              <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm border border-red-200">
                {errors.submitError}
              </div>
            )}
            
            {/* Payment Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-700">Document Fee</h3>
                <p className="text-xs text-slate-500 mt-0.5">Standard processing fee for {selectedDoc.title}</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-[#0C2340]">
                  {selectedDoc.fee === 0 ? "FREE" : `₱${selectedDoc.fee.toFixed(2)}`}
                </span>
              </div>
            </div>
            {/* Who is this document for? */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3">Who is this document for? *</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="requestFor"
                    value="myself"
                    checked={requestFor === "myself"}
                    onChange={() => setRequestFor("myself")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">For myself</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="requestFor"
                    value="other"
                    checked={requestFor === "other"}
                    onChange={() => setRequestFor("other")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">For someone else</span>
                </label>
              </div>
            </div>

            {/* Person Information */}
            {requestFor === "other" && (
              <div className="space-y-4 p-4 bg-slate-50 border border-slate-200 rounded-md">
                <h3 className="text-sm font-bold text-slate-700">Person Information</h3>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name *</label>
                  <Input
                    type="text"
                    value={otherPersonName}
                    onChange={(e) => {
                      setOtherPersonName(e.target.value)
                      setErrors((prev) => {
                        const c = { ...prev }
                        delete c.otherPersonName
                        return c
                      })
                    }}
                    placeholder="Enter full name"
                    className="w-full h-12 bg-white border-slate-300"
                  />
                  {errors.otherPersonName && <p className="text-xs text-red-600 mt-1">{errors.otherPersonName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Contact Number *</label>
                  <Input
                    type="tel"
                    value={otherPersonContact}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "")
                      setOtherPersonContact(value)
                      setErrors((prev) => {
                        const c = { ...prev }
                        delete c.otherPersonContact
                        return c
                      })
                    }}
                    placeholder="Enter contact number"
                    className="w-full h-12 bg-white border-slate-300"
                  />
                  {errors.otherPersonContact && <p className="text-xs text-red-600 mt-1">{errors.otherPersonContact}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Your Relationship *</label>
                  <Select
                    value={relationship}
                    onValueChange={(v) => {
                      setRelationship(v)
                      setErrors((prev) => {
                        const c = { ...prev }
                        delete c.relationship
                        return c
                      })
                    }}
                  >
                    <SelectTrigger className="w-full h-12 bg-white border-slate-300">
                      <SelectValue placeholder="Select relationship" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="parent">Parent</SelectItem>
                      <SelectItem value="sibling">Sibling</SelectItem>
                      <SelectItem value="spouse">Spouse</SelectItem>
                      <SelectItem value="child">Child</SelectItem>
                      <SelectItem value="guardian">Guardian</SelectItem>
                      <SelectItem value="relative">Relative</SelectItem>
                      <SelectItem value="authorized_representative">Authorized Representative</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.relationship && <p className="text-xs text-red-600 mt-1">{errors.relationship}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Authorization Letter *</label>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-12 flex items-center px-4 bg-white border border-slate-300 rounded-md">
                      <span className={`truncate text-sm ${authorizationLetter ? "text-slate-700" : "text-slate-400"}`}>
                        {authorizationLetter ? authorizationLetter.name : "No file chosen"}
                      </span>
                    </div>

                    <label className="inline-flex items-center h-12 px-4 bg-slate-900 text-white rounded-md cursor-pointer hover:bg-slate-800">
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={async (e) => {
                          const file = e.target.files?.[0] || null
                          setIsUploadingAuthorization(true)
                          await delay(500)

                          if (file && file.size > MAX_FILE_SIZE) {
                            setErrors((prev) => ({ ...prev, authorizationLetter: "File size exceeds 5MB" }))
                            setAuthorizationLetter(null)
                          } else {
                            setAuthorizationLetter(file)
                            setErrors((prev) => {
                              const c = { ...prev }
                              delete c.authorizationLetter
                              return c
                            })
                          }

                          setIsUploadingAuthorization(false)
                        }}
                        className="sr-only"
                        aria-label="Upload authorization letter"
                      />
                      <span className="text-sm font-semibold">{isUploadingAuthorization ? "Uploading..." : "Choose file"}</span>
                    </label>

                    {authorizationLetter && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthorizationLetter(null)
                          setErrors((prev) => {
                            const c = { ...prev }
                            delete c.authorizationLetter
                            return c
                          })
                        }}
                        className="h-10 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 mt-1">Upload a signed authorization letter (PDF, JPG, PNG). Max size: 5MB.</p>
                  {errors.authorizationLetter && <p className="text-xs text-red-600 mt-1">{errors.authorizationLetter}</p>}
                </div>
              </div>
            )}

            {/* Purpose Field */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Purpose of Request *</label>
              <Select value={purpose} onValueChange={(v) => {
                setPurpose(v)
                setErrors((prev) => {
                  const c = { ...prev }
                  delete c.purpose
                  return c
                })
              }}>
                <SelectTrigger className="w-full h-12 bg-white border-slate-300">
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>
                  {purposeOptions[selectedType].map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.purpose && <p className="text-xs text-red-600 mt-1">{errors.purpose}</p>}
            </div>

            {purpose === "Other" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Other Purpose (specify) *</label>
                <Input
                  type="text"
                  value={customPurpose}
                  onChange={(e) => setCustomPurpose(e.target.value)}
                  placeholder="Enter your custom purpose..."
                  className="w-full h-12 bg-white border-slate-300"
                />
              </div>
            )}

            {/* Additional Details */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Additional Details (Optional)</label>
              <Textarea
                value={additionalDetails}
                onChange={(e) => setAdditionalDetails(e.target.value)}
                placeholder="Provide any additional information about your request..."
                className="w-full min-h-24 bg-white border-slate-300"
              />
            </div>

            {/* Payment Method */}
            {selectedDoc && selectedDoc.fee > 0 && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-3">Payment Method *</label>
                <div className="grid grid-cols-2 gap-4">
                  <label className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${paymentMethod === "cash" ? "border-[#0C2340] bg-[#0C2340]/[0.02]" : "border-slate-200 hover:border-slate-300"}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash"
                      checked={paymentMethod === "cash"}
                      onChange={() => setPaymentMethod("cash")}
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="block text-sm font-semibold text-slate-900">Cash on Pick-up</span>
                      <span className="block text-xs text-slate-500 mt-0.5">Pay at the Barangay Hall</span>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${paymentMethod === "gcash" ? "border-[#0C2340] bg-[#0C2340]/[0.02]" : "border-slate-200 hover:border-slate-300"}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="gcash"
                      checked={paymentMethod === "gcash"}
                      onChange={() => setPaymentMethod("gcash")}
                      className="w-4 h-4"
                    />
                    <div>
                      <span className="block text-sm font-semibold text-slate-900">GCash</span>
                      <span className="block text-xs text-slate-500 mt-0.5">Pay now via GCash</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Processing Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-xs text-blue-900">
                ℹ Processing time: 1-3 business days. You will receive a notification when your document is ready.
              </p>
            </div>
          </div>
        </Card>
      )}
    </>
  )
}

export default function RequestDocumentPage() {
  const { isAuthorized, user } = useAuthGuard()
  if (!isAuthorized) return null

  if (user?.status === "Expired") {
    return (
      <ResidentPageShell>
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center max-w-md mx-auto">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 border-8 border-red-50/50">
            <span className="text-red-500 text-3xl">🔒</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0C2340] mb-3">Account Deactivated</h1>
          <p className="text-sm text-slate-600 mb-8 leading-relaxed">
            Your resident account is currently deactivated. You cannot request new documents until your account is reactivated by the barangay administration.
          </p>
          <a href="/profile" className="w-full h-12 flex items-center justify-center bg-[#0C2340] hover:bg-[#1a3a5c] text-white rounded-lg font-semibold transition-colors shadow-sm">
            Go to Profile to Request Reactivation
          </a>
        </div>
      </ResidentPageShell>
    )
  }

  if (user?.isVerified === false) {
    return (
      <ResidentPageShell>
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center max-w-md mx-auto">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6 border-8 border-amber-50/50">
            <span className="text-amber-500 text-3xl">⏳</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0C2340] mb-3">Account Under Review</h1>
          <p className="text-sm text-slate-600 mb-8 leading-relaxed">
            Your registration is currently being verified by the barangay administration. You will be able to request documents once your account is fully verified.
          </p>
          <a href="/dashboard" className="w-full h-12 flex items-center justify-center bg-[#0C2340] hover:bg-[#1a3a5c] text-white rounded-lg font-semibold transition-colors shadow-sm">
            Return to Dashboard
          </a>
        </div>
      </ResidentPageShell>
    )
  }

  return (
    <ResidentPageShell>
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading request form...</div>}>
        <RequestDocumentContent />
      </Suspense>
    </ResidentPageShell>
  )
}
