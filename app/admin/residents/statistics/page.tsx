"use client"

import { useState, useMemo } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useAdminData } from "@/hooks/admin"
import { useMounted } from "@/hooks/use-mounted"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, PieChart, Pie, Cell,
} from "recharts"
import { Users, UserCheck, Clock, AlertTriangle, ChevronDown, TrendingUp } from "lucide-react"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export default function ResidentStatisticsPage() {
  const { residents: allResidents, activityLogs, stats } = useAdminData()
  const mounted = useMounted()
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

  // Derive available years from resident join dates or activityLogs
  const allYears = useMemo(() => {
    const years = new Set<string>()
    allResidents.forEach(r => {
      const match = (r as any).createdAt?.toString().match(/\d{4}/) ||
                    (r as any).joinDate?.match(/\d{4}/)
      if (match) years.add(match[0])
    })
    activityLogs.forEach(log => {
      const match = log.date?.match(/\d{4}/)
      if (match) years.add(match[0])
    })
    if (years.size === 0) years.add(new Date().getFullYear().toString())
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [allResidents, activityLogs])

  const [selectedYear, setSelectedYear] = useState(allYears[0] || new Date().getFullYear().toString())

  // Activity logs for selected year (new registrations approved)
  const yearLogs = useMemo(() =>
    activityLogs.filter(log =>
      log.date?.includes(selectedYear) &&
      log.actionType === "approved" &&
      log.action?.toLowerCase().includes("verification")
    ),
    [activityLogs, selectedYear]
  )

  // Monthly registration data
  const monthlyData = useMemo(() =>
    MONTHS.map(month => {
      const monthLogs = yearLogs.filter(log => {
        const match = log.date?.match(/^([A-Za-z]+)/)
        return match && match[1].slice(0, 3) === month
      })
      return {
        month,
        newResidents: monthLogs.length,
        logs: monthLogs,
      }
    }),
    [yearLogs]
  )

  // Current snapshot counts
  const verifiedCount = allResidents.filter(r => r.status === "Verified").length
  const expiringCount = allResidents.filter(r => r.status === "Expiring").length
  const expiredCount = allResidents.filter(r => r.status === "Expired").length

  // Gender breakdown
  const maleCount = allResidents.filter(r => (r.gender || "").toLowerCase() === "male").length
  const femaleCount = allResidents.filter(r => (r.gender || "").toLowerCase() === "female").length
  const otherCount = allResidents.length - maleCount - femaleCount

  // Category breakdown
  const seniorCount = allResidents.filter(r => r.categories?.some(c => c.includes("Senior"))).length
  const adultCount = allResidents.filter(r => r.categories?.some(c => c.includes("Adult"))).length
  const minorCount = allResidents.filter(r => r.categories?.some(c => c.includes("Underage") || c.includes("Minor"))).length
  const voterCount = allResidents.filter(r => r.categories?.some(c => c.includes("Voter"))).length

  const genderData = [
    { name: "Male", value: maleCount, color: "#3b82f6" },
    { name: "Female", value: femaleCount, color: "#ec4899" },
    { name: "Other", value: otherCount, color: "#8b5cf6" },
  ].filter(d => d.value > 0)

  const categoryData = [
    { name: "Adult", value: adultCount, color: "#16a34a" },
    { name: "Senior", value: seniorCount, color: "#2563eb" },
    { name: "Minor", value: minorCount, color: "#d97706" },
    { name: "Voter", value: voterCount, color: "#0891b2" },
  ].filter(d => d.value > 0)

  if (!mounted) {
    return <AdminPageShell><div className="flex h-full items-center justify-center p-8">Loading statistics...</div></AdminPageShell>
  }

  return (
    <AdminPageShell>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Resident Statistics</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Population overview and yearly registration breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Year</label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {allYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Snapshot KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 flex items-center justify-center mb-2">
            <Users className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Population</p>
          <p className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">{allResidents.length.toLocaleString()}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Verified</p>
          <p className="text-2xl font-bold text-emerald-600">{verifiedCount}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-2">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Under Review</p>
          <p className="text-2xl font-bold text-amber-600">{stats.pendingVerifications}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Expired</p>
          <p className="text-2xl font-bold text-red-600">{expiredCount}</p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-12 gap-5 mb-6">
        {/* Monthly Registrations Chart */}
        <Card className="col-span-8 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
            <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">New Registrations — {selectedYear}</h2>
          </div>
          {yearLogs.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <div className="text-center">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No registration data for {selectedYear}</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey="newResidents" name="New Registrations" fill="#0C2340" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Gender & Category Breakdown */}
        <div className="col-span-4 flex flex-col gap-4">
          <Card className="p-4 shadow-sm flex-1">
            <h3 className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Gender Distribution</h3>
            {genderData.length > 0 ? (
              <div className="space-y-2">
                {genderData.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 flex-1">{d.name}</span>
                    <span className="text-[11px] font-semibold text-[#0C2340] dark:text-blue-50">{d.value}</span>
                    <span className="text-[10px] text-slate-400">{allResidents.length > 0 ? Math.round((d.value / allResidents.length) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">No data</p>
            )}
          </Card>
          <Card className="p-4 shadow-sm flex-1">
            <h3 className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Category Distribution</h3>
            <div className="space-y-2">
              {categoryData.map(d => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 flex-1">{d.name}</span>
                  <span className="text-[11px] font-semibold text-[#0C2340] dark:text-blue-50">{d.value}</span>
                  <span className="text-[10px] text-slate-400">{allResidents.length > 0 ? Math.round((d.value / allResidents.length) * 100) : 0}%</span>
                </div>
              ))}
              {categoryData.length === 0 && <p className="text-[11px] text-slate-400 italic">No data</p>}
            </div>
          </Card>
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      <Card className="shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Monthly Breakdown — {selectedYear}</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">Click a month to see individual registrations</p>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <div className="col-span-6 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Month</div>
          <div className="col-span-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">New Residents</div>
          <div className="col-span-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Cumulative</div>
        </div>

        {monthlyData.map((row, idx) => {
          const isExpanded = expandedMonth === row.month
          const cumulative = monthlyData.slice(0, idx + 1).reduce((sum, m) => sum + m.newResidents, 0)
          return (
            <div key={row.month}>
              <button
                onClick={() => setExpandedMonth(isExpanded ? null : row.month)}
                disabled={row.newResidents === 0}
                className={`w-full grid grid-cols-12 gap-2 px-5 py-3 items-center text-left transition-colors border-b border-slate-100 dark:border-slate-800 ${
                  row.newResidents > 0 ? "hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer" : "cursor-default opacity-50"
                } ${isExpanded ? "bg-[#0C2340]/5 dark:bg-slate-800/20" : ""}`}
              >
                <div className="col-span-6 flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{row.month} {selectedYear}</span>
                  {row.newResidents > 0 && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                </div>
                <div className="col-span-3 text-center">
                  <span className={`text-[12px] font-semibold ${row.newResidents > 0 ? "text-[#0C2340] dark:text-blue-50" : "text-slate-300"}`}>
                    {row.newResidents || "—"}
                  </span>
                </div>
                <div className="col-span-3 text-center">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">{cumulative > 0 ? cumulative : "—"}</span>
                </div>
              </button>

              {/* Expanded rows */}
              {isExpanded && row.logs.length > 0 && (
                <div className="bg-slate-50/50 dark:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                  {row.logs.map((log, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center border-b border-slate-100/50 dark:border-slate-800/50 last:border-0">
                      <div className="col-span-1">
                        <div className="w-6 h-6 rounded-full bg-[#0C2340] flex items-center justify-center">
                          <UserCheck className="w-3 h-3 text-white" />
                        </div>
                      </div>
                      <div className="col-span-5">
                        <p className="text-[11px] font-semibold text-[#0C2340] dark:text-blue-50">{log.residentName || "—"}</p>
                        <p className="text-[10px] text-slate-400">{log.action}</p>
                      </div>
                      <div className="col-span-3">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Registered</span>
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
