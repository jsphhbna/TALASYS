"use client"

import { useState, useRef } from "react"
import { ModalOverlay } from "@/components/ui/modal-overlay"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useResidentData } from "@/hooks/resident"
import { uploadFileToCloudinary } from "@/lib/resident"
import { showToastPreset } from "@/lib/app-toast"
import { Copy, Check, Upload, X, CreditCard, Banknote } from "lucide-react"

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  request: {
    id: string
    documentType: string
    documentFee?: number
    paymentReferenceNumber?: string
    paymentMethod?: string
  } | null
}

export function PaymentModal({ isOpen, onClose, request }: PaymentModalProps) {
  const { submitPayment } = useResidentData()
  const [activeTab, setActiveTab] = useState<"gcash" | "cash">(
    (request?.paymentMethod as "gcash" | "cash") || "cash"
  )
  const [gcashRef, setGcashRef] = useState("")
  const [gcashFile, setGcashFile] = useState<File | null>(null)
  const [gcashPreview, setGcashPreview] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!request) return null

  const handleCopy = () => {
    if (!request.paymentReferenceNumber) return
    navigator.clipboard.writeText(request.paymentReferenceNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      showToastPreset("uploadFailedSize")
      return
    }
    setGcashFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setGcashPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmitGCash = async () => {
    if (!gcashRef.trim()) return
    setIsSubmitting(true)
    try {
      let screenshotUrl = ""
      if (gcashFile) {
        screenshotUrl = await uploadFileToCloudinary(gcashFile)
      }
      await submitPayment(request.id, "gcash", {
        gcashRefNumber: gcashRef.trim(),
        gcashScreenshotUrl: screenshotUrl,
      })
      showToastPreset("profileRequestSubmitted")
      onClose()
    } catch (err) {
      console.error(err)
      showToastPreset("uploadFailedSize")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCashConfirm = async () => {
    setIsSubmitting(true)
    try {
      await submitPayment(request.id, "cash", {})
      showToastPreset("profileRequestSubmitted")
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-[#0C2340] dark:text-blue-50">Complete Payment</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{request.documentType}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-6 mt-5 mb-4 bg-[#0C2340] dark:bg-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-wider">Amount Due</p>
            <p className="text-2xl font-bold text-white">P{(request.documentFee ?? 0).toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-wider">Reference #</p>
            <p className="text-sm font-mono font-bold text-white">{request.paymentReferenceNumber || "N/A"}</p>
          </div>
        </div>

        <div className="flex border-b border-slate-100 dark:border-slate-800 mx-6">
          <button
            onClick={() => setActiveTab("gcash")}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === "gcash" ? "border-[#0C2340] text-[#0C2340] dark:text-blue-50" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            GCash
          </button>
          <button
            onClick={() => setActiveTab("cash")}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === "cash" ? "border-[#0C2340] text-[#0C2340] dark:text-blue-50" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            Cash
          </button>
        </div>

        <div className="p-6 space-y-4">
          {activeTab === "gcash" ? (
            <>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">GCash Reference Number *</label>
                <Input
                  value={gcashRef}
                  onChange={e => setGcashRef(e.target.value.replace(/\D/g, "").slice(0, 13))}
                  placeholder="13-digit reference number"
                  className="font-mono tracking-wider"
                />
                <p className="text-[10px] text-slate-400 mt-1">{gcashRef.length}/13 digits</p>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Payment Screenshot (Optional)</label>
                {gcashPreview ? (
                  <div className="relative">
                    <img src={gcashPreview} alt="GCash screenshot" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 object-contain max-h-48" />
                    <button onClick={() => { setGcashFile(null); setGcashPreview(null) }} className="absolute top-2 right-2 w-6 h-6 bg-slate-800/80 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-5 flex flex-col items-center gap-2 hover:border-[#0C2340] dark:hover:border-slate-500 transition-colors">
                    <Upload className="w-5 h-5 text-slate-400" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Click to upload screenshot</p>
                    <p className="text-[10px] text-slate-400">PNG, JPG up to 5MB</p>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
              </div>
              <Button onClick={handleSubmitGCash} disabled={isSubmitting || !gcashRef.trim()} className="w-full h-11 bg-[#0049AF] hover:bg-[#0041a0] text-white font-semibold">
                {isSubmitting ? "Submitting..." : "Submit GCash Payment"}
              </Button>
            </>
          ) : (
            <>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-5 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">Show this reference at the Barangay Treasurer</p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-xl font-mono font-bold text-[#0C2340] dark:text-blue-50 tracking-widest">{request.paymentReferenceNumber || "N/A"}</span>
                  <button onClick={handleCopy} className="w-7 h-7 flex items-center justify-center rounded-full bg-[#0C2340]/10 dark:bg-slate-700 hover:bg-[#0C2340]/20 transition-colors">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-[#0C2340] dark:text-blue-50" />}
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-left space-y-1.5">
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Document</span><span className="font-medium text-[#0C2340] dark:text-blue-50">{request.documentType}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-slate-500">Amount</span><span className="font-bold text-[#0C2340] dark:text-blue-50">P{(request.documentFee ?? 0).toFixed(2)}</span></div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center mt-4">
                <p className="text-[11px] text-amber-800">
                  Please present this reference number to the Barangay Treasurer to complete your payment. The admin will update your request status once paid.
                </p>
              </div>
              <Button onClick={onClose} className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-semibold mt-4">
                Close
              </Button>
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}
