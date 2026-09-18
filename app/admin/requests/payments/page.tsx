"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/admin"
import { useAuth } from "@/lib/auth"
import { Search, CreditCard } from "lucide-react"
import dynamic from 'next/dynamic'
import { ModalOverlay } from "@/components/ui/modal-overlay"

const AdminPaymentProcessModal = dynamic(
  () => import('@/components/admin/admin-payment-process-modal').then(mod => mod.AdminPaymentProcessModal),
  { ssr: false }
)

export default function PaymentProcessPage() {
  const { residents, documentRequests: adminDocumentRequests } = useAdminData()
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [paymentProcessRequest, setPaymentProcessRequest] = useState<any>(null)
  const [selectedRequest, setSelectedRequest] = useState<any>(null)
  const [showViewDialog, setShowViewDialog] = useState(false)

  // Only show requests that are awaiting payment, pending verification, or unpaid (Pay Later)
  const paymentRequests = adminDocumentRequests.filter(r =>
    r.status === "Awaiting Payment" || (r as any).paymentStatus === "pending_verification" || (r as any).paymentStatus === "unpaid"
  )

  const filteredRequests = paymentRequests.filter(r => {
    const q = searchQuery.toLowerCase()
    return (
      r.residentName.toLowerCase().includes(q) ||
      r.documentType.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      (r as any).receiptNumber?.toLowerCase().includes(q) ||
      (r as any).paymentReferenceNumber?.toLowerCase().includes(q) ||
      (r as any).gcashRefNumber?.toLowerCase().includes(q)
    )
  })

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Payment Process</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Verify resident payments using their reference numbers before processing their documents
        </p>
      </div>

      {/* Summary badge */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
          <CreditCard className="w-4 h-4 text-orange-600" />
          <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">{paymentRequests.length} Awaiting Payment</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full md:w-96 mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, document, or receipt number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C2340] dark:focus:ring-slate-700"
        />
      </div>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3 font-bold min-w-[200px]">RESIDENT</th>
                <th className="px-6 py-3 font-bold min-w-[180px]">DOCUMENT</th>
                <th className="px-6 py-3 font-bold">FEE</th>
                <th className="px-6 py-3 font-bold">PAYMENT METHOD</th>
                <th className="px-6 py-3 font-bold min-w-[200px]">REFERENCE NUMBER</th>
                <th className="px-6 py-3 font-bold">STATUS</th>
                <th className="px-6 py-3 font-bold min-w-[140px]">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRequests.map((request) => {
                const residentProfile = residents.find(r => r.id === request.residentId)
                const profilePic = residentProfile?.profilePicture
                const paymentMethod = (request as any).paymentMethod || "—"
                const refNumber = (request as any).gcashRefNumber || (request as any).receiptNumber || (request as any).paymentReferenceNumber || "—"
                const paymentStatus = (request as any).paymentStatus

                return (
                  <tr
                    key={request.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                    onClick={() => { setSelectedRequest(request); setShowViewDialog(true) }}
                  >
                    {/* Resident */}
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2.5">
                        {profilePic ? (
                          <img src={profilePic} alt={request.residentName} className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#0C2340]/10 dark:bg-slate-800 flex items-center justify-center text-[10px] font-semibold text-[#0C2340] dark:text-blue-50">
                            {request.residentName?.charAt(0) || "U"}
                          </div>
                        )}
                        <div>
                          <p className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{request.residentName}</p>
                          <p className="text-[10px] text-slate-400">{request.residentCategory}</p>
                        </div>
                      </div>
                    </td>

                    {/* Document */}
                    <td className="px-6 py-3.5">
                      <span className="text-[11px] text-[#0C2340] dark:text-blue-50 font-medium">{request.documentType}</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">{request.dateRequested}</p>
                    </td>

                    {/* Fee */}
                    <td className="px-6 py-3.5">
                      <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                        {(request.documentFee || 0) > 0 ? `₱${request.documentFee}` : "Free"}
                      </span>
                    </td>

                    {/* Payment Method */}
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                        paymentMethod === "gcash" ? "bg-blue-50 text-blue-700" :
                        paymentMethod === "cash" ? "bg-emerald-50 text-emerald-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {paymentMethod === "gcash" ? "GCash" : paymentMethod === "cash" ? "Cash" : paymentMethod}
                      </span>
                    </td>

                    {/* Reference Number */}
                    <td className="px-6 py-3.5">
                      {refNumber !== "—" ? (
                        <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-700 dark:text-slate-300">
                          {refNumber}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No reference yet</span>
                      )}
                    </td>

                    {/* Payment Status */}
                    <td className="px-6 py-3.5">
                      {paymentStatus === "pending_verification" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-medium bg-yellow-50 text-yellow-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                          Pending Verification
                        </span>
                      ) : paymentStatus === "unpaid" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          Pay Later
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                          Awaiting Payment
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-6 py-3.5">
                      {user?.role !== "View Only" && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPaymentProcessRequest(request)
                          }}
                          className="h-7 px-3 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                        >
                          Process Payment
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}

              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CreditCard className="w-8 h-8 opacity-30" />
                      <p className="text-sm">
                        {searchQuery ? "No payments found matching your search." : "No pending payments at the moment."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* View Details Dialog */}
      {showViewDialog && selectedRequest && (
        <ModalOverlay isOpen={true} onClose={() => setShowViewDialog(false)}>
          <Card className="w-full max-w-lg p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Payment Details</h3>
              <button onClick={() => setShowViewDialog(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Resident</p>
                  <p className="text-sm font-medium">{selectedRequest.residentName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Document</p>
                  <p className="text-sm font-medium">{selectedRequest.documentType}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Fee</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    {(selectedRequest.documentFee || 0) > 0 ? `₱${selectedRequest.documentFee}` : "Free"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Payment Method</p>
                  <p className="text-sm">{(selectedRequest as any).paymentMethod || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Reference Number</p>
                  <p className="font-mono text-sm bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded">
                    {(selectedRequest as any).gcashRefNumber || (selectedRequest as any).receiptNumber || (selectedRequest as any).paymentReferenceNumber || "No reference provided"}
                  </p>
                </div>
              </div>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  setShowViewDialog(false)
                  setPaymentProcessRequest(selectedRequest)
                }}
              >
                Process Payment
              </Button>
            </div>
          </Card>
        </ModalOverlay>
      )}

      {/* Payment Processing Modal */}
      <AdminPaymentProcessModal
        isOpen={!!paymentProcessRequest}
        onClose={() => setPaymentProcessRequest(null)}
        request={paymentProcessRequest}
      />
    </AdminPageShell>
  )
}
