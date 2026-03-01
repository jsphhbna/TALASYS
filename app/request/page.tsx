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

type DocumentType = "clearance" | "indigency" | "residency"
type RequestFor = "myself" | "other"

interface DocumentOption {
  id: DocumentType
  icon: string
  title: string
  description: string
}

const documentTypes: DocumentOption[] = [
  {
    id: "clearance",
    icon: "📄",
    title: "Barangay Clearance",
    description: "For employment, business, or legal purposes",
  },
  {
    id: "indigency",
    icon: "📋",
    title: "Certificate of Indigency",
    description: "For medical or financial assistance programs",
  },
  {
    id: "residency",
    icon: "🏠",
    title: "Certificate of Residency",
    description: "Proof of residence for banking or government use",
  },
]

const purposeOptions: Record<DocumentType, string[]> = {
  clearance: [
    "Employment / Job Application",
    "Business Permit",
    "Bank Transaction / Loan",
    "Travel / Visa Application",
    "Other",
  ],
  indigency: ["Medical Assistance", "Financial Aid", "Educational Support", "Housing Program", "Other"],
  residency: ["Bank Loan", "Business Registration", "Government Transaction", "School Enrollment", "Other"],
}

function RequestDocumentContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { addRequest } = useResidentData()
  const typeParam = searchParams.get("type") as DocumentType | null

  const [selectedType, setSelectedType] = useState<DocumentType | null>(typeParam || null)
  const [requestFor, setRequestFor] = useState<RequestFor>("myself")
  const [purpose, setPurpose] = useState("")
  const [customPurpose, setCustomPurpose] = useState("")
  const [additionalDetails, setAdditionalDetails] = useState("")
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
      if (!relationship) newErrors.relationship = "Relationship is required"
      if (!authorizationLetter) newErrors.authorizationLetter = "Authorization letter is required"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setIsSubmittingRequest(true)
    await delay(1000)

    if (selectedDoc) {
      addRequest({
        documentType: selectedDoc.title,
        purpose: finalPurpose,
      })
    }

    showToastPreset("documentRequestSubmitted")
    router.push("/history")
  }

  const selectedDoc = documentTypes.find((doc) => doc.id === selectedType)

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
          {documentTypes.map((doc) => (
            <Card
              key={doc.id}
              onClick={() => setSelectedType(doc.id)}
              className={`p-6 cursor-pointer transition-all border-2 hover:shadow-md ${selectedType === doc.id
                ? "border-[#0C2340] bg-[#0C2340]/[0.02] shadow-sm"
                : "border-transparent hover:border-slate-200"
                }`}
            >
              <div className="relative">
                <div className="text-3xl mb-4">{doc.icon}</div>
                <p className="text-sm font-semibold text-[#0C2340] mb-1">{doc.title}</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">{doc.description}</p>
                {selectedType === doc.id && (
                  <div className="absolute top-3 right-3 w-6 h-6 bg-[#0C2340] rounded-full flex items-center justify-center">
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
              {isSubmittingRequest ? "Submitting Request..." : "Submit Request"}
            </Button>
          </div>

          <div className="space-y-6">
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
  const { isAuthorized } = useAuthGuard()

  if (!isAuthorized) {
    return null
  }

  return (
    <ResidentPageShell>
      <Suspense fallback={null}>
        <RequestDocumentContent />
      </Suspense>
    </ResidentPageShell>
  )
}
