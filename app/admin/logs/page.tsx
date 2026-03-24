"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/use-admin-data"
const logActionFrequency: any[] = []
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"
import { Activity, CheckCircle2, XCircle, FileText, Shield } from "lucide-react"

export default function ActivityLogs() {
  const { activityLogs } = useAdminData()
  const [activeFilter, setActiveFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")

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
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.residentName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase())
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
    const badge = badges[type] || { bg: "bg-slate-50 text-slate-700", text: type, icon: Activity }
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
        <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Activity Logs</h1>
        <p className="text-sm text-slate-500 mt-0.5">Track all admin actions and system events</p>
      </div>

      {/* KPI Strip + Frequency Chart */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-7 grid grid-cols-4 gap-4">
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center mb-2">
              <Activity className="w-4 h-4 text-[#0C2340]" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actions Today</p>
            <p className="text-2xl font-bold text-[#0C2340]">{activityLogs.length}</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Approvals</p>
            <p className="text-2xl font-bold text-emerald-600">{approvedCount}</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-2">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Rejections</p>
            <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
          </Card>
          <Card className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Generated</p>
            <p className="text-2xl font-bold text-blue-600">{generatedCount}</p>
          </Card>
        </div>
        <Card className="col-span-5 p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Hourly Frequency</h3>
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
              className={`px-4 py-2 text-xs rounded-lg transition-colors ${activeFilter === filter.id ? "bg-[#0C2340] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search logs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-64 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#0C2340]"
        />
      </div>

      {/* Logs Table */}
      <Card className="shadow-sm">
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 rounded-t-lg">
          <div className="grid grid-cols-12 gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <div className="col-span-1">TIME</div>
            <div className="col-span-2">ACTION</div>
            <div className="col-span-2">TYPE</div>
            <div className="col-span-3">RESIDENT</div>
            <div className="col-span-4">DETAILS</div>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No activity logs found</p>
            </div>
          ) : filteredLogs.map((log) => (
            <div key={log.id} className="px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
              <div className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-1">
                  <span className="text-[11px] text-slate-500 font-mono">{log.time}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[12px] font-semibold text-[#0C2340]">{log.action}</span>
                </div>
                <div className="col-span-2">
                  {getActionBadge(log.actionType)}
                </div>
                <div className="col-span-3">
                  <span className="text-[11px] text-slate-600">{log.residentName || "—"}</span>
                </div>
                <div className="col-span-4">
                  <span className="text-[11px] text-slate-500">{log.details}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-3.5 flex items-center justify-between border-t border-slate-200">
          <p className="text-[10px] text-slate-500">Showing {filteredLogs.length} of {activityLogs.length} actions</p>
          <div className="flex items-center gap-1.5">
            <button className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded hover:bg-slate-50"><span className="text-slate-500 text-xs">‹</span></button>
            <button className="w-7 h-7 flex items-center justify-center bg-[#0C2340] text-white text-[10px] rounded">1</button>
            <button className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded hover:bg-slate-50"><span className="text-slate-500 text-xs">›</span></button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      <Card className="mt-6 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-[#0C2340]" />
          <h2 className="text-sm font-semibold text-[#0C2340]">Today&apos;s Summary</h2>
        </div>
        <div className="flex items-center gap-8 text-[11px]">
          <span className="text-slate-500">Peak Hour: <strong className="text-[#0C2340]">2:00 PM</strong></span>
          <span className="text-slate-500">Most Common: <strong className="text-[#0C2340]">Approvals</strong></span>
          <span className="text-slate-500">First Action: <strong className="text-[#0C2340]">9:30 AM</strong></span>
          <span className="text-slate-500">Last Action: <strong className="text-[#0C2340]">2:45 PM</strong></span>
        </div>
      </Card>
    </AdminPageShell>
  )
}
