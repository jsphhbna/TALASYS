"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/admin"
import { useSuperAdminData } from "@/hooks/superadmin"
import { Loader2, FileText } from "lucide-react"
import { toPng } from "html-to-image"
import jsPDF from "jspdf"
import { useAuth } from "@/lib/auth"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { escapeHtml } from "@/lib/security/sanitize"
import { canManageRequestsRole } from "@/lib/auth/auth-types"
import { useSecureMediaUrl } from "@/components/media/secure-image"
import {
  BUILT_IN_DOCUMENT_TYPES,
  DEFAULT_ENABLED_DOCUMENT_TYPES,
  DEFAULT_HEADERS,
  DEFAULT_TEMPLATES,
  resolveDocumentType,
  resolveDocumentSubject,
  renderDocumentTemplate,
  formatTemplateParagraphs,
} from "@/lib/document-catalog"

function GenerateDocumentsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { residents: allResidents, documentRequests: adminDocumentRequests, updateRequestStatus, updateRequestGenerated, confirmBeneficiaryDetails } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  const { user } = useAuth()
  const isAuthorized = canManageRequestsRole(user?.role)
  const { url: captainSignatureUrl, loading: captainSignatureLoading, error: captainSignatureError } = useSecureMediaUrl(systemConfig?.captainSignatureUrl)
  const { url: secretarySignatureUrl, loading: secretarySignatureLoading, error: secretarySignatureError } = useSecureMediaUrl(systemConfig?.secretarySignatureUrl)
  const requiredSignaturesLoading = (!!systemConfig?.captainSignatureUrl && captainSignatureLoading) || (!!systemConfig?.secretarySignatureUrl && secretarySignatureLoading)
  const requiredSignatureError = captainSignatureError || secretarySignatureError ||
    (!!systemConfig?.captainSignatureUrl && !captainSignatureUrl ? "Captain signature is unavailable." : null) ||
    (!!systemConfig?.secretarySignatureUrl && !secretarySignatureUrl ? "Secretary signature is unavailable." : null)

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedResident, setSelectedResident] = useState<any>(null)
  const [selectedDocType, setSelectedDocType] = useState("")
  const [customDocTitle, setCustomDocTitle] = useState("C E R T I F I C A T I O N")
  const [isGenerating, setIsGenerating] = useState(false)
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null)
  const [beneficiaryAddressOverride, setBeneficiaryAddressOverride] = useState<string>("")
  const [beneficiaryAgeOverride, setBeneficiaryAgeOverride] = useState<string>("")
  const [isConfirmingBeneficiary, setIsConfirmingBeneficiary] = useState(false)
  const [lastDownload, setLastDownload] = useState(0)
  const editorRef = useRef<HTMLDivElement>(null)
  const loadedRequestIdRef = useRef<string | null>(null)
  const isEditingBeneficiaryRef = useRef(false)

  useEffect(() => {
    const requestId = searchParams.get("requestId")
    if (requestId && allResidents.length > 0 && adminDocumentRequests.length > 0) {
      const req = adminDocumentRequests.find(r => r.id === requestId)
      if (req) {
        setProcessingRequestId(req.id)
        const res = allResidents.find(r => r.id === req.residentId)
        if (res) {
          setSelectedResident(res)
          setSearchQuery(res.name)
        }

        const resolved = resolveDocumentType(req.documentType, systemConfig?.customDocumentTypes)
        if (resolved) {
          setSelectedDocType(resolved.id)
          setCustomDocTitle(resolved.header)
        } else {
          setSelectedDocType("custom_blank")
          setCustomDocTitle("C E R T I F I C A T I O N")
        }

        if (req.requestFor === "other") {
          const isReprint = Boolean(req.hasGenerated && req.generatedAt)
          const initialAddress = isReprint && req.issuanceBeneficiaryAddress
            ? req.issuanceBeneficiaryAddress
            : (req.confirmedBeneficiaryAddress || req.representedAddress || "")
          const initialAge = isReprint && req.issuanceBeneficiaryAge !== undefined && req.issuanceBeneficiaryAge !== null
            ? String(req.issuanceBeneficiaryAge)
            : (req.confirmedBeneficiaryAge !== undefined
                ? String(req.confirmedBeneficiaryAge)
                : (req.representedAge !== undefined ? String(req.representedAge) : ""))

          if (loadedRequestIdRef.current !== req.id) {
            loadedRequestIdRef.current = req.id
            isEditingBeneficiaryRef.current = false
            setBeneficiaryAddressOverride(initialAddress)
            setBeneficiaryAgeOverride(initialAge)
          } else if (!isEditingBeneficiaryRef.current) {
            setBeneficiaryAddressOverride(initialAddress)
            setBeneficiaryAgeOverride(initialAge)
          }
        }
      }
    }
  }, [searchParams, allResidents, adminDocumentRequests, systemConfig])

  const getTemplateContent = () => {
    if (!selectedResident || !selectedDocType) return ""
    const templates = systemConfig?.templates || {}
    let template = templates[selectedDocType] || DEFAULT_TEMPLATES[selectedDocType]

    if (!template) {
      const customDoc = (systemConfig?.customDocumentTypes || []).find((c: any) => c.id === selectedDocType)
      if (customDoc?.template) template = customDoc.template
    }

    if (!template && selectedDocType === "custom_blank") {
      template = "This is to certify that {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\n[TYPE YOUR CUSTOM CONTENT HERE]\n\nCity of Manila, {{date_issued}}."
    }

    if (!template) {
      template = "This is to certify that {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for {{purpose}} purposes.\n\nCity of Manila, {{date_issued}}."
    }

    const resolvedType = resolveDocumentType(selectedDocType, systemConfig?.customDocumentTypes)
    const docLabel = resolvedType?.label || selectedDocType
    const matchedReq = processingRequestId
      ? adminDocumentRequests.find(r => r.id === processingRequestId)
      : adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))

    const subject = resolveDocumentSubject(matchedReq, selectedResident, {
      address: beneficiaryAddressOverride.trim() || undefined,
      age: beneficiaryAgeOverride.trim() || undefined,
    })
    const purpose = matchedReq?.purpose || "_____________"

    // V02: On reprint of an already-issued document, pass original generatedAt timestamp so date_issued reproduces original issuance faithfully
    const issuanceDate = matchedReq?.generatedAt ? new Date(matchedReq.generatedAt) : undefined

    return renderDocumentTemplate(template, {
      name: subject.subjectName,
      address: subject.address,
      age: subject.age,
      civilStatus: subject.civilStatus,
      purpose,
      barangayName: systemConfig?.barangayName,
      date: issuanceDate,
    })
  }

  const isInactiveResident = (status?: string | null) => {
    if (!status) return false
    const s = status.trim().toLowerCase()
    return s === "locked" || s === "deleted" || s === "deleted by resident"
  }

  const searchResults = searchQuery.length > 1
    ? allResidents.filter(r => !isInactiveResident(r.status) && !isInactiveResident((r as any).accountStatus) && r.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
    : []

  const builtInDocTypes = BUILT_IN_DOCUMENT_TYPES.map(d => ({
    id: d.id,
    label: d.label,
    icon: d.icon,
    desc: d.description,
    header: d.header,
    enabled: true,
  }))

  const customDocTypes = (systemConfig?.customDocumentTypes || []).map((c: any) => ({
    id: c.id,
    label: c.name,
    icon: c.icon || "📄",
    desc: `Custom document type`,
    header: c.header,
    enabled: true
  }))

  const allDocTypes = [
    ...builtInDocTypes,
    ...customDocTypes
  ]

  const enabledDocTypes = systemConfig?.documentTypes || DEFAULT_ENABLED_DOCUMENT_TYPES
  const docTypes = allDocTypes.map(doc => ({
    ...doc,
    enabled: enabledDocTypes.includes(doc.label)
  }))

  const selectedDocConfig = docTypes.find(d => d.id === selectedDocType)

  useEffect(() => {
    if (editorRef.current && selectedResident && selectedDocType) {
      const resolved = getTemplateContent()
      editorRef.current.innerHTML = formatTemplateParagraphs(resolved)
    }
  }, [selectedResident, selectedDocType, systemConfig, beneficiaryAddressOverride, beneficiaryAgeOverride])

  return (
    <AdminPageShell>
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Generate Documents</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Create and print official barangay documents</p>
        </div>
        {processingRequestId && (
          <Button variant="outline" onClick={() => router.push("/admin/requests")} className="h-9 px-4 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
            ← Back to Queue
          </Button>
        )}
      </div>

      {!isAuthorized ? (
        <Card className="p-8 text-center max-w-xl mx-auto my-12 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50">
          <FileText className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Unauthorized Document Generation</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your role (<span className="font-semibold">{user?.role || "Unknown"}</span>) does not have permission to generate official documents. This operational capability is restricted to Super Admin, Full Access, and Document Processing administrators.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-6">
        {/* Search + Doc Type Selection */}
        <div className="col-span-5 space-y-4">
          <Card className="p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-3">1. Search Resident</h3>
            <input
              type="text"
              placeholder="Type resident name..."
              value={searchQuery}
              disabled={!!processingRequestId}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectedResident(null) }}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0C2340] disabled:bg-slate-100 disabled:dark:bg-slate-800 disabled:opacity-70 disabled:cursor-not-allowed"
            />
            {searchResults.length > 0 && !processingRequestId && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100">
                {searchResults.map((r) => (
                  <button key={r.id} onClick={() => { setSelectedResident(r); setSearchQuery(r.name) }} className={`w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:bg-slate-950 ${selectedResident?.id === r.id ? "bg-[#0C2340]/[0.04] dark:bg-slate-800/[0.04]" : ""}`}>
                    <p className="text-xs font-semibold text-[#0C2340] dark:text-blue-50">{r.name}</p>
                    <p className="text-2xs text-slate-400">{r.categories.join(", ")} • {r.status}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-3">2. Select Document Type</h3>
            <div className="space-y-2">
              {docTypes.map((doc) => (
                <button
                  key={doc.id}
                  disabled={!!processingRequestId}
                  onClick={() => doc.enabled && setSelectedDocType(doc.id)}
                  className={`w-full p-3 rounded-lg text-left transition-colors border
                  ${doc.enabled && !processingRequestId ? 'hover:bg-slate-50 dark:bg-slate-950' : ''}
                  ${!doc.enabled || processingRequestId ? 'opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-950' : ''}
                  ${selectedDocType === doc.id ? "border-[#0C2340] bg-[#0C2340]/[0.04] dark:bg-slate-800/[0.04]" : "border-slate-200 dark:border-slate-700"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg" style={{ filter: doc.enabled ? 'none' : 'grayscale(100%)' }}>{doc.icon}</span>
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                          <p className="text-xs font-semibold text-[#0C2340] dark:text-blue-50">{doc.label}</p>
                          {!doc.enabled && <span className="text-[9px] font-semibold bg-slate-200 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">Disabled</span>}
                      </div>
                      <p className="text-2xs text-slate-400 mt-0.5">{doc.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* PDF Preview */}
        <Card className="col-span-7 shadow-sm p-0 gap-0 overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Document Preview</h3>
          </div>
          <div className="p-6">
            {selectedResident && selectedDocType ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-2xs text-slate-500 dark:text-slate-400 font-semibold mr-2 uppercase tracking-wider">Edit Document:</span>
                  <button
                    onMouseDown={e => { e.preventDefault(); document.execCommand('bold') }}
                    className="px-2.5 py-1 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 shadow-sm"
                  >B</button>
                  <button
                    onMouseDown={e => { e.preventDefault(); document.execCommand('italic') }}
                    className="px-2.5 py-1 text-xs italic bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 shadow-sm"
                  >I</button>
                  <button
                    onMouseDown={e => {
                      e.preventDefault()
                      if (!editorRef.current) return
                      const resolved = getTemplateContent()
                      editorRef.current.innerHTML = formatTemplateParagraphs(resolved)
                    }}
                    className="px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 shadow-sm ml-1"
                  >↺ Reset</button>

                </div>

                {(() => {
                  const resolvedType = resolveDocumentType(selectedDocType, systemConfig?.customDocumentTypes)
                  const docLabel = resolvedType?.label || selectedDocType
                  const matchedReq = processingRequestId
                    ? adminDocumentRequests.find(r => r.id === processingRequestId)
                    : adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))

                  if (matchedReq?.requestFor === "other") {
                    const subject = resolveDocumentSubject(matchedReq, selectedResident, {
                      address: beneficiaryAddressOverride.trim() || undefined,
                      age: beneficiaryAgeOverride.trim() || undefined,
                    })
                    return (
                      <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg text-xs text-purple-900 dark:text-purple-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold">Representation Request:</span> Document requested by <span className="font-semibold">{selectedResident.name}</span> (Requester) on behalf of <span className="font-semibold text-purple-700 dark:text-purple-300">{matchedReq.requestedByName}</span> (Document Subject).
                          </div>
                          {matchedReq.authorizationLetter && (
                            <a
                              href={matchedReq.authorizationLetter}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-3 shrink-0 px-2.5 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 font-semibold rounded hover:bg-purple-200 transition-colors"
                            >
                              📎 Auth Letter
                            </a>
                          )}
                        </div>

                        <div className="text-2xs text-purple-800 dark:text-purple-300 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>Relationship: <strong className="font-semibold">{matchedReq.relationship || "Authorized Representative"}</strong></span>
                          {matchedReq.requestedByContact && <span>Contact: <strong className="font-semibold">{matchedReq.requestedByContact}</strong></span>}
                        </div>

                        <div className="pt-2 border-t border-purple-200/60 dark:border-purple-800/60 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-purple-900 dark:text-purple-200">
                                Beneficiary Address
                              </label>
                              {subject.isSubjectAddressMissing ? (
                                <span className="text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-950/50 px-1.5 py-0.5 rounded">Missing — Required</span>
                              ) : subject.isAddressModified ? (
                                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">Modified — Requires Reconfirmation</span>
                              ) : subject.isBeneficiaryConfirmed ? (
                                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded">✓ Confirmed by Staff</span>
                              ) : (
                                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">Provided (Unreviewed)</span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={beneficiaryAddressOverride}
                              onChange={(e) => {
                                isEditingBeneficiaryRef.current = true
                                setBeneficiaryAddressOverride(e.target.value)
                              }}
                              placeholder="Enter verified beneficiary address..."
                              className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-800 dark:text-slate-100"
                            />
                            <p className="text-[10px] text-purple-700 dark:text-purple-400 mt-0.5">Requester's address is never applied to the represented subject.</p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-purple-900 dark:text-purple-200">
                                Beneficiary Age
                              </label>
                              {subject.isSubjectAgeMissing ? (
                                <span className="text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">Optional</span>
                              ) : subject.isAgeModified ? (
                                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">Modified — Requires Reconfirmation</span>
                              ) : subject.isBeneficiaryConfirmed ? (
                                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded">✓ Confirmed by Staff</span>
                              ) : (
                                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 rounded">Provided (Unreviewed)</span>
                              )}
                            </div>
                            <input
                              type="number"
                              min="0"
                              max="130"
                              value={beneficiaryAgeOverride}
                              onChange={(e) => {
                                isEditingBeneficiaryRef.current = true
                                setBeneficiaryAgeOverride(e.target.value)
                              }}
                              placeholder="Beneficiary age..."
                              className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-800 dark:text-slate-100"
                            />
                            <p className="text-[10px] text-purple-700 dark:text-purple-400 mt-0.5">Required for age-dependent documents (e.g. Funeral, PWD, OSCA).</p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-purple-200/60 dark:border-purple-800/60 flex items-center justify-between">
                          <div className="text-[10px] text-purple-700 dark:text-purple-400">
                            {subject.beneficiaryReviewStatus === "modified" ? (
                              <span className="font-semibold text-amber-800 dark:text-amber-300">
                                ⚠ Edited values differ from saved confirmation. Reconfirmation required before issuance.
                              </span>
                            ) : subject.isBeneficiaryConfirmed ? (
                              <span>
                                Confirmed by <strong className="font-semibold">{matchedReq.beneficiaryConfirmedBy || "Staff"}</strong>
                                {matchedReq.beneficiaryConfirmedAt ? ` on ${new Date(matchedReq.beneficiaryConfirmedAt).toLocaleDateString()}` : ""}
                              </span>
                            ) : (
                              <span>Staff review and explicit confirmation required before issuance.</span>
                            )}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isConfirmingBeneficiary || !beneficiaryAddressOverride.trim()}
                            onClick={async () => {
                              if (!matchedReq || !beneficiaryAddressOverride.trim()) return
                              setIsConfirmingBeneficiary(true)
                              try {
                                await confirmBeneficiaryDetails(matchedReq.id, {
                                  confirmedAddress: beneficiaryAddressOverride.trim(),
                                  confirmedAge: beneficiaryAgeOverride.trim() ? Number(beneficiaryAgeOverride.trim()) : undefined,
                                })
                                isEditingBeneficiaryRef.current = false
                                toast.success("Beneficiary details confirmed and persistently saved.")
                              } catch (err: any) {
                                toast.error(err?.message || "Failed to confirm beneficiary details.")
                              } finally {
                                setIsConfirmingBeneficiary(false)
                              }
                            }}
                            className="h-7 px-3 text-2xs bg-white dark:bg-purple-900 border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-200 hover:bg-purple-50"
                          >
                            {isConfirmingBeneficiary ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                            {subject.beneficiaryReviewStatus === "modified" ? "Update Confirmation" : subject.isBeneficiaryConfirmed ? "Update Confirmation" : "Confirm Details"}
                          </Button>
                        </div>
                      </div>
                    )
                  }
                  return null
                })()}

                <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-8 shadow-sm flex flex-col min-h-[600px] overflow-hidden">
                  <div
                    id="pdf-preview-container"
                    className={`bg-white relative w-full overflow-hidden ${selectedDocType === "residency" ? "font-sans" : "font-serif"}`}
                    style={{ aspectRatio: "8.5 / 11", padding: "0" }}
                  >
                    {/* Official Document Header removed because user prints on pre-printed letterhead */}
                    {/* Static body wrapper */}
                    <div style={{ position: "absolute", top: "28%", left: "12%", right: "12%", bottom: "8%" }}>
                      <div className="text-center mb-10">
                        <p className={`font-extrabold text-black uppercase whitespace-nowrap ${selectedDocType === "residency" ? "tracking-widest text-base" : "tracking-[0.25em] text-base"}`}>
                          {(() => {
                            const customDoc = (systemConfig?.customDocumentTypes || []).find((c: any) => c.id === selectedDocType)
                            if (customDoc?.header) return customDoc.header.toUpperCase()
                            const resolved = resolveDocumentType(selectedDocType, systemConfig?.customDocumentTypes)
                            if (resolved?.header) return resolved.header.toUpperCase()
                            return "C E R T I F I C A T I O N"
                          })()}
                        </p>
                      </div>
                      <div className="text-sm-minus text-black leading-relaxed">
                        <p className="mb-4">To Whom It May Concern:</p>
                        {/* EDITABLE AREA */}
                        <div
                          ref={editorRef}
                          contentEditable
                          suppressContentEditableWarning
                          className="outline-none focus:ring-1 focus:ring-blue-300 focus:ring-inset rounded min-h-[80px]"
                          style={{ cursor: "text" }}
                        />
                        {(systemConfig?.secretaryName?.trim() || systemConfig?.barangayCaptainName?.trim()) && (
                          <div className="mt-16 flex justify-between">
                            <div className="text-center w-48">
                              {systemConfig?.secretaryName?.trim() && (
                                <>
                                  <div className="h-16 flex items-end justify-center mb-1 relative">
                                    {secretarySignatureUrl && (
                                      <img src={secretarySignatureUrl} alt="Secretary Signature" crossOrigin="anonymous" className="absolute bottom-0 max-h-20 max-w-full mix-blend-multiply" />
                                    )}
                                  </div>
                                  <div className="border-b border-black mb-1 px-4 py-0.5">
                                    <p className="font-bold text-black uppercase text-xs">{systemConfig.secretaryName}</p>
                                  </div>
                                  <p className="text-xs text-black">Barangay Secretary</p>
                                </>
                              )}
                            </div>
                            <div className="text-center w-48">
                              {systemConfig?.barangayCaptainName?.trim() && (
                                <>
                                  <div className="h-16 flex items-end justify-center mb-1 relative">
                                    {captainSignatureUrl && (
                                      <img src={captainSignatureUrl} alt="Captain Signature" crossOrigin="anonymous" className="absolute bottom-0 max-h-20 max-w-full mix-blend-multiply" />
                                    )}
                                  </div>
                                  <div className="border-b border-black mb-1 px-4 py-0.5">
                                    <p className="font-bold text-black uppercase text-xs">{systemConfig.barangayCaptainName}</p>
                                  </div>
                                  <p className="text-xs text-black">Punong Barangay</p>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={async () => {
                      try {
                        if (requiredSignaturesLoading) throw new Error("Protected signatures are still loading. Please wait before exporting.")
                        if (requiredSignatureError) throw new Error(`Protected signature unavailable: ${requiredSignatureError}`)

                        const resolvedType = resolveDocumentType(selectedDocType, systemConfig?.customDocumentTypes)
                        const docLabel = resolvedType?.label || selectedDocType
                        const pendingReq = processingRequestId
                          ? adminDocumentRequests.find(r => r.id === processingRequestId)
                          : adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))

                        const subject = resolveDocumentSubject(pendingReq, selectedResident, {
                          address: beneficiaryAddressOverride.trim() || undefined,
                          age: beneficiaryAgeOverride.trim() || undefined,
                        })

                        const docTemplateText = (systemConfig?.templates && systemConfig.templates[selectedDocType]) || DEFAULT_TEMPLATES[selectedDocType] || ""
                        const requiresAge = docTemplateText.includes("{{age}}")

                        if (subject.isRepresentation) {
                          if (subject.isSubjectAddressMissing) {
                            toast.error("Beneficiary address is required before generating official documents. Please enter and confirm the verified address.")
                            return
                          }
                          if (requiresAge && subject.isSubjectAgeMissing) {
                            toast.error("Beneficiary age is required for this certificate before generating official documents. Please enter and confirm the verified age.")
                            return
                          }
                          if (subject.beneficiaryReviewStatus === "modified") {
                            toast.error("Beneficiary details were edited and require reconfirmation before issuance. Click 'Update Confirmation'.")
                            return
                          }
                          if (!subject.isBeneficiaryConfirmed) {
                            toast.error("Beneficiary details must be explicitly reviewed and confirmed by staff before issuance. Click 'Confirm Details'.")
                            return
                          }
                        } else {
                          if (subject.isSubjectAddressMissing) {
                            toast.error("Resident address is missing. Please ensure resident profile contains an address.")
                            return
                          }
                          if (requiresAge && subject.isSubjectAgeMissing) {
                            toast.error("Resident age is missing. Please ensure resident profile contains an age or birthdate.")
                            return
                          }
                        }

                        const now = Date.now();
                        if (now - lastDownload < 5000) {
                          toast.error("You are clicking too fast! Please try again in 5 seconds.");
                          return;
                        }
                        setLastDownload(now);

                        setIsGenerating(true)
                        const element = document.getElementById("pdf-preview-container")
                        if (!element) return

                        const scale = 2
                        const transparentPixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                        const imgData = await toPng(element, {
                          quality: 1,
                          pixelRatio: scale,
                          backgroundColor: 'white',
                          style: { transform: 'scale(1)', transformOrigin: 'top left' },
                          imagePlaceholder: transparentPixel,
                          onImageErrorHandler: () => transparentPixel,
                        })

                        const pdf = new jsPDF("p", "mm", "a4")

                        const rect = element.getBoundingClientRect()
                        const canvasWidth = rect.width * 2
                        const canvasHeight = rect.height * 2

                        const pdfWidth = pdf.internal.pageSize.getWidth()
                        const pdfHeight = (canvasHeight * pdfWidth) / canvasWidth

                        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight)

                        const docTitle = selectedDocType.replace(/[^a-zA-Z0-9_]/g, "_")
                        pdf.save(`${docTitle}_${subject.subjectName.replace(/\s+/g, "_")}.pdf`)

                        if (pendingReq) {
                           try {
                             await updateRequestGenerated(pendingReq.id)
                             isEditingBeneficiaryRef.current = false
                             toast.success("Document downloaded successfully.")
                             if (processingRequestId) router.push("/admin/requests")
                           } catch (err: any) {
                             console.error("Failed to mark document as generated after download:", err)
                             toast.warning("PDF was downloaded to your device, but recording official issuance in the database failed. Please retry or update the request status manually.", { duration: 6000 })
                           }
                        } else {
                           toast.success("Document generated successfully.")
                        }
                      } catch (error: any) {
                        console.error("PDF Generation failed:", error)
                        toast.error(error?.message || "Failed to generate PDF")
                      } finally {
                        setIsGenerating(false)
                      }
                    }}
                    disabled={isGenerating || requiredSignaturesLoading}
                    className="flex-1 min-w-[160px] h-10 bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isGenerating || requiredSignaturesLoading}
                    onClick={async () => {
                      if (requiredSignaturesLoading) { toast.error("Protected signatures are still loading. Please wait before printing."); return }
                      if (requiredSignatureError) { toast.error(`Protected signature unavailable: ${requiredSignatureError}`); return }
                      const element = document.getElementById("pdf-preview-container")
                      if (!element) return

                      const resolvedType = resolveDocumentType(selectedDocType, systemConfig?.customDocumentTypes)
                      const docLabel = resolvedType?.label || selectedDocType

                      const pendingReq = processingRequestId
                        ? adminDocumentRequests.find(r => r.id === processingRequestId)
                        : adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))

                      const subject = resolveDocumentSubject(pendingReq, selectedResident, {
                        address: beneficiaryAddressOverride.trim() || undefined,
                        age: beneficiaryAgeOverride.trim() || undefined,
                      })

                      const docTemplateText = (systemConfig?.templates && systemConfig.templates[selectedDocType]) || DEFAULT_TEMPLATES[selectedDocType] || ""
                      const requiresAge = docTemplateText.includes("{{age}}")

                      if (subject.isRepresentation) {
                        if (subject.isSubjectAddressMissing) {
                          toast.error("Beneficiary address is required before printing official documents. Please enter and confirm the verified address.")
                          return
                        }
                        if (requiresAge && subject.isSubjectAgeMissing) {
                          toast.error("Beneficiary age is required for this certificate before printing official documents. Please enter and confirm the verified age.")
                          return
                        }
                        if (subject.beneficiaryReviewStatus === "modified") {
                          toast.error("Beneficiary details were edited and require reconfirmation before issuance. Click 'Update Confirmation'.")
                          return
                        }
                        if (!subject.isBeneficiaryConfirmed) {
                          toast.error("Beneficiary details must be explicitly reviewed and confirmed by staff before issuance. Click 'Confirm Details'.")
                          return
                        }
                      } else {
                        if (subject.isSubjectAddressMissing) {
                          toast.error("Resident address is missing. Please ensure resident profile contains an address.")
                          return
                        }
                        if (requiresAge && subject.isSubjectAgeMissing) {
                          toast.error("Resident age is missing. Please ensure resident profile contains an age or birthdate.")
                          return
                        }
                      }

                      const printWindow = window.open("", "_blank")
                      if (!printWindow) {
                        toast.error("Pop-up window was blocked by your browser. Please allow pop-ups for TALASYS to print documents.")
                        return
                      }
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Print Document</title>
                            <script src="https://cdn.tailwindcss.com"></script>
                          </head>
                          <body onload="window.print();window.close()">
                            ${element.outerHTML}
                          </body>
                        </html>
                      `)
                      printWindow.document.close()

                      if (pendingReq) {
                        try {
                          await updateRequestGenerated(pendingReq.id)
                          isEditingBeneficiaryRef.current = false
                          toast.success("Document printed successfully.")
                          if (processingRequestId) router.push("/admin/requests")
                        } catch (err: any) {
                          console.error("Failed to mark document as generated after print:", err)
                          toast.warning("Document was sent to the print preview, but recording official issuance in the database failed. Please retry or update request status.", { duration: 6000 })
                        }
                      } else {
                        toast.success("Document printed successfully.")
                      }
                    }}
                    className={`flex-1 h-10 ${processingRequestId ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-0' : 'bg-transparent'}`}
                  >
                    Print Document
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[600px] text-slate-400 bg-slate-50/50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                <FileText className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm font-medium">Select a resident and document type</p>
                <p className="text-xs mt-1">The preview will appear here</p>
              </div>
            )}
          </div>
        </Card>
      </div>
      )}
    </AdminPageShell>
  )
}

export default function GenerateDocuments() {
  return (
    <Suspense fallback={
      <AdminPageShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
        </div>
      </AdminPageShell>
    }>
      <GenerateDocumentsContent />
    </Suspense>
  )
}
