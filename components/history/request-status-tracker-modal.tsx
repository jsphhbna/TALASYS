import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { CheckCircle2, Clock, FileText, Check, XCircle } from "lucide-react"
import type { ResidentRequest } from "@/lib/local-storage-store"

interface RequestStatusTrackerModalProps {
  request: ResidentRequest | null
  isOpen: boolean
  onClose: () => void
}

const statusSteps = [
  {
    id: "Pending",
    label: "Under Review",
    description: "Your request has been received and is waiting for administrator approval.",
    icon: Clock,
  },
  {
    id: "On Process",
    label: "Processing",
    description: "Your request has been approved and the document is currently being processed.",
    icon: FileText,
  },
  {
    id: "Ready for Pick Up",
    label: "Ready for Pick Up",
    description: "Your document is prepared. Please proceed to the barangay hall to pick it up.",
    icon: CheckCircle2,
  },
  {
    id: "Completed",
    label: "Completed",
    description: "This transaction has been successfully finished.",
    icon: Check,
  }
]

export function RequestStatusTrackerModal({ request, isOpen, onClose }: RequestStatusTrackerModalProps) {
  if (!request) return null

  // Determine current active step index
  const isRejected = request.status === "Rejected"
  let activeStepIndex = statusSteps.findIndex(s => s.id === request.status)
  
  // Map "Approved" legacy status to "On Process"
  if (request.status === "Approved") {
    activeStepIndex = 1
  }

  // If status is not found, fallback to pending
  if (activeStepIndex === -1 && !isRejected) {
    activeStepIndex = 0
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Track Request</DialogTitle>
          <DialogDescription>
            Reference Number: <span className="font-semibold text-slate-700 dark:text-slate-300">{request.refNumber}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <div className="mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-semibold text-[#0C2340] dark:text-blue-50 mb-1">{request.documentType}</h3>
            <p className="text-sm text-slate-500">Requested on {request.dateRequested}</p>
          </div>

          <div className="relative pl-6">
            {/* Vertical Line */}
            <div className="absolute left-[15px] top-4 bottom-8 w-[2px] bg-slate-200 dark:bg-slate-800" />

            {/* Timeline Steps */}
            <div className="space-y-8 relative">
              {statusSteps.map((step, index) => {
                const isCompleted = isRejected ? false : index <= activeStepIndex
                const isActive = isRejected ? false : index === activeStepIndex
                const Icon = step.icon
                
                // Determine the timestamp for this step
                let timestamp: number | undefined
                if (request.statusTimestamps) {
                  timestamp = request.statusTimestamps[step.id]
                  if (!timestamp && step.id === "On Process") {
                    timestamp = request.statusTimestamps["Approved"] // Check legacy key
                  }
                }
                // Fallback for Pending step using createdAt if timestamp is missing
                if (!timestamp && step.id === "Pending") {
                  timestamp = request.createdAt
                }

                const formattedTime = timestamp 
                  ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(timestamp))
                  : null

                return (
                  <div key={step.id} className="relative flex items-start gap-4">
                    {/* Status Node */}
                    <div className="relative z-10 flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center -ml-[33px] border-2 bg-white dark:bg-slate-950 transition-colors ${
                        isActive 
                          ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400" 
                          : isCompleted 
                            ? "border-emerald-500 text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" 
                            : "border-slate-300 dark:border-slate-700 text-slate-400"
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 pt-1">
                      <p className={`text-sm font-semibold mb-1 ${
                        isActive ? "text-blue-700 dark:text-blue-400" : isCompleted ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"
                      }`}>
                        {step.label}
                      </p>
                      <p className={`text-xs leading-relaxed mb-1 ${isActive || isCompleted ? "text-slate-600 dark:text-slate-300" : "text-slate-400"}`}>
                        {step.description}
                      </p>
                      {isCompleted && (
                        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mt-1">
                           <Clock className="w-3 h-3" /> {formattedTime || "Date unavailable (Legacy request)"}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Special Rejected State */}
              {isRejected && (
                <div className="relative flex items-start gap-4">
                  <div className="relative z-10 flex-shrink-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center -ml-[33px] border-2 bg-red-50 dark:bg-red-950/30 border-red-500 text-red-500">
                      <XCircle className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm font-semibold text-red-600 mb-1">Declined</p>
                    <p className="text-xs leading-relaxed text-red-500">
                      Your request was declined. Please check notifications for the specific reason or try submitting again.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
