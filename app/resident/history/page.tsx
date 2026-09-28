"use client"

import { useState, useMemo } from "react"
import { useAuthGuard } from "@/hooks/auth"
import { useMounted } from "@/hooks/use-mounted"
import { ModalOverlay } from "@/components/ui/modal-overlay"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { delay } from "@/lib/async-delay"
import { useResidentData } from "@/hooks/resident"
import type { ResidentRequest } from "@/lib/resident"
import { RequestStatusTrackerModal } from "@/components/resident/history/request-status-tracker-modal"
import { PaymentModal } from "@/components/resident/history/payment-modal"

export default function RequestHistoryPage() {
  const { isAuthorized } = useAuthGuard()
  const { requests, cancelRequest } = useResidentData()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [trackingRequestId, setTrackingRequestId] = useState<string | null>(null)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<ResidentRequest | null>(null)
  const [paymentRequest, setPaymentRequest] = useState<ResidentRequest | null>(null)
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString())
  const [selectedMonth, setSelectedMonth] = useState<string>("All Months")
  const itemsPerPage = 5
  const mounted = useMounted()

  // Statistics Calculation
  const stats = useMemo(() => {
    const years = new Set<string>()
    const availableMonthsForYear = new Set<string>()
    let displayTotal = 0
    let displayApproved = 0
    let displayDeclined = 0

    requests.forEach(req => {
      if (!req.dateRequested) return
      
      const date = new Date(req.dateRequested)
      if (isNaN(date.getTime())) return
      
      const year = date.getFullYear().toString()
      const month = date.toLocaleString('default', { month: 'long' })
      years.add(year)

      if (year === selectedYear) {
        availableMonthsForYear.add(month)
        
        if (selectedMonth === "All Months" || month === selectedMonth) {
          displayTotal++
          if (req.status === "Approved" || req.status === "Ready for Pick Up" || req.status === "Completed") {
            displayApproved++
          } else if (req.status === "Rejected") {
            displayDeclined++
          }
        }
      }
    })

    if (years.size === 0) {
      years.add(new Date().getFullYear().toString())
    }
    
    // Sort months chronologically
    const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    const sortedMonths = Array.from(availableMonthsForYear).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b))

    return {
      availableYears: Array.from(years).sort().reverse(),
      availableMonths: sortedMonths,
      displayTotal,
      displayApproved,
      displayDeclined
    }
  }, [requests, selectedYear, selectedMonth])

  if (!isAuthorized || !mounted) {
    return null
  }

  // Filter requests
  const filteredRequests = requests.filter((request) => {
    const matchesSearch = searchQuery === "" ||
      (request.documentType || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (request.refNumber || "").toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || (request.status || "").toLowerCase() === statusFilter.toLowerCase()
    return matchesSearch && matchesStatus
  })

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedRequests = filteredRequests.slice(startIndex, startIndex + itemsPerPage)
  const showingFrom = filteredRequests.length === 0 ? 0 : startIndex + 1
  const showingTo = filteredRequests.length === 0 ? 0 : Math.min(startIndex + itemsPerPage, filteredRequests.length)

  const handleCancelRequest = async (id: string) => {
    if (confirm("Are you sure you want to cancel this request?")) {
      cancelRequest(id)
    }
  }


  return (
    <ResidentPageShell>
      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 mb-1 tracking-tight">Request History</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">View and track all your document requests</p>
      </div>

      {/* Statistics Section */}
      <Card className="p-6 mb-8 shadow-sm border-slate-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Summary</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-full sm:w-32 h-9 bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-600">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Months">All Months</SelectItem>
                {stats.availableMonths.map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-28 h-9 bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-600">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {stats.availableYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Display Totals */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-slate-50 dark:bg-slate-950 p-3 sm:p-4 rounded-lg border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
            <p className="text-2xs sm:text-xs text-slate-500 dark:text-slate-400 font-bold mb-1 uppercase tracking-wide">Total</p>
            <p className="text-xl sm:text-2xl font-bold text-[#0C2340] dark:text-blue-50 leading-none">{stats.displayTotal}</p>
          </div>
          <div className="bg-emerald-50 p-3 sm:p-4 rounded-lg border border-emerald-100 flex flex-col items-center justify-center text-center">
            <p className="text-2xs sm:text-xs text-emerald-600 font-bold mb-1 uppercase tracking-wide">Approved</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-700 leading-none">{stats.displayApproved}</p>
          </div>
          <div className="bg-red-50 p-3 sm:p-4 rounded-lg border border-red-100 flex flex-col items-center justify-center text-center">
            <p className="text-2xs sm:text-xs text-red-600 font-bold mb-1 uppercase tracking-wide">Declined</p>
            <p className="text-xl sm:text-2xl font-bold text-red-700 leading-none">{stats.displayDeclined}</p>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-5 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Search */}
          <div className="md:col-span-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search requests..."
              className="w-full h-9 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700"
            />
          </div>

          {/* Status Filter */}
          <div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full h-9 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="awaiting payment">Awaiting Payment</SelectItem>
                <SelectItem value="on process">On Process</SelectItem>
                <SelectItem value="ready for pick up">Ready for Pick Up</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="approved">Approved (Legacy)</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Content Area */}
      <Card className="shadow-sm overflow-hidden py-0 bg-transparent sm:bg-white sm:dark:bg-slate-900 border-none sm:border-solid">
        
        {/* Mobile Cards (Hidden on Desktop) */}
        <div className="md:hidden flex flex-col gap-3 py-2">
          {paginatedRequests.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No requests found yet.</p>
          ) : (
            paginatedRequests.map((request) => (
              <Card key={request.id} className="p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-3 relative">
                <div className="flex justify-between items-start pr-2">
                  <div>
                    <p className="font-bold text-sm text-[#0C2340] dark:text-blue-50 mb-0.5 leading-tight">{request.documentType}</p>
                    <p className="text-xs-plus text-slate-500 uppercase tracking-wide">{request.refNumber}</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-1">
                  <span
                    className={`self-start inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold uppercase tracking-wide ${
                      request.status === "Pending" ? "bg-yellow-100 text-yellow-800" :
                      request.status === "On Process" || request.status === "Approved" ? "bg-blue-100 text-blue-800" :
                      request.status === "Awaiting Payment" ? "bg-orange-100 text-orange-800" :
                      request.status === "Ready for Pick Up" ? "bg-emerald-100 text-emerald-800" :
                      request.status === "Completed" ? "bg-slate-200 text-slate-800" :
                      "bg-red-100 text-red-800"
                    }`}
                  >
                    {request.status}
                  </span>
                  
                  {(request as any).paymentStatus === "pending_verification" && (
                    <span className="self-start inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-800">⏳ Payment under review</span>
                  )}
                  {(request as any).paymentStatus === "paid" && (
                    <span className="self-start inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-700">✓ Paid</span>
                  )}
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  <p className="mb-1"><span className="font-semibold text-slate-500">Date:</span> {request.dateRequested}</p>
                  <p className="truncate"><span className="font-semibold text-slate-500">Purpose:</span> {request.purpose}</p>
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 mt-1 flex-wrap">
                  {request.status === "Pending" && (
                    <Button size="sm" variant="outline" onClick={() => handleCancelRequest(request.id)} className="flex-1 text-xs-plus h-8 text-red-600 border-red-200">Cancel</Button>
                  )}
                  {((request as any).paymentStatus === "unpaid" || (request as any).paymentStatus === "pending_verification") && (request as any).documentFee > 0 && (
                    <Button size="sm" onClick={() => setPaymentRequest(request)} className={`flex-1 text-xs-plus h-8 font-bold ${(request as any).paymentStatus === "unpaid" ? "bg-orange-500 text-white" : "bg-amber-500 text-white"}`}>
                      {(request as any).paymentStatus === "unpaid" ? "💳 Pay Now" : "Resubmit"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setTrackingRequestId(request.id)} className="flex-1 text-xs-plus h-8 border-slate-300">Track</Button>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Desktop Table (Hidden on Mobile) */}
        <div
          className="hidden md:block history-scroll relative w-full max-w-full overflow-x-auto touch-pan-x [scrollbar-width:thin]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <table className="w-full min-w-[900px] table-auto">
            <thead>
              <tr className="bg-[#0C2340] dark:bg-slate-800/[0.03] border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-6 py-3.5 text-xs-plus font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Ref #</th>
                <th className="text-left px-6 py-3.5 text-xs-plus font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Document Type</th>
                <th className="text-left px-6 py-3.5 text-xs-plus font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Date Requested</th>
                <th className="text-left px-6 py-3.5 text-xs-plus font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="text-left px-6 py-3.5 text-xs-plus font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Purpose</th>
                <th className="text-left px-6 py-3.5 text-xs-plus font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRequests.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-sm text-slate-500 dark:text-slate-400" colSpan={6}>
                    No requests found yet.
                  </td>
                </tr>
              ) : (
                paginatedRequests.map((request, index) => (
                  <tr
                    key={request.id}
                    className={index < paginatedRequests.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}
                  >
                    <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{request.refNumber}</td>
                    <td className="px-6 py-3.5 text-sm font-medium text-[#0C2340] dark:text-blue-50 whitespace-nowrap">{request.documentType}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{request.dateRequested}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs-plus font-medium ${request.status === "Pending" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300" :
                              request.status === "On Process" || request.status === "Approved" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" :
                              request.status === "Awaiting Payment" ? "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300" :
                                request.status === "Ready for Pick Up" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300" :
                                  request.status === "Completed" ? "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300" :
                                    "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                            }`}
                        >
                          {request.status}
                        </span>
                        {(request as any).paymentStatus === "pending_verification" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">⏳ Payment under review</span>
                        )}
                        {(request as any).paymentStatus === "paid" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">✓ Paid · {(request as any).receiptNumber}</span>
                        )}
                        {(request as any).paymentStatus === "waived" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">🎁 Fee Waived</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{request.purpose}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {request.status === "Pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelRequest(request.id)}
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 text-2xs h-7 px-3 bg-transparent"
                          >
                            Cancel
                          </Button>
                        )}
                        {((request as any).paymentStatus === "unpaid" || (request as any).paymentStatus === "pending_verification") && (request as any).documentFee > 0 && (
                          <Button
                            size="sm"
                            onClick={() => setPaymentRequest(request)}
                            className={`text-2xs h-7 px-3 font-semibold ${ 
                              (request as any).paymentStatus === "unpaid" 
                                ? ((request as any).paymentMethod === "cash" ? "bg-[#0C2340] hover:bg-[#0a1c33] dark:bg-slate-800 dark:hover:bg-slate-700 text-white" : "bg-orange-500 hover:bg-orange-600 text-white") 
                                : "bg-amber-500 hover:bg-amber-600 text-white" 
                            }`}
                          >
                            {(request as any).paymentStatus === "unpaid" 
                              ? ((request as any).paymentMethod === "cash" ? "🧾 Receipt" : "💳 Pay Now") 
                              : "🕐 Resubmit"}
                          </Button>
                        )}
                        {request.status === "Rejected" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-2xs h-7 px-3 bg-transparent"
                            >
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-2xs h-7 px-3 bg-transparent"
                            >
                              Retry
                            </Button>
                          </>
                        )}
                        {request.authorizationLetter && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedRequest(request); setShowAuthDialog(true) }}
                            className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-2xs h-7 px-3 bg-transparent"
                          >
                            Auth Letter
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTrackingRequestId(request.id)}
                          className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-2xs h-7 px-3 bg-transparent"
                        >
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Showing {showingFrom}-{showingTo} of{" "}
            {filteredRequests.length} requests
          </p>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              variant="outline"
              size="sm"
              className="w-9 h-9 p-0 border-slate-300 dark:border-slate-600 bg-transparent disabled:opacity-50"
            >
              ←
            </Button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                onClick={() => setCurrentPage(page)}
                size="sm"
                className={`w-9 h-9 p-0 text-xs ${currentPage === page
                  ? "bg-[#0C2340] dark:bg-slate-800 hover:bg-[#1a3a5c] text-white"
                  : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600"
                  }`}
              >
                {page}
              </Button>
            ))}

            <Button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              variant="outline"
              size="sm"
              className="w-9 h-9 p-0 border-slate-300 dark:border-slate-600 bg-transparent disabled:opacity-50"
            >
              →
            </Button>
          </div>
        </div>
      </Card>

      {/* Authorization Letter Dialog */}
      {showAuthDialog && selectedRequest && (
        <ModalOverlay isOpen={true} onClose={() => setShowAuthDialog(false)}>
          <Card className="w-full max-w-lg p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Authorization Letter Details</h3>
              <button onClick={() => setShowAuthDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6">
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Requested For</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.requestedByName}</p></div>
                  <div><p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Relationship</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.relationship}</p></div>
                  <div><p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Contact</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.requestedByContact}</p></div>
                  <div><p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">File Uploaded</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.authorizationLetter}</p></div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center border border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-slate-400">Document Viewer Placeholder</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button className="flex-1 h-10 bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]">Download File</Button>
                <Button variant="outline" onClick={() => setShowAuthDialog(false)} className="flex-1 h-10 border-slate-200 dark:border-slate-700">Close</Button>
              </div>
            </div>
          </Card>
        </ModalOverlay>
      )}
      {/* Add active tracking request lookup so it updates in real time */}
      <RequestStatusTrackerModal 
        request={requests.find(r => r.id === trackingRequestId) || null} 
        isOpen={!!trackingRequestId} 
        onClose={() => setTrackingRequestId(null)} 
      />

      <PaymentModal
        isOpen={!!paymentRequest}
        onClose={() => setPaymentRequest(null)}
        request={paymentRequest ? {
          id: paymentRequest.id,
          documentType: paymentRequest.documentType,
          documentFee: (paymentRequest as any).documentFee,
          paymentReferenceNumber: (paymentRequest as any).paymentReferenceNumber,
          paymentMethod: (paymentRequest as any).paymentMethod,
        } : null}
      />

    </ResidentPageShell>
  )
}
