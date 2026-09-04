"use client"

import { useState, useMemo } from "react"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useMounted } from "@/hooks/use-mounted"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { delay } from "@/lib/async-delay"
import { useResidentData } from "@/hooks/use-resident-data"
import type { ResidentRequest } from "@/lib/local-storage-store"
import { RequestStatusTrackerModal } from "@/components/history/request-status-tracker-modal"

export default function RequestHistoryPage() {
  const { isAuthorized } = useAuthGuard()
  const { requests, cancelRequest } = useResidentData()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [trackingRequestId, setTrackingRequestId] = useState<string | null>(null)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<ResidentRequest | null>(null)
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString())
  const itemsPerPage = 5
  const mounted = useMounted()

  // Statistics Calculation
  const stats = useMemo(() => {
    const years = new Set<string>()
    const monthlyStats: Record<string, { total: number; approved: number; declined: number }> = {}
    let yearlyTotal = 0
    let yearlyApproved = 0
    let yearlyDeclined = 0

    requests.forEach(req => {
      if (!req.dateRequested) return
      
      const date = new Date(req.dateRequested)
      if (isNaN(date.getTime())) return
      
      const year = date.getFullYear().toString()
      const month = date.toLocaleString('default', { month: 'long' })
      years.add(year)

      if (year === selectedYear) {
        yearlyTotal++
        if (req.status === "Approved" || req.status === "Ready for Pick Up" || req.status === "Completed") {
          yearlyApproved++
        } else if (req.status === "Rejected") {
          yearlyDeclined++
        }

        if (!monthlyStats[month]) {
          monthlyStats[month] = { total: 0, approved: 0, declined: 0 }
        }
        monthlyStats[month].total++
        if (req.status === "Approved" || req.status === "Ready for Pick Up" || req.status === "Completed") {
          monthlyStats[month].approved++
        } else if (req.status === "Rejected") {
          monthlyStats[month].declined++
        }
      }
    })

    // If no years exist, default to current year
    if (years.size === 0) {
      years.add(new Date().getFullYear().toString())
    }

    return {
      availableYears: Array.from(years).sort().reverse(),
      yearlyTotal,
      yearlyApproved,
      yearlyDeclined,
      monthlyStats
    }
  }, [requests, selectedYear])

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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
          <h2 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Yearly Summary</h2>
          <div className="w-32 mt-3 sm:mt-0">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full h-9 bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-600">
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

        {/* Yearly Totals */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
          <div className="bg-slate-50 dark:bg-slate-950 p-3 sm:p-4 rounded-lg border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-bold mb-1 uppercase tracking-wide">Total</p>
            <p className="text-xl sm:text-2xl font-bold text-[#0C2340] dark:text-blue-50 leading-none">{stats.yearlyTotal}</p>
          </div>
          <div className="bg-emerald-50 p-3 sm:p-4 rounded-lg border border-emerald-100 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] sm:text-xs text-emerald-600 font-bold mb-1 uppercase tracking-wide">Approved</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-700 leading-none">{stats.yearlyApproved}</p>
          </div>
          <div className="bg-red-50 p-3 sm:p-4 rounded-lg border border-red-100 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] sm:text-xs text-red-600 font-bold mb-1 uppercase tracking-wide">Declined</p>
            <p className="text-xl sm:text-2xl font-bold text-red-700 leading-none">{stats.yearlyDeclined}</p>
          </div>
        </div>

        {/* Monthly Breakdown */}
        {Object.keys(stats.monthlyStats).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 uppercase tracking-wide">Monthly Breakdown</h3>
            <div className="flex overflow-x-auto pb-4 gap-4 snap-x sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:pb-0 sm:overflow-visible">
              {Object.entries(stats.monthlyStats).map(([month, data]) => (
                <div key={month} className="min-w-[240px] sm:min-w-0 flex-shrink-0 snap-start border border-slate-200 dark:border-slate-700 p-3 rounded-lg flex flex-col gap-2 bg-white dark:bg-slate-900">
                  <p className="text-sm font-bold text-[#0C2340] dark:text-blue-50">{month}</p>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Total:</span>
                    <span className="font-semibold">{data.total}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-emerald-600 font-medium">Approved:</span>
                    <span className="font-semibold text-emerald-700">{data.approved}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-red-600 font-medium">Declined:</span>
                    <span className="font-semibold text-red-700">{data.declined}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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

      {/* Table */}
      <Card className="shadow-sm overflow-hidden py-0">
        <div
          className="history-scroll relative w-full max-w-full overflow-x-auto touch-pan-x [scrollbar-width:thin]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <table className="w-full min-w-[900px] table-auto">
            <thead>
              <tr className="bg-[#0C2340] dark:bg-slate-800/[0.03] border-b border-slate-200 dark:border-slate-700">
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Ref #</th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Document Type</th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Date Requested</th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Purpose</th>
                <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Actions</th>
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
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium ${request.status === "Pending" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300" :
                            request.status === "On Process" || request.status === "Approved" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" :
                              request.status === "Ready for Pick Up" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300" :
                                request.status === "Completed" ? "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300" :
                                  "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                          }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{request.purpose}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {request.status === "Pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelRequest(request.id)}
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 text-[10px] h-7 px-3 bg-transparent"
                          >
                            Cancel
                          </Button>
                        )}
                        {request.status === "Rejected" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-[10px] h-7 px-3 bg-transparent"
                            >
                              Details
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-[10px] h-7 px-3 bg-transparent"
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
                            className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-[10px] h-7 px-3 bg-transparent"
                          >
                            Auth Letter
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTrackingRequestId(request.id)}
                          className="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-[10px] h-7 px-3 bg-transparent"
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
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Authorization Letter Details</h3>
              <button onClick={() => setShowAuthDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6">
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Requested For</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.requestedByName}</p></div>
                  <div><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Relationship</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.relationship}</p></div>
                  <div><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Contact</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.requestedByContact}</p></div>
                  <div><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">File Uploaded</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.authorizationLetter}</p></div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center border border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-slate-400">Document Viewer Placeholder</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => setShowAuthDialog(false)} className="flex-1 h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-900 dark:text-slate-100">Close</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
      {/* Add active tracking request lookup so it updates in real time */}
      <RequestStatusTrackerModal 
        request={requests.find(r => r.id === trackingRequestId) || null} 
        isOpen={!!trackingRequestId} 
        onClose={() => setTrackingRequestId(null)} 
      />

    </ResidentPageShell>
  )
}
