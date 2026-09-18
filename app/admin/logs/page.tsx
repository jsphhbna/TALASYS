"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/admin"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"
import { Activity, CheckCircle2, XCircle, FileText, Shield, Search } from "lucide-react"

export default function ActivityLogs() {
  const { activityLogs, addActivityLog } = useAdminData()
  const [activeFilter, setActiveFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")

  const groupedLogs = activityLogs.reduce((acc, log) => {
    const action = log.action.split(' ')[0] || "Other"
    acc[action] = (acc[action] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const logActionFrequency = Object.entries(groupedLogs).map(([name, count]) => ({
    action: name,
    count
  })).sort((a, b) => b.count - a.count).slice(0, 5)

  const filters = [
    { id: "all", label: "All Actions" },
    { id: "approved", label: "Approved" },
    { id: "rejected", label: "Rejected" },
    { id: "generated", label: "Generated" },
    { id: "verified", label: "Verified" },
    { id: "sent", label: "Sent" },
  ]

  const filteredLogs = activityLogs.filter(log => {
    const matchesFilter = activeFilter === "all" || log.actionType === activeFilter
    const matchesSearch = searchQuery === "" ||
      (log.action || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.residentName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.details || "").toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const approvedCount = activityLogs.filter(l => l.actionType === "approved").length
  const rejectedCount = activityLogs.filter(l => l.actionType === "rejected").length
  const generatedCount = activityLogs.filter(l => l.actionType === "generated").length

  const getActionBadge = (type: string) => {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      approved: { bg: "bg-emerald-50 text-emerald-700", text: "Approved", icon: CheckCircle2 },
      rejected: { bg: "bg-red-50 text-red-700", text: "Rejected", icon: XCircle },
      generated: { bg: "bg-blue-50 text-blue-700", text: "Generated", icon: FileText },
      verified: { bg: "bg-purple-50 text-purple-700", text: "Verified", icon: Shield },
      sent: { bg: "bg-amber-50 text-amber-700", text: "Sent", icon: Activity },
    }
    const badge = badges[type] || { bg: "bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300", text: type, icon: Activity }
    const Icon = badge.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${badge.bg}`}>
        <Icon className="w-3 h-3" />
        {badge.text}
      </span>
    )
  }

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Activity Logs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Track all admin actions and system events</p>
      </div>

      {/* KPI Strip + Frequency Chart */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-7 grid grid-cols-4 gap-4">
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center mb-2">
              <Activity className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions Today</p>
            <p className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">{activityLogs.length}</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Approvals</p>
            <p className="text-2xl font-bold text-emerald-600">{approvedCount}</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-2">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rejections</p>
            <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Generated</p>
            <p className="text-2xl font-bold text-blue-600">{generatedCount}</p>
          </Card>
        </div>
        <Card className="col-span-5 p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Hourly Frequency</h3>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={logActionFrequency} barSize={14}>
              <XAxis dataKey="hour" tick={{ fontSize: 8 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
              <Bar dataKey="actions" fill="#0C2340" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Filters + Search */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-4 py-2 text-xs rounded-lg transition-colors ${activeFilter === filter.id ? "bg-[#0C2340] dark:bg-slate-800 text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-950"
                }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-[#0C2340]"
          />
        </div>
      </div>

      {/* Logs Table */}
      <Card className="shadow-sm overflow-hidden p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3 font-bold min-w-[100px]">TIME</th>
                <th className="px-6 py-3 font-bold min-w-[150px]">ADMIN</th>
                <th className="px-6 py-3 font-bold min-w-[150px]">ACTION</th>
                <th className="px-6 py-3 font-bold whitespace-nowrap">TYPE</th>
                <th className="px-6 py-3 font-bold min-w-[150px]">RESIDENT</th>
                <th className="px-6 py-3 font-bold">DETAILS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredLogs.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-12 text-center text-slate-400">
                <div className="flex flex-col items-center justify-center">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No activity logs found</p>
                </div>
              </td>
            </tr>
          ) : filteredLogs.map((log) => (
            <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
              <td className="px-6 py-3.5 whitespace-nowrap">
                <div className="flex flex-col text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {(() => {
                      const ts = typeof log.timestamp === 'string' ? parseInt(log.timestamp) : log.timestamp;
                      if (ts && !isNaN(ts)) {
                        const d = new Date(ts);
                        return (
                          <>
                            <span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d)}</span>
                            <span className="text-[9px] text-slate-400">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(d)}</span>
                          </>
                        )
                      }
                      return (
                        <>
                          <span>{log.date || ""}</span>
                          <span className="text-[9px] text-slate-400">{log.time || "Just now"}</span>
                        </>
                      )
                    })()}
                  </div>
              </td>
              <td className="px-6 py-3.5">
                <div className="flex items-center gap-2">
                  {log.admin?.initials ? (
                    <div className="w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: log.admin.color || "#0C2340" }}>
                      {log.admin.initials}
                    </div>
                  ) : (
                    <div className="w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold text-white bg-slate-400">
                      ?
                    </div>
                  )}
                  <span className="text-[11px] font-medium text-[#0C2340] dark:text-blue-50 truncate">{log.admin?.name || "System"}</span>
                </div>
              </td>
              <td className="px-6 py-3.5">
                <span className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{log.action}</span>
              </td>
              <td className="px-6 py-3.5 whitespace-nowrap">
                {getActionBadge(log.actionType)}
              </td>
              <td className="px-6 py-3.5">
                <span className="text-[11px] text-slate-600 dark:text-slate-400">{log.residentName || "—"}</span>
              </td>
              <td className="px-6 py-3.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">{log.details}</span>
              </td>
            </tr>
          ))}
          </tbody>
        </table>
        </div>
        <div className="px-6 py-3.5 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Showing {filteredLogs.length} of {activityLogs.length} actions</p>
          <div className="flex items-center gap-1.5">
            <button className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950"><span className="text-slate-500 dark:text-slate-400 text-xs">‹</span></button>
            <button className="w-7 h-7 flex items-center justify-center bg-[#0C2340] dark:bg-slate-800 text-white text-[10px] rounded">1</button>
            <button className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:bg-slate-950"><span className="text-slate-500 dark:text-slate-400 text-xs">›</span></button>
          </div>
        </div>
      </Card>

    </AdminPageShell>
  )
}
