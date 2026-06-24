"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/use-admin-data"
import { useSuperAdminData } from "@/hooks/use-superadmin-data"
import { showToastPreset } from "@/lib/app-toast"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { Users, TrendingUp, Award, Loader2 } from "lucide-react"

export default function CategoryReports() {
  const { stats, residents } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  
  const barangayName = systemConfig?.barangayName || "Barangay Sample"
  const municipality = systemConfig?.address || "City of Sample"
  const contactNumber = systemConfig?.contactNumber || "(02) 8123-4567"
  const email = systemConfig?.emailAddress || "barangay@sample.gov.ph"

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)



  const [selectedCategory, setSelectedCategory] = useState("voters")
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
    { id: "all", name: "Full Population", icon: "👥", count: stats.totalResidents, color: "bg-purple-50", iconBg: "bg-purple-100" },
  ]

  const categoryDistribution = [
    { name: "Senior", value: stats.seniorCount, color: "#2563eb" },
    { name: "Minor", value: stats.minorCount, color: "#d97706" },
    { name: "Adult", value: stats.adultCount, color: "#16a34a" },
  ]

  const getSelectedCategoryInfo = () => categories.find((c) => c.id === selectedCategory)

  const getCategoryTitle = () => {
    const titles: Record<string, string> = {
      senior: "LIST OF SENIOR CITIZENS", minor: "LIST OF MINORS", adult: "LIST OF ADULTS",
      voters: "LIST OF REGISTERED VOTERS", "non-voters": "LIST OF NON-VOTERS",
      expired: "LIST OF EXPIRED ACCOUNTS", all: "COMPLETE POPULATION LIST",
    }
    return titles[selectedCategory] || "REPORT"
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
  const selectedCategoryInfo = getSelectedCategoryInfo()

  let filteredResidents = residents;
  if (selectedCategory === "senior") filteredResidents = residents.filter(r => (r.age || 0) >= 60)
  else if (selectedCategory === "minor") filteredResidents = residents.filter(r => (r.age || 0) < 18)
  else if (selectedCategory === "adult") filteredResidents = residents.filter(r => (r.age || 0) >= 18 && (r.age || 0) < 60)
  else if (selectedCategory === "voters") filteredResidents = residents.filter(r => r.isVoter)
  else if (selectedCategory === "non-voters") filteredResidents = residents.filter(r => !r.isVoter)
  else if (selectedCategory === "expired") filteredResidents = residents.filter(r => r.status === "Expired")

  const handleDownload = async () => {
    if (isDownloadingPdf) return

    setIsDownloadingPdf(true)
    
    try {
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

      doc.save(`Category_Report_${selectedCategory}.pdf`)
      showToastPreset("categoryReportDownloaded")
    } catch(e) {
      console.error(e)
    }

    setIsDownloadingPdf(false)
  }

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Category Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate PDF reports by resident category</p>
      </div>

      {/* Insight Strip + Charts */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-4 grid grid-cols-1 gap-4">
          <Card className="p-4 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center"><Users className="w-5 h-5 text-[#0C2340]" /></div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Population</p>
              <p className="text-xl font-bold text-[#0C2340]">{stats.totalResidents.toLocaleString()}</p>
            </div>
          </Card>
          <Card className="p-4 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><Award className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Largest Category</p>
              <p className="text-xl font-bold text-emerald-600">Adults</p>
              <p className="text-[10px] text-slate-400">1,812 residents (63.6%)</p>
            </div>
          </Card>
          <Card className="p-4 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Fastest Growing</p>
              <p className="text-xl font-bold text-amber-600">Minors</p>
              <p className="text-[10px] text-slate-400">+2.9% this quarter</p>
            </div>
          </Card>
        </div>
        <Card className="col-span-8 p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Category Distribution</h3>
          <div className="flex items-center gap-4">
            <div className="w-28 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryDistribution} cx="50%" cy="50%" innerRadius={24} outerRadius={48} dataKey="value" stroke="none">
                    {categoryDistribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {categoryDistribution.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="text-[10px] text-slate-600">{c.name}</span>
                  <span className="text-[10px] font-bold text-[#0C2340]">{c.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

      </div>

      {/* Category Selection */}
      <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Select Category</h3>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={`relative p-5 rounded-lg text-left transition-all ${selectedCategory === category.id
              ? `${category.color} border-2 border-[#0C2340]`
              : "bg-white border-2 border-slate-200 hover:border-slate-300"
              }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className={`w-9 h-9 rounded-lg ${category.iconBg} flex items-center justify-center text-base`}>{category.icon}</div>
              {selectedCategory === category.id && (
                <div className="w-5 h-5 rounded-full bg-[#0C2340] flex items-center justify-center"><span className="text-white text-xs">✓</span></div>
              )}
            </div>
            <p className="text-[11px] font-semibold text-[#0C2340] mb-1">{category.name}</p>
            <p className="text-[10px] text-slate-500">{category.count} residents</p>
            <span className="absolute top-5 right-5 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-500">PDF</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Report Configuration */}
        <Card className="col-span-7 shadow-sm">
          <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg">
            <h3 className="text-sm font-semibold text-[#0C2340]">Report Configuration: {selectedCategoryInfo?.name}</h3>
          </div>
          <div className="p-5">
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Include Columns</h4>
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
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${checked ? "bg-[#0C2340] border-[#0C2340]" : "bg-white border-slate-300"}`}
                    >
                      {checked && <span className="text-white text-sm">✓</span>}
                    </button>
                    <span className="text-[11px] text-[#0C2340]">{labels[key]}</span>
                  </label>
                )
              })}
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Sort By</label>
              <select className="w-48 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#0C2340]">
                <option>Last Name (A-Z)</option>
                <option>First Name (A-Z)</option>
                <option>Age (Ascending)</option>
                <option>Registration Date</option>
              </select>
            </div>
          </div>
        </Card>

        {/* PDF Preview */}
        <Card className="col-span-5 shadow-sm">
          <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg">
            <h3 className="text-sm font-semibold text-[#0C2340]">PDF Preview</h3>
          </div>
          <div className="p-5">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded min-h-[220px] overflow-y-auto text-[8px]">
              <div className="text-center space-y-2 mb-4">
                <p className="text-[9px] text-slate-600">Republic of the Philippines</p>
                <p className="text-[9px] text-slate-600">{municipality}</p>
                <p className="text-[9px] text-slate-600">{barangayName}</p>
                <hr className="border-slate-300" />
                <p className="text-[10px] font-bold text-[#0C2340] my-3">{getCategoryTitle()}</p>
                <p className="text-[8px] text-slate-600">As of November 27, 2025</p>
              </div>
              <div className="space-y-1">
                <div className="grid gap-1 bg-slate-200 p-1 text-[7px] text-slate-600 font-bold">
                  <div className="flex items-center">
                    <div className="w-8">No.</div>
                    {previewColumns.map((col) => <div key={col.id} className="flex-1">{col.label}</div>)}
                  </div>
                </div>
                {filteredResidents.length > 0 ? (
                  filteredResidents.slice(0, 3).map((r, index) => (
                    <div key={r.id} className="grid gap-1 text-[7px] text-slate-900 p-1">
                      <div className="flex items-center">
                        <div className="w-8">{index + 1}</div>
                        {previewColumns.map((col) => (
                          <div key={col.id} className="flex-1 truncate pr-1">
                            {col.id === "name" ? r.name :
                              col.id === "address" ? r.address :
                                col.id === "age" ? (r.age?.toString() || "N/A") :
                                  col.id === "contact" ? (r.contactNumber || "N/A") :
                                    col.id === "registration" ? ((r as any).createdAt ? new Date((r as any).createdAt).toLocaleDateString() : "N/A") :
                                      col.id === "status" ? r.status :
                                        col.id === "expiry" ? "N/A" : "Voter"}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-[7px] text-slate-400">No residents found in this category.</div>
                )}
                {filteredResidents.length > 3 && (
                  <p className="text-[7px] text-slate-400 text-center pt-2">... {filteredResidents.length - 3} more rows</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mt-6">
        <Button 
          onClick={handleDownload} 
          disabled={isDownloadingPdf}
          className="w-48 h-11 bg-[#0C2340] hover:bg-[#0a1c33]"
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
        <Button variant="outline" className="w-40 h-11 bg-transparent">Preview</Button>
      </div>
    </AdminPageShell>
  )
}
