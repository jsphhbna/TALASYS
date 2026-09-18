"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useAdminData } from "@/hooks/admin"
import { useSuperAdminData } from "@/hooks/superadmin"
import { FileText, Search } from "lucide-react"

export function DocumentHistoryContent() {
  const { residents, documentRequests } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  const [activeFilter, setActiveFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")

  const currentDate = new Date()
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear().toString())
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth().toString())

  const historyRequests = documentRequests.filter(r => r.status === "Completed" || r.status === "Rejected")

  const availableYears = Array.from(new Set(historyRequests.map(r => new Date(r.createdAt).getFullYear().toString()))).sort((a, b) => Number(b) - Number(a))
  if (!availableYears.includes(currentDate.getFullYear().toString())) {
    availableYears.unshift(currentDate.getFullYear().toString())
  }

  const months = [
    { value: "0", label: "January" }, { value: "1", label: "February" }, { value: "2", label: "March" },
    { value: "3", label: "April" }, { value: "4", label: "May" }, { value: "5", label: "June" },
    { value: "6", label: "July" }, { value: "7", label: "August" }, { value: "8", label: "September" },
    { value: "9", label: "October" }, { value: "10", label: "November" }, { value: "11", label: "December" }
  ]

  const defaultDocTypes = systemConfig?.documentTypes || []
  const customDocTypes = (systemConfig?.customDocumentTypes || []).map((c: any) => c.name)
  const allAvailableTypes = Array.from(new Set([...defaultDocTypes, ...customDocTypes]))

  const filters = [
    { id: "all", label: "All Records" },
    ...allAvailableTypes.map(type => ({
      id: type,
      label: type.replace("Certificate of ", "").replace("Barangay ", "")
    }))
  ]

  const filteredRequests = historyRequests.filter(r => {
    const requestDate = new Date(r.createdAt)
    const matchesYear = selectedYear === "all" || requestDate.getFullYear().toString() === selectedYear
    const matchesMonth = selectedMonth === "all" || requestDate.getMonth().toString() === selectedMonth

    const matchesFilter = activeFilter === "all" || r.documentType === activeFilter
    const matchesSearch = r.residentName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.documentType.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.refNumber?.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesYear && matchesMonth && matchesFilter && matchesSearch
  }).sort((a, b) => b.createdAt - a.createdAt)

  const formatDateTime = (timestamp?: number) => {
    if (!timestamp) return "-"
    return new Intl.DateTimeFormat("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true
    }).format(new Date(timestamp))
  }

  return (
    <div className="space-y-6">

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <div className="w-[200px]">
          <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-full bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-[#0C2340] dark:focus:ring-slate-700">
            <SelectValue placeholder="Select Document Type" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
            {filters.map((filter) => (
              <SelectItem 
                key={filter.id} 
                value={filter.id}
                className="focus:bg-slate-100 dark:focus:bg-slate-900 cursor-pointer"
              >
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>

        <div className="w-[140px]">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-full bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-[#0C2340] dark:focus:ring-slate-700">
              <SelectValue placeholder="Select Month" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
              <SelectItem value="all" className="focus:bg-slate-100 dark:focus:bg-slate-900 cursor-pointer">All Months</SelectItem>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value} className="focus:bg-slate-100 dark:focus:bg-slate-900 cursor-pointer">
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[110px]">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-full bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:ring-[#0C2340] dark:focus:ring-slate-700">
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
              <SelectItem value="all" className="focus:bg-slate-100 dark:focus:bg-slate-900 cursor-pointer">All Years</SelectItem>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year} className="focus:bg-slate-100 dark:focus:bg-slate-900 cursor-pointer">
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        </div>
        
        <div className="relative w-full md:w-80 lg:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by resident name, document, or ref number..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0C2340] dark:focus:ring-slate-700"
          />
        </div>
      </div>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3 font-bold min-w-[200px]">RESIDENT</th>
                <th className="px-6 py-3 font-bold min-w-[200px]">DOCUMENT</th>
                <th className="px-6 py-3 font-bold whitespace-nowrap">SUBMITTED DATE</th>
                <th className="px-6 py-3 font-bold whitespace-nowrap">PROCESSED DATE</th>
                <th className="px-6 py-3 font-bold whitespace-nowrap">COMPLETED DATE</th>
                <th className="px-6 py-3 font-bold whitespace-nowrap">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRequests.map((request) => {
                const ts = request.statusTimestamps || {}
                const processedTs = ts["On Process"] || ts["Approved"]
                const completedTs = ts["Completed"] || ts["Rejected"]
                
                const residentProfile = residents.find(r => r.id === request.residentId)
                const profilePic = residentProfile?.profilePicture
                
                return (
                <tr key={request.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                    {profilePic ? (
                      <img src={profilePic} alt={request.residentName} className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#0C2340]/10 dark:bg-slate-800 flex items-center justify-center text-[10px] font-semibold text-[#0C2340] dark:text-blue-50">
                        {request.residentInitials || request.residentName?.charAt(0) || "U"}
                      </div>
                    )}
                    <div>
                      <p className="text-[12px] font-semibold text-[#0C2340] dark:text-blue-50">{request.residentName}</p>
                      <p className="text-[10px] text-slate-400">{request.residentCategory}</p>
                    </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="text-[11px] text-[#0C2340] dark:text-blue-50 font-medium">{request.documentType}</span>
                    <p className="text-[10px] text-slate-400 truncate">{request.purpose}</p>
                    {request.refNumber && (
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">Ref: {request.refNumber}</p>
                    )}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(request.createdAt)}</span>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(processedTs)}</span>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span className="text-[11px] text-[#0C2340] dark:text-blue-50 font-medium">{formatDateTime(completedTs)}</span>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <div className="flex items-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-medium ${
                            request.status === "Completed" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${request.status === "Completed" ? "bg-emerald-500" : "bg-red-500"}`}></span>
                      {request.status}
                    </span>
                    </div>
                  </td>
                </tr>
              )
            })}
            
            {filteredRequests.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No document history found</p>
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
