"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { XCircle, Eye } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { ResidentProofDocument } from "@/lib/resident"

interface ProfileProofsCardProps {
  proofs: ResidentProofDocument[]
  verification: any | null
  isRequestSubmitted: boolean
  isOpeningDialog: boolean
  onRequestProfileEdit: () => void
}

export function ProfileProofsCard({
  proofs,
  verification,
  isRequestSubmitted,
  isOpeningDialog,
  onRequestProfileEdit,
}: ProfileProofsCardProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const isRejected = (verification?.status as string) === "rejected"

  const handleResubmit = () => {
    // Open the profile edit modal so they can upload new documents
    onRequestProfileEdit()
  }

  const handleCancelEdit = async () => {
    if (!verification || verification.type !== "profile-edit") return
    try {
      const { doc, deleteDoc } = await import("firebase/firestore")
      const db = (await import("@/lib/firebase")).db
      
      // Deleting the rejected profile edit automatically reverts the UI 
      // to show the older valid documents thanks to our aggregation logic!
      await deleteDoc(doc(db, "verifications", verification.id))
    } catch (error) {
      console.error("Failed to cancel edit request", error)
    }
  }

  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold text-[#0C2340] dark:text-blue-50 mb-5">Uploaded Proofs</h3>

      <div className="space-y-3">
        {proofs.length === 0 ? (
          <Card className="p-4 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">No uploaded proofs yet.</p>
          </Card>
        ) : (
          proofs.map((doc) => (
            <Card key={doc.id} className="p-4 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-1">{doc.name}</p>
                  <p className="text-xs-plus text-slate-600 dark:text-slate-400">
                    {doc.filename} • Uploaded {doc.uploadDate}
                  </p>
                  {doc.url && (
                    <button 
                      onClick={() => setSelectedImage(doc.url as string)}
                      className="text-xs-plus text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-2 focus:outline-none"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Document
                    </button>
                  )}
                </div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-2xs font-medium ml-3 ${
                  doc.status === 'Valid' ? 'bg-green-100 text-green-700' : 
                  doc.status === 'Rejected' ? 'bg-red-100 text-red-700' : 
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {doc.status}
                </span>
              </div>
            </Card>
          ))
        )}
      </div>

      {isRejected && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs font-semibold text-red-700 mb-1">Verification Rejected</p>
          <p className="text-xs-plus text-red-600 mb-3">{verification?.rejectionReason || "Please review and re-submit your documents."}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleResubmit} className="flex-1 bg-red-600 hover:bg-red-700 text-white" size="sm">
              Upload New Documents
            </Button>
            {verification?.type === "profile-edit" && (
              <Button onClick={handleCancelEdit} variant="outline" className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" size="sm">
                Cancel Edit (Revert)
              </Button>
            )}
          </div>
        </div>
      )}

      <Button
        onClick={onRequestProfileEdit}
        disabled={isRequestSubmitted || isOpeningDialog}
        className={`w-full mt-4 ${isRequestSubmitted
          ? "bg-green-500 text-white hover:bg-green-600"
          : "border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 bg-transparent"
          }`}
        variant={isRequestSubmitted ? "default" : "outline"}
      >
        {isRequestSubmitted
          ? "✓ Request Submitted"
          : isOpeningDialog
            ? "Preparing Form..."
            : "Request Profile Edit"}
      </Button>

      {/* Fullscreen Image Modal */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl w-fit p-0 bg-transparent border-0 shadow-none flex items-center justify-center">
          <DialogTitle className="sr-only">Fullscreen Document</DialogTitle>
          <div className="relative flex items-center justify-center">
            <img 
              src={selectedImage || ""} 
              alt="Fullscreen Document" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl bg-black/50" 
              onClick={() => setSelectedImage(null)}
            />
            <button 
              className="absolute -top-4 -right-4 sm:-top-6 sm:-right-6 bg-black/80 hover:bg-black text-white rounded-full p-2 transition-colors z-50 focus:outline-none"
              onClick={() => setSelectedImage(null)}
            >
              <XCircle className="w-8 h-8" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
