"use client"

import { useState, useRef, useEffect } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/use-admin-data"
import { useSuperAdminData } from "@/hooks/use-superadmin-data"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"
import { Printer, TrendingUp, FileText, Clock, Loader2 } from "lucide-react"
import { toPng } from "html-to-image"
import jsPDF from "jspdf"
import { useAuth } from "@/lib/auth-context"

export default function GenerateDocuments() {
  const { residents: allResidents, documentRequests: adminDocumentRequests, updateRequestStatus } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  const { user } = useAuth()

  const now = Date.now()
  const dayMs = 1000 * 60 * 60 * 24

  const generationVolumeTrend = Array.from({ length: 7 }).map((_, i) => {
    const start = now - (6 - i) * dayMs;
    const end = start + dayMs;
    const reqs = adminDocumentRequests.filter(r => r.createdAt >= start && r.createdAt < end && r.status === "Completed");
    return {
      day: new Date(start).toLocaleDateString('en-US', { weekday: 'short' }),
      volume: reqs.length
    }
  });

  const [activeTab, setActiveTab] = useState("manual")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedResident, setSelectedResident] = useState<any>(null)
  const [selectedDocType, setSelectedDocType] = useState("")
  const [customDocTitle, setCustomDocTitle] = useState("C E R T I F I C A T I O N")
  const [isGenerating, setIsGenerating] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  
  // Custom Template Logic
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
    
    // For any custom document type added by superadmin — read directly from Firebase templates
    if (!template && templates[selectedDocType]) template = templates[selectedDocType]
    // Ultimate fallback for brand-new custom types with no saved template yet
    if (!template) template = "This is to certify that {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for {{purpose}} purposes.\n\nCity of Manila, {{date_issued}}."
    
    // Find matching request to inject specific data
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
    const pendingReq = adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))
    
    const purpose = pendingReq?.purpose || "whatever legal purpose it may serve"
    
    const date = new Date()
    const dateStr = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)
    const monthStr = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date)
    const yearStr = date.getFullYear().toString()
    const getOrdinal = (n: number) => {
      const s = ["th", "st", "nd", "rd"]
      const v = n % 100
      return n + (s[(v - 20) % 10] || s[v] || s[0])
    }
    const dayOrdinal = getOrdinal(date.getDate())
    const dateOrdinalStr = `${dayOrdinal} of ${monthStr} ${yearStr}`
    const dateDayStr = `${dayOrdinal.toUpperCase()} day of ${monthStr} ${yearStr}`
    
    const clearanceNumber = pendingReq?.id ? pendingReq.id.slice(0, 8).toUpperCase() : Math.floor(Math.random() * 1000000).toString()

    // Replace placeholders with bold HTML
    return template
      .replace(/{{name}}/g, `<strong>${selectedResident.name}</strong>`)
      .replace(/{{resident_name}}/g, `<strong>${selectedResident.name}</strong>`)
      .replace(/{{age}}/g, selectedResident.age?.toString() || "N/A")
      .replace(/{{gender}}/g, selectedResident.gender || "resident")
      .replace(/{{address}}/g, selectedResident.address || "this barangay")
      .replace(/{{barangay_name}}/g, systemConfig?.barangayName || "Barangay Sample")
      .replace(/{{municipality}}/g, systemConfig?.address?.split(',')[0] || "City of Sample")
      .replace(/{{province}}/g, systemConfig?.address?.split(',')[1]?.trim() || "Province of Sample")
      .replace(/{{date_issued}}/g, dateStr)
      .replace(/{{date_ordinal_issued}}/g, dateOrdinalStr)
      .replace(/{{date_day_issued}}/g, dateDayStr)
      .replace(/{{captain_name}}/g, `<strong>${systemConfig?.barangayCaptainName || "Hon. Juan Dela Cruz"}</strong>`)
      .replace(/{{purpose}}/g, `<strong>${purpose}</strong>`)
      .replace(/{{clearance_number}}/g, clearanceNumber)
  }

  // Whenever resident or doc type changes, push resolved content into the editable area
  useEffect(() => {
    if (!selectedResident || !selectedDocType || !editorRef.current) return
    const resolved = getTemplateContent()
    const paragraphs = resolved.split('\n\n').map(p =>
      `<p style="text-indent:2em;text-align:justify;margin-bottom:1em;">${p}</p>`
    ).join('')
    editorRef.current.innerHTML = paragraphs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResident, selectedDocType])

 const searchResults = searchQuery.length >= 2
    ? allResidents.filter(r => (r.name || "").toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  const pendingGeneration = adminDocumentRequests.filter(r => r.status === "On Process" || r.status === "Approved")

  const builtInDocTypes = [
    { id: "funeral", label: "Funeral Certification", icon: "🕊️", desc: "Certification for funeral assistance" },
    { id: "pwd_adult", label: "PWD Certification (Adult)", icon: "♿", desc: "For PWD application purposes (Adult)" },
    { id: "pwd_minor", label: "PWD Certification (Minor)", icon: "🚸", desc: "For PWD application purposes (Minor)" },
    { id: "indigency", label: "Certificate of Indigency", icon: "📋", desc: "For medical or financial assistance" },
    { id: "residency", label: "Proof of Residency", icon: "🏠", desc: "Proof of residence for various purposes" },
    { id: "business", label: "Business Clearance", icon: "🏢", desc: "General business clearance or activity" },
    { id: "business_homeowner", label: "Business Clearance (Homeowner)", icon: "🏡", desc: "Business clearance for homeowners" },
    { id: "business_contractor", label: "Business Clearance (Contractor)", icon: "👷", desc: "Business clearance for contractors" },
    { id: "osca", label: "OSCA Certification", icon: "👵", desc: "For Senior Citizen ID application" },
  ]

  const customDocTypes = (systemConfig?.customDocumentTypes || []).map((c: any) => ({
    id: c.id,
    label: c.name,
    icon: c.icon || "📄",
    desc: `Custom document type`,
    header: c.header,
  }))

  const allDocTypes = [
    ...builtInDocTypes, 
    ...customDocTypes,
    { id: "custom_blank", label: "Blank Custom Document", icon: "📝", desc: "Write a one-off document from scratch", header: customDocTitle }
  ]

  const docTypes = allDocTypes.map(doc => {
    let enabled = true;
    if (systemConfig && systemConfig.documentTypes !== undefined) {
      enabled = systemConfig.documentTypes.includes(doc.label)
    }
    if (doc.id === "custom_blank") enabled = true;
    return { ...doc, enabled }
  })

  const mostGenerated = [
    { name: "Clearance", count: adminDocumentRequests.filter(r => r.documentType.includes("Clearance") && (r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Completed")).length },
    { name: "Residency", count: adminDocumentRequests.filter(r => r.documentType.includes("Residency") && (r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Completed")).length },
    { name: "Indigency", count: adminDocumentRequests.filter(r => r.documentType.includes("Indigency") && (r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Completed")).length },
  ]

  const recentGenerations = pendingGeneration.slice(0, 3).map(r => ({
    name: r.residentName,
    doc: r.documentType,
    time: r.dateRequested,
  }))

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Generate Documents</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Create and print official barangay documents</p>
      </div>

      {/* Volume KPI Strip */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-8 grid grid-cols-4 gap-4">
          {[
            { label: "Generated Today", value: "0", icon: Printer, color: "text-[#0C2340] dark:text-blue-50", bg: "bg-[#0C2340] dark:bg-slate-800/[0.06]" },
            { label: "This Week", value: "0", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Most Requested", value: "-", icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Avg Per Day", value: "0", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          ].map((kpi, i) => (
            <Card key={i} className="p-4 shadow-sm">
              <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-2`}>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.color} mt-0.5`}>{kpi.value}</p>
            </Card>
          ))}
        </div>
        <Card className="col-span-4 p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Most Generated</h3>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={mostGenerated} layout="vertical" barSize={10}>
              <XAxis type="number" tick={{ fontSize: 9 }} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} stroke="#94a3b8" width={60} />
              <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
              <Bar dataKey="count" fill="#0C2340" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Recent Generations Strip */}
      <Card className="p-4 shadow-sm mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
            <h3 className="text-[11px] font-semibold text-[#0C2340] dark:text-blue-50">Generation History</h3>
          </div>
          <div className="flex items-center gap-4">
            {recentGenerations.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-[#0C2340] dark:text-blue-50">{g.name}</span>
                <span className="text-[10px] text-slate-400">• {g.doc} • {g.time}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab("manual")} className={`px-4 py-2 rounded-lg text-xs transition-colors ${activeTab === "manual" ? "bg-[#0C2340] dark:bg-slate-800 text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-950"}`}>
          Manual Generation
        </button>
        <button onClick={() => setActiveTab("processing")} className={`px-4 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${activeTab === "processing" ? "bg-[#0C2340] dark:bg-slate-800 text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-950"}`}>
          Processing Queue
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === "processing" ? "bg-white/20" : "bg-amber-100 text-amber-700"}`}>{pendingGeneration.length}</span>
        </button>
      </div>

      {activeTab === "manual" ? (
        <div className="grid grid-cols-12 gap-6">
          {/* Search + Doc Type Selection */}
          <div className="col-span-5 space-y-4">
            <Card className="p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-3">1. Search Resident</h3>
              <input
                type="text"
                placeholder="Type resident name..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedResident(null) }}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0C2340]"
              />
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100">
                  {searchResults.map((r) => (
                    <button key={r.id} onClick={() => { setSelectedResident(r); setSearchQuery(r.name) }} className={`w-full px-4 py-2.5 text-left hover:bg-slate-50 dark:bg-slate-950 ${selectedResident?.id === r.id ? "bg-[#0C2340] dark:bg-slate-800/[0.04]" : ""}`}>
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
                  <button key={doc.id} onClick={() => doc.enabled && setSelectedDocType(doc.id)} className={`w-full p-3 rounded-lg text-left transition-colors border ${doc.enabled ? 'hover:bg-slate-50 dark:bg-slate-950' : 'opacity-60 cursor-not-allowed bg-slate-50 dark:bg-slate-950'} ${selectedDocType === doc.id ? "border-[#0C2340] bg-[#0C2340] dark:bg-slate-800/[0.04]" : "border-slate-200 dark:border-slate-700"}`}>
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
          <Card className="col-span-7 shadow-sm">
            <div className="px-5 py-3.5 bg-[#0C2340] dark:bg-slate-800/[0.03] border-b border-slate-200 dark:border-slate-700 rounded-t-lg">
              <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Document Preview</h3>
            </div>
            <div className="p-6">
              {selectedResident && selectedDocType ? (
                <div className="space-y-2">
                  {/* Simple WYSIWYG toolbar */}
                  <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mr-2 uppercase tracking-wider">Edit Document:</span>
                    <button
                      onMouseDown={e => { e.preventDefault(); document.execCommand('bold') }}
                      className="px-2.5 py-1 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 shadow-sm"
                      title="Bold selected text"
                    >B</button>
                    <button
                      onMouseDown={e => { e.preventDefault(); document.execCommand('italic') }}
                      className="px-2.5 py-1 text-xs italic bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 shadow-sm"
                      title="Italic selected text"
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
                      title="Reset to original template"
                    >↺ Reset</button>
                    {selectedDocType === "custom_blank" && (
                      <div className="ml-2 flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Title:</span>
                        <input
                          type="text"
                          value={customDocTitle}
                          onChange={e => setCustomDocTitle(e.target.value)}
                          className="px-2 py-0.5 text-xs border border-slate-200 dark:border-slate-700 rounded max-w-[150px]"
                        />
                      </div>
                    )}
                    <span className="ml-auto text-[10px] text-slate-400">Click anywhere in the document to edit</span>
                  </div>

                  {/* Editable Paper Preview */}
                  <div
                    id="pdf-preview-container"
                    className={`bg-white dark:bg-slate-900 relative w-full overflow-hidden ${selectedDocType === "residency" ? "font-sans" : "font-serif"}`}
                    style={{ aspectRatio: "8.5 / 11", padding: "0" }}
                  >
                    {/* Static header — not editable */}
                    <div style={{ position: "absolute", top: "28%", left: "12%", right: "12%", bottom: "8%" }}>
                      <div className="text-center mb-10">
                        <p className={`font-extrabold text-black uppercase whitespace-nowrap ${selectedDocType === "residency" ? "tracking-widest text-base" : "tracking-[0.25em] text-base"}`}>
                          {(() => {
                             if (selectedDocType === "custom_blank") return customDocTitle.toUpperCase()
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
                        <div className="mt-16 flex justify-end">
                          <div className="text-center w-48">
                            <div className="border-b border-black mb-1 px-4 py-0.5">
                              <p className="font-bold text-black uppercase text-xs">{systemConfig?.barangayCaptainName || "Hon. Juan Dela Cruz"}</p>
                            </div>
                            <p className="text-xs text-black">Punong Barangay</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center min-h-[400px]">
                  <div className="text-center">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">Select a resident and document type</p>
                  </div>
                </div>
              )}
              {selectedResident && selectedDocType && (
                <div className="flex gap-3 mt-4">
                  <Button
                    onClick={async () => {
                      setIsGenerating(true)
                      try {
                        const element = document.getElementById("pdf-preview-container")
                        if (!element) return

                        // Render element to image using html-to-image
                        const imgData = await toPng(element, {
                          pixelRatio: 2,
                          backgroundColor: '#ffffff'
                        })

                        // A4 is 210x297mm
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
                        // Mark requests for this doc type as Completed
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
                        const pendingReq = adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))
                        if (pendingReq) {
                           await updateRequestStatus(pendingReq.id, "Completed", undefined, user?.name || "Admin", user?.email || "admin@system.com")
                        }
                      } catch (error) {
                        console.error("PDF Generation failed:", error)
                      } finally {
                        setIsGenerating(false)
                      }
                    }}
                    disabled={isGenerating}
                    className="flex-1 h-10 bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Generate PDF
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
                      
                      const docLabel = selectedDocType === "clearance" ? "Barangay Clearance" : selectedDocType === "residency" ? "Certificate of Residency" : selectedDocType === "indigency" ? "Certificate of Indigency" : "Business Permit Clearance"
                      const pendingReq = adminDocumentRequests.find(r => r.residentId === selectedResident.id && r.documentType === docLabel && (r.status === "Pending" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Approved"))
                      if (pendingReq) {
                         updateRequestStatus(pendingReq.id, "Completed", undefined, user?.name || "Admin", user?.email || "admin@system.com").catch(console.error)
                      }
                    }}
                    className="flex-1 h-10 bg-transparent"
                  >
                    Print Document
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : (
        /* Processing Queue Tab */
        <Card className="shadow-sm">
          <div className="px-5 py-3.5 bg-[#0C2340] dark:bg-slate-800/[0.03] border-b border-slate-200 dark:border-slate-700 rounded-t-lg flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Processing Queue — Ready for Generation</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingGeneration.map((req) => (
              <div key={req.id} className="px-5 py-3.5 hover:bg-slate-50/50 dark:bg-slate-900/50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0C2340] dark:bg-slate-800/[0.08] flex items-center justify-center text-[10px] font-semibold text-[#0C2340] dark:text-blue-50">{req.residentInitials}</div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{req.residentName}</p>
                    <p className="text-[10px] text-slate-400">{req.documentType} • {req.purpose}</p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => {
                    const r = allResidents.find(r => r.id === req.residentId)
                    if (r) {
                      setSelectedResident(r)
                      setSearchQuery(r.name)
                      const dt = req.documentType.includes("Clearance") ? "clearance" : req.documentType.includes("Residency") ? "residency" : req.documentType.includes("Indigency") ? "indigency" : "business"
                      setSelectedDocType(dt)
                      setActiveTab("manual")
                    }
                  }}
                  className="h-7 px-4 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                >
                  Generate
                </Button>
              </div>
            ))}
            {pendingGeneration.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-400">No requests in the processing queue</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </AdminPageShell>
  )
}
