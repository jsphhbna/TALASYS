import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { ResidentProofDocument } from "@/lib/local-storage-store"

interface ProfileProofsCardProps {
  proofs: ResidentProofDocument[]
  isRequestSubmitted: boolean
  isOpeningDialog: boolean
  onRequestProfileEdit: () => void
}

export function ProfileProofsCard({
  proofs,
  isRequestSubmitted,
  isOpeningDialog,
  onRequestProfileEdit,
}: ProfileProofsCardProps) {
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
