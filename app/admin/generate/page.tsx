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

function GenerateDocumentsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { residents: allResidents, documentRequests: adminDocumentRequests, updateRequestStatus, updateRequestGenerated } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  const { user } = useAuth()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedResident, setSelectedResident] = useState<any>(null)
  const [selectedDocType, setSelectedDocType] = useState("")
  const [customDocTitle, setCustomDocTitle] = useState("C E R T I F I C A T I O N")
  const [isGenerating, setIsGenerating] = useState(false)
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null)
  const [lastDownload, setLastDownload] = useState(0)
  const editorRef = useRef<HTMLDivElement>(null)

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
        
        let matchedId = "custom_blank";
        const builtInLabels: Record<string, string> = {
          "Funeral Certification": "funeral",
          "PWD Certification (Adult)": "pwd_adult",
          "PWD Certification (Minor)": "pwd_minor",
          "Certificate of Indigency": "indigency",
          "Proof of Residency": "residency",
          "Business Clearance": "business",
          "Business Clearance (Homeowner)": "business_homeowner",
          "Business Clearance (Contractor)": "business_contractor",
          "OSCA Certification": "osca"
        }
        
        if (builtInLabels[req.documentType]) {
          matchedId = builtInLabels[req.documentType]
        } else if (req.documentType.toLowerCase().includes("clearance")) {
          matchedId = "business"
        } else if (req.documentType.toLowerCase().includes("residency")) {
          matchedId = "residency"
        } else if (req.documentType.toLowerCase().includes("indigency")) {
          matchedId = "indigency"
        }
        
        setSelectedDocType(matchedId)
      }
    }
  }, [searchParams, allResidents, adminDocumentRequests])

  const getTemplateContent = () => {
    if (!selectedResident || !selectedDocType) return ""
    const templates = systemConfig?.templates || {}
    let template = ""
    if (selectedDocType === "funeral") template = templates.funeral || "This is to certify that {{name}}, age {{age}}, is a bonafide resident of {{barangay_name}}, with postal address located at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for FUNERAL ASSISTANCE purposes.\n\nCity of Manila, {{date_issued}}."
    if (selectedDocType === "pwd_adult") template = templates.pwd_adult || "This is to certify that {{name}} is a bonified resident and registered voter of {{barangay_name}}, with postal address located at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for <strong>PWD-Application</strong> purposes.\n\nIssued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila."
    if (selectedDocType === "pwd_minor") template = templates.pwd_minor || "This is to certify that {{name}} {{age}} years old of age, is a bonified resident of {{barangay_name}}, with postal address located at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for <strong>PWD-Application</strong> purposes.\n\nIssued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila."
    if (selectedDocType === "indigency") template = templates.indigency || "This is to certify that {{name}} is a bonafide resident of {{barangay_name}} with postal address {{address}}.\n\nThis further certifies that the said person belongs to indigent families in our Barangay.\n\nThis Certification is issued upon the request of the above-named person for {{purpose}} purposes.\n\nIssued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila."
    if (selectedDocType === "residency") template = templates.residency || "This is to certify {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\nThis Certification is issued upon the request of the above-mentioned name for {{purpose}} purposes.\n\nIssued this {{date_day_issued}}, City of Manila."
    if (selectedDocType === "business") template = templates.business || "This is to certify that {{name}} located at {{address}} with Business Style _________________ conducted \"__________________\" at _________________ today {{date_issued}}.\n\nThis Certification is issued upon the request of the above-cited for whatever legal purpose this is intended.\n\nDonation for venue Php 500.00\n\nCity Manila, {{date_issued}}."
    if (selectedDocType === "business_homeowner") template = templates.business_homeowner || "This is to certify that {{name}} is hereby issued Barangay Clearance for \"__________________\" entity located at {{address}}. This is under the territorial jurisdiction of {{barangay_name}}.\n\nThis certification is issued upon the request of the above-cited person for whatever purposes it may serve.\n\nIssued this {{date_ordinal_issued}}, City of Manila."
    if (selectedDocType === "business_contractor") template = templates.business_contractor || "This is to certify that {{name}} is hereby issued Barangay Clearance for \"__________________\" entity located along {{address}} Under the territorial jurisdiction of {{barangay_name}}.\n\nThis certification is issued upon the request of the above-cited name for whatever legal purpose this is intended.\n\nCity of Manila, {{date_issued}}."
    if (selectedDocType === "osca") template = templates.osca || "This is to certify that {{name}} is bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\nThis Certification is issued upon the request of the above cited person for <strong>OSCA ID application</strong> purposes.\n\nCity of Manila, {{date_issued}}."
    if (selectedDocType === "custom_blank") template = "This is to certify that {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\n[TYPE YOUR CUSTOM CONTENT HERE]\n\nCity of Manila, {{date_issued}}."
    
    if (!template && templates[selectedDocType]) template = templates[selectedDocType]
    if (!template) template = "This is to certify that {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for {{purpose}} purposes.\n\nCity of Manila, {{date_issued}}."
    
    const docLabelMap: Record<string, string> = {
      funeral: "Funeral Certification",
      pwd_adult: "PWD Certification (Adult)",
      pwd_minor: "PWD Certification (Minor)",
      indigency: "Certificate of Indigency",
      residency: "Proof of Residency",
      business: "Business Clearance",
      business_homeowner: "Business Clearance (Homeowner)",
      business_contractor: "Business Clearance (Contractor)",
      osca: "OSCA Certification"
    }
    const docLabel = docLabelMap[selectedDocType] || selectedDocType
    const matchedReq = processingRequestId 
      ? adminDocumentRequests.find(r => r.id === processingRequestId)
      : adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))
    
    const purpose = matchedReq?.purpose || "_____________"
    const age = selectedResident.age?.toString() || "___"
    
    const d = new Date()
    const formatter = new Intl.DateTimeFormat('en', { day: 'numeric' })
    const day = formatter.format(d)
    const suffix = ["11", "12", "13"].includes(day) ? "th" : day.endsWith("1") ? "st" : day.endsWith("2") ? "nd" : day.endsWith("3") ? "rd" : "th"
    const ordinalDay = `${day}${suffix}`
    const monthYear = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    const dateIssued = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const dateOrdinalIssued = `${ordinalDay} day of ${monthYear}`
    const dateDayIssued = `${ordinalDay} of ${monthYear}`

    let resolved = template
      .replace(/{{name}}/g, `<strong>${selectedResident.name.toUpperCase()}</strong>`)
      .replace(/{{address}}/g, `<strong>${selectedResident.address || "__________________"}</strong>`)
      .replace(/{{age}}/g, age)
      .replace(/{{purpose}}/g, `<strong>${purpose.toUpperCase()}</strong>`)
      .replace(/{{date_issued}}/g, `<strong>${dateIssued}</strong>`)
      .replace(/{{date_ordinal_issued}}/g, `<strong>${dateOrdinalIssued}</strong>`)
      .replace(/{{date_day_issued}}/g, `<strong>${dateDayIssued}</strong>`)
      .replace(/{{barangay_name}}/g, systemConfig?.barangayName || "__________________")
    
    return resolved
  }

  const searchResults = searchQuery.length > 1 
    ? allResidents.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
    : []

  const builtInDocTypes = [
    { id: "funeral", label: "Funeral Certification", icon: "🕊️", desc: "Certification for funeral assistance", enabled: true },
    { id: "pwd_adult", label: "PWD Certification (Adult)", icon: "♿", desc: "For PWD application purposes (Adult)", enabled: true },
    { id: "pwd_minor", label: "PWD Certification (Minor)", icon: "🚸", desc: "For PWD application purposes (Minor)", enabled: true },
    { id: "indigency", label: "Certificate of Indigency", icon: "📋", desc: "For medical or financial assistance", enabled: true },
    { id: "residency", label: "Proof of Residency", icon: "🏠", desc: "Proof of residence for various purposes", enabled: true },
    { id: "business", label: "Business Clearance", icon: "🏢", desc: "General business clearance or activity", enabled: true },
    { id: "business_homeowner", label: "Business Clearance (Homeowner)", icon: "🏡", desc: "Business clearance for homeowners", enabled: true },
    { id: "business_contractor", label: "Business Clearance (Contractor)", icon: "👷", desc: "Business clearance for contractors", enabled: true },
    { id: "osca", label: "OSCA Certification", icon: "👵", desc: "For Senior Citizen ID application", enabled: true },
  ]

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

  const enabledDocTypes = systemConfig?.documentTypes || [
    "Funeral Certification", "PWD Certification (Adult)", "PWD Certification (Minor)", 
    "Certificate of Indigency", "Proof of Residency", "Business Clearance", 
    "Business Clearance (Homeowner)", "Business Clearance (Contractor)", "OSCA Certification"
  ]
  const docTypes = allDocTypes.map(doc => ({
    ...doc,
    enabled: enabledDocTypes.includes(doc.label)
  }))

  const selectedDocConfig = docTypes.find(d => d.id === selectedDocType)

  useEffect(() => {
    if (editorRef.current && selectedResident && selectedDocType) {
      const resolved = getTemplateContent()
      const paragraphs = resolved.split('\n\n').map(p => 
        `<p style="text-indent:2em;text-align:justify;margin-bottom:1em;">${p}</p>`
      ).join('')
      editorRef.current.innerHTML = paragraphs
    }
  }, [selectedResident, selectedDocType, systemConfig])

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
                    <p className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{r.name}</p>
                    <p className="text-[10px] text-slate-400">{r.categories.join(", ")} • {r.status}</p>
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
                          <p className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{doc.label}</p>
                          {!doc.enabled && <span className="text-[9px] font-semibold bg-slate-200 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">Disabled</span>}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{doc.desc}</p>
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
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mr-2 uppercase tracking-wider">Edit Document:</span>
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
                      const paragraphs = resolved.split('\n\n').map(p =>
                        `<p style="text-indent:2em;text-align:justify;margin-bottom:1em;">${p}</p>`
                      ).join('')
                      editorRef.current.innerHTML = paragraphs
                    }}
                    className="px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 shadow-sm ml-1"
                  >↺ Reset</button>
                  
                </div>

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
                             if (selectedDocType === "indigency") return "CERTIFICATE OF INDIGENCY"
                             if (selectedDocType === "residency" || selectedDocType === "business") return "BARANGAY CERTIFICATION"
                             if (selectedDocType === "business_homeowner") return "BARANGAY BUSINESS CLEARANCE"
                             if (selectedDocType === "business_contractor") return "BARANGAY CLEARANCE"
                             return "C E R T I F I C A T I O N"
                           })()}
                        </p>
                      </div>
                      <div className="text-[13px] text-black leading-relaxed">
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
                                    {systemConfig?.secretarySignatureUrl && (
                                      <img src={systemConfig.secretarySignatureUrl} alt="Secretary Signature" className="absolute bottom-0 max-h-20 max-w-full mix-blend-multiply" />
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
                                    {systemConfig?.captainSignatureUrl && (
                                      <img src={systemConfig.captainSignatureUrl} alt="Captain Signature" className="absolute bottom-0 max-h-20 max-w-full mix-blend-multiply" />
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
                        const imgData = await toPng(element, {
                          quality: 1,
                          pixelRatio: scale,
                          backgroundColor: 'white',
                          style: { transform: 'scale(1)', transformOrigin: 'top left' }
                        })

                        const pdf = new jsPDF("p", "mm", "a4")

                        const rect = element.getBoundingClientRect()
                        const canvasWidth = rect.width * 2
                        const canvasHeight = rect.height * 2

                        const pdfWidth = pdf.internal.pageSize.getWidth()
                        const pdfHeight = (canvasHeight * pdfWidth) / canvasWidth

                        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight)

                        const docTitleMap: Record<string, string> = {
                          funeral: "Funeral",
                          pwd_adult: "PWD_Adult",
                          pwd_minor: "PWD_Minor",
                          indigency: "Indigency",
                          residency: "Residency",
                          business: "Business",
                          business_homeowner: "Business_Homeowner",
                          business_contractor: "Business_Contractor",
                          osca: "OSCA"
                        }
                        const docTitle = docTitleMap[selectedDocType] || selectedDocType
                        pdf.save(`${docTitle}_${selectedResident.name.replace(/\s+/g, "_")}.pdf`)
                        
                        const docLabelMap: Record<string, string> = {
                          funeral: "Funeral Certification",
                          pwd_adult: "PWD Certification (Adult)",
                          pwd_minor: "PWD Certification (Minor)",
                          indigency: "Certificate of Indigency",
                          residency: "Proof of Residency",
                          business: "Business Clearance",
                          business_homeowner: "Business Clearance (Homeowner)",
                          business_contractor: "Business Clearance (Contractor)",
                          osca: "OSCA Certification"
                        }
                        const docLabel = docLabelMap[selectedDocType] || selectedDocType
                        const pendingReq = processingRequestId 
                          ? adminDocumentRequests.find(r => r.id === processingRequestId)
                          : adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))
                        
                        if (pendingReq) {
                           await updateRequestGenerated(pendingReq.id)
                           toast.success("Document downloaded successfully.")
                           if (processingRequestId) router.push("/admin/requests")
                        } else {
                           toast.success("Document generated successfully.")
                        }
                      } catch (error) {
                        console.error("PDF Generation failed:", error)
                        toast.error("Failed to generate PDF")
                      } finally {
                        setIsGenerating(false)
                      }
                    }}
                    disabled={isGenerating}
                    className="flex-1 min-w-[160px] h-10 bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isGenerating}
                    onClick={() => {
                      const element = document.getElementById("pdf-preview-container")
                      if (!element) return
                      const printWindow = window.open("", "_blank")
                      printWindow?.document.write(`
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
                      printWindow?.document.close()
                      
                      const docLabelMap: Record<string, string> = {
                        funeral: "Funeral Certification",
                        pwd_adult: "PWD Certification (Adult)",
                        pwd_minor: "PWD Certification (Minor)",
                        indigency: "Certificate of Indigency",
                        residency: "Proof of Residency",
                        business: "Business Clearance",
                        business_homeowner: "Business Clearance (Homeowner)",
                        business_contractor: "Business Clearance (Contractor)",
                        osca: "OSCA Certification"
                      }
                      const docLabel = docLabelMap[selectedDocType] || selectedDocType
                      
                      const pendingReq = processingRequestId 
                        ? adminDocumentRequests.find(r => r.id === processingRequestId)
                        : adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))
                      
                      if (pendingReq) {
                         updateRequestGenerated(pendingReq.id)
                          .then(() => {
                             toast.success("Document printed successfully.")
                             if (processingRequestId) router.push("/admin/requests")
                          })
                          .catch(console.error)
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
