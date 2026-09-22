"use client"

import { useState, Suspense } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useAdminData } from "@/hooks/admin"
import { useSuperAdminData } from "@/hooks/superadmin"
import { useAuth } from "@/lib/auth"
import { toast } from "sonner"
import { FileText, Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { ModalOverlay } from "@/components/ui/modal-overlay"
import dynamic from 'next/dynamic'

const AdminPaymentProcessModal = dynamic(
  () => import('@/components/admin/admin-payment-process-modal').then(mod => mod.AdminPaymentProcessModal),
  { ssr: false }
)

function DocumentRequestsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { residents, documentRequests: adminDocumentRequests, updateRequestStatus, confirmPayment, waivePayment } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  const { user } = useAuth()
  
  const [docTypeFilter, setDocTypeFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [paymentProcessRequest, setPaymentProcessRequest] = useState<any>(null)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [selectedRequest, setSelectedRequest] = useState<any>(null)

  // Derive activeTab directly from URL — always in sync with sidebar links
  const activeTab = searchParams.get("tab") || "all"

  const handleTabChange = (tabId: string) => {
    if (tabId === "all") {
      router.replace("/admin/requests")
    } else {
      router.replace(`/admin/requests?tab=${tabId}`)
    }
  }

  const activeRequests = adminDocumentRequests.filter(r => r.status !== "Completed" && r.status !== "Rejected")

  const defaultDocTypes = systemConfig?.documentTypes || []
  const customDocTypes = (systemConfig?.customDocumentTypes || []).map((c: any) => c.name)
  const allAvailableTypes = Array.from(new Set([...defaultDocTypes, ...customDocTypes]))

  const tabs = [
    { id: "all", label: "All Active" },
    { id: "pending", label: "🕐 Awaiting Approval" },
    { id: "processing", label: "⚙️ In Process" },
    { id: "ready", label: "📦 Ready for Pick Up" }
  ]

  const docTypeOptions = [
    { id: "all", label: "All Document Types" },
    ...allAvailableTypes.map(type => ({
      id: type,
      label: type.replace("Certificate of ", "").replace("Barangay ", "")
    }))
  ]

  const filteredRequests = activeRequests.filter(r => {
    // 1. Tab Filtering
    let matchesTab = true;
    if (activeTab === "pending") matchesTab = r.status === "Pending";
    else if (activeTab === "payments") matchesTab = r.status === "Awaiting Payment" || (r as any).paymentStatus === "pending_verification";
    else if (activeTab === "processing") matchesTab = r.status === "On Process" || r.status === "Approved";
    else if (activeTab === "ready") matchesTab = r.status === "Ready for Pick Up";

    // 2. Doc Type Filtering
    const matchesDocType = docTypeFilter === "all" || r.documentType === docTypeFilter;
    
    // 3. Search Query
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = r.residentName.toLowerCase().includes(searchLower) || 
                          r.documentType.toLowerCase().includes(searchLower) ||
                          r.id.toLowerCase().includes(searchLower) ||
                          (r as any).receiptNumber?.toLowerCase().includes(searchLower);

    return matchesTab && matchesDocType && matchesSearch;
  })



  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Document Requests</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Review and manage resident document requests</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-nowrap overflow-x-auto gap-6 border-b border-slate-200 dark:border-slate-800 mb-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id 
                ? "border-[#0C2340] text-[#0C2340] dark:border-blue-500 dark:text-blue-500" 
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="w-[220px]">
          <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
            <SelectTrigger className="w-full bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-[#0C2340] dark:focus:ring-slate-700">
              <SelectValue placeholder="Select Document Type" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
              {docTypeOptions.map((opt) => (
                <SelectItem 
                  key={opt.id} 
                  value={opt.id}
                  className="focus:bg-slate-100 dark:focus:bg-slate-900 cursor-pointer"
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="relative w-full md:w-80 lg:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by resident name or reference (PAY- / REC-)..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C2340] dark:focus:ring-slate-700"
          />
        </div>
      </div>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3 font-bold min-w-[200px]">RESIDENT</th>
                <th className="px-6 py-3 font-bold min-w-[200px]">DOCUMENT</th>
                <th className="px-6 py-3 font-bold min-w-[150px]">PURPOSE</th>
                <th className="px-6 py-3 font-bold whitespace-nowrap">DATE</th>
                <th className="px-6 py-3 font-bold whitespace-nowrap">STATUS</th>
                <th className="px-6 py-3 font-bold min-w-[220px]">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRequests.map((request) => {
              const residentProfile = residents.find(r => r.id === request.residentId)
              const profilePic = residentProfile?.profilePicture

              return (
              <tr key={request.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => { setSelectedRequest(request); setShowViewDialog(true) }}>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-2.5">
                  {profilePic ? (
                    <img src={profilePic} alt={request.residentName} className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#0C2340]/10 dark:bg-slate-800 flex items-center justify-center text-[10px] font-semibold text-[#0C2340] dark:text-blue-50">
                      {request.residentInitials || request.residentName?.charAt(0) || "U"}
                    </div>
                  )}
                  <div>
                    <p className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{request.residentName}</p>
                    <p className="text-[10px] text-slate-400">{request.residentCategory}</p>
                  </div>
                  </div>
                </td>
                  <td className="px-6 py-3.5">
                    <span className="text-[11px] text-[#0C2340] dark:text-blue-50 font-medium">{request.documentType}</span>
                    {(request as any).paymentStatus === "unpaid" && (request.documentFee ?? 0) > 0 && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        Pay Later
                      </span>
                    )}
                    {request.id && (
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5" title={request.id}>Ref: {request.id.substring(0, 8).toUpperCase()}</p>
                    )}
                  </td>
                <td className="px-6 py-3.5">
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">{request.purpose}</span>
                </td>
                <td className="px-6 py-3.5 whitespace-nowrap">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{request.dateRequested}</span>
                </td>
                <td className="px-6 py-3.5 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-medium ${request.status === "Pending" ? "bg-amber-50 text-amber-700" :
                      request.status === "On Process" || request.status === "Approved" ? "bg-blue-50 text-blue-700" :
                        request.status === "Awaiting Payment" ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" :
                          request.status === "Ready for Pick Up" ? "bg-emerald-50 text-emerald-700" :
                            request.status === "Completed" ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" :
                              "bg-red-50 text-red-700"
                    }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${request.status === "Pending" ? "bg-amber-500" :
                        request.status === "On Process" || request.status === "Approved" ? "bg-blue-500" :
                          request.status === "Awaiting Payment" ? "bg-slate-500" :
                            request.status === "Ready for Pick Up" ? "bg-emerald-500" :
                              request.status === "Completed" ? "bg-slate-400" :
                                "bg-red-500"
                      }`} />
                    {request.status === "Awaiting Payment" ? "Pay Later" : request.status}
                  </span>
                  {(request as any).paymentStatus === "pending_verification" && (
                    <span className="block mt-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[9px] w-fit">
                      Review Payment
                    </span>
                  )}
                  {(request as any).paymentStatus === "paid" && (
                    <span className="block mt-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] w-fit">
                      Paid
                    </span>
                  )}
                  {request.requestFor === "other" && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[9px]">Rep.</span>
                  )}
                </td>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-2">
                  {user?.role !== "View Only" && (
                    <>
                      {request.status === "Pending" && !((request as any).paymentStatus === "pending_verification") && (
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
                      {(request.status === "Awaiting Payment" || (request as any).paymentStatus === "pending_verification") && (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-200">
                            ⏳ Payment pending — go to Payment Process
                          </span>
                        </div>
                      )}
                      {(request.status === "On Process" || request.status === "Approved") && (
                        <div className="flex items-center gap-2">
                          {!(request as any).hasGenerated ? (
                            <Button size="sm" onClick={(e) => { 
                              e.stopPropagation(); 
                              router.push(`/admin/generate?requestId=${request.id}`)
                            }} className="h-6 px-3 text-[10px] bg-blue-600 hover:bg-blue-700">Generate</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={async (e) => { 
                              e.stopPropagation(); 
                              try {
                                await updateRequestStatus(request.id, "Ready for Pick Up", undefined, user?.name || "Admin", user?.email || "admin@system.com")
                                toast.success("Status updated to Ready for Pick Up")
                              } catch (err: any) {
                                toast.error(err.message || "Failed to update status")
                              }
                            }} className="h-6 px-3 text-[10px] bg-transparent text-slate-500">Mark Ready</Button>
                          )}
                        </div>
                      )}
                      {request.status === "Ready for Pick Up" && (
                        <Button 
                          size="sm" 
                          disabled={(request as any).paymentStatus === "unpaid"}
                          title={(request as any).paymentStatus === "unpaid" ? "Payment must be processed first" : ""}
                          onClick={async (e) => { 
                            e.stopPropagation(); 
                            try {
                              await updateRequestStatus(request.id, "Completed", undefined, user?.name || "Admin", user?.email || "admin@system.com")
                              toast.success("Status updated to Completed")
                            } catch (err: any) {
                              toast.error(err.message || "Failed to update status")
                            }
                          }} 
                          className="h-6 px-3 text-[10px] bg-[#0C2340] dark:bg-slate-800 hover:bg-[#1a3a5c] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Complete
                        </Button>
                      )}
                    </>
                  )}
                  {(request.status === "Completed" || request.status === "Rejected") && (
                    <span className="text-[10px] text-slate-400">Processed</span>
                  )}
                  </div>
                </td>
              </tr>
            )
            })}
            
            {filteredRequests.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No document requests found</p>
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
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Request Details</h3>
              <button onClick={() => setShowViewDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Reference Number</p>
                  <p className="text-sm font-mono text-slate-900 dark:text-slate-100">{selectedRequest.id.substring(0, 8).toUpperCase()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Date Requested</p>
                  <p className="text-sm text-slate-900 dark:text-slate-100">{selectedRequest.dateRequested}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Document Type</p>
                  <p className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">{selectedRequest.documentType}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Purpose</p>
                  <p className="text-sm text-slate-900 dark:text-slate-100">{selectedRequest.purpose}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Resident</p>
                  <p className="text-sm text-slate-900 dark:text-slate-100">{selectedRequest.residentName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm text-slate-900 dark:text-slate-100">{selectedRequest.status}</p>
                </div>
                {selectedRequest.documentFee > 0 && (
                  <>
                    <div className="col-span-2 mt-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-sm font-bold text-[#0C2340] dark:text-blue-50 mb-3">Payment Details</h4>
                      <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Fee</p>
                          <p className="text-sm font-bold text-[#0C2340]">₱{selectedRequest.documentFee.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Status</p>
                          <p className="text-sm font-semibold capitalize text-amber-600">{selectedRequest.paymentStatus.replace("_", " ")}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Method</p>
                          <p className="text-sm uppercase font-semibold">{selectedRequest.paymentMethod || "N/A"}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Reference</p>
                          <p className="text-sm font-mono">{selectedRequest.paymentMethod === "gcash" ? selectedRequest.gcashRefNumber : selectedRequest.paymentReferenceNumber}</p>
                        </div>
                      </div>
                    </div>
                    {selectedRequest.paymentMethod === "gcash" && selectedRequest.gcashScreenshotUrl && (
                      <div className="col-span-2">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">GCash Screenshot</p>
                        <img src={selectedRequest.gcashScreenshotUrl} alt="GCash proof" className="w-full max-h-64 object-contain rounded-lg border border-slate-200" />
                      </div>
                    )}
                  </>
                )}
              </div>
              <Button onClick={() => setShowViewDialog(false)} className="w-full h-10 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-900 dark:text-slate-100">Close</Button>
            </div>
          </Card>
        </ModalOverlay>
      )}

      {/* Approve Dialog */}
      {showApproveDialog && selectedRequest && (
        <ModalOverlay isOpen={true} onClose={() => setShowApproveDialog(false)}>
          <Card className="w-full max-w-md p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Approve Request</h3>
              <button onClick={() => setShowApproveDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Approve <strong>{selectedRequest.documentType}</strong> for <strong>{selectedRequest.residentName}</strong>?</p>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button onClick={async () => { 
                    try {
                      await updateRequestStatus(selectedRequest.id, "On Process", undefined, user?.name || "Admin", user?.email || "admin@system.com"); 
                      setShowApproveDialog(false);
                      toast.success(`Status updated to On Process`)
                    } catch (err: any) {
                      toast.error(err.message || "Failed to update status")
                    }
                  }} className="w-full h-10 bg-emerald-600 hover:bg-emerald-700">
                    Confirm Approval
                  </Button>
                </div>
                <Button variant="outline" onClick={() => setShowApproveDialog(false)} className="w-full h-10 bg-transparent">Cancel</Button>
              </div>
            </div>
          </Card>
        </ModalOverlay>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && selectedRequest && (
        <ModalOverlay isOpen={true} onClose={() => setShowRejectDialog(false)}>
          <Card className="w-full max-w-md p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Reject Request</h3>
              <button onClick={() => setShowRejectDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Reject <strong>{selectedRequest.documentType}</strong> for <strong>{selectedRequest.residentName}</strong>?</p>
              <textarea
                placeholder="Reason for rejection (min 10 characters)..."
                className="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm mb-2 focus:outline-none focus:border-[#0C2340]"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <p className={`text-[10px] mb-4 ${rejectReason.trim().length >= 10 ? 'text-green-600' : 'text-red-500'}`}>
                {rejectReason.trim().length}/10 characters minimum
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={async () => { 
                    try {
                      await updateRequestStatus(selectedRequest.id, "Rejected", rejectReason, user?.name || "Admin", user?.email || "admin@system.com"); 
                      setShowRejectDialog(false);
                      toast.success("Status updated to Rejected")
                    } catch (err: any) {
                      toast.error(err.message || "Failed to reject status")
                    }
                  }}
                  disabled={rejectReason.trim().length < 10}
                  className="flex-1 h-10 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  Confirm Reject
                </Button>
                <Button variant="outline" onClick={() => setShowRejectDialog(false)} className="flex-1 h-10 bg-transparent">Cancel</Button>
              </div>
            </div>
          </Card>
        </ModalOverlay>
      )}

      {/* Authorization Letter Dialog */}
      {showAuthDialog && selectedRequest && (
        <ModalOverlay isOpen={true} onClose={() => setShowAuthDialog(false)}>
          <Card className="w-full max-w-lg p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Authorization Letter</h3>
              <button onClick={() => setShowAuthDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6">
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Requested By</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.requestedByName}</p></div>
                  <div><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Relationship</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.relationship}</p></div>
                  <div><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Contact</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.requestedByContact}</p></div>
                  <div><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">File</p><p className="text-sm text-[#0C2340] dark:text-blue-50">{selectedRequest.authorizationLetter}</p></div>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-8 text-center mb-4">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Authorization letter preview</p>
              </div>
              <Button onClick={() => setShowAuthDialog(false)} className="w-full h-10 bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]">Close</Button>
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

export default function DocumentRequests() {
  return (
    <Suspense fallback={<AdminPageShell><div className="p-8">Loading requests...</div></AdminPageShell>}>
      <DocumentRequestsContent />
    </Suspense>
  )
}
