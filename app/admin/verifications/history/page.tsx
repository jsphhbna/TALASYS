"use client"

import { useState, useMemo } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useAdminData } from "@/hooks/admin"
import { useMounted } from "@/hooks/use-mounted"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts"
import { CheckCircle2, XCircle, Activity, ChevronDown } from "lucide-react"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export default function VerificationHistoryPage() {
  const { activityLogs, rejectedVerifications } = useAdminData()
  const mounted = useMounted()
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

  // Parse year from log.date format e.g. "Sep 4, 2026"
  const allYears = useMemo(() => {
    const years = new Set<string>()
    activityLogs.forEach(log => {
      if (log.actionType === "approved" || log.actionType === "rejected") {
        const match = log.date?.match(/\d{4}/)
        if (match) years.add(match[0])
      }
    })
    if (years.size === 0) years.add(new Date().getFullYear().toString())
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [activityLogs])

  const [selectedYear, setSelectedYear] = useState(allYears[0] || new Date().getFullYear().toString())

  const verifLogs = useMemo(() =>
    activityLogs.filter(log =>
      (log.actionType === "approved" || log.actionType === "rejected") &&
      log.action?.includes("Verification") &&
      log.date?.includes(selectedYear)
    ),
    [activityLogs, selectedYear]
  )

  const monthlyData = useMemo(() =>
    MONTHS.map((month, idx) => {
      const monthLogs = verifLogs.filter(log => {
        const match = log.date?.match(/^([A-Za-z]+)/)
        return match && match[1].slice(0, 3) === month
      })
      const approved = monthLogs.filter(l => l.actionType === "approved").length
      const rejected = monthLogs.filter(l => l.actionType === "rejected").length
      return { month, approved, rejected, total: approved + rejected, logs: monthLogs }
    }),
    [verifLogs]
  )

  const totalApproved = verifLogs.filter(l => l.actionType === "approved").length
  const totalRejected = verifLogs.filter(l => l.actionType === "rejected").length
  const totalProcessed = totalApproved + totalRejected
  const approvalRate = totalProcessed > 0 ? Math.round((totalApproved / totalProcessed) * 100) : 0

  const topReasonsByType = useMemo(() => {
    const breakdown = {
      "registration": [] as string[],
      "profile-edit": [] as string[],
      "reactivation": [] as string[]
    }
    
    rejectedVerifications.forEach(v => {
      // Check if it belongs to selected year
      if (v.rejectionReason && (v.submittedDate?.includes(selectedYear) || v.submittedDate === undefined)) {
        if (v.type === "registration") breakdown["registration"].push(v.rejectionReason)
        if (v.type === "profile-edit") breakdown["profile-edit"].push(v.rejectionReason)
        if (v.type === "reactivation") breakdown["reactivation"].push(v.rejectionReason)
      }
    })

    const getTop = (reasons: string[]) => {
      const counts = reasons.reduce((acc, r) => {
        const key = r.trim()
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => ({ reason, count, total: reasons.length }))
    }

    return [
      { id: "registration", title: "New Registrations", color: "text-blue-600", bg: "bg-blue-50", data: getTop(breakdown["registration"]) },
      { id: "profile-edit", title: "Profile Edits", color: "text-green-600", bg: "bg-green-50", data: getTop(breakdown["profile-edit"]) },
      { id: "reactivation", title: "Reactivation", color: "text-purple-600", bg: "bg-purple-50", data: getTop(breakdown["reactivation"]) },
    ]
  }, [rejectedVerifications, selectedYear])

  if (!mounted) {
    return <AdminPageShell><div className="flex h-full items-center justify-center p-8">Loading history...</div></AdminPageShell>
  }

  return (
    <AdminPageShell>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Verification History</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Yearly and monthly breakdown of all processed verifications</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Year</label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
            <Activity className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Processed</p>
          <p className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">{totalProcessed}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Approved</p>
          <p className="text-2xl font-bold text-emerald-600">{totalApproved}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-2">
            <XCircle className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Rejected</p>
          <p className="text-2xl font-bold text-red-600">{totalRejected}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Approval Rate</p>
          <p className="text-2xl font-bold text-blue-600">{approvalRate}%</p>
        </Card>
      </div>

      {/* Monthly Chart & Rejection Reasons */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <Card className="col-span-8 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-4">Monthly Overview — {selectedYear}</h2>
          {totalProcessed === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <div className="text-center">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No data for {selectedYear}</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} barSize={12} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                <Bar dataKey="approved" name="Approved" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="rejected" name="Rejected" fill="#dc2626" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Top Rejection Reasons Breakdown */}
        <Card className="col-span-4 p-5 shadow-sm flex flex-col h-[340px]">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-4">Common Rejection Reasons</h2>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {topReasonsByType.map(group => {
              if (group.data.length === 0) return null
              return (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${group.bg} ${group.color}`}>
                      {group.title}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.data.map((item, idx) => (
                      <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 flex items-start gap-2">
                        <span className="text-[10px] font-bold text-slate-400 shrink-0 mt-0.5">#{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium leading-snug break-words">"{item.reason}"</p>
                          <p className="text-[10px] text-slate-400 mt-1">{item.count} occurence{item.count !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {topReasonsByType.every(g => g.data.length === 0) && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <XCircle className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No rejections found</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Monthly Breakdown Table */}
      <Card className="shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Monthly Breakdown</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">Click a month to see individual entries</p>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="col-span-4 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Month</div>
          <div className="col-span-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Total</div>
          <div className="col-span-2 text-[10px] font-semibold text-emerald-600 uppercase tracking-wider text-center">Approved</div>
          <div className="col-span-2 text-[10px] font-semibold text-red-500 uppercase tracking-wider text-center">Rejected</div>
          <div className="col-span-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Rate</div>
        </div>

        {monthlyData.map((row) => {
          const isExpanded = expandedMonth === row.month
          const rate = row.total > 0 ? Math.round((row.approved / row.total) * 100) : null
          return (
            <div key={row.month}>
              <button
                onClick={() => setExpandedMonth(isExpanded ? null : row.month)}
                className={`w-full grid grid-cols-12 gap-2 px-5 py-3 items-center text-left transition-colors border-b border-slate-100 dark:border-slate-800 ${
                  row.total > 0 ? "hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer" : "cursor-default opacity-50"
                } ${isExpanded ? "bg-[#0C2340]/5 dark:bg-slate-800/20" : ""}`}
                disabled={row.total === 0}
              >
                <div className="col-span-4 flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{row.month} {selectedYear}</span>
                  {row.total > 0 && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                </div>
                <div className="col-span-2 text-center">
                  <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{row.total || "—"}</span>
                </div>
                <div className="col-span-2 text-center">
                  <span className="text-[12px] font-semibold text-emerald-600">{row.approved || "—"}</span>
                </div>
                <div className="col-span-2 text-center">
                  <span className="text-[12px] font-semibold text-red-500">{row.rejected || "—"}</span>
                </div>
                <div className="col-span-2 text-center">
                  {rate !== null ? (
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${rate >= 70 ? "bg-emerald-50 text-emerald-700" : rate >= 40 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                      {rate}%
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </div>
              </button>

              {/* Expanded Entries */}
              {isExpanded && row.logs.length > 0 && (
                <div className="bg-slate-50/50 dark:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                  {row.logs.map((log, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center border-b border-slate-100/50 dark:border-slate-800/50 last:border-0">
                      <div className="col-span-1 flex items-center justify-center">
                        {log.actionType === "approved"
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          : <XCircle className="w-3.5 h-3.5 text-red-500" />
                        }
                      </div>
                      <div className="col-span-5">
                        <p className="text-[11px] font-semibold text-[#0C2340] dark:text-blue-50">{log.residentName || "—"}</p>
                        <p className="text-[10px] text-slate-400">{log.action}</p>
                      </div>
                      <div className="col-span-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${log.actionType === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                          {log.actionType === "approved" ? "Approved" : "Rejected"}
                        </span>
                      </div>
                      <div className="col-span-3 text-right">
                        <p className="text-[10px] text-slate-400">{log.date}</p>
                        <p className="text-[10px] text-slate-400">{log.admin?.name || ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </Card>
    </AdminPageShell>
  )
}
