"use client"

import { useState, useEffect } from "react"
import { ModalOverlay } from "@/components/ui/modal-overlay"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth"
import { useAdminData } from "@/hooks/admin"
import { toast } from "sonner"
import { CreditCard, Banknote, X, CheckCircle2 } from "lucide-react"

interface AdminPaymentProcessModalProps {
  isOpen: boolean
  onClose: () => void
  request: any
}

export function AdminPaymentProcessModal({ isOpen, onClose, request }: AdminPaymentProcessModalProps) {
  const { user } = useAuth()
  const { confirmPayment, updateRequestStatus, markPayLater } = useAdminData()
  
  const [activeTab, setActiveTab] = useState<"cash" | "gcash">("cash")
  const [gcashRef, setGcashRef] = useState(request?.gcashRefNumber || "")
  const [submitType, setSubmitType] = useState<"cash" | "gcash" | "payLater" | null>(null)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  useEffect(() => {
    if (request) {
      setGcashRef(request.gcashRefNumber || "")
      setActiveTab(request.paymentMethod === "gcash" ? "gcash" : "cash")
    }
  }, [request])

  if (!request) return null

  const handleConfirmCash = async () => {
    setSubmitType("cash")
    try {
      await confirmPayment(request.id, user?.name || "Admin", user?.email || "admin@system.com", "cash")
      if (request.status === "Pending" || request.status === "Awaiting Payment") {
        await updateRequestStatus(request.id, "On Process", undefined, user?.name || "Admin", user?.email || "admin@system.com")
      }
      toast.success("Cash payment confirmed! Request updated.")
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm payment")
    } finally {
      setSubmitType(null)
    }
  }

  const handleConfirmGCash = async () => {
    if (gcashRef.trim().length < 13) {
      toast.error("Please enter a valid 13-digit GCash Reference Number")
      return
    }
    setSubmitType("gcash")
    try {
      await confirmPayment(request.id, user?.name || "Admin", user?.email || "admin@system.com", "gcash", gcashRef.trim())
      if (request.status === "Pending" || request.status === "Awaiting Payment") {
        await updateRequestStatus(request.id, "On Process", undefined, user?.name || "Admin", user?.email || "admin@system.com")
      }
      toast.success("GCash payment confirmed! Request updated.")
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm payment")
    } finally {
      setSubmitType(null)
    }
  }

  const handlePayLater = async () => {
    setSubmitType("payLater")
    try {
      await markPayLater(request.id, user?.name || "Admin", user?.email || "admin@system.com")
      toast.success("Payment marked as Pay Later. You can now approve the document.")
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Failed to mark as pay later")
    } finally {
      setSubmitType(null)
    }
  }

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-[#0C2340] dark:text-blue-50">Process Payment</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{request.documentType}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-6 mt-5 mb-4 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Amount Due</p>
            <p className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">P{(request.documentFee ?? 0).toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Ref #</p>
            <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">{request.gcashRefNumber || request.paymentReferenceNumber || "N/A"}</p>
          </div>
        </div>

        <div className="px-6 mb-5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Resident</p>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{request.residentName}</p>
        </div>

        <div className="flex border-b border-slate-100 dark:border-slate-800 mx-6">
          <button
            onClick={() => setActiveTab("cash")}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === "cash" ? "border-[#0C2340] text-[#0C2340] dark:text-blue-50" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            Cash
          </button>
          <button
            onClick={() => setActiveTab("gcash")}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === "gcash" ? "border-[#0C2340] text-[#0C2340] dark:text-blue-50" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            GCash
          </button>
        </div>

        <div className="p-6">
          {activeTab === "cash" ? (
            <div className="space-y-5">
              <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/50 rounded-lg">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-400">Receive Cash Payment</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500/80 mt-1">Verify that you have received P{(request.documentFee ?? 0).toFixed(2)} from the resident.</p>
              </div>
              <div className="flex flex-col gap-3">
                <Button onClick={handleConfirmCash} disabled={!!submitType} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                  {submitType === "cash" ? "Processing..." : "Confirm Cash Payment"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {request.paymentMethod === "gcash" && request.gcashScreenshotUrl && (
                <div className="mb-4">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Resident Uploaded Proof</p>
                  <img 
                    src={request.gcashScreenshotUrl} 
                    alt="GCash proof" 
                    className="w-full h-32 object-contain bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 cursor-zoom-in hover:opacity-90 transition-opacity" 
                    onClick={() => setIsLightboxOpen(true)}
                  />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">GCash Reference Number *</label>
                <Input value={gcashRef} onChange={e => setGcashRef(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="13-digit reference number" className="font-mono tracking-wider" maxLength={13} />
                <p className="text-[10px] text-slate-400 mt-1">{gcashRef.length}/13 digits</p>
              </div>
              <div className="flex flex-col gap-3 mt-4">
                <Button onClick={handleConfirmGCash} disabled={!!submitType || gcashRef.length < 13} className="w-full h-11 bg-[#0049AF] hover:bg-[#0041a0] text-white font-semibold">
                  {submitType === "gcash" ? "Processing..." : "Confirm GCash Payment"}
                </Button>
                <Button variant="outline" onClick={handlePayLater} disabled={!!submitType} className="w-full h-11 border-slate-300 font-semibold text-slate-700 dark:text-slate-300">
                  {submitType === "payLater" ? "Processing..." : "Pay Later (Process Document First)"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ModalOverlay 
        isOpen={isLightboxOpen} 
        onClose={() => setIsLightboxOpen(false)}
        className="z-[60] bg-black/90 p-4"
      >
        <div className="relative max-w-4xl w-full h-full flex flex-col items-center justify-center">
          <button 
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-[70] bg-black/50 p-2 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
          <img 
            src={request.gcashScreenshotUrl} 
            alt="GCash proof enlarged" 
            className="max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl" 
          />
        </div>
      </ModalOverlay>
    </ModalOverlay>
  )
}
