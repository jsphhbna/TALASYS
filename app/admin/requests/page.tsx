"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/use-admin-data"
import {
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { ClipboardList, CheckCircle2, XCircle, FileText } from "lucide-react"

export default function DocumentRequests() {
  const { documentRequests: adminDocumentRequests, updateRequestStatus } = useAdminData()
  const now = Date.now()
  const dayMs = 1000 * 60 * 60 * 24

  const requestTypeTrend = Array.from({ length: 6 }).map((_, i) => {
    const start = now - (5 - i) * 30 * dayMs;
    const end = start + 30 * dayMs;
    const reqs = adminDocumentRequests.filter(r => r.createdAt >= start && r.createdAt < end);
    return {
      month: new Date(start).toLocaleDateString('en-US', { month: 'short' }),
      clearance: reqs.filter(r => r.documentType.includes("Clearance")).length,
      residency: reqs.filter(r => r.documentType.includes("Residency")).length,
      indigency: reqs.filter(r => r.documentType.includes("Indigency")).length
    }
  });
  const [activeFilter, setActiveFilter] = useState("all")
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [selectedRequest, setSelectedRequest] = useState<any>(null)

  const filters = [
    { id: "all", label: "All Requests" },
    { id: "Barangay Clearance", label: "Clearance" },
    { id: "Certificate of Residency", label: "Residency" },
    { id: "Certificate of Indigency", label: "Indigency" },
  ]

  const filteredRequests = adminDocumentRequests.filter(r =>
    activeFilter === "all" || r.documentType === activeFilter
  )

  const pendingCount = adminDocumentRequests.filter(r => r.status === "Pending").length
  const approvedCount = adminDocumentRequests.filter(r => r.status === "Approved").length
  const rejectedCount = adminDocumentRequests.filter(r => r.status === "Rejected").length

  const typeDistribution = [
    { name: "Clearance", value: adminDocumentRequests.filter(r => r.documentType.includes("Clearance")).length, color: "#0C2340" },
    { name: "Residency", value: adminDocumentRequests.filter(r => r.documentType.includes("Residency")).length, color: "#2563eb" },
    { name: "Indigency", value: adminDocumentRequests.filter(r => r.documentType.includes("Indigency")).length, color: "#C5A55A" },
  ]

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Document Requests</h1>
        <p className="text-sm text-slate-500 mt-0.5">Review and manage resident document requests</p>
      </div>

      {/* KPI Strip + Charts */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-5 grid grid-cols-2 gap-4">
          {[
            { label: "Pending", value: pendingCount, icon: ClipboardList, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Approved Today", value: approvedCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Rejected", value: rejectedCount, icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
            { label: "Monthly Total", value: adminDocumentRequests.length, icon: FileText, color: "text-[#0C2340]", bg: "bg-[#0C2340]/[0.06]" },
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
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Request Trend</h3>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={requestTypeTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
              <Area type="monotone" dataKey="clearance" stroke="#0C2340" fill="#0C2340" fillOpacity={0.08} strokeWidth={1.5} />
              <Area type="monotone" dataKey="residency" stroke="#2563eb" fill="#2563eb" fillOpacity={0.06} strokeWidth={1.5} />
              <Area type="monotone" dataKey="indigency" stroke="#C5A55A" fill="#C5A55A" fillOpacity={0.06} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card className="col-span-3 p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Type Distribution</h3>
          <div className="flex items-center gap-3">
            <div className="w-20 h-20">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeDistribution} cx="50%" cy="50%" innerRadius={18} outerRadius={36} dataKey="value" stroke="none">
                    {typeDistribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5">
              {typeDistribution.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-[10px] text-slate-600">{t.name}</span>
                  <span className="text-[10px] font-bold text-[#0C2340]">{t.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            className={`px-4 py-2 rounded-lg text-xs transition-colors ${activeFilter === filter.id ? "bg-[#0C2340] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card className="shadow-sm overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 rounded-t-lg">
            <div className="grid grid-cols-12 gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <div className="col-span-2">RESIDENT</div>
              <div className="col-span-2">DOCUMENT</div>
              <div className="col-span-2">PURPOSE</div>
              <div className="col-span-1">DATE</div>
              <div className="col-span-2">STATUS</div>
              <div className="col-span-3">ACTIONS</div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredRequests.map((request) => (
              <div key={request.id} className="grid grid-cols-12 gap-4 items-center px-6 py-3.5 hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => { setSelectedRequest(request); setShowViewDialog(true) }}>
                <div className="col-span-2 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#0C2340]/[0.08] flex items-center justify-center text-[10px] font-semibold text-[#0C2340]">{request.residentInitials}</div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#0C2340]">{request.residentName}</p>
                    <p className="text-[10px] text-slate-400">{request.residentCategory}</p>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-[11px] text-[#0C2340] font-medium">{request.documentType}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[11px] text-slate-600">{request.purpose}</span>
                </div>
                <div className="col-span-1">
                  <span className="text-[11px] text-slate-500">{request.dateRequested}</span>
                </div>
                <div className="col-span-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-medium ${request.status === "Pending" ? "bg-amber-50 text-amber-700" :
                      request.status === "On Process" || request.status === "Approved" ? "bg-blue-50 text-blue-700" :
                        request.status === "Ready for Pick Up" ? "bg-emerald-50 text-emerald-700" :
                          request.status === "Completed" ? "bg-slate-100 text-slate-700" :
                            "bg-red-50 text-red-700"
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${request.status === "Pending" ? "bg-amber-500" :
                        request.status === "On Process" || request.status === "Approved" ? "bg-blue-500" :
                          request.status === "Ready for Pick Up" ? "bg-emerald-500" :
                            request.status === "Completed" ? "bg-slate-400" :
                              "bg-red-500"
                      }`} />
                    {request.status}
                  </span>
                  {request.requestFor === "other" && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[9px]">Rep.</span>
                  )}
                </div>
                <div className="col-span-3 flex items-center gap-2">
                  {request.status === "Pending" && (
                    <>
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); setSelectedRequest(request); setShowApproveDialog(true) }} className="h-6 px-3 text-[10px] bg-emerald-600 hover:bg-emerald-700">Approve</Button>
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); setSelectedRequest(request); setRejectReason(""); setShowRejectDialog(true) }} className="h-6 px-3 text-[10px] bg-red-600 hover:bg-red-700">Reject</Button>
                      {request.requestFor === "other" && request.authorizationLetter && (
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedRequest(request); setShowAuthDialog(true) }} className="h-6 px-3 text-[10px] bg-transparent">
                          📎 Auth
                        </Button>
                      )}
                    </>
                  )}
                  {(request.status === "On Process" || request.status === "Approved") && (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); updateRequestStatus(request.id, "Ready for Pick Up") }} className="h-6 px-3 text-[10px] bg-emerald-600 hover:bg-emerald-700">Mark Ready</Button>
                  )}
                  {request.status === "Ready for Pick Up" && (
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); updateRequestStatus(request.id, "Completed") }} className="h-6 px-3 text-[10px] bg-[#0C2340] hover:bg-[#1a3a5c]">Complete</Button>
                  )}
                  {(request.status === "Completed" || request.status === "Rejected") && (
                    <span className="text-[10px] text-slate-400">Processed</span>
                  )}
                </div>
              </div>
            ))}
            {filteredRequests.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No document requests found</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* View Details Dialog */}
      {showViewDialog && selectedRequest && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-[#0C2340]">Request Details</h3>
              <button onClick={() => setShowViewDialog(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Reference Number</p>
                  <p className="text-sm font-mono text-slate-900">{selectedRequest.id.substring(0, 8).toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Date Requested</p>
                  <p className="text-sm text-slate-900">{selectedRequest.dateRequested}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Document Type</p>
                  <p className="text-sm font-semibold text-[#0C2340]">{selectedRequest.documentType}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Purpose</p>
                  <p className="text-sm text-slate-900">{selectedRequest.purpose}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Resident</p>
                  <p className="text-sm text-slate-900">{selectedRequest.residentName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm text-slate-900">{selectedRequest.status}</p>
                </div>
              </div>
              <Button onClick={() => setShowViewDialog(false)} className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-900">Close</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Approve Dialog */}
      {showApproveDialog && selectedRequest && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-[#0C2340]">Approve Request</h3>
              <button onClick={() => setShowApproveDialog(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">Approve <strong>{selectedRequest.documentType}</strong> for <strong>{selectedRequest.residentName}</strong>?</p>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button onClick={() => { updateRequestStatus(selectedRequest.id, "On Process"); setShowApproveDialog(false) }} className="flex-1 h-10 bg-blue-600 hover:bg-blue-700">Mark On Process</Button>
                  <Button onClick={() => { updateRequestStatus(selectedRequest.id, "Ready for Pick Up"); setShowApproveDialog(false) }} className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700">Mark Ready for Pick Up</Button>
                </div>
                <Button variant="outline" onClick={() => setShowApproveDialog(false)} className="w-full h-10 bg-transparent">Cancel</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && selectedRequest && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-[#0C2340]">Reject Request</h3>
              <button onClick={() => setShowRejectDialog(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-3">Reject <strong>{selectedRequest.documentType}</strong> for <strong>{selectedRequest.residentName}</strong>?</p>
              <textarea
                placeholder="Reason for rejection (min 10 characters)..."
                className="w-full p-3 border border-slate-200 rounded-lg text-sm mb-2 focus:outline-none focus:border-[#0C2340]"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <p className={`text-[10px] mb-4 ${rejectReason.trim().length >= 10 ? 'text-green-600' : 'text-red-500'}`}>
                {rejectReason.trim().length}/10 characters minimum
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={() => { updateRequestStatus(selectedRequest.id, "Rejected", rejectReason); setShowRejectDialog(false) }}
                  disabled={rejectReason.trim().length < 10}
                  className="flex-1 h-10 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  Confirm Reject
                </Button>
                <Button variant="outline" onClick={() => setShowRejectDialog(false)} className="flex-1 h-10 bg-transparent">Cancel</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Authorization Letter Dialog */}
      {showAuthDialog && selectedRequest && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-[#0C2340]">Authorization Letter</h3>
              <button onClick={() => setShowAuthDialog(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6">
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Requested By</p><p className="text-sm text-[#0C2340]">{selectedRequest.requestedByName}</p></div>
                  <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Relationship</p><p className="text-sm text-[#0C2340]">{selectedRequest.relationship}</p></div>
                  <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Contact</p><p className="text-sm text-[#0C2340]">{selectedRequest.requestedByContact}</p></div>
                  <div><p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">File</p><p className="text-sm text-[#0C2340]">{selectedRequest.authorizationLetter}</p></div>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center mb-4">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Authorization letter preview</p>
              </div>
              <Button onClick={() => setShowAuthDialog(false)} className="w-full h-10 bg-[#0C2340] hover:bg-[#0a1c33]">Close</Button>
            </div>
          </Card>
        </div>
      )}
    </AdminPageShell>
  )
}
