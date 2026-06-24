"use client"

import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useAdminData } from "@/hooks/use-admin-data"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import {
  ClipboardList, ShieldCheck, FileText, Clock, Users, TrendingUp, Inbox,
} from "lucide-react"

export default function AdminDashboard() {
  const { stats, verifications, documentRequests, activityLogs, notifications } = useAdminData()

  const kpis = [
    { label: "Total Requests", value: String(stats.totalRequests), sub: `${stats.pendingRequests} pending`, icon: ClipboardList, color: "#0C2340" },
    { label: "Verifications", value: String(stats.pendingVerifications), sub: "Pending review", icon: ShieldCheck, color: "#16a34a" },
    { label: "Documents Generated", value: String(stats.totalDocumentsGenerated), sub: "Approved requests", icon: FileText, color: "#2563eb" },
    { label: "Pending Queue", value: String(stats.pendingRequests + stats.pendingVerifications), sub: "Requires attention", icon: Clock, color: "#d97706" },
  ]

  const quickStats = [
    { label: "Senior Citizens", value: String(stats.seniorCount), color: "bg-blue-50 text-blue-900" },
    { label: "Minors", value: String(stats.minorCount), color: "bg-amber-50 text-amber-900" },
    { label: "Total Residents", value: String(stats.totalResidents), color: "bg-teal-50 text-teal-900" },
    { label: "Active Accounts", value: String(stats.activeResidents), color: "bg-green-50 text-green-900" },
    { label: "Expired Accounts", value: String(stats.expiredResidents), color: "bg-red-50 text-red-900" },
    { label: "Expiring Accounts", value: String(stats.expiringResidents), color: "bg-purple-50 text-purple-900" },
  ]

  const pendingItems = [
    ...verifications.slice(0, 3).map((v) => ({
      type: v.type === "registration" ? "Registration" : v.type === "profile-edit" ? "Profile Edit" : "Reactivation",
      typeColor: v.type === "registration" ? "bg-amber-100 text-amber-900" : v.type === "profile-edit" ? "bg-green-100 text-green-900" : "bg-purple-100 text-purple-900",
      resident: v.name,
      date: v.submittedDate,
      href: "/admin/verifications",
    })),
    ...documentRequests.filter((r) => r.status === "Pending").slice(0, 3).map((r) => ({
      type: "Doc Request",
      typeColor: "bg-blue-100 text-blue-900",
      resident: r.residentName,
      date: r.dateRequested,
      href: "/admin/requests",
    })),
  ].slice(0, 5)

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Daily operational overview — what needs your attention today</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi, i) => (
          <Card key={i} className="p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center">
                <kpi.icon className="w-4 h-4 text-[#0C2340]" />
              </div>
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
            <p className="text-2xl font-bold text-[#0C2340] mt-0.5">{kpi.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
          </Card>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {quickStats.map((stat, i) => (
          <Card key={i} className={`p-3.5 shadow-sm ${stat.color}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1">{stat.label}</p>
            <p className="text-xl font-bold">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Pending Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0C2340]">Pending Actions</h2>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{pendingItems.length} items</span>
          </div>
          <div className="p-5">
            {pendingItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Inbox className="w-8 h-8 mb-2" />
                <p className="text-sm">No pending actions</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-12 gap-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200">
                  <div className="col-span-3">TYPE</div>
                  <div className="col-span-3">RESIDENT</div>
                  <div className="col-span-3">DATE</div>
                  <div className="col-span-3">ACTION</div>
                </div>
                {pendingItems.map((action, i) => (
                  <div key={i} className="grid grid-cols-12 gap-4 items-center text-sm">
                    <div className="col-span-3">
                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-medium ${action.typeColor}`}>{action.type}</span>
                    </div>
                    <div className="col-span-3 text-[#0C2340] font-medium text-[12px]">{action.resident}</div>
                    <div className="col-span-3 text-slate-500 text-[11px]">{action.date}</div>
                    <div className="col-span-3">
                      <Link href={action.href}>
                        <Button variant="outline" size="sm" className="h-6 px-3 text-[10px] bg-transparent">Review</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="shadow-sm">
          <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg">
            <h2 className="text-sm font-semibold text-[#0C2340]">Recent Activity</h2>
          </div>
          <div className="p-5 space-y-3.5">
            {activityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Inbox className="w-8 h-8 mb-2" />
                <p className="text-sm">No activity yet</p>
              </div>
            ) : (
              activityLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-[#0C2340]" />
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold text-[#0C2340]">{log.action}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{log.details}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {(() => {
                        if (log.time && log.time !== "Just now") return log.time;
                        const ts = typeof log.timestamp === 'string' ? parseInt(log.timestamp) : log.timestamp;
                        if (ts && !isNaN(ts)) {
                          return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ts));
                        }
                        return "Just now";
                      })()}
                    </p>
                  </div>
                </div>
              ))
            )}
            {activityLogs.length > 0 && (
              <Link href="/admin/logs" className="block text-[11px] text-[#0C2340] font-medium hover:underline text-center pt-1">
                View all activity →
              </Link>
            )}
          </div>
        </Card>
      </div>

      {/* Today's Summary */}
      <Card className="mt-6 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-[#0C2340]" />
          <h2 className="text-sm font-semibold text-[#0C2340]">Summary</h2>
        </div>
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Total Residents:</span>
            <span className="text-[11px] font-bold text-[#0C2340]">{stats.totalResidents}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Pending Verifications:</span>
            <span className="text-[11px] font-bold text-[#0C2340]">{stats.pendingVerifications}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Pending Requests:</span>
            <span className="text-[11px] font-bold text-[#0C2340]">{stats.pendingRequests}</span>
          </div>
        </div>
      </Card>
    </AdminPageShell>
  )
}
