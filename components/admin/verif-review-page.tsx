"use client"

import { useState, useEffect } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/admin"
import { useMounted } from "@/hooks/use-mounted"
import { ClipboardCheck, CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"

interface VerifReviewPageProps {
  type: "registration" | "profile-edit" | "reactivation"
  title: string
  subtitle: string
  accentColor: "blue" | "green" | "purple"
}

const colorMap = {
  blue:   { stat: "text-blue-600", initials: "bg-blue-600", badge: "bg-blue-50 text-blue-800" },
  green:  { stat: "text-green-600", initials: "bg-green-600", badge: "bg-green-50 text-green-800" },
  purple: { stat: "text-purple-600", initials: "bg-purple-600", badge: "bg-purple-50 text-purple-800" },
}

export function VerifReviewPage({ type, title, subtitle, accentColor }: VerifReviewPageProps) {
  const { verifications: pendingVerifications, activityLogs, approveVerification, rejectVerification } = useAdminData()
  const { user } = useAuth()
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedUserDetails, setSelectedUserDetails] = useState<any>(null)
  const mounted = useMounted()

  useEffect(() => {
    if (selectedItem?.residentId && !selectedItem.contactNumber) {
      import("firebase/firestore").then(({ doc, getDoc }) => {
        import("@/lib/firebase").then(({ db }) => {
          getDoc(doc(db, "users", selectedItem.residentId)).then((docSnap) => {
            if (docSnap.exists()) {
              setSelectedUserDetails(docSnap.data())
            }
          })
        })
      })
    } else {
      setSelectedUserDetails(null)
    }
  }, [selectedItem])

  if (!mounted) {
    return <AdminPageShell><div className="flex h-full items-center justify-center p-8">Loading...</div></AdminPageShell>
  }

  const today = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date())
  
  let actionString = "Verification"
  if (type === "profile-edit") actionString = "Profile Edit"
  else if (type === "reactivation") actionString = "Reactivation"
  
  const approvedTodayCount = activityLogs.filter(log => log.date === today && log.actionType === "approved" && log.action === `Approved ${actionString}`).length
  const rejectedTodayCount = activityLogs.filter(log => log.date === today && log.actionType === "rejected" && log.action === `Rejected ${actionString}`).length
  
  const filteredItems = pendingVerifications.filter(v => v.type === type)
  const c = colorMap[accentColor]

  const isOlderThan3Days = (dateStr: string) => {
    const day = parseInt(dateStr.replace("Nov ", ""))
    return day <= 25
  }

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <Card className="p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending in Queue</p>
          <p className={`text-2xl font-bold mt-1 ${c.stat}`}>{filteredItems.length}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Approved Today</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{approvedTodayCount}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Rejected Today</p>
          <p className="text-2xl font-bold mt-1 text-red-600">{rejectedTodayCount}</p>
        </Card>
      </div>

      {/* List */}
      <div className="w-full">
        <Card className="w-full shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Pending Items</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">{filteredItems.length} item{filteredItems.length !== 1 ? "s" : ""} awaiting review</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto max-h-[58vh]">
            {filteredItems.map((item) => {
              const isOverdue = isOlderThan3Days(item.submittedDate)
              const isSelected = selectedItem?.id === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`w-full p-4 text-left transition-colors ${isSelected ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 ${c.initials}`}>
                        {item.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 truncate">{item.name}</p>
                          {isOverdue && <AlertTriangle className="w-3 h-3 flex-shrink-0 text-amber-500" />}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {item.categories?.slice(0, 3).map((cat: string, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-900">{cat}</span>
                          ))}
                        </div>
                        <p className="text-xs mt-1 text-slate-500">Submitted {item.submittedDate}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 text-xs shrink-0">Review Details</Button>
                  </div>
                </button>
              )
            })}
            {filteredItems.length === 0 && (
              <div className="p-12 text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No pending items</p>
                <p className="text-xs mt-1 opacity-70">All caught up!</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Modal Detail */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent 
          className="max-w-3xl max-h-[90vh] p-0 border-0 overflow-hidden flex flex-col gap-0"
          onInteractOutside={(e) => {
            if (selectedImage) {
              e.preventDefault()
            }
          }}
        >
          <DialogTitle className="sr-only">Review Details</DialogTitle>
          <DialogDescription className="sr-only">Review details for {selectedItem?.name}</DialogDescription>
          {selectedItem && (
            <>
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Review Details</h3>
                <span className={`px-3 py-1 rounded text-xs font-semibold ${c.badge}`}>{title}</span>
              </div>
              <div className="p-6 space-y-6 overflow-y-auto overscroll-contain flex-1">
                <div className="flex items-start gap-5 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold text-white flex-shrink-0 ${c.initials}`}>{selectedItem.initials}</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xl font-bold text-[#0C2340] dark:text-blue-50 mb-1">{selectedItem.name}</h4>
                    {selectedItem.age && <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Age: {selectedItem.age} • {selectedItem.gender}</p>}
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Contact Number</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                          {selectedItem.contactNumber || selectedUserDetails?.contactNumber || "N/A"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Email Address</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate" title={selectedItem.email || selectedUserDetails?.email}>
                          {selectedItem.email || selectedUserDetails?.email || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Date of Birth</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                          {selectedItem.dateOfBirth || selectedUserDetails?.dateOfBirth ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(selectedItem.dateOfBirth || selectedUserDetails?.dateOfBirth)) : "N/A"}
                        </p>
                      </div>
                      <div className="col-span-full">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Full Address</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{selectedItem.address || selectedUserDetails?.address || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedItem.changes && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Requested Changes</p>
                    <div className="space-y-3">
                      {selectedItem.changes.map((ch: any, i: number) => (
                        <div key={i} className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                          <p className="text-xs font-bold text-slate-500 uppercase mb-2">{ch.field}</p>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-red-500 line-through">{ch.oldValue}</span>
                            <span className="text-slate-300">→</span>
                            <span className="text-emerald-600 font-medium">{ch.newValue}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedItem.reason && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Reason</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-100 dark:border-slate-800 italic">&ldquo;{selectedItem.reason}&rdquo;</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Documents</p>
                  <div className="space-y-4">
                    {selectedItem.documents?.map((doc: any, i: number) => (
                      <div key={i} className="flex flex-col gap-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-[#0C2340] dark:text-blue-50 font-bold">{doc.name}</span>
                          <span className={`px-2.5 py-1 rounded text-xs font-semibold ${doc.status?.toLowerCase() === "verified" || doc.status?.toLowerCase() === "valid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{doc.status}</span>
                        </div>
                        {doc.url ? (
                          <button onClick={() => setSelectedImage(doc.url)} className="block w-full mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity shadow-sm">
                            <img src={doc.url} alt={doc.name} className="w-full max-h-64 object-cover cursor-zoom-in" />
                          </button>
                        ) : (
                          <div className="text-xs text-slate-400 italic mt-2">No image available</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {user?.role !== "View Only" && (
                  <div className="flex gap-4 pt-4 mt-6 border-t border-slate-100 dark:border-slate-800">
                    <Button onClick={() => { approveVerification(selectedItem.id, user?.name || "Admin", user?.email || "admin@system.com"); setSelectedItem(null) }} className="flex-1 h-12 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700">Approve Request</Button>
                    <Button onClick={() => setShowRejectConfirm(true)} className="flex-1 h-12 text-sm font-semibold bg-red-600 hover:bg-red-700">Reject Request</Button>
                  </div>
                )}

                {showRejectConfirm && (
                  <div className="mt-4 p-5 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-base font-bold text-red-800 mb-2">Confirm Rejection</p>
                    <p className="text-sm text-red-700 mb-4">Please provide a reason (min 10 characters):</p>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Enter rejection reason..."
                      className="w-full p-4 border border-red-200 rounded-lg text-sm mb-3 focus:outline-none focus:border-red-400 bg-white dark:bg-slate-900"
                      rows={3}
                    />
                    <p className={`text-xs mb-4 font-medium ${rejectReason.trim().length >= 10 ? "text-green-600" : "text-red-500"}`}>{rejectReason.trim().length}/10 characters minimum</p>
                    <div className="flex gap-3">
                      <Button onClick={() => { if (rejectReason.trim().length < 10) return; rejectVerification(selectedItem.id, rejectReason, user?.name || "Admin", user?.email || "admin@system.com"); setSelectedItem(null); setShowRejectConfirm(false); setRejectReason("") }} disabled={rejectReason.trim().length < 10} className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-sm font-semibold disabled:opacity-50">Confirm Reject</Button>
                      <Button variant="outline" onClick={() => { setShowRejectConfirm(false); setRejectReason("") }} className="flex-1 h-11 bg-transparent text-sm font-semibold text-slate-700">Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Viewer */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent 
          className="max-w-[95vw] w-fit p-0 bg-transparent border-0 shadow-none flex items-center justify-center"
        >
          <DialogTitle className="sr-only">Fullscreen Document</DialogTitle>
          <div className="relative">
            <img src={selectedImage || ""} alt="Fullscreen Document" className="max-w-full max-h-[90vh] object-contain rounded-lg cursor-zoom-out" onClick={() => setSelectedImage(null)} />
            <button className="absolute -top-4 -right-4 sm:-top-6 sm:-right-6 bg-black/80 hover:bg-black text-white rounded-full p-2 transition-colors z-50" onClick={() => setSelectedImage(null)}>
              <XCircle className="w-8 h-8" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  )
}
