"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/use-admin-data"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { ClipboardCheck, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react"

export default function Verifications() {
  const { verifications: pendingVerifications, rejectedVerifications, activityLogs, approveVerification, rejectVerification } = useAdminData()
  const [activeTab, setActiveTab] = useState("registration")
  const [selectedItem, setSelectedItem] = useState<any>(pendingVerifications[0] || rejectedVerifications[0])
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const now = Date.now()
  const dayMs = 1000 * 60 * 60 * 24
  
  const verificationFlowTrend = Array.from({ length: 7 }).map((_, i) => {
    const start = now - (6 - i) * dayMs;
    const end = start + dayMs;
    const vers = pendingVerifications.filter(v => (v as any).createdAt >= start && (v as any).createdAt < end);
    return {
      day: new Date(start).toLocaleDateString('en-US', { weekday: 'short' }),
      incoming: vers.length,
      approved: vers.filter(v => v.status === "Approved").length
    }
  });

  const tabs = [
    { id: "registration", label: "New Registrations", count: pendingVerifications.filter(v => v.type === "registration").length },
    { id: "profile-edit", label: "Profile Edits", count: pendingVerifications.filter(v => v.type === "profile-edit").length },
    { id: "reactivation", label: "Reactivation", count: pendingVerifications.filter(v => v.type === "reactivation").length },
    { id: "rejected", label: "Rejected History", count: rejectedVerifications.length },
  ]

  const filteredItems = activeTab === "rejected" 
    ? rejectedVerifications 
    : pendingVerifications.filter(v => v.type === activeTab)

  const isOlderThan3Days = (dateStr: string) => {
    const day = parseInt(dateStr.replace("Nov ", ""))
    return day <= 25
  }

  // Compute actual KPI stats from activity logs
  const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date())
  const approvedToday = activityLogs.filter(log => log.date === today && log.actionType === "approved" && log.action.includes("Verification")).length
  const rejectedToday = activityLogs.filter(log => log.date === today && log.actionType === "rejected" && log.action.includes("Verification")).length

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Verifications</h1>
        <p className="text-sm text-slate-500 mt-0.5">Review and approve pending resident requests</p>
      </div>

      {/* Queue KPI Strip */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-8 grid grid-cols-4 gap-4">
          {[
            { label: "Pending", value: pendingVerifications.length, icon: ClipboardCheck, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Approved Today", value: approvedToday.toString(), icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Rejected Today", value: rejectedToday.toString(), icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
            { label: "Avg Process Time", value: "<1d", icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
          ].map((kpi, i) => (
            <Card key={i} className="p-4 shadow-sm">
              <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center mb-2`}>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </Card>
          ))}
        </div>
        <Card className="col-span-4 p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Weekly Flow</h3>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={verificationFlowTrend} barSize={8}>
              <XAxis dataKey="week" tick={{ fontSize: 9 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
              <Bar dataKey="approved" fill="#16a34a" radius={[2, 2, 0, 0]} />
              <Bar dataKey="rejected" fill="#dc2626" radius={[2, 2, 0, 0]} />
              <Bar dataKey="pending" fill="#d97706" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSelectedItem(null) }}
            className={`px-4 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${activeTab === tab.id ? "bg-[#0C2340] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
          >
            {tab.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === tab.id ? "bg-white/20" : "bg-slate-100"}`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* List + Detail Panel */}
      <div className="grid grid-cols-12 gap-6">
        {/* List */}
        <Card className="col-span-5 shadow-sm">
          <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg">
            <h3 className="text-sm font-semibold text-[#0C2340]">{activeTab === "rejected" ? "Rejected Items" : "Pending Items"}</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => {
              const isOverdue = isOlderThan3Days(item.submittedDate)
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`w-full p-4 text-left transition-colors ${selectedItem?.id === item.id ? "bg-[#0C2340]/[0.04]" : "hover:bg-slate-50"
                    }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#0C2340]/[0.08] flex items-center justify-center text-[10px] font-semibold text-[#0C2340]">{item.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-semibold text-[#0C2340] truncate">{item.name}</p>
                        {isOverdue && <span title="Older than 3 days"><AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" /></span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.categories?.slice(0, 2).map((c, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-900 rounded text-[9px]">{c}</span>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Submitted {item.submittedDate}</p>
                    </div>
                  </div>
                </button>
              )
            })}
            {filteredItems.length === 0 && (
              <div className="p-12 text-center text-slate-400">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No pending items in this category</p>
              </div>
            )}
          </div>
        </Card>

        {/* Detail Panel */}
        <Card className="col-span-7 shadow-sm">
          {selectedItem ? (
            <>
              <div className="px-5 py-3.5 bg-[#0C2340]/[0.03] border-b border-slate-200 rounded-t-lg flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#0C2340]">Review Details</h3>
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-medium ${selectedItem.type === "registration" ? "bg-blue-50 text-blue-800" :
                  selectedItem.type === "profile-edit" ? "bg-green-50 text-green-800" :
                    "bg-purple-50 text-purple-800"
                  }`}>
                  {selectedItem.type === "registration" ? "Registration" : selectedItem.type === "profile-edit" ? "Profile Edit" : "Reactivation"}
                </span>
              </div>
              <div className="p-5 space-y-5">
                {/* Profile */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#0C2340]/[0.08] flex items-center justify-center text-lg font-semibold text-[#0C2340]">{selectedItem.initials}</div>
                  <div>
                    <h4 className="text-base font-bold text-[#0C2340]">{selectedItem.name}</h4>
                    {selectedItem.age && <p className="text-[11px] text-slate-500">Age: {selectedItem.age} • {selectedItem.gender}</p>}
                    {selectedItem.address && <p className="text-[11px] text-slate-500">{selectedItem.address}</p>}
                  </div>
                </div>

                {/* Changes (for profile edits) */}
                {selectedItem.changes && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Requested Changes</p>
                    <div className="space-y-2">
                      {selectedItem.changes.map((c: any, i: number) => (
                        <div key={i} className="bg-slate-50 p-3 rounded">
                          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{c.field}</p>
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-red-500 line-through">{c.oldValue}</span>
                            <span className="text-slate-300">→</span>
                            <span className="text-emerald-600 font-medium">{c.newValue}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reason */}
                {selectedItem.reason && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Reason</p>
                    <p className="text-[11px] text-slate-700 bg-slate-50 p-3 rounded italic">&ldquo;{selectedItem.reason}&rdquo;</p>
                  </div>
                )}
                {selectedItem.status === "rejected" && selectedItem.rejectionReason && (
                  <div>
                    <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">Rejection Reason</p>
                    <p className="text-[11px] text-red-700 bg-red-50 p-3 rounded italic">&ldquo;{selectedItem.rejectionReason}&rdquo;</p>
                  </div>
                )}

                {/* Documents */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Documents</p>
                  <div className="space-y-2">
                    {selectedItem.documents.map((doc: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-slate-50 p-3 rounded">
                        <span className="text-[11px] text-[#0C2340] font-medium">{doc.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${doc.status === "verified" || doc.status === "valid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>{doc.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                {selectedItem.status !== "rejected" && (
                  <div className="flex gap-3 pt-2">
                    <Button onClick={() => { approveVerification(selectedItem.id); setSelectedItem(null) }} className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700">Approve</Button>
                    <Button onClick={() => setShowRejectConfirm(true)} className="flex-1 h-10 bg-red-600 hover:bg-red-700">Reject</Button>
                  </div>
                )}

                {/* Reject Confirmation Dialog */}
                {showRejectConfirm && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-semibold text-red-800 mb-2">Confirm Rejection</p>
                    <p className="text-xs text-red-700 mb-3">Please provide a reason for rejecting this verification:</p>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Enter rejection reason (min 10 characters)..."
                      className="w-full p-3 border border-red-200 rounded-lg text-sm mb-2 focus:outline-none focus:border-red-400 bg-white"
                      rows={3}
                    />
                    <p className={`text-[10px] mb-3 ${rejectReason.trim().length >= 10 ? 'text-green-600' : 'text-red-500'}`}>
                      {rejectReason.trim().length}/10 characters minimum
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          if (rejectReason.trim().length < 10) return
                          rejectVerification(selectedItem.id, rejectReason)
                          setSelectedItem(null)
                          setShowRejectConfirm(false)
                          setRejectReason("")
                        }}
                        disabled={rejectReason.trim().length < 10}
                        className="flex-1 h-9 bg-red-600 hover:bg-red-700 text-xs disabled:opacity-50"
                      >
                        Confirm Reject
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => { setShowRejectConfirm(false); setRejectReason("") }}
                        className="flex-1 h-9 bg-transparent text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full p-12">
              <div className="text-center">
                <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Select an item to review</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminPageShell>
  )
}
