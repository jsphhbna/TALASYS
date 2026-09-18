"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { useAdminData } from "@/hooks/admin"
import { useSuperAdminData } from "@/hooks/superadmin"
import { Search, Receipt, CreditCard, Banknote, Gift } from "lucide-react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

export function PaymentHistoryContent() {
  const { documentRequests } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  const [searchQuery, setSearchQuery] = useState("")
  const [methodFilter, setMethodFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")

  const currentDate = new Date()
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString())
  const [selectedMonth, setSelectedMonth] = useState("all")

  const months = [
    { value: "all", label: "All Months" },
    { value: "0", label: "January" }, { value: "1", label: "February" }, { value: "2", label: "March" },
    { value: "3", label: "April" }, { value: "4", label: "May" }, { value: "5", label: "June" },
    { value: "6", label: "July" }, { value: "7", label: "August" }, { value: "8", label: "September" },
    { value: "9", label: "October" }, { value: "10", label: "November" }, { value: "11", label: "December" }
  ]

  // All requests that have had payment action (paid, waived, or still pending but has fee info)
  const paymentRecords = documentRequests.filter(r =>
    (r as any).paymentStatus === "paid" ||
    (r as any).paymentStatus === "waived" ||
    (r as any).paymentStatus === "pending_verification"
  )

  const availableYears = Array.from(
    new Set(paymentRecords.map(r => new Date((r as any).paymentConfirmedAt || r.createdAt).getFullYear().toString()))
  ).sort((a, b) => Number(b) - Number(a))
  if (!availableYears.includes(currentDate.getFullYear().toString())) {
    availableYears.unshift(currentDate.getFullYear().toString())
  }

  const filteredRecords = paymentRecords.filter(r => {
    const ts = (r as any).paymentConfirmedAt || r.createdAt
    const date = new Date(ts)
    const matchesYear = selectedYear === "all" || date.getFullYear().toString() === selectedYear
    const matchesMonth = selectedMonth === "all" || date.getMonth().toString() === selectedMonth

    const method = (r as any).paymentMethod || "cash"
    const matchesMethod = methodFilter === "all" || method.toLowerCase() === methodFilter

    const pStatus = (r as any).paymentStatus
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "paid" && pStatus === "paid") ||
      (statusFilter === "waived" && pStatus === "waived") ||
      (statusFilter === "pending" && pStatus === "pending_verification")

    const q = searchQuery.toLowerCase()
    const refNum = (r as any).receiptNumber || (r as any).gcashRefNumber || (r as any).paymentReferenceNumber || ""
    const confirmedBy = (r as any).paymentConfirmedBy || ""
    const matchesSearch = !q ||
      r.residentName.toLowerCase().includes(q) ||
      r.documentType.toLowerCase().includes(q) ||
      refNum.toLowerCase().includes(q) ||
      confirmedBy.toLowerCase().includes(q)

    return matchesYear && matchesMonth && matchesMethod && matchesStatus && matchesSearch
  }).sort((a, b) => ((b as any).paymentConfirmedAt || b.createdAt) - ((a as any).paymentConfirmedAt || a.createdAt))

  const formatDateTime = (ts?: number) => {
    if (!ts) return "—"
    return new Intl.DateTimeFormat("en-PH", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true
    }).format(new Date(ts))
  }

  const totalRevenue = filteredRecords
    .filter(r => (r as any).paymentStatus === "paid")
    .reduce((sum, r) => sum + (r.documentFee || 0), 0)

  const paidCount = filteredRecords.filter(r => (r as any).paymentStatus === "paid").length
  const waivedCount = filteredRecords.filter(r => (r as any).paymentStatus === "waived").length
  const pendingCount = filteredRecords.filter(r => (r as any).paymentStatus === "pending_verification").length

  const getMethodIcon = (method: string) => {
    if (method?.toLowerCase() === "gcash") return <CreditCard className="w-3.5 h-3.5 text-blue-500" />
    if (method?.toLowerCase() === "cash") return <Banknote className="w-3.5 h-3.5 text-emerald-500" />
    return <Receipt className="w-3.5 h-3.5 text-slate-400" />
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <p className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide mb-1">Total Collected</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">₱{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <p className="text-[11px] text-blue-600 font-semibold uppercase tracking-wide mb-1">Paid</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{paidCount}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p className="text-[11px] text-amber-600 font-semibold uppercase tracking-wide mb-1">Waived</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{waivedCount}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
          <p className="text-[11px] text-orange-600 font-semibold uppercase tracking-wide mb-1">Pending Verification</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search resident, receipt, or admin..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C2340] dark:focus:ring-slate-700"
          />
        </div>

        {/* Year */}
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[120px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-950">
            {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Month */}
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[150px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-950">
            {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Method */}
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-[140px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-950">
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="gcash">GCash</SelectItem>
          </SelectContent>
        </Select>

        {/* Status */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px] bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-950">
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
            <SelectItem value="pending">Pending Verification</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-5 py-3 font-bold min-w-[180px]">RESIDENT</th>
                <th className="px-5 py-3 font-bold min-w-[160px]">DOCUMENT</th>
                <th className="px-5 py-3 font-bold">FEE</th>
                <th className="px-5 py-3 font-bold">METHOD</th>
                <th className="px-5 py-3 font-bold min-w-[160px]">RECEIPT / REF</th>
                <th className="px-5 py-3 font-bold">STATUS</th>
                <th className="px-5 py-3 font-bold min-w-[140px]">PROCESSED BY</th>
                <th className="px-5 py-3 font-bold min-w-[160px]">DATE & TIME</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRecords.map((r) => {
                const pStatus = (r as any).paymentStatus
                const method = (r as any).paymentMethod || "cash"
                const refNum = (r as any).receiptNumber || (r as any).gcashRefNumber || (r as any).paymentReferenceNumber
                const confirmedBy = (r as any).paymentConfirmedBy
                const confirmedAt = (r as any).paymentConfirmedAt

                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    {/* Resident */}
                    <td className="px-5 py-3.5">
                      <p className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{r.residentName}</p>
                      <p className="text-[10px] text-slate-400">{r.residentCategory}</p>
                    </td>

                    {/* Document */}
                    <td className="px-5 py-3.5">
                      <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium">{r.documentType}</span>
                    </td>

                    {/* Fee */}
                    <td className="px-5 py-3.5">
                      <span className="text-[12px] font-bold text-slate-700 dark:text-slate-300">
                        {pStatus === "waived" ? (
                          <span className="flex items-center gap-1 text-amber-600"><Gift className="w-3 h-3" /> Waived</span>
                        ) : (r.documentFee || 0) > 0 ? `₱${r.documentFee}` : "Free"}
                      </span>
                    </td>

                    {/* Method */}
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium ${
                        method === "gcash" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
                      }`}>
                        {getMethodIcon(method)}
                        {method === "gcash" ? "GCash" : "Cash"}
                      </span>
                    </td>

                    {/* Receipt / Ref */}
                    <td className="px-5 py-3.5">
                      {refNum ? (
                        <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-700 dark:text-slate-300">
                          {refNum}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">—</span>
                      )}
                    </td>

                    {/* Payment Status */}
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                        pStatus === "paid" ? "bg-emerald-50 text-emerald-700" :
                        pStatus === "waived" ? "bg-amber-50 text-amber-700" :
                        "bg-orange-50 text-orange-700"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          pStatus === "paid" ? "bg-emerald-500" :
                          pStatus === "waived" ? "bg-amber-500" : "bg-orange-500"
                        }`} />
                        {pStatus === "paid" ? "Paid" : pStatus === "waived" ? "Waived" : "Pending Verification"}
                      </span>
                    </td>

                    {/* Processed By */}
                    <td className="px-5 py-3.5">
                      {confirmedBy ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-[#0C2340]/10 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold text-[#0C2340] dark:text-blue-200">
                            {confirmedBy.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">{confirmedBy}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">—</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(confirmedAt)}</span>
                    </td>
                  </tr>
                )
              })}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="w-8 h-8 opacity-30" />
                      <p className="text-sm">
                        {searchQuery ? "No payment records found matching your search." : "No payment records for the selected period."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
