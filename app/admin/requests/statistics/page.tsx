"use client"

import { useState, useMemo } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useAdminData } from "@/hooks/admin"
import { useMounted } from "@/hooks/use-mounted"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts"
import { CheckCircle2, XCircle, Activity, FileText, ChevronDown } from "lucide-react"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export default function DocumentHistoryPage() {
  const { documentRequests } = useAdminData()
  const mounted = useMounted()
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

  const allYears = useMemo(() => {
    const years = new Set<string>()
    documentRequests.forEach(r => { if (r.createdAt) years.add(new Date(r.createdAt).getFullYear().toString()) })
    if (years.size === 0) years.add(new Date().getFullYear().toString())
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [documentRequests])

  const [selectedYear, setSelectedYear] = useState(() => allYears[0] || new Date().getFullYear().toString())

  const yearRequests = useMemo(() =>
    documentRequests.filter(r => r.createdAt && new Date(r.createdAt).getFullYear().toString() === selectedYear),
    [documentRequests, selectedYear]
  )

  const DONE = ["Completed","Approved","Ready for Pick Up","On Process"]

  const monthlyData = useMemo(() =>
    MONTHS.map((month, idx) => {
      const m = yearRequests.filter(r => new Date(r.createdAt).getMonth() === idx)
      return {
        month, reqs: m, total: m.length,
        completed: m.filter(r => DONE.includes(r.status)).length,
        rejected:  m.filter(r => r.status === "Rejected").length,
        pending:   m.filter(r => r.status === "Pending").length,
      }
    }),
    [yearRequests]
  )

  const totalCompleted = yearRequests.filter(r => DONE.includes(r.status)).length
  const totalRejected  = yearRequests.filter(r => r.status === "Rejected").length
  const totalPending   = yearRequests.filter(r => r.status === "Pending").length
  const totalProcessed = yearRequests.length
  const completionRate = totalProcessed > 0 ? Math.round((totalCompleted / totalProcessed) * 100) : 0

  const topDocTypes = useMemo(() => {
    const c = yearRequests.reduce((acc, r) => { const k = r.documentType || "Unknown"; acc[k] = (acc[k]||0)+1; return acc }, {} as Record<string,number>)
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,5)
      .map(([type, count]) => ({ type, count, pct: totalProcessed>0 ? Math.round((count/totalProcessed)*100) : 0 }))
  }, [yearRequests, totalProcessed])

  const topPurposes = useMemo(() => {
    const c = yearRequests.reduce((acc, r) => { const k=(r.purpose||"Not specified").trim(); acc[k]=(acc[k]||0)+1; return acc }, {} as Record<string,number>)
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([purpose,count])=>({ purpose, count }))
  }, [yearRequests])

  const topRejections = useMemo(() => {
    const c = yearRequests.filter(r => r.status==="Rejected" && (r as any).rejectReason)
      .reduce((acc, r) => { const k=((r as any).rejectReason||"").trim(); if(k) acc[k]=(acc[k]||0)+1; return acc }, {} as Record<string,number>)
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([reason,count])=>({ reason, count }))
  }, [yearRequests])

  if (!mounted) return <AdminPageShell><div className="flex h-full items-center justify-center p-8">Loading history...</div></AdminPageShell>

  const palette = ["#0C2340","#2563eb","#C5A55A","#10b981","#6366f1"]

  return (
    <AdminPageShell>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Document Processing History</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Yearly and monthly breakdown of all document requests and outcomes</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Year</label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{allYears.map(y=><SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {([
          { label:"Total Requests",    value:totalProcessed,       color:"text-[#0C2340] dark:text-blue-50", bg:"bg-slate-100 dark:bg-slate-800",   Icon:Activity,     ic:"text-slate-500" },
          { label:"Completed",         value:totalCompleted,       color:"text-emerald-600",                 bg:"bg-emerald-50",                     Icon:CheckCircle2, ic:"text-emerald-600" },
          { label:"Rejected",          value:totalRejected,        color:"text-red-600",                     bg:"bg-red-50",                         Icon:XCircle,      ic:"text-red-600" },
          { label:"Pending",           value:totalPending,         color:"text-amber-600",                   bg:"bg-amber-50",                       Icon:FileText,     ic:"text-amber-600" },
          { label:"Completion Rate",   value:`${completionRate}%`, color:"text-blue-600",                    bg:"bg-blue-50",                        Icon:Activity,     ic:"text-blue-600" },
        ] as const).map(({ label, value, color, bg, Icon, ic }) => (
          <Card key={label} className="p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}><Icon className={`w-4 h-4 ${ic}`} /></div>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      {/* Monthly chart + Rejection reasons */}
      <div className="grid grid-cols-12 gap-5 mb-5">
        <Card className="col-span-8 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-4">Common Requested Documents — {selectedYear}</h2>
          {topDocTypes.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-400">
              <div className="text-center"><Activity className="w-8 h-8 mx-auto mb-2 opacity-30"/><p className="text-sm">No data for {selectedYear}</p></div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topDocTypes} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="type" tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false} tickFormatter={(val) => val.replace("Certificate of ","").replace("Barangay ","").substring(0, 10) + (val.length > 10 ? "..." : "")} />
                <YAxis tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip contentStyle={{fontSize:11,borderRadius:8,border:"1px solid #e2e8f0"}} cursor={{fill:"#f8fafc"}}/>
                <Bar dataKey="count" name="Total Requests" fill="#0C2340" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="col-span-4 p-5 shadow-sm flex flex-col">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-1">Top Rejection Reasons</h2>
          <p className="text-[10px] text-slate-400 mb-3">Why document requests are being rejected</p>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {topRejections.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                <XCircle className="w-8 h-8 mb-2 opacity-30"/><p className="text-sm">No rejections recorded</p>
              </div>
            ) : topRejections.map((item,idx) => (
              <div key={idx} className="bg-red-50/60 dark:bg-red-900/10 p-2.5 rounded-lg border border-red-100 dark:border-red-900/30 flex items-start gap-2">
                <span className="text-[10px] font-bold text-red-400 shrink-0 mt-0.5">#{idx+1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium leading-snug break-words">"{item.reason}"</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{item.count} occurrence{item.count!==1?"s":""}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Most Requested + Top Purposes */}
      <div className="grid grid-cols-12 gap-5 mb-5">
        <Card className="col-span-6 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-1">Most Requested Documents</h2>
          <p className="text-[10px] text-slate-400 mb-4">Ranking of document types in {selectedYear}</p>
          {topDocTypes.length === 0
            ? <div className="flex items-center justify-center h-24 text-slate-400"><p className="text-sm">No requests for {selectedYear}</p></div>
            : topDocTypes.map((item,idx) => (
              <div key={idx} className="flex items-center gap-3 mb-3">
                <span className="text-[11px] font-bold text-slate-400 w-5 shrink-0">#{idx+1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50 truncate">{item.type}</p>
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 ml-2 shrink-0">{item.count} <span className="font-normal text-slate-400">({item.pct}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{width:`${item.pct}%`,backgroundColor:palette[idx]}}/>
                  </div>
                </div>
              </div>
            ))
          }
        </Card>

        <Card className="col-span-6 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-1">Top Request Purposes</h2>
          <p className="text-[10px] text-slate-400 mb-4">Why residents are requesting documents in {selectedYear}</p>
          {topPurposes.length === 0
            ? <div className="flex items-center justify-center h-24 text-slate-400"><p className="text-sm">No requests for {selectedYear}</p></div>
            : topPurposes.map((item,idx) => (
              <div key={idx} className="bg-blue-50/50 dark:bg-blue-900/10 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/30 flex items-center gap-3 mb-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#0C2340]/10 text-[#0C2340] dark:text-blue-200 text-[10px] font-bold shrink-0">{idx+1}</span>
                <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 flex-1 truncate">{item.purpose}</p>
                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 shrink-0">{item.count}×</span>
              </div>
            ))
          }
        </Card>
      </div>

      {/* Monthly breakdown accordion */}
      <Card className="shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Monthly Breakdown</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">Click a month to see individual entries</p>
        </div>
        <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50">
          <div className="col-span-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Month</div>
          <div className="col-span-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center">Total</div>
          <div className="col-span-2 text-[10px] font-semibold text-emerald-600 uppercase tracking-wider text-center">Completed</div>
          <div className="col-span-2 text-[10px] font-semibold text-red-500 uppercase tracking-wider text-center">Rejected</div>
          <div className="col-span-2 text-[10px] font-semibold text-amber-500 uppercase tracking-wider text-center">Pending</div>
        </div>
        {monthlyData.map(row => {
          const isExpanded = expandedMonth === row.month
          return (
            <div key={row.month}>
              <button
                onClick={() => setExpandedMonth(isExpanded ? null : row.month)}
                disabled={row.total === 0}
                className={`w-full grid grid-cols-12 gap-2 px-5 py-3 items-center text-left transition-colors border-b border-slate-100 dark:border-slate-800 ${row.total>0?"hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer":"cursor-default opacity-50"} ${isExpanded?"bg-[#0C2340]/5 dark:bg-slate-800/20":""}`}
              >
                <div className="col-span-4 flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{row.month} {selectedYear}</span>
                  {row.total>0 && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded?"rotate-180":""}`}/>}
                </div>
                <div className="col-span-2 text-center"><span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{row.total||"—"}</span></div>
                <div className="col-span-2 text-center"><span className="text-[12px] font-semibold text-emerald-600">{row.completed||"—"}</span></div>
                <div className="col-span-2 text-center"><span className="text-[12px] font-semibold text-red-500">{row.rejected||"—"}</span></div>
                <div className="col-span-2 text-center"><span className="text-[12px] font-semibold text-amber-500">{row.pending||"—"}</span></div>
              </button>
              {isExpanded && row.reqs.length > 0 && (
                <div className="bg-slate-50/50 dark:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                  {row.reqs.map((req, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center border-b border-slate-100/50 last:border-0">
                      <div className="col-span-1 flex items-center justify-center">
                        {DONE.includes(req.status) ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/>
                          : req.status==="Rejected" ? <XCircle className="w-3.5 h-3.5 text-red-500"/>
                          : <Activity className="w-3.5 h-3.5 text-amber-500"/>}
                      </div>
                      <div className="col-span-4">
                        <p className="text-[11px] font-semibold text-[#0C2340] dark:text-blue-50">{req.residentName||"—"}</p>
                        <p className="text-[10px] text-slate-400">{req.documentType}</p>
                      </div>
                      <div className="col-span-3"><p className="text-[10px] text-slate-500 truncate">{req.purpose||"—"}</p></div>
                      <div className="col-span-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                          DONE.includes(req.status)?"bg-emerald-50 text-emerald-700"
                          :req.status==="Rejected"?"bg-red-50 text-red-700"
                          :req.status==="Pending"?"bg-amber-50 text-amber-700"
                          :"bg-blue-50 text-blue-700"}`}>{req.status}</span>
                      </div>
                      <div className="col-span-2 text-right"><p className="text-[10px] text-slate-400">{req.dateRequested||"—"}</p></div>
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
