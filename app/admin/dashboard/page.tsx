"use client"

import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { dashboardWeeklyTrend } from "@/lib/admin-data"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from "recharts"
import {
  ClipboardList, ShieldCheck, FileText, Clock, Users, AlertTriangle, TrendingUp,
} from "lucide-react"

export default function AdminDashboard() {
  const kpis = [
    { label: "Today's Requests", value: "8", change: "+3 vs yesterday", icon: ClipboardList, trend: [3, 5, 4, 7, 6, 5, 8], color: "#0C2340" },
    { label: "Verifications Done", value: "5", change: "+2 vs yesterday", icon: ShieldCheck, trend: [2, 3, 4, 2, 5, 3, 5], color: "#16a34a" },
    { label: "Documents Generated", value: "14", change: "+6 vs yesterday", icon: FileText, trend: [8, 10, 9, 11, 12, 8, 14], color: "#2563eb" },
    { label: "Pending Queue", value: "12", change: "Requires attention", icon: Clock, trend: [8, 10, 14, 12, 15, 11, 12], color: "#d97706" },
  ]

  const quickStats = [
    { label: "Senior Citizens", value: "423", color: "bg-blue-50 text-blue-900" },
    { label: "Minors (Under 18)", value: "612", color: "bg-amber-50 text-amber-900" },
    { label: "Adults", value: "1,812", color: "bg-teal-50 text-teal-900" },
    { label: "Registered Voters", value: "1,892", color: "bg-green-50 text-green-900" },
    { label: "Expired Accounts", value: "47", color: "bg-red-50 text-red-900" },
    { label: "Reactivation Requests", value: "3", color: "bg-purple-50 text-purple-900" },
  ]

  const pendingActions = [
    { type: "Registration", typeColor: "bg-amber-100 text-amber-900", resident: "Maria Santos", date: "Nov 27, 2025", href: "/admin/verifications", urgent: true },
    { type: "Doc Request", typeColor: "bg-blue-100 text-blue-900", resident: "Pedro Reyes", date: "Nov 26, 2025", href: "/admin/requests", urgent: false },
    { type: "Reactivation", typeColor: "bg-purple-100 text-purple-900", resident: "Jose Garcia", date: "Nov 26, 2025", href: "/admin/verifications", urgent: false },
    { type: "Profile Edit", typeColor: "bg-green-100 text-green-900", resident: "Ana Cruz", date: "Nov 25, 2025", href: "/admin/verifications", urgent: false },
    { type: "Verification", typeColor: "bg-red-100 text-red-900", resident: "Luis Ramos", date: "Nov 25, 2025", href: "/admin/verifications", urgent: true },
  ]

  const recentAlerts = [
    { title: "New Registration", message: "Maria Santos submitted", time: "2m ago", color: "bg-blue-500" },
    { title: "Account Expiring", message: "15 accounts expire soon", time: "1h ago", color: "bg-amber-500" },
    { title: "Document Approved", message: "Clearance for J. Reyes", time: "3h ago", color: "bg-green-500" },
    { title: "Reactivation Request", message: "Jose Garcia requested", time: "5h ago", color: "bg-red-500" },
    { title: "Profile Edit Request", message: "Ana Cruz wants to edit", time: "1d ago", color: "bg-purple-500" },
  ]

  return (
    <AdminPageShell>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Admin Dashboard</h1>
            <p className="text-sm text-slate-500 mt-0.5">Daily operational overview — what needs your attention today</p>
          </div>

          {/* KPI Strip with Sparklines */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {kpis.map((kpi, i) => (
              <Card key={i} className="p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0C2340]/[0.06] flex items-center justify-center">
                    <kpi.icon className="w-4 h-4 text-[#0C2340]" />
                  </div>
                  <div className="w-16 h-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={kpi.trend.map((v, j) => ({ v, j }))}>
                        <Area type="monotone" dataKey="v" stroke={kpi.color} fill={kpi.color} fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                <p className="text-2xl font-bold text-[#0C2340] mt-0.5">{kpi.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{kpi.change}</p>
              </Card>
            ))}
          </div>

          {/* Workload Trend Chart + Quick Stats */}
          <div className="grid grid-cols-12 gap-6 mb-6">
            <Card className="col-span-8 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#0C2340]">7-Day Workload Trend</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">Requests, verifications, and documents this week</p>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#0C2340]" /> Requests</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Verifications</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Documents</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dashboardWeeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                  <Area type="monotone" dataKey="requests" stroke="#0C2340" fill="#0C2340" fillOpacity={0.08} strokeWidth={2} />
                  <Area type="monotone" dataKey="verifications" stroke="#16a34a" fill="#16a34a" fillOpacity={0.06} strokeWidth={2} />
                  <Area type="monotone" dataKey="documents" stroke="#2563eb" fill="#2563eb" fillOpacity={0.06} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <div className="col-span-4 grid grid-cols-2 gap-3">
              {quickStats.map((stat, i) => (
                <Card key={i} className={`p-3.5 shadow-sm ${stat.color}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-1">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </Card>
              ))}
            </div>
          </div>

          {/* Pending Actions + Alerts */}
          <div className="grid grid-cols-3 gap-6">
            <Card className="col-span-2 shadow-sm">
              <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#0C2340]">Pending Actions</h2>
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{pendingActions.length} items</span>
              </div>
              <div className="p-5">
                <div className="space-y-3">
                  <div className="grid grid-cols-12 gap-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200">
                    <div className="col-span-3">TYPE</div>
                    <div className="col-span-3">RESIDENT</div>
                    <div className="col-span-3">DATE</div>
                    <div className="col-span-3">ACTION</div>
                  </div>
                  {pendingActions.map((action, i) => (
                    <div key={i} className="grid grid-cols-12 gap-4 items-center text-sm">
                      <div className="col-span-3 flex items-center gap-1.5">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-medium ${action.typeColor}`}>{action.type}</span>
                        {action.urgent && <AlertTriangle className="w-3 h-3 text-amber-500" />}
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
              </div>
            </Card>

            <Card className="shadow-sm">
              <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg">
                <h2 className="text-sm font-semibold text-[#0C2340]">Recent Alerts</h2>
              </div>
              <div className="p-5 space-y-3.5">
                {recentAlerts.map((alert, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${alert.color}`} />
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-[#0C2340]">{alert.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{alert.message}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{alert.time}</p>
                    </div>
                  </div>
                ))}
                <Link href="/admin/notifications" className="block text-[11px] text-[#0C2340] font-medium hover:underline text-center pt-1">
                  View all notifications →
                </Link>
              </div>
            </Card>
          </div>

          {/* Today's Activity */}
          <Card className="mt-6 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-[#0C2340]" />
              <h2 className="text-sm font-semibold text-[#0C2340]">Today's Activity</h2>
            </div>
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Documents Generated:</span>
                <span className="text-[11px] font-bold text-[#0C2340]">14</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Registrations Approved:</span>
                <span className="text-[11px] font-bold text-[#0C2340]">5</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Requests Processed:</span>
                <span className="text-[11px] font-bold text-[#0C2340]">8</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-3">Last action: Approved clearance for Pedro Reyes at 2:45 PM</p>
          </Card>
    </AdminPageShell>
  )
}
