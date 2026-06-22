import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { ResidentProofDocument } from "@/lib/local-storage-store"

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
  const isRejected = verification?.status === "rejected"

  const handleResubmit = async () => {
    try {
      const { doc, updateDoc, serverTimestamp } = await import("firebase/firestore")
      const db = (await import("@/lib/firebase")).db
      if (!verification) return
      
      const docRef = doc(db, "verifications", verification.id)
      await updateDoc(docRef, {
        status: "pending",
        rejectionReason: "",
        updatedAt: serverTimestamp()
      })
      window.location.reload() // Force UI refresh
    } catch (error) {
      console.error("Failed to re-submit verification", error)
    }
  }

  return (
    <Card className="p-6">
      <h3 className="text-base font-semibold text-[#0C2340] mb-5">Uploaded Proofs</h3>

      <div className="space-y-3">
        {proofs.length === 0 ? (
          <Card className="p-4 bg-slate-50 border-slate-200">
            <p className="text-xs text-slate-500">No uploaded proofs yet.</p>
          </Card>
        ) : (
          proofs.map((doc) => (
            <Card key={doc.id} className="p-4 bg-slate-50 border-slate-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#0C2340] mb-1">{doc.name}</p>
                  <p className="text-[11px] text-slate-600">
                    {doc.filename} • Uploaded {doc.uploadDate}
                  </p>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-medium bg-green-100 text-green-700 ml-3">
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
          <p className="text-[11px] text-red-600 mb-3">{verification?.rejectionReason || "Please review and re-submit your documents."}</p>
          <Button onClick={handleResubmit} className="w-full bg-red-600 hover:bg-red-700 text-white" size="sm">
            Re-Submit Verification
          </Button>
        </div>
      )}

      <Button
        onClick={onRequestProfileEdit}
        disabled={isRequestSubmitted || isOpeningDialog}
        className={`w-full mt-4 ${isRequestSubmitted
          ? "bg-green-500 text-white hover:bg-green-600"
          : "border-slate-300 text-slate-900 bg-transparent"
          }`}
        variant={isRequestSubmitted ? "default" : "outline"}
      >
        {isRequestSubmitted
          ? "✓ Request Submitted"
          : isOpeningDialog
            ? "Preparing Form..."
            : "Request Profile Edit"}
      </Button>
    </Card>
  )
}
