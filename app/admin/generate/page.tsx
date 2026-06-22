"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/use-admin-data"
const generationVolumeTrend: any[] = []
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"
import { Printer, TrendingUp, FileText, Clock, Loader2 } from "lucide-react"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"

export default function GenerateDocuments() {
  const { residents: allResidents, documentRequests: adminDocumentRequests } = useAdminData()
  const [activeTab, setActiveTab] = useState("manual")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedResident, setSelectedResident] = useState<any>(null)
  const [selectedDocType, setSelectedDocType] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const searchResults = searchQuery.length >= 2
    ? allResidents.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  const pendingGeneration = adminDocumentRequests.filter(r => r.status === "On Process" || r.status === "Approved")

  const docTypes = [
    { id: "clearance", label: "Barangay Clearance", icon: "📋", desc: "Official clearance certificate" },
    { id: "residency", label: "Certificate of Residency", icon: "🏠", desc: "Proof of residency in the barangay" },
    { id: "indigency", label: "Certificate of Indigency", icon: "📄", desc: "For financial assistance programs" },
    { id: "business", label: "Business Permit Clearance", icon: "🏪", desc: "For business permit applications" },
  ]

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
        <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Generate Documents</h1>
        <p className="text-sm text-slate-500 mt-0.5">Create and print official barangay documents</p>
      </div>

      {/* Volume KPI Strip */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-8 grid grid-cols-4 gap-4">
          {[
            { label: "Generated Today", value: "0", icon: Printer, color: "text-[#0C2340]", bg: "bg-[#0C2340]/[0.06]" },
            { label: "This Week", value: "0", icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Most Requested", value: "-", icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Avg Per Day", value: "0", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          ].map((kpi, i) => (
            <Card key={i} className="p-4 shadow-sm">
              <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-2`}>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.color} mt-0.5`}>{kpi.value}</p>
            </Card>
          ))}
        </div>
        <Card className="col-span-4 p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Most Generated</h3>
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
            <Printer className="w-4 h-4 text-[#0C2340]" />
            <h3 className="text-[11px] font-semibold text-[#0C2340]">Generation History</h3>
          </div>
          <div className="flex items-center gap-4">
            {recentGenerations.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-[#0C2340]">{g.name}</span>
                <span className="text-[10px] text-slate-400">• {g.doc} • {g.time}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setActiveTab("manual")} className={`px-4 py-2 rounded-lg text-xs transition-colors ${activeTab === "manual" ? "bg-[#0C2340] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          Manual Generation
        </button>
        <button onClick={() => setActiveTab("processing")} className={`px-4 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${activeTab === "processing" ? "bg-[#0C2340] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
          Processing Queue
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === "processing" ? "bg-white/20" : "bg-amber-100 text-amber-700"}`}>{pendingGeneration.length}</span>
        </button>
      </div>

      {activeTab === "manual" ? (
        <div className="grid grid-cols-12 gap-6">
          {/* Search + Doc Type Selection */}
          <div className="col-span-5 space-y-4">
            <Card className="p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#0C2340] mb-3">1. Search Resident</h3>
              <input
                type="text"
                placeholder="Type resident name..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedResident(null) }}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#0C2340]"
              />
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {searchResults.map((r) => (
                    <button key={r.id} onClick={() => { setSelectedResident(r); setSearchQuery(r.name) }} className={`w-full px-4 py-2.5 text-left hover:bg-slate-50 ${selectedResident?.id === r.id ? "bg-[#0C2340]/[0.04]" : ""}`}>
                      <p className="text-[12px] font-semibold text-[#0C2340]">{r.name}</p>
                      <p className="text-[10px] text-slate-400">{r.categories.join(", ")} • {r.status}</p>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#0C2340] mb-3">2. Select Document Type</h3>
              <div className="space-y-2">
                {docTypes.map((doc) => (
                  <button key={doc.id} onClick={() => setSelectedDocType(doc.id)} className={`w-full p-3 rounded-lg text-left transition-colors border ${selectedDocType === doc.id ? "border-[#0C2340] bg-[#0C2340]/[0.04]" : "border-slate-200 hover:bg-slate-50"}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{doc.icon}</span>
                      <div>
                        <p className="text-[12px] font-semibold text-[#0C2340]">{doc.label}</p>
                        <p className="text-[10px] text-slate-400">{doc.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* PDF Preview */}
          <Card className="col-span-7 shadow-sm">
            <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg">
              <h3 className="text-sm font-semibold text-[#0C2340]">Document Preview</h3>
            </div>
            <div className="p-6">
              {selectedResident && selectedDocType ? (
                <div id="pdf-preview-container" className="bg-white border border-slate-200 p-12 min-h-[500px]">
                  <div className="text-center space-y-2 mb-8">
                    <p className="text-xs text-slate-500">Republic of the Philippines</p>
                    <p className="text-xs text-slate-500">Province of &mdash; / City of &mdash;</p>
                    <p className="text-sm font-bold text-slate-700">BARANGAY SAMPLE</p>
                    <hr className="border-slate-300 my-4" />
                    <p className="text-lg font-bold text-[#0C2340] tracking-wide">
                      {selectedDocType === "clearance" ? "BARANGAY CLEARANCE" : selectedDocType === "residency" ? "CERTIFICATE OF RESIDENCY" : selectedDocType === "indigency" ? "CERTIFICATE OF INDIGENCY" : "BUSINESS PERMIT CLEARANCE"}
                    </p>
                  </div>
                  <div className="text-sm text-slate-800 leading-loose space-y-4">
                    <p>TO WHOM IT MAY CONCERN:</p>
                    <p className="indent-8">
                      This is to certify that <strong className="text-[#0C2340]">{selectedResident.name}</strong>, {selectedResident.age} years old, {selectedResident.gender || "a resident"}, residing at <strong>{selectedResident.address}</strong>, is known to be a person of good moral character and a law-abiding citizen in this barangay.
                    </p>
                    <p className="indent-8">
                      This certification is issued upon the request of the above-named person for whatever legal purpose it may serve.
                    </p>
                    <p className="mt-12 text-slate-600">Issued this {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())} at Barangay Sample.</p>
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

                        // Render element to canvas
                        const canvas = await html2canvas(element, {
                          scale: 2, // Higher resolution
                          useCORS: true,
                        })

                        const imgData = canvas.toDataURL("image/png")
                        // A4 is 210x297mm
                        const pdf = new jsPDF("p", "mm", "a4")
                        
                        const pdfWidth = pdf.internal.pageSize.getWidth()
                        const pdfHeight = (canvas.height * pdfWidth) / canvas.width

                        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight)
                        
                        const docTitle = selectedDocType === "clearance" ? "Clearance" : selectedDocType === "residency" ? "Residency" : selectedDocType === "indigency" ? "Indigency" : "Permit"
                        pdf.save(`${docTitle}_${selectedResident.name.replace(/\s+/g, "_")}.pdf`)
                      } catch (error) {
                        console.error("PDF Generation failed:", error)
                      } finally {
                        setIsGenerating(false)
                      }
                    }}
                    disabled={isGenerating}
                    className="flex-1 h-10 bg-[#0C2340] hover:bg-[#0a1c33]"
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
          <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#0C2340]">Processing Queue — Ready for Generation</h3>
            <Button size="sm" className="h-7 px-4 text-[10px] bg-[#0C2340] hover:bg-[#0a1c33]">Generate All</Button>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingGeneration.map((req) => (
              <div key={req.id} className="px-5 py-3.5 hover:bg-slate-50/50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#0C2340]/[0.08] flex items-center justify-center text-[10px] font-semibold text-[#0C2340]">{req.residentInitials}</div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#0C2340]">{req.residentName}</p>
                    <p className="text-[10px] text-slate-400">{req.documentType} • {req.purpose}</p>
                  </div>
                </div>
                <Button size="sm" className="h-7 px-4 text-[10px] bg-emerald-600 hover:bg-emerald-700">Generate</Button>
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
