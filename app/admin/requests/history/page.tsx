"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { DocumentHistoryContent } from "./document-history-content"
import { PaymentHistoryContent } from "./payment-history-content"

export default function CombinedHistoryPage() {
  const [activeTab, setActiveTab] = useState("documents")

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">History</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          View the complete log of completed and rejected requests, and all payment transactions.
        </p>
      </div>

      <div className="flex flex-nowrap overflow-x-auto gap-6 border-b border-slate-200 dark:border-slate-800 mb-6">
        <button
          onClick={() => setActiveTab("documents")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "documents"
              ? "border-[#0C2340] text-[#0C2340] dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          Document History
        </button>
        <button
          onClick={() => setActiveTab("payments")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "payments"
              ? "border-[#0C2340] text-[#0C2340] dark:border-blue-500 dark:text-blue-500"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          Payment History
        </button>
      </div>

      {activeTab === "documents" ? <DocumentHistoryContent /> : <PaymentHistoryContent />}
    </AdminPageShell>
  )
}
