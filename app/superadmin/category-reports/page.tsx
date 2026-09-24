"use client"

import { useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { useAdminData } from "@/hooks/admin"
import { useSuperAdminData } from "@/hooks/superadmin"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  Users, TrendingUp, AlertTriangle, BarChart3,
} from "lucide-react"
import { ModalOverlay } from "@/components/ui/modal-overlay"

export default function CategoryReports() {
  const { stats: adminStats, residents } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  const barangayName = systemConfig?.barangayName || "Barangay Sample"
  const municipality = systemConfig?.address || "City of Sample"
  const contactNumber = systemConfig?.contactNumber || "(02) 8123-4567"
  const email = systemConfig?.emailAddress || "barangay@sample.gov.ph"
  const nonVoterCount = adminStats.totalResidents - adminStats.voterCount

  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)

  const barData = [
    { name: "Seniors", value: adminStats.seniorCount, color: "#0C2340" },
    { name: "Adults", value: adminStats.adultCount, color: "#2a5080" },
    { name: "Minors", value: adminStats.minorCount, color: "#C5A55A" },
    { name: "Voters", value: adminStats.voterCount, color: "#10b981" },
    { name: "Non-Voters", value: nonVoterCount, color: "#3b82f6" },
    { name: "Expired", value: adminStats.expiredResidents, color: "#ef4444" },
  ]

  const totalPop = adminStats.totalResidents || 1

  const rawCategoryDistribution = [
    { name: "Seniors", value: adminStats.seniorCount, color: "#0C2340", change: 2.1 },
    { name: "Adults", value: adminStats.adultCount, color: "#2a5080", change: 0.5 },
    { name: "Minors", value: adminStats.minorCount, color: "#C5A55A", change: 3.2 },
  ]
  const categoryDistribution = rawCategoryDistribution.filter(c => c.value > 0)
  
  if (categoryDistribution.length === 0) {
    categoryDistribution.push({ name: "No Data", value: 1, color: "#f1f5f9", change: 0 })
  }

  const largestCategory = rawCategoryDistribution.sort((a, b) => b.value - a.value)[0]
  const largestName = largestCategory && largestCategory.value > 0 ? largestCategory.name : "N/A"
  const largestPct = largestCategory && adminStats.totalResidents > 0 ? ((largestCategory.value / adminStats.totalResidents) * 100).toFixed(1) : "0.0"
  const largestDesc = largestCategory && largestCategory.value > 0 ? `${largestPct}% of population` : "No data available"

  const fastestGrowingName = "N/A"
  const fastestGrowingDesc = "No historical data"

  const [selectedCategories, setSelectedCategories] = useState<string[]>(["voters"])
  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(id)) {
        return prev.filter(c => c !== id)
      }
      return [...prev, id]
    })
  }

  const getCategoryTitle = () => {
    if (selectedCategories.length === 0) return "REPORT"
    if (selectedCategories.length === 1) {
      const titles: Record<string, string> = {
        seniors: "LIST OF SENIOR CITIZENS", minors: "LIST OF MINORS", adults: "LIST OF ADULTS",
        voters: "LIST OF REGISTERED VOTERS", "non-voters": "LIST OF NON-VOTERS",
        expired: "LIST OF EXPIRED ACCOUNTS", full: "FULL POPULATION LIST",
        male: "LIST OF MALE RESIDENTS", female: "LIST OF FEMALE RESIDENTS", "other-gender": "LIST OF OTHER GENDERS",
      }
      return titles[selectedCategories[0]] || "REPORT"
    }
    return "MULTIPLE CATEGORIES REPORT"
  }
  const [selectedColumns, setSelectedColumns] = useState({
    fullName: true, address: true, age: true, contactNumber: false,
    registrationDate: true, accountStatus: false, expiryDate: false, otherCategories: false,
  })
  const [showDownloadDialog, setShowDownloadDialog] = useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [lastExport, setLastExport] = useState(0)

  const categories = [
    { id: "seniors", title: "Senior Citizens", count: `${adminStats.seniorCount} residents`, icon: "SC", reportTitle: "LIST OF SENIOR CITIZENS" },
    { id: "minors", title: "Minors (Under 18)", count: `${adminStats.minorCount} residents`, icon: "18", reportTitle: "LIST OF MINORS" },
    { id: "adults", title: "Adults", count: `${adminStats.adultCount} residents`, icon: "A", reportTitle: "LIST OF ADULTS" },
    { id: "voters", title: "Registered Voters", count: `${adminStats.voterCount} residents`, icon: "V", reportTitle: "LIST OF REGISTERED VOTERS" },
    { id: "non-voters", title: "Non-Voters", count: `${nonVoterCount} residents`, icon: "NV", reportTitle: "LIST OF NON-VOTERS" },
    { id: "expired", title: "Expired Accounts", count: `${adminStats.expiredResidents} residents`, icon: "EX", reportTitle: "LIST OF EXPIRED ACCOUNTS" },
    { id: "male", title: "Male Residents", count: `${residents.filter(r => r.gender === "Male").length} residents`, icon: "M", reportTitle: "LIST OF MALE RESIDENTS" },
    { id: "female", title: "Female Residents", count: `${residents.filter(r => r.gender === "Female").length} residents`, icon: "F", reportTitle: "LIST OF FEMALE RESIDENTS" },
    { id: "other-gender", title: "Other Genders", count: `${residents.filter(r => r.gender === "Other").length} residents`, icon: "O", reportTitle: "LIST OF OTHER GENDERS" },
    { id: "full", title: "Full Population", count: `${adminStats.totalResidents} residents`, icon: "All", reportTitle: "FULL POPULATION LIST" },
  ]

  const generatePDFDocument = () => {
    const doc = new jsPDF()
    const title = getCategoryTitle()

    const pageWidth = doc.internal.pageSize.getWidth()

    // Header
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text("Republic of the Philippines", pageWidth / 2, 20, { align: "center" })
    doc.text(municipality, pageWidth / 2, 25, { align: "center" })
    doc.text(barangayName, pageWidth / 2, 30, { align: "center" })
    
    // Title
    doc.setFontSize(14)
    doc.setTextColor(12, 35, 64)
    doc.setFont("helvetica", "bold")
    doc.text(title.toUpperCase(), pageWidth / 2, 45, { align: "center" })
    
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.setFont("helvetica", "normal")
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    doc.text(`As of ${dateStr}`, pageWidth / 2, 51, { align: "center" })

    // Filter residents
    const filtered = residents.filter(r => {
      if (selectedCategories.includes("full")) return true
      let match = false
      if (selectedCategories.includes("seniors") && (r.age || 0) >= 60) match = true
      if (selectedCategories.includes("minors") && (r.age || 0) < 18) match = true
      if (selectedCategories.includes("adults") && (r.age || 0) >= 18 && (r.age || 0) < 60) match = true
      if (selectedCategories.includes("voters") && r.isVoter) match = true
      if (selectedCategories.includes("non-voters") && !r.isVoter) match = true
      if (selectedCategories.includes("expired") && r.status === "Expired") match = true
      if (selectedCategories.includes("male") && r.gender === "Male") match = true
      if (selectedCategories.includes("female") && r.gender === "Female") match = true
      if (selectedCategories.includes("other-gender") && r.gender === "Other") match = true
      return match
    })
    
    // Map columns
    const cols = []
    if (selectedColumns.fullName) cols.push("Full Name")
    if (selectedColumns.address) cols.push("Address")
    if (selectedColumns.age) cols.push("Age")
    if (selectedColumns.contactNumber) cols.push("Contact")
    if (selectedColumns.registrationDate) cols.push("Reg. Date")
    if (selectedColumns.accountStatus) cols.push("Status")

    const body = filtered.map(r => {
      const row = []
      if (selectedColumns.fullName) row.push(r.name)
      if (selectedColumns.address) row.push(r.address)
      if (selectedColumns.age) row.push(r.age?.toString() || "N/A")
      if (selectedColumns.contactNumber) row.push(r.contactNumber || "N/A")
      if (selectedColumns.registrationDate) row.push((r as any).createdAt ? new Date((r as any).createdAt).toLocaleDateString() : "N/A")
      if (selectedColumns.accountStatus) row.push(r.status)
      return row
    })

    autoTable(doc, {
      startY: 65,
      head: [cols],
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [12, 35, 64] },
      margin: { bottom: 30 },
      didDrawPage: function (data) {
        const pageHeight = doc.internal.pageSize.getHeight()
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(`Contact Us: ${contactNumber} | Email: ${email}`, pageWidth / 2, pageHeight - 15, { align: "center" })
      }
    })

    return doc
  }

  const handleConfirmDownload = async () => {
    if (isDownloadingPdf) return
    const now = Date.now()
    if (now - lastExport < 5000) {
      showToastPreset("actionRateLimited")
      return
    }
    setLastExport(now)

    setIsDownloadingPdf(true)
    
    try {
      const doc = generatePDFDocument()
      doc.save(`Category_Report.pdf`)
      showToastPreset("categoryReportDownloaded")
      setShowDownloadDialog(false)
    } catch(e) {
      console.error(e)
    }

    setIsDownloadingPdf(false)
  }

  const handlePreview = () => {
    try {
      const doc = generatePDFDocument()
      const pdfUrl = doc.output('bloburl')
      setPreviewPdfUrl(pdfUrl.toString())
      setShowPreviewModal(true)
    } catch (e) {
      console.error(e)
    }
  }

  const toggleColumn = (column: keyof typeof selectedColumns) => {
    setSelectedColumns((prev) => ({ ...prev, [column]: !prev[column] }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Category Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Generate PDF reports by resident category with analytics</p>
      </div>

      {/* Insight KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340] dark:bg-slate-800/[0.06] flex items-center justify-center mb-2">
            <Users className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Total Population</p>
          <span className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">{adminStats.totalResidents.toLocaleString()}</span>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340] dark:bg-slate-800/[0.06] flex items-center justify-center mb-2">
            <BarChart3 className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Largest Category</p>
          <span className="text-lg font-bold text-[#0C2340] dark:text-blue-50">{largestName}</span>
          <p className="text-[10px] text-[#C5A55A] font-semibold mt-0.5">{largestDesc}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Fastest Growing</p>
          <span className="text-lg font-bold text-[#0C2340] dark:text-blue-50">{fastestGrowingName}</span>
          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">{fastestGrowingDesc}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Expiring Soon</p>
          <span className="text-2xl font-bold text-amber-600">{adminStats.expiringResidents}</span>
          <p className="text-[10px] text-slate-400 mt-0.5">Need renewal</p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-12 gap-6">
        {/* Distribution Pie */}
        <Card className="col-span-5 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-1">Age Distribution</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">Population breakdown</p>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={categoryDistribution} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" stroke="none" paddingAngle={3}>
                {categoryDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="text-[12px] font-bold" fill="#0C2340">{totalPop.toLocaleString()}</text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-[8px]" fill="#94a3b8">total</text>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {categoryDistribution.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-slate-600 dark:text-slate-400">{c.name}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#0C2340] dark:text-blue-50">{c.name === "No Data" ? "-" : c.value.toLocaleString()}</span>
                  <span className="text-emerald-600 font-medium">{c.name === "No Data" ? "" : `+${c.change}%`}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Comparative Bar */}
        <Card className="col-span-7 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-1">Category Comparison</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">Resident count by category</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600, color: "#0C2340" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={20} name="Residents">
                {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Layout Grid: Select Category (left) and Config (right) */}
      <div className="grid grid-cols-12 gap-6">
        {/* Category Selector */}
        <div className="col-span-12 lg:col-span-7">
          <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-3">Select Category</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                className={`text-left rounded-lg border-2 transition-all p-4 ${selectedCategories.includes(category.id)
                  ? "border-[#0C2340] bg-[#0C2340] dark:bg-slate-800/[0.03] ring-1 ring-[#0C2340]/20"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
                  }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${selectedCategories.includes(category.id) ? "bg-white/10 dark:bg-slate-800/10" : "bg-slate-100 dark:bg-slate-800"}`}>
                  <span className={`text-[11px] font-bold ${selectedCategories.includes(category.id) ? "text-white dark:text-blue-50" : "text-slate-500 dark:text-slate-400"}`}>{category.icon}</span>
                </div>
                <h4 className={`text-[12px] font-semibold mb-0.5 ${selectedCategories.includes(category.id) ? "text-white dark:text-blue-50" : "text-[#0C2340] dark:text-blue-50"}`}>{category.title}</h4>
                <p className={`text-[10px] ${selectedCategories.includes(category.id) ? "text-blue-100 dark:text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>{category.count}</p>
                {selectedCategories.includes(category.id) && (
                  <div className="flex items-center justify-end mt-1">
                    <div className="w-4 h-4 rounded-full bg-white/20 dark:bg-slate-800 flex items-center justify-center">
                      <span className="text-white text-[8px]">✓</span>
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Report Config */}
        <div className="col-span-12 lg:col-span-5">
          <Card className="shadow-sm overflow-hidden h-full">
            <div className="bg-slate-50 dark:bg-slate-950 px-5 py-3 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">Report Configuration</h3>
            </div>
            <div className="p-5 space-y-6">
              <div>
                <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Include Columns</h4>
                <div className="grid grid-cols-2 gap-4">
                  {(Object.keys(selectedColumns) as (keyof typeof selectedColumns)[]).map((col) => (
                    <button key={col} onClick={() => toggleColumn(col)} className="flex items-center gap-2.5 text-[12px] text-slate-800 dark:text-slate-200">
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selectedColumns[col] ? "bg-[#0C2340] dark:bg-slate-800 border-[#0C2340]" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-slate-400"
                        }`}>
                        {selectedColumns[col] && <span className="text-white text-[8px]">✓</span>}
                      </div>
                      {col.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Sort By</h4>
                <select className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900">
                  <option>Last Name (A-Z)</option>
                  <option>Last Name (Z-A)</option>
                  <option>Age (Youngest First)</option>
                  <option>Age (Oldest First)</option>
                </select>
              </div>
              
              <div className="pt-2 flex flex-col gap-3">
                <Button onClick={() => setShowDownloadDialog(true)} disabled={selectedCategories.length === 0} className="w-full bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]">Download PDF</Button>
                <Button variant="outline" className="w-full bg-transparent" disabled={selectedCategories.length === 0} onClick={handlePreview}>Preview</Button>
              </div>
            </div>
          </Card>
        </div>
      </div>



      {/* Download Dialog */}
      {showDownloadDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50 mb-3">Download PDF Report?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              This will download a PDF report for your selected categories with the specified columns sorted as requested.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDownloadDialog(false)} disabled={isDownloadingPdf}>Cancel</Button>
              <Button onClick={handleConfirmDownload} className="bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]" disabled={isDownloadingPdf}>
                {isDownloadingPdf ? "Downloading..." : "Confirm Download"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      <ModalOverlay isOpen={showPreviewModal} onClose={() => {
        setShowPreviewModal(false)
        if (previewPdfUrl) {
          URL.revokeObjectURL(previewPdfUrl)
          setPreviewPdfUrl(null)
        }
      }}>
        <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-5xl h-[85vh] p-6 shadow-2xl flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">PDF Preview</h3>
            <Button variant="outline" size="sm" onClick={() => {
              setShowPreviewModal(false)
              if (previewPdfUrl) {
                URL.revokeObjectURL(previewPdfUrl)
                setPreviewPdfUrl(null)
              }
            }}>Close</Button>
          </div>
          <div className="flex-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {previewPdfUrl && (
              <iframe 
                src={previewPdfUrl} 
                className="w-full h-full border-0" 
                title="PDF Preview"
              />
            )}
          </div>
        </div>
      </ModalOverlay>
    </div>
  )
}
