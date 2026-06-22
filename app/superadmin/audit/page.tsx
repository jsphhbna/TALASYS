"use client"

import { useState } from "react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
  AreaChart, Area,
} from "recharts"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
const auditHourlyActivity: any[] = []; const auditWeeklyTrend: any[] = [];
import { useSuperAdminData } from "@/hooks/use-superadmin-data"
import {
  Activity, FileText, Users, Shield, AlertTriangle,
  TrendingUp,
} from "lucide-react"

// --- Mini Sparkline ---
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 56; const h = 24
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4)}`).join(" ")
  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function AuditLogs() {
  const { auditLogs, stats: { auditActionBreakdown, totalAuditLogs } } = useSuperAdminData()
  const [searchTerm, setSearchTerm] = useState("")
  const [adminFilter, setAdminFilter] = useState("all")
  const [actionFilter, setActionFilter] = useState("all")
  const [showExportCSV, setShowExportCSV] = useState(false)
  const [showExportPDF, setShowExportPDF] = useState(false)
  const [isExportingCsv, setIsExportingCsv] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  const handleExportCsv = async () => {
    if (isExportingCsv) return

    setIsExportingCsv(true)
    await delay(900)
    setShowExportCSV(false)
    setIsExportingCsv(false)
    showToastPreset("auditCsvExported")
  }

  const handleExportPdf = async () => {
    if (isExportingPdf) return

    setIsExportingPdf(true)
    await delay(1000)
    setShowExportPDF(false)
    setIsExportingPdf(false)
    showToastPreset("auditPdfExported")
  }

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch = log.details.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesAdmin = adminFilter === "all" || log.admin.name === adminFilter
    const matchesAction = actionFilter === "all" || log.actionType === actionFilter
    return matchesSearch && matchesAdmin && matchesAction
  })

  const getActionColor = (type: string) => {
    switch (type) {
      case "approved": return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "verified": return "bg-blue-50 text-blue-700 border-blue-200"
      case "rejected": return "bg-red-50 text-red-700 border-red-200"
      case "generated": return "bg-amber-50 text-amber-700 border-amber-200"
      case "Config Edit": return "bg-[#C5A55A]/10 text-[#8a7430] border-[#C5A55A]/20"
      case "Login": return "bg-slate-50 text-slate-600 border-slate-200"
      default: return "bg-slate-50 text-slate-600 border-slate-200"
    }
  }

  const suspiciousCount = auditLogs.filter(l => l.actionType === "Deleted Admin" || l.actionType === "Config Edit").length

  const todaysActions = auditLogs.filter(l => l.date === new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })).length
  const kpis = [
    { label: "Today's Actions", value: todaysActions.toString(), icon: Activity, color: "#0C2340", spark: [0, 0, 0, 0, 0, 0, 0] },
    { label: "This Week", value: auditLogs.length.toString(), icon: FileText, color: "#2a5080", spark: [0, 0, 0, 0, 0, 0, 0] },
    { label: "Active Admins", value: "0", icon: Users, color: "#10b981", spark: [0, 0, 0, 0, 0, 0, 0] },
    { label: "Flagged", value: suspiciousCount.toString(), icon: AlertTriangle, color: "#ef4444", spark: [0, 0, 0, 0, 0, 0, 0] },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Audit Logs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Complete activity history of all admin actions</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowExportCSV(true)}>Export CSV</Button>
          <Button onClick={() => setShowExportPDF(true)} className="bg-[#0C2340] hover:bg-[#0a1c33]">Export PDF</Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center">
                <kpi.icon className="w-4 h-4 text-[#0C2340]" />
              </div>
              <Sparkline data={kpi.spark} color={kpi.color} />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">{kpi.label}</p>
            <span className="text-2xl font-bold text-[#0C2340]">{kpi.value}</span>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-12 gap-6">
        {/* Hourly Activity Distribution */}
        <Card className="col-span-5 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Hourly Activity</h2>
          <p className="text-[11px] text-slate-500 mb-4">Action distribution throughout the day</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={auditHourlyActivity} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600, color: "#0C2340" }} />
              <Bar dataKey="actions" fill="#0C2340" radius={[3, 3, 0, 0]} barSize={18} name="Actions" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-400 mt-2">Peak activity: - (0 actions)</p>
        </Card>

        {/* Action Type Breakdown */}
        <Card className="col-span-3 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Action Breakdown</h2>
          <p className="text-[11px] text-slate-500 mb-3">By type this period</p>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie data={auditActionBreakdown} cx="50%" cy="50%" innerRadius={32} outerRadius={52} dataKey="value" stroke="none" paddingAngle={2}>
                {auditActionBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold" fill="#0C2340">{totalAuditLogs}</text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-[9px]" fill="#94a3b8">total</text>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-1">
            {auditActionBreakdown.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                  <span className="text-slate-600">{a.name}</span>
                </span>
                <span className="font-semibold text-[#0C2340]">{a.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Weekly Trend */}
        <Card className="col-span-4 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-[#0C2340]">Weekly Trend</h2>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="font-medium">-</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mb-4">Daily action volume this week</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={auditWeeklyTrend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradWeekly" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0C2340" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#0C2340" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600, color: "#0C2340" }} />
              <Area type="monotone" dataKey="actions" stroke="#0C2340" strokeWidth={2} fill="url(#gradWeekly)" name="Actions" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 shadow-sm">
        <div className="grid grid-cols-4 gap-4">
          <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-md text-sm">
            <option value="all">All Admins</option>
            {Array.from(new Set(auditLogs.map((l: any) => l.admin.name || typeof l.admin === "string" ? l.admin : "System"))).map(name => (
              <option key={name as string} value={name as string}>{name as string}</option>
            ))}
          </select>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="px-4 py-2 border border-slate-200 rounded-md text-sm">
            <option value="all">All Actions</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="verified">Verified</option>
            <option value="generated">Generated</option>
            <option value="Config Edit">Config Edit</option>
            <option value="Login">Login</option>
          </select>
          <input type="text" className="px-4 py-2 border border-slate-200 rounded-md text-sm" value="Jun 1 - Jun 30, 2024" readOnly />
          <div className="flex gap-3">
            <Input placeholder="Search by details..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="flex-1" />
            <Button className="bg-[#0C2340] hover:bg-[#0a1c33]">Apply</Button>
          </div>
        </div>
      </Card>

      {/* Log Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm">
        <div className="min-w-[800px]">
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Timestamp</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Admin</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Action</p></div>
              <div className="col-span-4"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Details</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">IP Address</p></div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No logs found matching filters.</div>
          ) : filteredLogs.map((log) => (
            <div key={log.id} className="px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
              <div className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-2">
                  <p className="text-sm text-[#0C2340]">{log.date}</p>
                  <p className="text-[10px] text-slate-500">{log.timestamp}</p>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: log.admin.color }}>
                    <span className="text-[9px] text-white font-medium">{log.admin.initials}</span>
                  </div>
                  <span className="text-sm text-[#0C2340]">{log.admin.name}</span>
                </div>
                <div className="col-span-2">
                  <span className={`inline-block px-2.5 py-1 rounded-md border text-[10px] font-semibold ${getActionColor(log.actionType)}`}>
                    {log.actionType.toUpperCase()}
                  </span>
                </div>
                <div className="col-span-4"><p className="text-sm text-slate-700">{log.details}</p></div>
                <div className="col-span-2"><p className="text-sm text-slate-500 font-mono text-[11px]">{log.ipAddress}</p></div>
              </div>
            </div>
          ))}
          </div>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-600">Showing 1-10 of {filteredLogs.length} entries</p>
        <div className="flex gap-2">
          <button className="w-8 h-8 border border-slate-200 rounded flex items-center justify-center text-slate-500 hover:bg-slate-50 text-sm">&lt;</button>
          <button className="w-8 h-8 bg-[#0C2340] rounded flex items-center justify-center text-white text-sm">1</button>
          <button className="w-8 h-8 border border-slate-200 rounded flex items-center justify-center text-slate-500 hover:bg-slate-50 text-sm">2</button>
          <button className="w-8 h-8 border border-slate-200 rounded flex items-center justify-center text-slate-500 hover:bg-slate-50 text-sm">3</button>
          <button className="w-8 h-8 border border-slate-200 rounded flex items-center justify-center text-slate-500 hover:bg-slate-50 text-sm">&gt;</button>
        </div>
      </div>

      {/* Export CSV Modal */}
      {showExportCSV && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-[#0C2340] mb-3">Export Audit Logs to CSV?</h3>
            <p className="text-sm text-slate-600 mb-6">This will export {filteredLogs.length} audit log entries to a CSV file with all applied filters.</p>
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
            <h3 className="text-lg font-bold text-[#0C2340] mb-3">Export Audit Logs to PDF?</h3>
            <p className="text-sm text-slate-600 mb-6">This will generate a PDF report with {filteredLogs.length} audit log entries including all filtered actions.</p>
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
