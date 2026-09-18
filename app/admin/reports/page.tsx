"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/admin"
import { useSuperAdminData } from "@/hooks/superadmin"
import { showToastPreset } from "@/lib/app-toast"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import { Users, TrendingUp, Award, Loader2 } from "lucide-react"
import { ModalOverlay } from "@/components/ui/modal-overlay"

export default function CategoryReports() {
  const { stats, residents } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  
  const barangayName = systemConfig?.barangayName || "Barangay Sample"
  const municipality = systemConfig?.address || "City of Sample"
  const contactNumber = systemConfig?.contactNumber || "(02) 8123-4567"
  const email = systemConfig?.emailAddress || "barangay@sample.gov.ph"

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)



  const [selectedCategories, setSelectedCategories] = useState<string[]>(["voters"])
  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(id)) {
        return prev.filter(c => c !== id)
      }
      return [...prev, id]
    })
  }
  const [selectedColumns, setSelectedColumns] = useState({
    name: true,
    address: true,
    age: true,
    contact: false,
    registration: true,
    status: false,
    expiry: false,
    categories: false,
  })

  const categories = [
    { id: "senior", name: "Senior Citizens", icon: "👴", count: stats.seniorCount, color: "bg-blue-50", iconBg: "bg-blue-100" },
    { id: "minor", name: "Minors (Under 18)", icon: "👶", count: stats.minorCount, color: "bg-amber-50", iconBg: "bg-amber-100" },
    { id: "adult", name: "Adults", icon: "👤", count: stats.adultCount, color: "bg-green-50", iconBg: "bg-green-100" },
    { id: "voters", name: "Registered Voters", icon: "🗳️", count: stats.voterCount, color: "bg-blue-50", iconBg: "bg-blue-100" },
    { id: "non-voters", name: "Non-Voters", icon: "✗", count: stats.totalResidents - stats.voterCount, color: "bg-red-50", iconBg: "bg-red-100" },
    { id: "expired", name: "Expired Accounts", icon: "⏰", count: stats.expiredResidents, color: "bg-red-50", iconBg: "bg-red-100" },
    { id: "male", name: "Male", icon: "👨", count: residents.filter(r => r.gender === "Male").length, color: "bg-cyan-50", iconBg: "bg-cyan-100" },
    { id: "female", name: "Female", icon: "👩", count: residents.filter(r => r.gender === "Female").length, color: "bg-pink-50", iconBg: "bg-pink-100" },
    { id: "other-gender", name: "Other Genders", icon: "🧑", count: residents.filter(r => r.gender === "Other").length, color: "bg-slate-50", iconBg: "bg-slate-200" },
    { id: "all", name: "Full Population", icon: "👥", count: stats.totalResidents, color: "bg-purple-50", iconBg: "bg-purple-100" },
  ]

  const rawCategoryDistribution = [
    { name: "Senior", value: stats.seniorCount, color: "#2563eb" },
    { name: "Minor", value: stats.minorCount, color: "#d97706" },
    { name: "Adult", value: stats.adultCount, color: "#16a34a" },
  ]
  const categoryDistribution = rawCategoryDistribution.filter(c => c.value > 0)
  if (categoryDistribution.length === 0) {
    categoryDistribution.push({ name: "No Data", value: 1, color: "#f1f5f9" })
  }

  const largestCategory = rawCategoryDistribution.sort((a, b) => b.value - a.value)[0]
  const largestName = largestCategory && largestCategory.value > 0 ? largestCategory.name : "N/A"
  const largestPct = largestCategory && stats.totalResidents > 0 ? ((largestCategory.value / stats.totalResidents) * 100).toFixed(1) : "0.0"
  const largestDesc = largestCategory && largestCategory.value > 0 ? `${largestCategory.value.toLocaleString()} residents (${largestPct}%)` : "No data available"

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentResidents = residents.filter(r => r.createdAt && new Date(r.createdAt) >= thirtyDaysAgo)

  let fastestCategory = "N/A"
  let fastestCount = 0

  if (recentResidents.length > 0) {
    const growth: Record<string, number> = {
      "Seniors": recentResidents.filter(r => (r.age || 0) >= 60).length,
      "Minors": recentResidents.filter(r => (r.age || 0) < 18).length,
      "Adults": recentResidents.filter(r => (r.age || 0) >= 18 && (r.age || 0) < 60).length,
      "Voters": recentResidents.filter(r => r.isVoter).length,
    }

    for (const [cat, count] of Object.entries(growth)) {
      if (count > fastestCount) {
        fastestCount = count
        fastestCategory = cat
      }
    }
  }

  const fastestGrowingName = fastestCategory
  const fastestGrowingDesc = fastestCount > 0 ? `+${fastestCount} this month` : "No recent growth"

  const getCategoryTitle = () => {
    if (selectedCategories.length === 0) return "NO CATEGORIES SELECTED"
    if (selectedCategories.length === 1) {
      const titles: Record<string, string> = {
        senior: "LIST OF SENIOR CITIZENS", minor: "LIST OF MINORS", adult: "LIST OF ADULTS",
        voters: "LIST OF REGISTERED VOTERS", "non-voters": "LIST OF NON-VOTERS",
        expired: "LIST OF EXPIRED ACCOUNTS", all: "COMPLETE POPULATION LIST",
        male: "LIST OF MALE RESIDENTS", female: "LIST OF FEMALE RESIDENTS", "other-gender": "LIST OF OTHER GENDERS",
      }
      return titles[selectedCategories[0]] || "REPORT"
    }
    return "MULTIPLE CATEGORIES REPORT"
  }

  const getPreviewColumns = () => {
    const labels: Record<string, string> = {
      name: "Name", address: "Address", age: "Age", contact: "Contact",
      registration: "Reg. Date", status: "Status", expiry: "Expiry", categories: "Categories",
    }
    return Object.entries(selectedColumns)
      .filter(([, checked]) => checked)
      .map(([key]) => ({ id: key, label: labels[key] }))
  }

  const previewColumns = getPreviewColumns()
  const filteredResidents = residents.filter(r => {
    if (selectedCategories.includes("all")) return true
    let match = false
    if (selectedCategories.includes("senior") && (r.age || 0) >= 60) match = true
    if (selectedCategories.includes("minor") && (r.age || 0) < 18) match = true
    if (selectedCategories.includes("adult") && (r.age || 0) >= 18 && (r.age || 0) < 60) match = true
    if (selectedCategories.includes("voters") && r.isVoter) match = true
    if (selectedCategories.includes("non-voters") && !r.isVoter) match = true
    if (selectedCategories.includes("expired") && r.status === "Expired") match = true
    if (selectedCategories.includes("male") && r.gender === "Male") match = true
    if (selectedCategories.includes("female") && r.gender === "Female") match = true
    if (selectedCategories.includes("other-gender") && r.gender === "Other") match = true
    return match
  })

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

    // Map columns
    const cols = []
    if (selectedColumns.name) cols.push("Full Name")
    if (selectedColumns.address) cols.push("Address")
    if (selectedColumns.age) cols.push("Age")
    if (selectedColumns.contact) cols.push("Contact")
    if (selectedColumns.registration) cols.push("Reg. Date")
    if (selectedColumns.status) cols.push("Status")

    const body = filteredResidents.map(r => {
      const row = []
      if (selectedColumns.name) row.push(r.name)
      if (selectedColumns.address) row.push(r.address)
      if (selectedColumns.age) row.push(r.age?.toString() || "N/A")
      if (selectedColumns.contact) row.push(r.contactNumber || "N/A")
      if (selectedColumns.registration) row.push((r as any).createdAt ? new Date((r as any).createdAt).toLocaleDateString() : "N/A")
      if (selectedColumns.status) row.push(r.status)
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

  const handleDownload = async () => {
    if (isDownloadingPdf) return

    setIsDownloadingPdf(true)
    
    try {
      const doc = generatePDFDocument()
      doc.save(`Category_Report.pdf`)
      showToastPreset("categoryReportDownloaded")
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

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Category Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Generate PDF reports by resident category</p>
      </div>

      {/* Insight Strip */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <Card className="p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center"><Users className="w-6 h-6 text-[#0C2340] dark:text-blue-50" /></div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Total Population</p>
            <p className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">{stats.totalResidents.toLocaleString()}</p>
          </div>
        </Card>
        <Card className="p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center"><Award className="w-6 h-6 text-emerald-600" /></div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Largest Category</p>
            <p className="text-2xl font-bold text-emerald-600">{largestName}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{largestDesc}</p>
          </div>
        </Card>
        <Card className="p-5 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center"><TrendingUp className="w-6 h-6 text-amber-600" /></div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Fastest Growing</p>
            <p className="text-2xl font-bold text-amber-600">{fastestGrowingName}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{fastestGrowingDesc}</p>
          </div>
        </Card>
      </div>

      {/* Settings Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Category Selection */}
        <div className="col-span-1 md:col-span-6 lg:col-span-7">
          <h3 className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Select Categories</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            {categories.map((category) => {
              const isSelected = selectedCategories.includes(category.id)
              return (
                <button
                  key={category.id}
                  onClick={() => toggleCategory(category.id)}
                  className={`relative p-5 rounded-lg text-left transition-all ${isSelected
                    ? `${category.color} border-2 border-[#0C2340]`
                    : "bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:border-slate-600"
                    }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className={`w-9 h-9 rounded-lg ${category.iconBg} flex items-center justify-center text-base`}>{category.icon}</div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-[#0C2340] dark:bg-slate-800 flex items-center justify-center"><span className="text-white text-xs">✓</span></div>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-[#0C2340] dark:text-blue-50 mb-1">{category.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{category.count} residents</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Report Configuration */}
        <div className="col-span-1 md:col-span-6 lg:col-span-5 space-y-6">
          <Card className="shadow-sm p-0 gap-0 overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Report Configuration</h3>
              <span className="text-[11px] font-medium px-2 py-0.5 bg-[#0C2340]/10 dark:bg-slate-800 text-[#0C2340] dark:text-blue-50 rounded-full">
                {filteredResidents.length} {filteredResidents.length === 1 ? 'resident' : 'residents'} selected
              </span>
            </div>
            <div className="p-5">
              <h4 className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Include Columns</h4>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {Object.entries(selectedColumns).map(([key, checked]) => {
                  const labels: Record<string, string> = {
                    name: "Full Name", address: "Address", age: "Age", contact: "Contact Number",
                    registration: "Registration Date", status: "Account Status", expiry: "Expiry Date", categories: "Other Categories",
                  }
                  return (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <button
                        type="button"
                        onClick={() => setSelectedColumns((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${checked ? "bg-[#0C2340] dark:bg-slate-800 border-[#0C2340]" : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"}`}
                      >
                        {checked && <span className="text-white text-sm">✓</span>}
                      </button>
                      <span className="text-[11px] text-[#0C2340] dark:text-blue-50">{labels[key]}</span>
                    </label>
                  )
                })}
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Sort By</label>
                <select className="w-48 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0C2340]">
                  <option>Last Name (A-Z)</option>
                  <option>First Name (A-Z)</option>
                  <option>Age (Ascending)</option>
                  <option>Registration Date</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <Button 
              onClick={handleDownload} 
              disabled={isDownloadingPdf || selectedCategories.length === 0}
              className="w-full h-11 bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]"
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                "Download PDF"
              )}
            </Button>
            <Button 
              onClick={handlePreview} 
              disabled={isDownloadingPdf || selectedCategories.length === 0}
              variant="outline"
              className="w-full h-11 bg-transparent border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              Preview PDF
            </Button>
          </div>
        </div>
      </div>

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
    </AdminPageShell>
  )
}
