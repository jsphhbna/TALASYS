"use client"

import { useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts"
import { Card } from "@/components/ui/card"
import { useSuperAdminData } from "@/hooks/use-superadmin-data"
import { useAdminData } from "@/hooks/use-admin-data"
import { useMounted } from "@/hooks/use-mounted"
import {
  TrendingUp, TrendingDown, Users, FileText, ShieldCheck, Clock, CheckCircle,
  AlertTriangle, AlertCircle, Info, ArrowRight, Activity,
} from "lucide-react"

// --- Sparkline mini-component ---
function Sparkline({ data, color, height = 28 }: { data: number[]; color: string; height?: number }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 64
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4)}`).join(" ")
  return (
    <svg width={w} height={height} className="flex-shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// --- KPI Card ---
function KpiCard({ label, value, unit, change, trend, icon: Icon, sparkData, sparkColor }: {
  label: string; value: string; unit?: string; change: number; trend: "up" | "down"
  icon: React.ElementType; sparkData: number[]; sparkColor: string
}) {
  const isPositiveChange = (trend === "up" && change > 0) || (trend === "down" && change < 0)
  return (
    <Card className="p-5 shadow-sm relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center">
          <Icon className="w-[18px] h-[18px] text-[#0C2340]" />
        </div>
        <Sparkline data={sparkData} color={sparkColor} />
      </div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-[#0C2340]">{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
      <div className="flex items-center gap-1 mt-2">
        {isPositiveChange ? (
          <TrendingUp className="w-3 h-3 text-emerald-600" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-500" />
        )}
        <span className={`text-[11px] font-medium ${isPositiveChange ? "text-emerald-600" : "text-red-500"}`}>
          {change > 0 ? "+" : ""}{change}%
        </span>
        <span className="text-[11px] text-slate-400">vs last period</span>
      </div>
    </Card>
  )
}

// --- Alert severity config ---
const alertConfig = {
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: AlertCircle, badge: "bg-red-100 text-red-700" },
  warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: AlertTriangle, badge: "bg-amber-100 text-amber-700" },
  info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: Info, badge: "bg-blue-100 text-blue-700" },
}

// --- Activity type colors ---
const activityColors: Record<string, string> = {
  approval: "bg-emerald-500",
  verification: "bg-blue-500",
  rejection: "bg-red-500",
  generation: "bg-[#C5A55A]",
  system: "bg-slate-500",
}

// --- Custom Recharts tooltip ---
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2">
      <p className="text-[11px] font-semibold text-[#0C2340] mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-[11px] text-slate-600">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-semibold text-[#0C2340]">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// === MAIN DASHBOARD ===
type TimePeriod = "daily" | "weekly" | "monthly"

export default function SuperAdminDashboard() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("weekly")
  const { systemAlerts } = useSuperAdminData()
  const { documentRequests, stats: adminStats } = useAdminData()
  const mounted = useMounted()

  if (!mounted) {
    return <div className="flex h-full items-center justify-center p-8">Loading dashboard...</div>
  }

  // Generate dynamic chart data based on documentRequests
  const now = Date.now()
  const dayMs = 1000 * 60 * 60 * 24
  
  const dailyRequests = Array.from({ length: 7 }).map((_, i) => {
    const start = now - (6 - i) * dayMs;
    const end = start + dayMs;
    const reqs = documentRequests.filter(r => r.createdAt >= start && r.createdAt < end);
    const apps = reqs.filter(r => ["Approved", "Ready for Pick Up", "Completed"].includes(r.status));
    return { day: new Date(start).toLocaleDateString('en-US', { weekday: 'short' }), requests: reqs.length, approvals: apps.length }
  });

  const weeklyRequests = Array.from({ length: 8 }).map((_, i) => {
    const start = now - (7 - i) * 7 * dayMs;
    const end = start + 7 * dayMs;
    const reqs = documentRequests.filter(r => r.createdAt >= start && r.createdAt < end);
    const apps = reqs.filter(r => ["Approved", "Ready for Pick Up", "Completed"].includes(r.status));
    return { week: `W${i+1}`, requests: reqs.length, approvals: apps.length }
  });

  const monthlyRequests = Array.from({ length: 12 }).map((_, i) => {
    const start = now - (11 - i) * 30 * dayMs;
    const end = start + 30 * dayMs;
    const reqs = documentRequests.filter(r => r.createdAt >= start && r.createdAt < end);
    const apps = reqs.filter(r => ["Approved", "Ready for Pick Up", "Completed"].includes(r.status));
    return { month: new Date(start).toLocaleDateString('en-US', { month: 'short' }), requests: reqs.length, approvals: apps.length }
  });

  const chartData = timePeriod === "daily" ? dailyRequests : timePeriod === "weekly" ? weeklyRequests : monthlyRequests
  const xKey = timePeriod === "daily" ? "day" : timePeriod === "weekly" ? "week" : "month"

  const processingPipeline = {
    submitted: documentRequests.length,
    underReview: documentRequests.filter(r => r.status === "On Process").length,
    approved: documentRequests.filter(r => r.status === "Approved" || r.status === "Ready for Pick Up" || r.status === "Completed").length,
    rejected: documentRequests.filter(r => r.status === "Rejected").length,
  };

  const performanceMetrics = {
    approvalRate: documentRequests.length ? Math.round((processingPipeline.approved / documentRequests.length) * 100) : 0,
    avgTurnaroundHours: 24,
    todayProcessed: dailyRequests[6].approvals,
    todayPending: dailyRequests[6].requests - dailyRequests[6].approvals,
    satisfactionScore: 98
  }

  // Sparklines mapped from past 7 days logic
  const populationSparkline = [0, 0, 0, 1, 3, 5, adminStats.totalResidents];
  const requestsSparkline = dailyRequests.map(d => d.requests);
  const verificationsSparkline = dailyRequests.map(d => d.requests * 0.5); // Simplified for verifications
  const processingSparkline = dailyRequests.map(d => d.approvals);
  const approvalSparkline = dailyRequests.map(d => d.approvals > 0 ? (d.approvals / (d.requests || 1)) * 100 : 0);

  // Compute dynamic document type breakdown
  const documentCounts: Record<string, number> = {}
  documentRequests.forEach((r: any) => documentCounts[r.documentType] = (documentCounts[r.documentType] || 0) + 1)
  const docColors = { "Barangay Clearance": "#0C2340", "Certificate of Indigency": "#10b981", "Certificate of Residency": "#C5A55A", "Other": "#94a3b8" }
  const documentTypeBreakdown = Object.entries(documentCounts).map(([name, value]) => ({
    name, value, color: docColors[name as keyof typeof docColors] || "#94a3b8"
  }))
  if (documentTypeBreakdown.length === 0) {
    documentTypeBreakdown.push({ name: "No Data", value: 1, color: "#f1f5f9" })
  }

  // Compute dynamic request purposes
  const purposeCounts: Record<string, number> = {}
  documentRequests.forEach((r: any) => purposeCounts[r.purpose] = (purposeCounts[r.purpose] || 0) + 1)
  const totalRequestsForPurpose = documentRequests.length || 1
  const requestPurposes = Object.entries(purposeCounts).map(([purpose, count]) => ({
    purpose, count, percentage: Math.round((count / totalRequestsForPurpose) * 100)
  })).sort((a, b) => b.count - a.count).slice(0, 5)

  const totalDocuments = documentTypeBreakdown.filter(d => d.name !== "No Data").reduce((s, d) => s + d.value, 0)
  const pipelineTotal = processingPipeline.submitted + processingPipeline.underReview + processingPipeline.approved + processingPipeline.rejected

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Command Center</h1>
          <p className="text-sm text-slate-500 mt-0.5">Barangay-wide operational overview and analytics</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          {(["daily", "weekly", "monthly"] as TimePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setTimePeriod(p)}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${timePeriod === p
                ? "bg-[#0C2340] text-white"
                : "text-slate-600 hover:bg-slate-50"
                }`}
            >
              {p === "daily" ? "7 Days" : p === "weekly" ? "8 Weeks" : "12 Months"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard label="Total Population" value={adminStats.totalResidents.toLocaleString()} change={0} trend={"up"} icon={Users} sparkData={populationSparkline} sparkColor="#0C2340" />
        <KpiCard label="Active Requests" value={adminStats.pendingRequests.toString()} change={0} trend={"up"} icon={FileText} sparkData={requestsSparkline} sparkColor="#2a5080" />
        <KpiCard label="Pending Verify" value={adminStats.pendingVerifications.toString()} change={0} trend={"up"} icon={ShieldCheck} sparkData={verificationsSparkline} sparkColor="#C5A55A" />
        <KpiCard label="Avg Processing" value={"0"} unit="days" change={0} trend={"up"} icon={Clock} sparkData={processingSparkline} sparkColor="#10b981" />
        <KpiCard label="Approval Rate" value={"0"} unit="%" change={0} trend={"up"} icon={CheckCircle} sparkData={approvalSparkline} sparkColor="#0C2340" />
      </div>

      {/* Primary Charts Row */}
      <div className="grid grid-cols-12 gap-6">
        {/* Area Chart — Request Volume Trend */}
        <Card className="col-span-8 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-[#0C2340]">Request Volume Trend</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">Submissions vs approvals over time</p>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#0C2340]" />Requests</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#C5A55A]" />Approvals</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0C2340" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#0C2340" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradApprovals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C5A55A" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#C5A55A" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="requests" stroke="#0C2340" strokeWidth={2} fill="url(#gradRequests)" name="Requests" />
              <Area type="monotone" dataKey="approvals" stroke="#C5A55A" strokeWidth={2} fill="url(#gradApprovals)" name="Approvals" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Pie Chart — Document Type Breakdown */}
        <Card className="col-span-4 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Document Breakdown</h2>
          <p className="text-[11px] text-slate-500 mb-4">By document type issued</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={documentTypeBreakdown}
                cx="50%" cy="50%"
                innerRadius={45} outerRadius={70}
                dataKey="value" stroke="none"
                paddingAngle={2}
              >
                {documentTypeBreakdown.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="text-lg font-bold" fill="#0C2340">
                {totalDocuments.toLocaleString()}
              </text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-[10px]" fill="#94a3b8">
                total
              </text>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {documentTypeBreakdown.map((doc, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: doc.color }} />
                  <span className="text-slate-600">{doc.name}</span>
                </span>
                <span className="font-semibold text-[#0C2340]">{doc.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Operational Intelligence Row */}
      <div className="grid grid-cols-12 gap-6">
        {/* Alerts & Anomalies */}
        <Card className="col-span-4 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#0C2340]">Alerts & Signals</h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {systemAlerts.filter(a => a.severity === "critical").length} critical
            </span>
          </div>
          <div className="space-y-3">
            {systemAlerts.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs bg-slate-50 rounded-lg">No alerts at this time</div>
            ) : systemAlerts.map((alert) => {
              const config = alertConfig[alert.severity] || alertConfig.info
              const AlertIcon = config.icon
              return (
                <div key={alert.id} className={`${config.bg} border ${config.border} rounded-lg p-3`}>
                  <div className="flex items-start gap-2.5">
                    <AlertIcon className={`w-4 h-4 ${config.text} mt-0.5 flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-[12px] font-semibold ${config.text}`}>{alert.title}</p>
                        {alert.metric && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${config.badge}`}>{alert.metric}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{alert.description}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{alert.timestamp}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Processing Pipeline */}
        <Card className="col-span-4 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Processing Pipeline</h2>
          <p className="text-[11px] text-slate-500 mb-5">Current document flow status</p>

          <div className="space-y-4">
            {[
              { label: "Submitted", value: processingPipeline.submitted, color: "#0C2340" },
              { label: "Under Review", value: processingPipeline.underReview, color: "#C5A55A" },
              { label: "Approved", value: processingPipeline.approved, color: "#10b981" },
              { label: "Rejected", value: processingPipeline.rejected, color: "#ef4444" },
            ].map((stage, i, arr) => (
              <div key={stage.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-slate-600">{stage.label}</span>
                  <span className="text-[12px] font-bold text-[#0C2340]">{stage.value}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(stage.value / pipelineTotal) * 100}%`,
                      backgroundColor: stage.color,
                    }}
                  />
                </div>
                {i < arr.length - 1 && (
                  <div className="flex justify-center my-1">
                    <ArrowRight className="w-3 h-3 text-slate-300" />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Total processed</span>
              <span className="font-bold text-[#0C2340]">{pipelineTotal.toLocaleString()}</span>
            </div>
          </div>
        </Card>

        {/* Top Request Purposes — Bar Chart */}
        <Card className="col-span-4 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-1">Request Purposes</h2>
          <p className="text-[11px] text-slate-500 mb-4">Why residents request documents</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={requestPurposes} layout="vertical" margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="purpose" width={100} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-[11px]">
                      <p className="font-semibold text-[#0C2340]">{d.purpose}</p>
                      <p className="text-slate-600">{d.count} requests ({d.percentage}%)</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="count" fill="#0C2340" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Activity & Performance Row */}
      <div className="grid grid-cols-12 gap-6">
        {/* Recent Admin Activity */}
        <Card className="col-span-7 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#0C2340]">Recent Activity</h2>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600">
              <Activity className="w-3 h-3" />
              <span className="font-medium">Live</span>
            </div>
          </div>
          <div className="space-y-4">
            {recentAdminActivity.map((activity, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-full ${activityColors[activity.type]} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-[10px] text-white font-semibold">{activity.initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-slate-800">
                    <span className="font-semibold text-[#0C2340]">{activity.admin}</span>
                    {" "}{activity.action.toLowerCase()}{" "}
                    <span className="text-slate-600">{activity.detail}</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{activity.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Performance Overview */}
        <Card className="col-span-5 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] mb-4">Performance Overview</h2>

          {/* Approval Rate Ring */}
          <div className="flex items-center gap-6 mb-5">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15.91549" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.91549" fill="none"
                  stroke="#0C2340" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${performanceMetrics.approvalRate} ${100 - performanceMetrics.approvalRate}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[14px] font-bold text-[#0C2340]">{performanceMetrics.approvalRate}%</span>
              </div>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#0C2340]">Approval Rate</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Based on all processed requests this period</p>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-3.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Avg Turnaround</p>
              <p className="text-lg font-bold text-[#0C2340]">{performanceMetrics.avgTurnaroundHours}h</p>
              <p className="text-[10px] text-slate-400">~{(performanceMetrics.avgTurnaroundHours / 24).toFixed(1)} days</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Today Processed</p>
              <p className="text-lg font-bold text-[#0C2340]">{performanceMetrics.todayProcessed}</p>
              <p className="text-[10px] text-slate-400">{performanceMetrics.todayPending} still pending</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Satisfaction</p>
              <p className="text-lg font-bold text-[#0C2340]">{performanceMetrics.satisfactionScore}/5.0</p>
              <p className="text-[10px] text-slate-400">Resident feedback</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3.5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Active Admins</p>
              <p className="text-lg font-bold text-[#0C2340]">0</p>
              <p className="text-[10px] text-slate-400">Online now</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
