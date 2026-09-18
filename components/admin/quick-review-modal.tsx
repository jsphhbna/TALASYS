"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { useAdminData } from "@/hooks/admin"

interface QuickReviewModalProps {
  item: any | null
  itemType: "verification" | "request" | null
  isOpen: boolean
  onClose: () => void
}

export function QuickReviewModal({ item, itemType, isOpen, onClose }: QuickReviewModalProps) {
  const { user } = useAuth()
  const { approveVerification, rejectVerification, updateRequestStatus } = useAdminData()
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  if (!item) return null

  const handleApprove = async () => {
    setIsProcessing(true)
    if (itemType === "verification") {
      await approveVerification(item.id, user?.name || "Admin", user?.email || "admin@system.com")
    } else if (itemType === "request") {
      await updateRequestStatus(item.id, "Approved", undefined, user?.name || "Admin", user?.email || "admin@system.com")
    }
    setIsProcessing(false)
    onClose()
  }

  const handleReject = async () => {
    if (rejectReason.length < 10) return
    setIsProcessing(true)
    if (itemType === "verification") {
      await rejectVerification(item.id, rejectReason, user?.name || "Admin", user?.email || "admin@system.com")
    } else if (itemType === "request") {
      await updateRequestStatus(item.id, "Rejected", rejectReason, user?.name || "Admin", user?.email || "admin@system.com")
    }
    setIsProcessing(false)
    setShowRejectConfirm(false)
    setRejectReason("")
    onClose()
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md md:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#0C2340] dark:text-blue-50">
              {itemType === "verification" ? "Review Verification" : "Review Document Request"}
            </DialogTitle>
            <DialogDescription>
              {itemType === "verification" ? `Submitted by ${item.name}` : `Requested by ${item.residentName}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Display Verification Specific Fields */}
            {itemType === "verification" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Type</p>
                    <p className="text-sm font-medium text-[#0C2340] dark:text-blue-50 capitalize">{item.type.replace("-", " ")}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Date</p>
                    <p className="text-sm font-medium text-[#0C2340] dark:text-blue-50">{item.submittedDate}</p>
                  </div>
                </div>

                {item.changes && item.changes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Requested Changes</p>
                    <div className="bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                      {item.changes.map((c: any, i: number) => (
                        <div key={i} className="p-3 text-sm flex gap-4">
                          <div className="w-1/3 font-medium text-slate-500">{c.field}</div>
                          <div className="w-2/3">
                            <div className="text-red-500 line-through text-xs mb-1">{c.oldValue}</div>
                            <div className="text-emerald-600 font-medium">{c.newValue}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {item.documents && item.documents.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Attached Documents</p>
                    <div className="space-y-2">
                      {item.documents.map((doc: any, i: number) => (
                        <div key={i} className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-100 dark:border-slate-800">
                          <span className="text-[11px] font-medium text-[#0C2340] dark:text-blue-50">{doc.name}</span>
                          {doc.url && (
                            <button onClick={() => setSelectedImage(doc.url)} className="block w-full mt-2 overflow-hidden rounded border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity focus:outline-none">
                              <img src={doc.url} alt={doc.name} className="w-full max-h-32 object-cover cursor-zoom-in" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Display Request Specific Fields */}
            {itemType === "request" && (
              <div className="space-y-3">
                 <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Document</p>
                    <p className="text-sm font-medium text-[#0C2340] dark:text-blue-50">{item.documentType}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Purpose</p>
                    <p className="text-sm font-medium text-[#0C2340] dark:text-blue-50">{item.purpose}</p>
                  </div>
                </div>
                {item.specificDetails && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Additional Details</p>
                    <p className="text-sm font-medium text-[#0C2340] dark:text-blue-50 mt-1">{item.specificDetails}</p>
                  </div>
                )}
              </div>
            )}

            {showRejectConfirm ? (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-semibold text-red-800 mb-2">Confirm Rejection</p>
                <p className="text-xs text-red-700 mb-3">Please provide a reason (min 10 characters):</p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full p-3 border border-red-200 rounded-lg text-sm mb-2 focus:outline-none focus:border-red-400 bg-white dark:bg-slate-900 text-black dark:text-white"
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowRejectConfirm(false)} className="flex-1 border-red-200 text-red-700 hover:bg-red-100">Cancel</Button>
                  <Button size="sm" onClick={handleReject} disabled={rejectReason.length < 10 || isProcessing} className="flex-1 bg-red-600 hover:bg-red-700 text-white">Confirm Reject</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button onClick={() => setShowRejectConfirm(true)} variant="outline" className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" disabled={isProcessing}>Reject</Button>
                <Button onClick={handleApprove} className="flex-1 bg-[#10b981] hover:bg-[#059669] text-white" disabled={isProcessing}>Approve</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Full Image Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-1 bg-transparent border-none shadow-none">
          {selectedImage && (
            <img src={selectedImage} alt="Full screen preview" className="w-full h-auto max-h-[90vh] object-contain rounded-lg bg-black/50" />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
