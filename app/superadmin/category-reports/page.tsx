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
import { useAdminData } from "@/hooks/use-admin-data"
import { useSuperAdminData } from "@/hooks/use-superadmin-data"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  Users, TrendingUp, AlertTriangle, BarChart3,
} from "lucide-react"

export default function CategoryReports() {
  const { stats: adminStats, residents } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  const barangayName = systemConfig?.barangayName || "Barangay Sample"
  const municipality = systemConfig?.address || "City of Sample"
  const contactNumber = systemConfig?.contactNumber || "(02) 8123-4567"
  const email = systemConfig?.emailAddress || "barangay@sample.gov.ph"
  const nonVoterCount = adminStats.totalResidents - adminStats.voterCount

  const barData = [
    { name: "Seniors", value: adminStats.seniorCount, color: "#0C2340" },
    { name: "Adults", value: adminStats.adultCount, color: "#2a5080" },
    { name: "Minors", value: adminStats.minorCount, color: "#C5A55A" },
    { name: "Voters", value: adminStats.voterCount, color: "#10b981" },
    { name: "Non-Voters", value: nonVoterCount, color: "#3b82f6" },
    { name: "Expired", value: adminStats.expiredResidents, color: "#ef4444" },
  ]

  const totalPop = adminStats.totalResidents || 1

  const categoryDistribution = [
    { name: "Seniors", value: adminStats.seniorCount, color: "#0C2340", change: 2.1 },
    { name: "Adults", value: adminStats.adultCount, color: "#2a5080", change: 0.5 },
    { name: "Minors", value: adminStats.minorCount, color: "#C5A55A", change: 3.2 },
  ].filter(c => c.value > 0)
  
  if (categoryDistribution.length === 0) {
    categoryDistribution.push({ name: "No Data", value: 1, color: "#f1f5f9", change: 0 })
  }



  const [selectedCategory, setSelectedCategory] = useState("voters")
  const [selectedColumns, setSelectedColumns] = useState({
    fullName: true, address: true, age: true, contactNumber: false,
    registrationDate: true, accountStatus: false, expiryDate: false, otherCategories: false,
  })
  const [showDownloadDialog, setShowDownloadDialog] = useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)

  const categories = [
    { id: "seniors", title: "Senior Citizens", count: `${adminStats.seniorCount} residents`, icon: "SC", reportTitle: "LIST OF SENIOR CITIZENS" },
    { id: "minors", title: "Minors (Under 18)", count: `${adminStats.minorCount} residents`, icon: "18", reportTitle: "LIST OF MINORS" },
    { id: "adults", title: "Adults", count: `${adminStats.adultCount} residents`, icon: "A", reportTitle: "LIST OF ADULTS" },
    { id: "voters", title: "Registered Voters", count: `${adminStats.voterCount} residents`, icon: "V", reportTitle: "LIST OF REGISTERED VOTERS" },
    { id: "non-voters", title: "Non-Voters", count: `${nonVoterCount} residents`, icon: "NV", reportTitle: "LIST OF NON-VOTERS" },
    { id: "expired", title: "Expired Accounts", count: `${adminStats.expiredResidents} residents`, icon: "EX", reportTitle: "LIST OF EXPIRED ACCOUNTS" },
    { id: "full", title: "Full Population", count: `${adminStats.totalResidents} residents`, icon: "All", reportTitle: "FULL POPULATION LIST" },
  ]

  const selectedCategoryObj = categories.find((c) => c.id === selectedCategory) || categories[3]
  const categoryResidentCount = selectedCategoryObj.count.split(" ")[0]

  const handleConfirmDownload = async () => {
    if (isDownloadingPdf) return

    setIsDownloadingPdf(true)
    
    try {
      const doc = new jsPDF()
      const title = selectedCategoryObj.reportTitle

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
      let filtered = residents;
      if (selectedCategory === "seniors") filtered = residents.filter(r => (r.age || 0) >= 60)
      else if (selectedCategory === "minors") filtered = residents.filter(r => (r.age || 0) < 18)
      else if (selectedCategory === "adults") filtered = residents.filter(r => (r.age || 0) >= 18 && (r.age || 0) < 60)
      else if (selectedCategory === "voters") filtered = residents.filter(r => r.isVoter)
      else if (selectedCategory === "non-voters") filtered = residents.filter(r => !r.isVoter)
      else if (selectedCategory === "expired") filtered = residents.filter(r => r.status === "Expired")
      
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

      doc.save(`Category_Report_${selectedCategory}.pdf`)
      showToastPreset("categoryReportDownloaded")
      setShowDownloadDialog(false)
    } catch(e) {
      console.error(e)
    }

    setIsDownloadingPdf(false)
  }

  const toggleColumn = (column: keyof typeof selectedColumns) => {
    setSelectedColumns((prev) => ({ ...prev, [column]: !prev[column] }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Category Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate PDF reports by resident category with analytics</p>
      </div>

      {/* Insight KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
            <Users className="w-4 h-4 text-[#0C2340]" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Total Population</p>
          <span className="text-2xl font-bold text-[#0C2340]">{adminStats.totalResidents.toLocaleString()}</span>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
            <BarChart3 className="w-4 h-4 text-[#0C2340]" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Largest Category</p>
          <span className="text-lg font-bold text-[#0C2340]">Adults (18-59)</span>
          <p className="text-[10px] text-[#C5A55A] font-semibold mt-0.5">66.0% of population</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Fastest Growing</p>
          <span className="text-lg font-bold text-[#0C2340]">Minors</span>
          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">+3.2% growth</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Expiring Soon</p>
          <span className="text-2xl font-bold text-amber-600">{adminStats.expiringResidents}</span>
          <p className="text-[10px] text-slate-400 mt-0.5">Need renewal</p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-12 gap-6">
        {/* Distribution Pie */}
        <Card className="col-span-5 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Age Distribution</h2>
          <p className="text-[11px] text-slate-500 mb-3">Population breakdown</p>
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
                  <span className="text-slate-600">{c.name}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#0C2340]">{c.value.toLocaleString()}</span>
                  <span className="text-emerald-600 font-medium">+{c.change}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Comparative Bar */}
        <Card className="col-span-7 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Category Comparison</h2>
          <p className="text-[11px] text-slate-500 mb-4">Resident count by category</p>
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

      {/* Category Selector */}
      <div>
        <h3 className="text-sm font-semibold text-[#0C2340] mb-3">Select Category</h3>
        <div className="grid grid-cols-4 gap-3">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`text-left rounded-lg border-2 transition-all p-4 ${selectedCategory === category.id
                ? "border-[#0C2340] bg-[#0C2340]/[0.03] ring-1 ring-[#0C2340]/20"
                : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${selectedCategory === category.id ? "bg-[#0C2340]/10" : "bg-slate-100"}`}>
                <span className={`text-[11px] font-bold ${selectedCategory === category.id ? "text-[#0C2340]" : "text-slate-500"}`}>{category.icon}</span>
              </div>
              <h4 className="text-[12px] font-semibold text-[#0C2340] mb-0.5">{category.title}</h4>
              <p className={`text-[10px] ${selectedCategory === category.id ? "text-[#0C2340]" : "text-slate-500"}`}>{category.count}</p>
              {selectedCategory === category.id && (
                <div className="flex items-center justify-end mt-1">
                  <div className="w-4 h-4 rounded-full bg-[#0C2340] flex items-center justify-center">
                    <span className="text-white text-[8px]">✓</span>
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Report Config + Preview */}
      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-7 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
            <h3 className="text-[12px] font-semibold text-[#0C2340]">Report Configuration: {selectedCategoryObj.title}</h3>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Include Columns</h4>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(selectedColumns) as (keyof typeof selectedColumns)[]).map((col) => (
                  <button key={col} onClick={() => toggleColumn(col)} className="flex items-center gap-2.5 text-[12px] text-slate-800">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${selectedColumns[col] ? "bg-[#0C2340] border-[#0C2340]" : "border-slate-300 bg-white hover:border-slate-400"
                      }`}>
                      {selectedColumns[col] && <span className="text-white text-[8px]">✓</span>}
                    </div>
                    {col.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Sort By</h4>
              <select className="w-52 px-3 py-2 border border-slate-200 rounded-md text-sm">
                <option>Last Name (A-Z)</option>
                <option>Last Name (Z-A)</option>
                <option>Age (Youngest First)</option>
                <option>Age (Oldest First)</option>
              </select>
            </div>
          </div>
        </Card>

        <Card className="col-span-5 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
            <h3 className="text-[12px] font-semibold text-[#0C2340]">PDF Preview</h3>
          </div>
          <div className="p-5">
            <div className="bg-slate-50 border border-slate-200 rounded p-4 h-64 flex flex-col">
              <div className="text-center space-y-1 mb-3">
                <p className="text-[8px] text-slate-500">Republic of the Philippines</p>
                <p className="text-[8px] text-slate-500">{municipality}</p>
                <p className="text-[8px] text-slate-500">{barangayName}</p>
                <div className="w-5 h-5 bg-slate-200 rounded mx-auto mt-1" />
              </div>
              <div className="h-px bg-slate-200 mb-2" />
              <p className="text-[9px] font-bold text-[#0C2340] text-center mb-0.5">{selectedCategoryObj.reportTitle}</p>
              <p className="text-[7px] text-slate-500 text-center mb-2">As of February 20, 2026</p>
              <div className="bg-slate-200 h-3 rounded mb-1 flex gap-0.5 px-1">
                {selectedColumns.fullName && <div className="flex-1 h-full rounded bg-slate-300" />}
                {selectedColumns.address && <div className="flex-1 h-full rounded bg-slate-300" />}
                {selectedColumns.age && <div className="flex-1 h-full rounded bg-slate-300" />}
                {selectedColumns.contactNumber && <div className="flex-1 h-full rounded bg-slate-300" />}
              </div>
              <div className="space-y-0.5">
                <div className="h-2.5 bg-slate-100 rounded" />
                <div className="h-2.5 bg-slate-100 rounded" />
                <div className="h-2.5 bg-slate-100 rounded" />
              </div>
              <p className="text-[6px] text-slate-400 text-center mt-2">
                ... {Math.max(0, Number.parseInt(categoryResidentCount.replace(/,/g, "")) - 3)} more rows
              </p>
              <div className="flex-1" />
              <div className="mt-3 border-t border-slate-200 pt-2 text-center">
                <p className="text-[6px] text-slate-400">Contact Us: {contactNumber} | Email: {email}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Download Buttons */}
      <div className="flex gap-3">
        <Button onClick={() => setShowDownloadDialog(true)} className="bg-[#0C2340] hover:bg-[#0a1c33] px-8">Download PDF</Button>
        <Button variant="outline" className="bg-transparent">Preview</Button>
      </div>

      {/* Download Dialog */}
      {showDownloadDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-[#0C2340] mb-3">Download PDF Report?</h3>
            <p className="text-sm text-slate-600 mb-6">
              This will download a PDF report for {selectedCategoryObj.title} ({categoryResidentCount} residents) with the selected columns sorted by Last Name (A-Z).
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDownloadDialog(false)} disabled={isDownloadingPdf}>Cancel</Button>
              <Button onClick={handleConfirmDownload} className="bg-[#0C2340] hover:bg-[#0a1c33]" disabled={isDownloadingPdf}>
                {isDownloadingPdf ? "Downloading..." : "Confirm Download"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
