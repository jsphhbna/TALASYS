"use client"

import { useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, Legend,
} from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { useAdminData } from "@/hooks/use-admin-data"
import { useMounted } from "@/hooks/use-mounted"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  TrendingUp, BarChart3, AlertTriangle, Target, Layers, FileText,
} from "lucide-react"

const PIE_COLORS = ["#0C2340", "#1a3a5c", "#2a5080", "#3b82f6", "#C5A55A", "#94a3b8", "#64748b"]

export default function ReasonAnalytics() {
  const { documentRequests } = useAdminData()
  const mounted = useMounted()
  const [showExportCSV, setShowExportCSV] = useState(false)
  const [showExportPDF, setShowExportPDF] = useState(false)
  const [isExportingCsv, setIsExportingCsv] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  const handleExportCsv = async () => {
    if (isExportingCsv) return

    setIsExportingCsv(true)
    try {
      const headers = ["Rank,Reason,Count,Percentage"]
      const rows = reasonAnalytics.map(r => `${r.rank},"${r.reason}",${r.count},${r.percentage}%`)
      const csvContent = headers.concat(rows).join("\n")
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute("download", "Reason_Analytics.csv")
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToastPreset("reasonCsvExported")
    } catch (e) {
      console.error(e)
    }
    setIsExportingCsv(false)
  }

  const handleExportPdf = async () => {
    if (isExportingPdf) return

    setIsExportingPdf(true)
    try {
      const doc = new jsPDF()
      
      doc.setFontSize(16)
      doc.setTextColor(12, 35, 64)
      doc.text("Reason Analytics Report", 14, 20)
      
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 28)

      autoTable(doc, {
        startY: 35,
        head: [['Rank', 'Reason', 'Count', 'Percentage']],
        body: reasonAnalytics.map(r => [r.rank.toString(), r.reason, r.count.toString(), `${r.percentage}%`]),
        theme: 'grid',
        headStyles: { fillColor: [12, 35, 64] },
      })

      doc.save("Reason_Analytics_Report.pdf")
      showToastPreset("reasonPdfExported")
    } catch (e) {
      console.error(e)
    }
    setIsExportingPdf(false)
  }

  // Calculate reasonAnalytics dynamically
  const purposeCounts: Record<string, number> = {}
  documentRequests.forEach(r => {
    const p = r.purpose || "Other"
    purposeCounts[p] = (purposeCounts[p] || 0) + 1
  })
  const totalRequests = documentRequests.length || 1

  const reasonAnalytics = Object.entries(purposeCounts).map(([reason, count]) => ({
    reason,
    count,
    percentage: Math.round((count / totalRequests) * 100)
  })).sort((a, b) => b.count - a.count).map((r, i) => ({ ...r, rank: i + 1 }))

  const reasonPieData = reasonAnalytics.map((r) => ({
    name: r.reason.split(" ")[0],
    value: r.count,
  }))

  const topReason = reasonAnalytics.length > 0 ? reasonAnalytics[0] : { reason: "None", percentage: 0 }

  // Build reasonTrendData from real documentRequests grouped by month
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const monthCounts: Record<string, Record<string, number>> = {}
  documentRequests.forEach(r => {
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

  // Build reasonByDocType from real documentRequests
  const docTypes = ["Barangay Clearance", "Certificate of Indigency", "Certificate of Residency"]
  const reasonByDocType = docTypes.map(docType => {
    const subset = documentRequests.filter(r => r.documentType === docType)
    const total = subset.length || 1
    const purposeBreakdown: Record<string, number> = {}
    subset.forEach(r => {
      const p = r.purpose || "Other"
      purposeBreakdown[p] = (purposeBreakdown[p] || 0) + 1
    })
    // Get top 3 purposes + other
    const sorted = Object.entries(purposeBreakdown).sort((a, b) => b[1] - a[1])
    const top3 = sorted.slice(0, 3)
    const otherCount = sorted.slice(3).reduce((s, [, v]) => s + v, 0)
    const entry: any = { docType: docType.replace("Certificate of ", "") }
    top3.forEach(([p, count], i) => { entry[`cat${i}`] = Math.round((count / total) * 100) })
    entry.other = Math.round((otherCount / total) * 100)
    return entry
  }).filter((d, idx) => documentRequests.some(r => r.documentType === docTypes[idx] || true))

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
          <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Reason Behavior Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Analyze and understand why residents request documents</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowExportCSV(true)}>Export CSV</Button>
          <Button onClick={() => setShowExportPDF(true)} className="bg-[#0C2340] hover:bg-[#0a1c33]">Export PDF</Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 shadow-sm">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Document Type</label>
            <select className="w-full px-4 py-2 border border-slate-200 rounded-md text-sm">
              <option>All Documents</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Time Period</label>
            <select className="w-full px-4 py-2 border border-slate-200 rounded-md text-sm">
              <option>Last 6 Months</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
            <select className="w-full px-4 py-2 border border-slate-200 rounded-md text-sm">
              <option>All Categories</option>
            </select>
          </div>
        </div>
      </Card>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-[#0C2340]" />
            </div>
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Total Analyzed</p>
          <span className="text-2xl font-bold text-[#0C2340]">{totalRequests.toLocaleString()}</span>
          <p className="text-[10px] text-slate-400 mt-1">Last 6 months</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center">
              <Layers className="w-4 h-4 text-[#0C2340]" />
            </div>
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Unique Reasons</p>
          <span className="text-2xl font-bold text-[#0C2340]">{reasonAnalytics.length}</span>
          <p className="text-[10px] text-slate-400 mt-1">Categorized reasons</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center">
              <Target className="w-4 h-4 text-[#0C2340]" />
            </div>
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Top Reason</p>
          <span className="text-lg font-bold text-[#0C2340] truncate block max-w-full">{topReason.reason}</span>
          <p className="text-[10px] text-[#C5A55A] font-semibold mt-1">{topReason.percentage}% of all requests</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Growth Trend</p>
          <span className="text-2xl font-bold text-emerald-600">{growthPct >= 0 ? "+" : ""}{growthPct}%</span>
          <p className="text-[10px] text-slate-400 mt-1">vs previous period</p>
        </Card>
      </div>

      {/* Charts Row: Reason List + Distribution Pie + Trend Chart */}
      <div className="grid grid-cols-12 gap-6">
        {/* Top Reasons Table */}
        <Card className="col-span-5 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#0C2340] mb-4">Top Reasons for Document Requests</h3>
          <div className="space-y-3">
            {reasonAnalytics.map((item) => (
              <div key={item.rank} className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-[#C5A55A] w-4 text-center">{item.rank}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-[#0C2340] font-medium">{item.reason}</span>
                    <span className="text-[11px] font-bold text-[#0C2340]">{item.count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#0C2340]" style={{ width: `${(item.percentage / (topReason.percentage || 1)) * 100}%` }} />
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 w-8 text-right">{item.percentage}%</span>
                {item.percentage > 20 && <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-0.5">
          </div>
        </Card>

        {/* Reason Distribution Pie */}
        <Card className="col-span-3 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#0C2340] mb-1">Distribution</h3>
          <p className="text-[11px] text-slate-500 mb-3">Request reasons share</p>
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
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i] }} />
                  <span className="text-slate-600">{r.name}</span>
                </span>
                <span className="font-semibold text-[#0C2340]">{r.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Reason Trends Over Time (Recharts) */}
        <Card className="col-span-4 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#0C2340] mb-1">Reason Trends</h3>
          <p className="text-[11px] text-slate-500 mb-4">Top 4 reasons over 6 months</p>
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
              <span key={i} className="flex items-center gap-1.5 text-[10px]"><span className={`w-2 h-2 rounded-full ${["bg-[#0C2340]", "bg-[#3b82f6]", "bg-[#10b981]", "bg-[#C5A55A]"][i]}`} />{p}</span>
            ))}
          </div>
        </Card>
      </div>

      {/* Breakdown by Document Type — Stacked Bar Chart */}
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#0C2340]">Breakdown by Document Type</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Reason distribution per document (percentage)</p>
          </div>
          <div className="flex items-center gap-4 text-[10px]">
            {top4Purposes.slice(0, 3).map((p, i) => (
              <span key={i} className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${["bg-[#0C2340]", "bg-[#3b82f6]", "bg-[#10b981]"][i]}`} />{p}</span>
            ))}
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8]" />Other</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={reasonByDocType} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} unit="%" />
            <YAxis type="category" dataKey="docType" width={100} tick={{ fontSize: 11, fill: "#0C2340" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600, color: "#0C2340" }} formatter={(value: number) => `${value}%`} />
            <Bar dataKey="cat0" stackId="a" fill="#0C2340" name={top4Purposes[0] || "Cat 1"} />
            <Bar dataKey="cat1" stackId="a" fill="#3b82f6" name={top4Purposes[1] || "Cat 2"} />
            <Bar dataKey="cat2" stackId="a" fill="#10b981" name={top4Purposes[2] || "Cat 3"} />
            <Bar dataKey="other" stackId="a" fill="#94a3b8" name="Other" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Export CSV Modal */}
      {showExportCSV && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-[#0C2340] mb-3">Export to CSV?</h3>
            <p className="text-sm text-slate-600 mb-6">This will export the reason analytics data to a CSV file for the selected time period.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowExportCSV(false)} disabled={isExportingCsv}>Cancel</Button>
              <Button onClick={handleExportCsv} className="bg-[#0C2340] hover:bg-[#0a1c33]" disabled={isExportingCsv}>
                {isExportingCsv ? "Exporting CSV..." : "Confirm Export"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Export PDF Modal */}
      {showExportPDF && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-[#0C2340] mb-3">Export to PDF?</h3>
            <p className="text-sm text-slate-600 mb-6">This will generate a PDF report with all analytics data, charts, and trends for the selected period.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowExportPDF(false)} disabled={isExportingPdf}>Cancel</Button>
              <Button onClick={handleExportPdf} className="bg-[#0C2340] hover:bg-[#0a1c33]" disabled={isExportingPdf}>
                {isExportingPdf ? "Exporting PDF..." : "Confirm Export"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
