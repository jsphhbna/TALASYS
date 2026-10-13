"use client"

import { useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/admin"
import { useAuth } from "@/lib/auth"
import { SecureMediaViewer } from "@/components/media/secure-image"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  UserPlus,
  FileEdit,
  RefreshCw,
  History,
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  Inbox,
  Clock,
  Eye,
  Check,
  X,
  AlertTriangle,
  Bell,
} from "lucide-react"
import { toast } from "sonner"

export function VerificationWorkspace() {
  const { verifications, rejectedVerifications, activityLogs, notifications, approveVerification, rejectVerification } = useAdminData()
  const { user } = useAuth()

  const [activeTab, setActiveTab] = useState<"all" | "registration" | "profile-edit" | "reactivation" | "history">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [reviewItem, setReviewItem] = useState<any | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null)

  // Verification Queue Counts
  const regCount = useMemo(() => verifications.filter(v => v.type === "registration").length, [verifications])
  const editCount = useMemo(() => verifications.filter(v => v.type === "profile-edit").length, [verifications])
  const reactivateCount = useMemo(() => verifications.filter(v => v.type === "reactivation").length, [verifications])
  const totalPending = verifications.length

  // Authoritative Verification History from activityLogs and rejectedVerifications
  const verificationHistory = useMemo(() => {
    const historyList: any[] = []

    // From activityLogs
    activityLogs.forEach(log => {
      const isApprovedOrRejected = log.actionType === "approved" || log.actionType === "rejected"
      const actionText = (log.action || log.actionType || "").toLowerCase()
      const isVerificationAction =
        log.targetCollection === "verifications" ||
        actionText.includes("verification") ||
        actionText.includes("profile edit") ||
        actionText.includes("reactivation")

      if (isApprovedOrRejected && isVerificationAction) {
        historyList.push({
          id: log.id,
          name: log.residentName || "Resident",
          type: actionText.includes("profile edit")
            ? "profile-edit"
            : actionText.includes("reactivation")
              ? "reactivation"
              : "registration",
          decision: log.actionType === "approved" ? "Approved" : "Rejected",
          date: log.date || new Date(log.timestamp || Date.now()).toLocaleDateString(),
          reviewer: log.admin?.name || "Admin",
          notes: log.details || "",
        })
      }
    })

    // From rejectedVerifications (if not duplicate)
    rejectedVerifications.forEach(rej => {
      if (!historyList.some(h => h.id === rej.id)) {
        historyList.push({
          id: rej.id,
          name: rej.name || "Resident",
          type: rej.type || "registration",
          decision: "Rejected",
          date: rej.submittedDate || "Recently",
          reviewer: (rej as any).reviewedBy || "Admin",
          notes: (rej as any).rejectionReason || "Requirements not met",
        })
      }
    })

    return historyList
  }, [activityLogs, rejectedVerifications])

  // Filtered queue items
  const filteredQueue = useMemo(() => {
    let list = verifications
    if (activeTab === "registration") {
      list = list.filter(v => v.type === "registration")
    } else if (activeTab === "profile-edit") {
      list = list.filter(v => v.type === "profile-edit")
    } else if (activeTab === "reactivation") {
      list = list.filter(v => v.type === "reactivation")
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(v =>
        (v.name || "").toLowerCase().includes(q) ||
        (v.id || "").toLowerCase().includes(q) ||
        (v.email || "").toLowerCase().includes(q)
      )
    }

    return list
  }, [verifications, activeTab, searchQuery])

  // Filtered history items
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return verificationHistory
    const q = searchQuery.toLowerCase()
    return verificationHistory.filter(h =>
      (h.name || "").toLowerCase().includes(q) ||
      (h.notes || "").toLowerCase().includes(q) ||
      (h.reviewer || "").toLowerCase().includes(q)
    )
  }, [verificationHistory, searchQuery])

  const handleApprove = async (item: any) => {
    setIsProcessing(true)
    try {
      await approveVerification(item.id, user?.name || "Verification Officer", user?.email || "officer@barangay.gov.ph")
      toast.success(`Verification for ${item.name} approved successfully.`)
      setReviewItem(null)
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve verification")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!reviewItem) return
    if (!rejectReason || rejectReason.trim().length < 10) {
      toast.error("Please provide a specific rejection reason (minimum 10 characters).")
      return
    }

    setIsProcessing(true)
    try {
      await rejectVerification(
        reviewItem.id,
        rejectReason.trim(),
        user?.name || "Verification Officer",
        user?.email || "officer@barangay.gov.ph"
      )
      toast.success(`Verification for ${reviewItem.name} rejected.`)
      setShowRejectModal(false)
      setRejectReason("")
      setReviewItem(null)
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject verification")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0C2340] to-[#1e3a8a] text-white flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">
              Verification Workspace
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Review and decision queues for resident registrations, profile changes, and account reactivations
            </p>
          </div>
        </div>
      </div>

      {notifications.length > 0 && (
        <Card className="p-4 border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/20" aria-label="Verification notifications">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-100">Verification Notifications</h2>
            <span className="ml-auto text-2xs font-semibold rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">{notifications.filter(item => !item.isRead).length} unread</span>
          </div>
          <div className="space-y-2">
            {notifications.slice(0, 5).map(item => (
              <div key={item.id} className="rounded-md border border-blue-100 dark:border-blue-900/60 bg-white/80 dark:bg-slate-900/60 p-2.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{item.title}</p>
                <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">{item.message}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Strictly Scoped KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          onClick={() => setActiveTab("registration")}
          className={`p-4 shadow-sm cursor-pointer transition-all border-slate-200 dark:border-slate-800 hover:border-blue-400 ${
            activeTab === "registration" ? "ring-2 ring-blue-500 bg-blue-50/20" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
              <UserPlus className="w-4 h-4" />
            </div>
            {regCount > 0 && (
              <span className="text-2xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <p className="text-2xs font-semibold text-slate-500 uppercase tracking-wider">New Registrations</p>
          <p className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 mt-0.5">{regCount}</p>
          <p className="text-2xs text-slate-400 mt-0.5">Pending identity verification</p>
        </Card>

        <Card
          onClick={() => setActiveTab("profile-edit")}
          className={`p-4 shadow-sm cursor-pointer transition-all border-slate-200 dark:border-slate-800 hover:border-emerald-400 ${
            activeTab === "profile-edit" ? "ring-2 ring-emerald-500 bg-emerald-50/20" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600">
              <FileEdit className="w-4 h-4" />
            </div>
            {editCount > 0 && (
              <span className="text-2xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-semibold px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <p className="text-2xs font-semibold text-slate-500 uppercase tracking-wider">Profile Edits</p>
          <p className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 mt-0.5">{editCount}</p>
          <p className="text-2xs text-slate-400 mt-0.5">Pending information updates</p>
        </Card>

        <Card
          onClick={() => setActiveTab("reactivation")}
          className={`p-4 shadow-sm cursor-pointer transition-all border-slate-200 dark:border-slate-800 hover:border-purple-400 ${
            activeTab === "reactivation" ? "ring-2 ring-purple-500 bg-purple-50/20" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center text-purple-600">
              <RefreshCw className="w-4 h-4" />
            </div>
            {reactivateCount > 0 && (
              <span className="text-2xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-semibold px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </div>
          <p className="text-2xs font-semibold text-slate-500 uppercase tracking-wider">Reactivations</p>
          <p className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 mt-0.5">{reactivateCount}</p>
          <p className="text-2xs text-slate-400 mt-0.5">Expired or dormant accounts</p>
        </Card>

        <Card
          onClick={() => setActiveTab("history")}
          className={`p-4 shadow-sm cursor-pointer transition-all border-slate-200 dark:border-slate-800 hover:border-amber-400 ${
            activeTab === "history" ? "ring-2 ring-amber-500 bg-amber-50/20" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
              <History className="w-4 h-4" />
            </div>
            <span className="text-2xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold px-2 py-0.5 rounded-full">
              Ledger
            </span>
          </div>
          <p className="text-2xs font-semibold text-slate-500 uppercase tracking-wider">Verification History</p>
          <p className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 mt-0.5">{verificationHistory.length}</p>
          <p className="text-2xs text-slate-400 mt-0.5">Processed decisions logged</p>
        </Card>
      </div>

      {/* Workspace Tabs & Search Controls */}
      <Card className="p-0 border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === "all"
                  ? "bg-[#0C2340] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span>All Pending</span>
              <span className={`px-1.5 py-0.2 rounded-full text-2xs ${activeTab === "all" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                {totalPending}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("registration")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === "registration"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span>Registrations</span>
              <span className={`px-1.5 py-0.2 rounded-full text-2xs ${activeTab === "registration" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                {regCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("profile-edit")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === "profile-edit"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span>Profile Edits</span>
              <span className={`px-1.5 py-0.2 rounded-full text-2xs ${activeTab === "profile-edit" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                {editCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("reactivation")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === "reactivation"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span>Reactivations</span>
              <span className={`px-1.5 py-0.2 rounded-full text-2xs ${activeTab === "reactivation" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                {reactivateCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === "history"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
              <span className={`px-1.5 py-0.2 rounded-full text-2xs ${activeTab === "history" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                {verificationHistory.length}
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by resident name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Content Area */}
        <div className="p-5">
          {activeTab !== "history" ? (
            /* Queue Table */
            filteredQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <CheckCircle2 className="w-10 h-10 mb-2 text-emerald-500 opacity-80" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Queue is clear</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {searchQuery ? "No verifications matched your search filter." : "No pending verification requests in this queue."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-2xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Resident</th>
                      <th className="py-2.5 px-3">Submitted</th>
                      <th className="py-2.5 px-3">Evidence Details</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    {filteredQueue.map((item) => {
                      const typeLabel =
                        item.type === "registration"
                          ? "Registration"
                          : item.type === "profile-edit"
                            ? "Profile Edit"
                            : "Reactivation"
                      const typeColor =
                        item.type === "registration"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : item.type === "profile-edit"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-purple-50 text-purple-700 border-purple-200"

                      const docCount = item.documents ? Object.keys(item.documents).length : 0
                      const changeCount = item.changes?.length || 0

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-semibold border ${typeColor}`}>
                              {typeLabel}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-[#0C2340] dark:text-blue-100">{item.name}</div>
                            <div className="text-2xs text-slate-400">{item.email || item.contactNumber || "Resident"}</div>
                          </td>
                          <td className="py-3 px-3 text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{item.submittedDate || "Recent"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-500">
                            {item.type === "profile-edit" ? (
                              <span className="text-2xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                                {changeCount} field{changeCount !== 1 ? "s" : ""} modified
                              </span>
                            ) : (
                              <span className="text-2xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                                {docCount > 0 ? `${docCount} proof document${docCount > 1 ? "s" : ""}` : "Valid ID attached"}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReviewItem(item)}
                                className="h-7 px-2.5 text-2xs text-[#0C2340] dark:text-blue-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                Review
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleApprove(item)}
                                disabled={isProcessing}
                                className="h-7 px-2.5 text-2xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <Check className="w-3.5 h-3.5 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setReviewItem(item)
                                  setShowRejectModal(true)
                                }}
                                disabled={isProcessing}
                                className="h-7 px-2.5 text-2xs text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                              >
                                <X className="w-3.5 h-3.5 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* History Table */
            filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Inbox className="w-10 h-10 mb-2 opacity-60" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No verification history found</p>
                <p className="text-xs text-slate-400 mt-0.5">Processed decisions will appear in this authoritative ledger.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-2xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Decision</th>
                      <th className="py-2.5 px-3">Resident</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Reviewed By</th>
                      <th className="py-2.5 px-3">Details / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                    {filteredHistory.map((h, i) => (
                      <tr key={h.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold ${
                              h.decision === "Approved"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {h.decision === "Approved" ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-600" />
                            )}
                            {h.decision}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium text-[#0C2340] dark:text-blue-100">{h.name}</td>
                        <td className="py-3 px-3 capitalize text-slate-500">{h.type.replace("-", " ")}</td>
                        <td className="py-3 px-3 text-slate-500">{h.date}</td>
                        <td className="py-3 px-3 text-slate-500">{h.reviewer}</td>
                        <td className="py-3 px-3 text-slate-500 max-w-xs truncate">{h.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </Card>

      {/* Review Dialog with Scoped Evidence & Resident Information */}
      <Dialog open={!!reviewItem && !showRejectModal} onOpenChange={(open) => !open && setReviewItem(null)}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#0C2340] dark:text-blue-50 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <span>Review Verification — {reviewItem?.name}</span>
            </DialogTitle>
            <DialogDescription>
              Review resident details and submitted proof documents before taking action.
            </DialogDescription>
          </DialogHeader>

          {reviewItem && (
            <div className="space-y-4 py-2">
              {/* Resident Overview */}
              <div className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-2xs font-semibold text-slate-400 uppercase">Verification Type</span>
                    <p className="font-semibold text-[#0C2340] dark:text-blue-100 capitalize mt-0.5">
                      {reviewItem.type.replace("-", " ")}
                    </p>
                  </div>
                  <div>
                    <span className="text-2xs font-semibold text-slate-400 uppercase">Submission Date</span>
                    <p className="font-semibold text-[#0C2340] dark:text-blue-100 mt-0.5">
                      {reviewItem.submittedDate || "Recent"}
                    </p>
                  </div>
                  <div>
                    <span className="text-2xs font-semibold text-slate-400 uppercase">Full Name</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5">{reviewItem.name}</p>
                  </div>
                  <div>
                    <span className="text-2xs font-semibold text-slate-400 uppercase">Contact / Email</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5">
                      {reviewItem.email || reviewItem.contactNumber || "Not specified"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Profile Edit Differences */}
              {reviewItem.type === "profile-edit" && reviewItem.changes && reviewItem.changes.length > 0 && (
                <div>
                  <p className="text-2xs font-semibold text-slate-500 uppercase mb-2">Requested Profile Modifications</p>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden text-xs">
                    {reviewItem.changes.map((c: any, idx: number) => (
                      <div key={idx} className="p-3 flex items-start justify-between gap-4">
                        <span className="font-semibold text-slate-600 dark:text-slate-300 w-1/3">{c.field}</span>
                        <div className="w-2/3">
                          <div className="text-red-500 line-through text-2xs mb-0.5">{c.oldValue || "(empty)"}</div>
                          <div className="text-emerald-600 font-semibold">{c.newValue}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submitted Proof Documents with Secure Media Delivery */}
              <div>
                <p className="text-2xs font-semibold text-slate-500 uppercase mb-2">Submitted Evidence & Proofs</p>
                {reviewItem.documents && Object.keys(reviewItem.documents).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(reviewItem.documents).map(([docTitle, docUrl]: [string, any], idx) => (
                      <div key={idx} className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-[#0C2340] dark:text-blue-100">{docTitle}</span>
                          <span className="text-2xs text-slate-400">Authenticated Media</span>
                        </div>
                        <div className="max-h-48 overflow-hidden rounded bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-2 border border-slate-100 dark:border-slate-800">
                          <SecureMediaViewer
                            src={typeof docUrl === "string" ? docUrl : docUrl?.url}
                            alt={docTitle}
                            recordId={reviewItem.id}
                            recordType="verification"
                            className="max-h-44 object-contain rounded"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-center text-xs text-slate-400">
                    No attached digital documents recorded for this verification.
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectModal(true)
              }}
              disabled={isProcessing}
              className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Reject Request
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setReviewItem(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                onClick={() => handleApprove(reviewItem)}
                disabled={isProcessing}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                Approve Verification
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirm Rejection</span>
            </DialogTitle>
            <DialogDescription>
              Specify the rationale for rejecting {reviewItem?.name}&apos;s verification. This will be sent as an official notice to the resident.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <label className="text-2xs font-semibold text-slate-500 uppercase block">
              Rejection Reason (min 10 characters)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. The submitted ID is expired and address does not match Barangay records."
              rows={3}
              className="w-full p-2.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <DialogFooter className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRejectModal(false)} className="text-xs">
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleReject}
              disabled={isProcessing || rejectReason.trim().length < 10}
              className="bg-red-600 hover:bg-red-700 text-white text-xs"
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
