"use client"

import { useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, Legend,
} from "recharts"
import { Card } from "@/components/ui/card"
import { ModalOverlay } from "@/components/ui/modal-overlay"
import { Button } from "@/components/ui/button"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { useAdminData } from "@/hooks/admin"
import { useSuperAdminData } from "@/hooks/superadmin"
import { useMounted } from "@/hooks/use-mounted"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  TrendingUp, BarChart3, AlertTriangle, Target, Layers, FileText,
} from "lucide-react"

const PIE_COLORS = ["#0C2340", "#1a3a5c", "#2a5080", "#3b82f6", "#C5A55A", "#94a3b8", "#64748b"]
const BAR_COLORS = ["#0C2340", "#3b82f6", "#10b981"]

export default function ReasonAnalytics() {
  const { documentRequests, residents } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  const mounted = useMounted()
  
  const barangayName = systemConfig?.barangayName || "Barangay Sample"
  const municipality = systemConfig?.address || "City of Sample"
  const contactNumber = systemConfig?.contactNumber || "(02) 8123-4567"
  const email = systemConfig?.emailAddress || "barangay@sample.gov.ph"
  const [showExportCSV, setShowExportCSV] = useState(false)
  const [showExportPDF, setShowExportPDF] = useState(false)
  const [isExportingCsv, setIsExportingCsv] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [lastExport, setLastExport] = useState(0)

  const [selectedYear, setSelectedYear] = useState<string>("All")
  const [selectedMonth, setSelectedMonth] = useState<string>("All")
  const [selectedDocType, setSelectedDocType] = useState<string>("All Documents")
  const [selectedCategory, setSelectedCategory] = useState<string>("All Categories")

  const currentYear = new Date().getFullYear()
  const yearsList = Array.from(new Set(documentRequests.map(r => {
    if (!r.createdAt) return null;
    const date = new Date(r.createdAt);
    return date.getFullYear();
  }).filter((y): y is number => y !== null))).sort((a, b) => b - a)
  
  if (yearsList.length === 0) yearsList.push(currentYear)

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  const availableDocTypes = Array.from(new Set([
    ...(systemConfig?.documentTypes || [
      "Barangay Clearance",
      "Certificate of Indigency",
      "Proof of Residency",
      "Certificate of Residency",
    ]),
    ...documentRequests.map(r => r.documentType).filter(Boolean)
  ]))

  // Helper to extract demographic categories from request snapshot or resident profile
  const getRequestCategories = (r: typeof documentRequests[0]): string[] => {
    const cats = new Set<string>()
    const lifecycleWords = ["active", "inactive", "verified", "unverified", "pending", "expired", "expiring", "rejected"]

    // 1. Snapshot demographic category (excluding lifecycle status strings)
    if (r.residentCategory && !lifecycleWords.includes(r.residentCategory.toLowerCase().trim())) {
      cats.add(r.residentCategory.trim())
    }

    // 2. Cross-reference resident profile
    const resident = residents.find(res => res.id === r.residentId || (r.residentName && res.name.toLowerCase() === r.residentName.toLowerCase()))
    if (resident) {
      if (Array.isArray(resident.categories)) {
        resident.categories.forEach(c => {
          if (!lifecycleWords.includes(c.toLowerCase().trim())) {
            cats.add(c.trim())
          }
        })
      }
      if (resident.isVoter) cats.add("Registered Voter")
      if (resident.age >= 60) cats.add("Senior Citizen")
      if (resident.age > 0 && resident.age < 18) cats.add("Minor")
      if (resident.age >= 18 && resident.age < 60) cats.add("Adult")
    }
    return Array.from(cats)
  }

  const matchesCategory = (r: typeof documentRequests[0], cat: string): boolean => {
    if (cat === "All Categories" || cat === "All") return true
    const cats = getRequestCategories(r).map(c => c.toLowerCase())
    if (cat === "Senior Citizens") return cats.some(c => c.includes("senior"))
    if (cat === "Adults") return cats.some(c => c.includes("adult") || c === "resident")
    if (cat === "Minors") return cats.some(c => c.includes("minor") || c.includes("underage"))
    if (cat === "Registered Voters") return cats.some(c => c.includes("voter"))
    if (cat === "PWD") return cats.some(c => c.includes("pwd"))
    if (cat === "Solo Parents") return cats.some(c => c.includes("solo parent"))
    return cats.includes(cat.toLowerCase())
  }

  const filteredRequests = documentRequests.filter(r => {
    if (selectedDocType !== "All Documents" && r.documentType !== selectedDocType) return false
    if (!matchesCategory(r, selectedCategory)) return false
    if (!r.createdAt && (selectedYear !== "All" || selectedMonth !== "All")) return false
    
    if (r.createdAt) {
      const date = new Date(r.createdAt)
      if (selectedYear !== "All" && date.getFullYear().toString() !== selectedYear) return false
      if (selectedMonth !== "All" && date.getMonth().toString() !== selectedMonth) return false
    }
    return true
  })

  const handleExportCsv = async () => {
    if (isExportingCsv) return
    const now = Date.now()
    if (now - lastExport < 5000) {
      showToastPreset("actionRateLimited")
      return
    }
    setLastExport(now)

    setIsExportingCsv(true)
    try {
      const filterMetadata = `# Filter: DocType=${selectedDocType}, Category=${selectedCategory}, Year=${selectedYear}, Month=${selectedMonth}`
      const headers = ["Rank,Reason,Count,Percentage"]
      const rows = reasonAnalytics.map(r => `${r.rank},"${r.reason.replace(/"/g, '""')}",${r.count},${r.percentage}%`)
      const csvContent = [filterMetadata, ...headers, ...rows].join("\n")
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", `Reason_Analytics_${selectedYear}_${selectedMonth}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToastPreset("reasonCsvExported")
      setShowExportCSV(false)
    } catch (e) {
      console.error(e)
    }
    setIsExportingCsv(false)
  }

  const handleExportPdf = async () => {
    if (isExportingPdf) return
    const now = Date.now()
    if (now - lastExport < 5000) {
      showToastPreset("actionRateLimited")
      return
    }
    setLastExport(now)

    setIsExportingPdf(true)
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      
      // Header
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text("Republic of the Philippines", pageWidth / 2, 20, { align: "center" })
      doc.text(municipality, pageWidth / 2, 25, { align: "center" })
      doc.text(barangayName, pageWidth / 2, 30, { align: "center" })
      
      // Title
      doc.setFontSize(14)
      doc.setTextColor(12, 35, 64) // #0C2340
      doc.setFont("helvetica", "bold")
      doc.text("REASON ANALYTICS REPORT", pageWidth / 2, 45, { align: "center" })
      
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.setFont("helvetica", "normal")
      doc.text(`Filters: ${selectedDocType} | ${selectedCategory} | ${selectedYear} ${selectedMonth !== "All" ? monthNames[parseInt(selectedMonth)] : ""}`, pageWidth / 2, 51, { align: "center" })
      doc.text(`Generated on: ${new Date().toLocaleDateString()} | Total Analyzed: ${totalRequests}`, pageWidth / 2, 56, { align: "center" })

      autoTable(doc, {
        startY: 65,
        head: [['Rank', 'Reason', 'Count', 'Percentage']],
        body: reasonAnalytics.length > 0 
          ? reasonAnalytics.map(r => [r.rank.toString(), r.reason, r.count.toString(), `${r.percentage}%`])
          : [['-', 'No requests found for selected period', '0', '0%']],
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

      doc.save(`Reason_Analytics_Report_${selectedYear}.pdf`)
      showToastPreset("reasonPdfExported")
      setShowExportPDF(false)
    } catch (e) {
      console.error(e)
    }
    setIsExportingPdf(false)
  }

  // Calculate reasonAnalytics dynamically (Finding #12: separate real total from division guard)
  const purposeCounts: Record<string, number> = {}
  filteredRequests.forEach(r => {
    const p = r.purpose || "Other"
    purposeCounts[p] = (purposeCounts[p] || 0) + 1
  })
  const totalRequests = filteredRequests.length
  const safeTotalRequests = Math.max(1, filteredRequests.length)

  const reasonAnalytics = Object.entries(purposeCounts).map(([reason, count]) => ({
    reason,
    count,
    percentage: totalRequests === 0 ? 0 : Math.round((count / safeTotalRequests) * 100)
  })).sort((a, b) => b.count - a.count).map((r, i) => ({ ...r, rank: i + 1 }))

  const reasonPieData = reasonAnalytics.map((r) => ({
    name: r.reason.length > 15 ? r.reason.slice(0, 12) + "..." : r.reason,
    value: r.count,
  }))

  const topReason = reasonAnalytics.length > 0 ? reasonAnalytics[0] : { reason: "None", percentage: 0 }

  // Build reasonTrendData from filteredRequests grouped by month
  const monthCounts: Record<string, Record<string, number>> = {}
  filteredRequests.forEach(r => {
    const ts = r.createdAt ? new Date(r.createdAt) : null
    if (!ts || isNaN(ts.getTime())) return
    const monthKey = monthNames[ts.getMonth()]
    if (!monthCounts[monthKey]) monthCounts[monthKey] = {}
    const p = r.purpose || "Other"
    monthCounts[monthKey][p] = (monthCounts[monthKey][p] || 0) + 1
  })
  // Get top 4 purposes for trend lines
  const top4Purposes = reasonAnalytics.slice(0, 4).map(r => r.reason)
  const reasonTrendData = Object.entries(monthCounts).map(([month, purposes]) => {
    const entry: any = { month }
    top4Purposes.forEach((p, i) => { entry[`reason${i}`] = purposes[p] || 0 })
    return entry
  })

  // Finding #13: Stable purpose keys shared by every row, derived from actual/configured data
  const top3Purposes = top4Purposes.slice(0, 3)
  const activeDocTypes = selectedDocType !== "All Documents" 
    ? [selectedDocType]
    : availableDocTypes.filter(dt => filteredRequests.some(r => r.documentType === dt))
  
  const displayDocTypes = activeDocTypes.length > 0 ? activeDocTypes : availableDocTypes.slice(0, 3)

  const reasonByDocType = displayDocTypes.map(docType => {
    const subset = filteredRequests.filter(r => r.documentType === docType)
    const subsetTotal = subset.length
    const safeSubsetTotal = Math.max(1, subsetTotal)
    const purposeBreakdown: Record<string, number> = {}
    subset.forEach(r => {
      const p = r.purpose || "Other"
      purposeBreakdown[p] = (purposeBreakdown[p] || 0) + 1
    })

    const entry: any = { 
      docType: docType.replace("Certificate of ", "").replace("Proof of ", "") 
    }
    
    // Assign stable shared purpose keys rather than independent row rankings
    let accountedCount = 0
    top3Purposes.forEach(p => {
      const count = purposeBreakdown[p] || 0
      accountedCount += count
      entry[p] = subsetTotal === 0 ? 0 : Math.round((count / safeSubsetTotal) * 100)
    })
    const otherCount = Math.max(0, subsetTotal - accountedCount)
    entry.other = subsetTotal === 0 ? 0 : Math.round((otherCount / safeSubsetTotal) * 100)
    return entry
  })

  // Calculate real growth
  const now = Date.now()
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  const thisMonth = documentRequests.filter(r => r.createdAt && (now - r.createdAt) < thirtyDaysMs).length
  const lastMonth = documentRequests.filter(r => r.createdAt && (now - r.createdAt) >= thirtyDaysMs && (now - r.createdAt) < thirtyDaysMs * 2).length
  const growthPct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : thisMonth > 0 ? 100 : 0

  if (!mounted) {
    return <div className="flex h-full items-center justify-center p-8">Loading analytics...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Reason Behavior Analytics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Analyze and understand why residents request documents</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowExportCSV(true)}>Export CSV</Button>
          <Button onClick={() => setShowExportPDF(true)} className="bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]">Export PDF</Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 shadow-sm">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Document Type</label>
            <select
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
            >
              <option value="All Documents">All Documents</option>
              {availableDocTypes.map(dt => (
                <option key={dt} value={dt}>{dt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
            >
              <option value="All">All Years</option>
              {yearsList.map(y => <option key={y} value={y.toString()}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
            >
              <option value="All">All Months</option>
              {monthNames.map((m, i) => <option key={m} value={i.toString()}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Category</label>
            <select 
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
            >
              <option value="All Categories">All Categories</option>
              <option value="Senior Citizens">Senior Citizens</option>
              <option value="Adults">Adults</option>
              <option value="Minors">Minors / Youth</option>
              <option value="Registered Voters">Registered Voters</option>
              <option value="PWD">PWD</option>
              <option value="Solo Parents">Solo Parents</option>
            </select>
          </div>
        </div>
      </Card>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
            </div>
          </div>
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Total Analyzed</p>
          <span className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">{totalRequests.toLocaleString()}</span>
          <p className="text-2xs text-slate-400 mt-1">Last 6 months</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center">
              <Layers className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
            </div>
          </div>
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Unique Reasons</p>
          <span className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">{reasonAnalytics.length}</span>
          <p className="text-2xs text-slate-400 mt-1">Categorized reasons</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center">
              <Target className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
            </div>
          </div>
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Top Reason</p>
          <span className="text-lg font-bold text-[#0C2340] dark:text-blue-50 truncate block max-w-full">{topReason.reason}</span>
          <p className="text-2xs text-[#C5A55A] font-semibold mt-1">{topReason.percentage}% of all requests</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Growth Trend</p>
          <span className="text-2xl font-bold text-emerald-600">{growthPct >= 0 ? "+" : ""}{growthPct}%</span>
          <p className="text-2xs text-slate-400 mt-1">vs previous period</p>
        </Card>
      </div>

      {/* Charts Row: Reason List + Distribution Pie + Trend Chart */}
      <div className="grid grid-cols-12 gap-6">
        {/* Top Reasons Table */}
        <Card className="col-span-5 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-4">Top Reasons for Document Requests</h3>
          <div className="space-y-3">
            {reasonAnalytics.map((item) => (
              <div key={item.rank} className="flex items-center gap-3">
                <span className="text-xs-plus font-bold text-[#C5A55A] w-4 text-center">{item.rank}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#0C2340] dark:text-blue-50 font-medium">{item.reason}</span>
                    <span className="text-xs-plus font-bold text-[#0C2340] dark:text-blue-50">{item.count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#0C2340] dark:bg-slate-800" style={{ width: `${(item.percentage / (topReason.percentage || 1)) * 100}%` }} />
                  </div>
                </div>
                <span className="text-2xs text-slate-500 dark:text-slate-400 w-8 text-right">{item.percentage}%</span>
                {item.percentage > 20 && <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
          </div>
        </Card>

        {/* Reason Distribution Pie */}
        <Card className="col-span-3 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-1">Distribution</h3>
          <p className="text-xs-plus text-slate-500 dark:text-slate-400 mb-3">Request reasons share</p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={reasonPieData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} dataKey="value" stroke="none" paddingAngle={2}>
                {reasonPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold" fill="#0C2340">{totalRequests.toLocaleString()}</text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-[9px]" fill="#94a3b8">total</text>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-1">
            {reasonPieData.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-2xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i] }} />
                  <span className="text-slate-600 dark:text-slate-400">{r.name}</span>
                </span>
                <span className="font-semibold text-[#0C2340] dark:text-blue-50">{r.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Reason Trends Over Time (Recharts) */}
        <Card className="col-span-4 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-1">Reason Trends</h3>
          <p className="text-xs-plus text-slate-500 dark:text-slate-400 mb-4">Top 4 reasons over 6 months</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={reasonTrendData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600, color: "#0C2340" }} />
              <Area type="monotone" dataKey="reason0" stroke="#0C2340" strokeWidth={1.5} fill="none" name={top4Purposes[0] || "Reason 1"} />
              <Area type="monotone" dataKey="reason1" stroke="#3b82f6" strokeWidth={1.5} fill="none" name={top4Purposes[1] || "Reason 2"} />
              <Area type="monotone" dataKey="reason2" stroke="#10b981" strokeWidth={1.5} fill="none" name={top4Purposes[2] || "Reason 3"} />
              <Area type="monotone" dataKey="reason3" stroke="#C5A55A" strokeWidth={1.5} fill="none" name={top4Purposes[3] || "Reason 4"} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-3">
            {top4Purposes.map((p, i) => (
              <span key={i} className="flex items-center gap-1.5 text-2xs"><span className={`w-2 h-2 rounded-full ${["bg-[#0C2340] dark:bg-slate-800", "bg-[#3b82f6]", "bg-[#10b981]", "bg-[#C5A55A]"][i]}`} />{p}</span>
            ))}
          </div>
        </Card>
      </div>

      {/* Breakdown by Document Type — Stacked Bar Chart */}
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Breakdown by Document Type</h3>
            <p className="text-xs-plus text-slate-500 dark:text-slate-400 mt-0.5">Reason distribution per document (percentage)</p>
          </div>
          <div className="flex items-center gap-4 text-2xs">
            {top4Purposes.slice(0, 3).map((p, i) => (
              <span key={i} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${["bg-[#0C2340] dark:bg-slate-800", "bg-[#3b82f6]", "bg-[#10b981]"][i]}`} />{p}</span>
            ))}
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8]" />Other</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={reasonByDocType} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} unit="%" />
            <YAxis type="category" dataKey="docType" width={100} tick={{ fontSize: 11, fill: "#0C2340" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600, color: "#0C2340" }} formatter={(value: number) => `${value}%`} />
            {top3Purposes.map((p, i) => (
              <Bar 
                key={p} 
                dataKey={p} 
                stackId="a" 
                fill={["#0C2340", "#3b82f6", "#10b981"][i]} 
                name={p} 
              />
            ))}
            <Bar dataKey="other" stackId="a" fill="#94a3b8" name="Other" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Export CSV Modal */}
      <ModalOverlay isOpen={showExportCSV} onClose={() => setShowExportCSV(false)}>
        <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50 mb-3">Export to CSV?</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">This will export the reason analytics data to a CSV file for the selected time period.</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowExportCSV(false)} disabled={isExportingCsv}>Cancel</Button>
            <Button onClick={handleExportCsv} className="min-w-[160px] bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]" disabled={isExportingCsv}>
              {isExportingCsv ? "Exporting CSV..." : "Confirm Export"}
            </Button>
          </div>
        </div>
      </ModalOverlay>

      {/* Export PDF Modal */}
      <ModalOverlay isOpen={showExportPDF} onClose={() => setShowExportPDF(false)}>
        <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50 mb-3">Export to PDF?</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">This will generate a PDF report with all analytics data, charts, and trends for the selected period.</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowExportPDF(false)} disabled={isExportingPdf}>Cancel</Button>
            <Button onClick={handleExportPdf} className="min-w-[160px] bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]" disabled={isExportingPdf}>
              {isExportingPdf ? "Exporting PDF..." : "Confirm Export"}
            </Button>
          </div>
        </div>
      </ModalOverlay>
    </div>
  )
}
