"use client"

import { useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { useAdminData } from "@/hooks/use-admin-data"
import { useMounted } from "@/hooks/use-mounted"
import {
  FileText, TrendingUp, Clock, BarChart3, Download,
  Users, Shield, Activity,
} from "lucide-react"

export default function SystemReports() {
  const { stats: adminStats, documentRequests } = useAdminData()
  const [activeTab, setActiveTab] = useState("all")
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [selectedReport, setSelectedReport] = useState<any>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const mounted = useMounted()

  if (!mounted) {
    return <div className="flex h-full items-center justify-center p-8">Loading reports...</div>
  }

  const now = Date.now()
  const dayMs = 1000 * 60 * 60 * 24
  const reportGenerationTrend = Array.from({ length: 7 }).map((_, i) => {
    const start = now - (6 - i) * dayMs
    const end = start + dayMs
    const dayReqs = documentRequests.filter(r => r.createdAt && r.createdAt >= start && r.createdAt < end)
    return {
      day: new Date(start).toLocaleDateString('en-US', { weekday: 'short' }),
      generated: dayReqs.length,
      documents: dayReqs.filter(r => r.status === 'Approved' || r.status === 'Completed').length,
      population: 0,
      analytics: 0,
    }
  })

  const reportTypeBreakdown = [
    { name: "Clearances", value: documentRequests.filter(r => r.documentType.includes("Clearance")).length, color: "#0C2340" },
    { name: "Indigency", value: documentRequests.filter(r => r.documentType.includes("Indigency")).length, color: "#2563eb" },
    { name: "Residency", value: documentRequests.filter(r => r.documentType.includes("Residency")).length, color: "#C5A55A" },
  ].filter(r => r.value > 0)

  if (reportTypeBreakdown.length === 0) reportTypeBreakdown.push({ name: "None", value: 1, color: "#e2e8f0" })

  const reportTotal = reportTypeBreakdown.reduce((acc, curr) => acc + curr.value, 0)

  const handleGenerateReport = async () => {
    if (isGeneratingReport) return

    setIsGeneratingReport(true)
    await delay(1100)
    setShowGenerateDialog(false)
    setIsGeneratingReport(false)
    showToastPreset("reportGenerated")
  }

  const nonVoterCount = adminStats.totalResidents - adminStats.voterCount

  const reports = [
    { title: "Full Population", description: "All registered residents", count: `${adminStats.totalResidents} records`, icon: Users, color: "#0C2340", pct: 100 },
    { title: "Seniors Summary", description: "60 years old and above", count: `${adminStats.seniorCount} records`, icon: Users, color: "#2a5080", pct: adminStats.totalResidents ? Math.round((adminStats.seniorCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Adults Summary", description: "18 years old and above", count: `${adminStats.adultCount} records`, icon: Users, color: "#3b82f6", pct: adminStats.totalResidents ? Math.round((adminStats.adultCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Minors Summary", description: "Under 18 years old", count: `${adminStats.minorCount} records`, icon: Users, color: "#C5A55A", pct: adminStats.totalResidents ? Math.round((adminStats.minorCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Voters List", description: "Registered voters", count: `${adminStats.voterCount} records`, icon: Shield, color: "#10b981", pct: adminStats.totalResidents ? Math.round((adminStats.voterCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Non-Voters List", description: "Not registered to vote", count: `${nonVoterCount} records`, icon: Shield, color: "#ef4444", pct: adminStats.totalResidents ? Math.round((nonVoterCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Expired Accounts", description: "Accounts needing renewal", count: `${adminStats.expiredResidents} records`, icon: Clock, color: "#f59e0b", pct: adminStats.totalResidents ? Math.round((adminStats.expiredResidents / adminStats.totalResidents) * 100) : 0 },
  ]

  const rejectedCount = documentRequests.filter(r => r.status === "Rejected").length

  const documentReports = [
    { title: "Documents by Date Range", description: "All generated documents", icon: FileText, color: "#0C2340", hasDatePicker: true },
    { title: "Rejected Requests", description: "All rejected with reasons", count: `${rejectedCount} records`, icon: Activity, color: "#ef4444" },
    { title: "Full Analytics PDF", description: "Complete system analytics", details: "Charts, stats, trends", icon: BarChart3, color: "#C5A55A" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">System Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate comprehensive system-wide PDF reports</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
            <FileText className="w-4 h-4 text-[#0C2340]" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Reports Generated</p>
          <span className="text-2xl font-bold text-[#0C2340]">{reportTotal}</span>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] font-medium text-slate-400">-</span>
          </div>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
            <Download className="w-4 h-4 text-[#0C2340]" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Most Requested</p>
          <span className="text-lg font-bold text-[#0C2340]">Document Reports</span>
          <p className="text-[10px] text-slate-400 mt-1">0 of {reportTotal} total</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
            <Clock className="w-4 h-4 text-[#0C2340]" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Avg Generation</p>
          <span className="text-2xl font-bold text-[#0C2340]">0s</span>
          <p className="text-[10px] text-slate-400 mt-1">Processing time</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
            <BarChart3 className="w-4 h-4 text-[#0C2340]" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">This Month</p>
          <span className="text-2xl font-bold text-[#0C2340]">0</span>
          <p className="text-[10px] text-slate-400 mt-1">Reports this month</p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-12 gap-6">
        {/* Generation Trend */}
        <Card className="col-span-8 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#0C2340]">Report Generation Trend</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Monthly breakdown by report category</p>
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#0C2340]" />Population</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#2a5080]" />Documents</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#C5A55A]" />Analytics</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={reportGenerationTrend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradPop" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0C2340" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#0C2340" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradDoc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2a5080" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#2a5080" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600, color: "#0C2340" }} />
              <Area type="monotone" dataKey="documents" stroke="#2a5080" strokeWidth={2} fill="url(#gradDoc)" name="Documents" />
              <Area type="monotone" dataKey="population" stroke="#0C2340" strokeWidth={2} fill="url(#gradPop)" name="Population" />
              <Area type="monotone" dataKey="analytics" stroke="#C5A55A" strokeWidth={2} fill="none" name="Analytics" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Type Breakdown Pie */}
        <Card className="col-span-4 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Report Distribution</h2>
          <p className="text-[11px] text-slate-500 mb-3">By report type</p>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={reportTypeBreakdown} cx="50%" cy="50%" innerRadius={38} outerRadius={58} dataKey="value" stroke="none" paddingAngle={3}>
                {reportTypeBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold" fill="#0C2340">{reportTotal}</text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-[9px]" fill="#94a3b8">total</text>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {reportTypeBreakdown.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-slate-600">{r.name}</span>
                </span>
                <span className="font-semibold text-[#0C2340]">{r.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Population Reports */}
      <div>
        <h3 className="text-sm font-semibold text-[#0C2340] mb-3">Population Reports</h3>
        <div className="grid grid-cols-4 gap-4">
          {reports.map((report) => (
            <Card key={report.title} className="p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${report.color}10` }}>
                  <report.icon className="w-4 h-4" style={{ color: report.color }} />
                </div>
                <span className="text-[10px] font-bold text-[#C5A55A]">{report.pct}%</span>
              </div>
              <h4 className="text-[12px] font-semibold text-[#0C2340] mb-0.5">{report.title}</h4>
              <p className="text-[10px] text-slate-500 mb-1">{report.description}</p>
              <p className="text-[10px] font-medium text-slate-600">{report.count}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Document Reports */}
      <div>
        <h3 className="text-sm font-semibold text-[#0C2340] mb-3">Document Reports</h3>
        <div className="grid grid-cols-3 gap-4">
          {documentReports.map((report) => (
            <Card key={report.title} className="p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${report.color}10` }}>
                <report.icon className="w-4 h-4" style={{ color: report.color }} />
              </div>
              <h4 className="text-[12px] font-semibold text-[#0C2340] mb-0.5">{report.title}</h4>
              <p className="text-[10px] text-slate-500 mb-1">{report.description}</p>
              {report.hasDatePicker && (
                <button className="mt-1 px-3 py-1 text-[10px] bg-slate-50 border border-slate-200 rounded text-slate-600 hover:bg-slate-100 transition-colors">Select dates</button>
              )}
              {report.count && <p className="text-[10px] font-medium text-slate-600">{report.count}</p>}
              {report.details && <p className="text-[10px] text-slate-500">{report.details}</p>}
            </Card>
          ))}
        </div>
      </div>

      {/* Custom Report Builder */}
      <Card className="p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[#0C2340] mb-4">Generate Custom Report</h3>
        <div className="grid grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Report Type</label>
            <select className="w-full px-4 py-2.5 border border-slate-200 rounded-md text-sm">
              <option>Full Population</option>
              <option>Seniors Summary</option>
              <option>Adults Summary</option>
              <option>Voters List</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date Range</label>
            <input type="text" className="w-full px-4 py-2.5 border border-slate-200 rounded-md text-sm" value="Jun 1 - Jun 30, 2024" readOnly />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Format</label>
            <select className="w-full px-4 py-2.5 border border-slate-200 rounded-md text-sm">
              <option>PDF</option>
              <option>CSV</option>
              <option>Excel</option>
            </select>
          </div>
          <Button onClick={() => setShowGenerateDialog(true)} className="bg-[#0C2340] hover:bg-[#0a1c33]">Generate Report</Button>
        </div>
      </Card>

      {/* Generate Dialog */}
      {showGenerateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-[#0C2340] mb-3">Generate Report?</h3>
            <p className="text-sm text-slate-600 mb-6">This will generate a Full Population report in PDF format for the date range Jun 1 - Jun 30, 2024.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowGenerateDialog(false)} disabled={isGeneratingReport}>Cancel</Button>
              <Button onClick={handleGenerateReport} className="bg-[#0C2340] hover:bg-[#0a1c33]" disabled={isGeneratingReport}>
                {isGeneratingReport ? "Generating..." : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
