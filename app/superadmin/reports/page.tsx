"use client"

import { useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts"
import { Card } from "@/components/ui/card"
import { ModalOverlay } from "@/components/ui/modal-overlay"
import { Button } from "@/components/ui/button"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"
import { useAdminData } from "@/hooks/admin"
import { useSuperAdminData } from "@/hooks/superadmin"
import { useMounted } from "@/hooks/use-mounted"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import {
  FileText, TrendingUp, Clock, BarChart3, Download,
  Users, Shield, Activity,
} from "lucide-react"
import {
  normalizeTimestamp,
  getManilaCalendarDate,
  isRecordInPeriod,
  getAuthoritativeIssuanceTimestamp,
  getAuthoritativeGenerationTimestamp,
  calculateFullAnalyticsMetrics,
} from "@/lib/timestamp-normalizer"

export default function SystemReports() {
  const { stats: adminStats, documentRequests, residents } = useAdminData()
  const { systemConfig } = useSuperAdminData()
  
  const barangayName = systemConfig?.barangayName || "Barangay Sample"
  const municipality = systemConfig?.address || "City of Sample"
  const contactNumber = systemConfig?.contactNumber || "(02) 8123-4567"
  const email = systemConfig?.emailAddress || "barangay@sample.gov.ph"

  const [activeTab, setActiveTab] = useState("all")
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [selectedReport, setSelectedReport] = useState<any>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [selectedYear, setSelectedYear] = useState<string>("All")
  const [selectedMonth, setSelectedMonth] = useState<string>("All")
  const [reportType, setReportType] = useState<string>("Full Population")
  const [reportFormat, setReportFormat] = useState<string>("PDF")
  const [showDateRangeModal, setShowDateRangeModal] = useState<boolean>(false)
  const [dateRangeStart, setDateRangeStart] = useState<string>("")
  const [dateRangeEnd, setDateRangeEnd] = useState<string>("")
  const [dateRangeError, setDateRangeError] = useState<string>("")
  const [lastExport, setLastExport] = useState(0)

  const currentYear = new Date().getFullYear()
  const yearsList = Array.from(new Set(documentRequests.map(r => {
    if (!r.createdAt) return null;
    const ts = normalizeTimestamp(r.createdAt);
    if (ts === null) return null;
    return getManilaCalendarDate(ts).year;
  }).filter((y): y is number => y !== null))).sort((a, b) => b - a)
  
  if (yearsList.length === 0) yearsList.push(currentYear)

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const mounted = useMounted()

  if (!mounted) {
    return <div className="flex h-full items-center justify-center p-8">Loading reports...</div>
  }

  const getIssuanceTimestamp = (r: any): number | null => {
    return getAuthoritativeIssuanceTimestamp(r)
  }

  const currentDate = new Date()
  const reportGenerationTrend = Array.from({ length: 6 }).map((_, i) => {
    const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - (5 - i), 1)
    const start = targetDate.getTime()
    const nextMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1)
    const end = nextMonth.getTime()
    const monthReqs = documentRequests.filter(r => {
      const ts = normalizeTimestamp(r.createdAt)
      return ts !== null && ts >= start && ts < end
    })
    const monthGenerated = documentRequests.filter(r => {
      if ((r as any).hasGenerated !== true) return false
      const ts = getAuthoritativeGenerationTimestamp(r)
      return ts !== null && ts >= start && ts < end
    }).length
    const monthPop = residents.filter(r => {
      const ts = normalizeTimestamp((r as any).createdAt)
      return ts !== null && ts >= start && ts < end
    }).length
    return {
      month: targetDate.toLocaleDateString('en-US', { month: 'short' }),
      documents: monthGenerated,
      population: monthPop,
      analytics: monthReqs.length,
    }
  })

  const reportTypeBreakdown = [
    { name: "Clearances", value: documentRequests.filter(r => r.documentType.includes("Clearance")).length, color: "#0C2340" },
    { name: "Indigency", value: documentRequests.filter(r => r.documentType.includes("Indigency")).length, color: "#2563eb" },
    { name: "Residency", value: documentRequests.filter(r => r.documentType.includes("Residency")).length, color: "#C5A55A" },
  ].filter(r => r.value > 0)

  // Calculate true total before adding fallback
  const trueTotal = documentRequests.length

  if (reportTypeBreakdown.length === 0) reportTypeBreakdown.push({ name: "None", value: 1, color: "#e2e8f0" })

  const mostRequested = trueTotal > 0 && reportTypeBreakdown.length > 0 && reportTypeBreakdown[0].name !== "None"
    ? [...reportTypeBreakdown].sort((a,b) => b.value - a.value)[0]
    : null

  const exportToExcel = async (filename: string, sheetName: string, headers: string[], rows: (string | number)[][]) => {
    const ExcelJSModule = await import("exceljs")
    const ExcelJS = (ExcelJSModule as any).default || ExcelJSModule
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "TALASYS"
    workbook.created = new Date()
    const worksheet = workbook.addWorksheet(sheetName.slice(0, 31))
    worksheet.columns = headers.map(h => ({ header: h, key: h, width: Math.max(h.length + 3, 14) }))
    worksheet.getRow(1).font = { bold: true }
    worksheet.views = [{ state: "frozen", ySplit: 1 }]
    for (const row of rows) {
      worksheet.addRow(row)
    }
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const exportToCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvRows = [
      headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(","),
      ...rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(","))
    ]
    const csv = csvRows.join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleGenerateDateRangeReport = async () => {
    if (!dateRangeStart || !dateRangeEnd) {
      setDateRangeError("Please select both start and end dates.")
      return
    }
    const startMs = new Date(`${dateRangeStart}T00:00:00+08:00`).getTime()
    const endMs = new Date(`${dateRangeEnd}T23:59:59.999+08:00`).getTime()
    if (startMs > endMs) {
      setDateRangeError("Start date cannot be after end date.")
      return
    }
    setDateRangeError("")
    setIsGeneratingReport(true)
    try {
      const rangedDocs = documentRequests.filter(r => {
        if (!(r as any).hasGenerated) return false
        const ts = getIssuanceTimestamp(r)
        return ts !== null && ts >= startMs && ts <= endMs
      })

      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text("Republic of the Philippines", pageWidth / 2, 20, { align: "center" })
      doc.text(municipality, pageWidth / 2, 25, { align: "center" })
      doc.text(barangayName, pageWidth / 2, 30, { align: "center" })

      doc.setFontSize(14)
      doc.setTextColor(12, 35, 64)
      doc.setFont("helvetica", "bold")
      doc.text("DOCUMENTS ISSUED BY DATE RANGE", pageWidth / 2, 45, { align: "center" })

      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.setFont("helvetica", "normal")
      doc.text(`Period: ${dateRangeStart} to ${dateRangeEnd} (Asia/Manila)`, pageWidth / 2, 52, { align: "center" })

      autoTable(doc, {
        startY: 60,
        head: [['Request ID', 'Resident', 'Document Type', 'Status', 'Date Issued']],
        body: rangedDocs.map(r => {
          const issueTs = getIssuanceTimestamp(r)
          return [
            r.id.slice(0, 8),
            r.residentName || 'N/A',
            r.documentType,
            r.status,
            issueTs !== null ? new Date(issueTs).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' }) : 'Unknown'
          ]
        }),
        theme: 'striped',
        headStyles: { fillColor: [12, 35, 64] },
      })

      doc.save(`Documents_${dateRangeStart}_to_${dateRangeEnd}.pdf`)
      showToastPreset("reportGenerated")
      setShowDateRangeModal(false)
    } catch (e) {
      console.error(e)
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const handleGenerateReport = async () => {
    if (isGeneratingReport) return
    const now = Date.now()
    if (now - lastExport < 5000) {
      showToastPreset("actionRateLimited")
      return
    }
    setLastExport(now)
    setIsGeneratingReport(true)

    try {
      const filterByDate = (createdAt?: any) => isRecordInPeriod(createdAt, selectedYear, selectedMonth)

      const periodLabel = selectedMonth === "All" && selectedYear === "All"
        ? "All Time"
        : `${selectedMonth !== "All" ? monthNames[parseInt(selectedMonth)] : ""} ${selectedYear !== "All" ? selectedYear : ""}`.trim()

      if (reportType === "Rejected Requests") {
        const data = documentRequests.filter(r => r.status === "Rejected" && filterByDate(r.createdAt))
        const headers = ["Request ID", "Resident", "Document Type", "Rejection Reason", "Date"]
        const rows = data.map(r => [
          r.id.slice(0, 8),
          r.residentName || 'N/A',
          r.documentType || '',
          r.rejectionReason || 'Not specified',
          r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' }) : 'N/A'
        ])
        const filenameBase = `Rejected_Requests_${periodLabel.replace(/\s+/g, "_")}`

        if (reportFormat === "Excel") {
          await exportToExcel(`${filenameBase}.xlsx`, "Rejected Requests", headers, rows)
        } else if (reportFormat === "CSV") {
          exportToCsv(`${filenameBase}.csv`, headers, rows)
        } else {
          const doc = new jsPDF()
          const pageWidth = doc.internal.pageSize.getWidth()
          doc.setFontSize(14)
          doc.text("REJECTED REQUESTS REPORT", pageWidth / 2, 25, { align: "center" })
          doc.setFontSize(9)
          doc.text(`Period: ${periodLabel}`, pageWidth / 2, 32, { align: "center" })
          autoTable(doc, {
            startY: 40,
            head: [headers],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [12, 35, 64] },
          })
          doc.save(`${filenameBase}.pdf`)
        }
      } else if (reportType === "Full Analytics") {
        const { headers, rows } = calculateFullAnalyticsMetrics({
          documentRequests,
          residents,
          adminStats,
          selectedYear,
          selectedMonth,
        })
        const filenameBase = `TALASYS_Analytics_${periodLabel.replace(/\s+/g, "_")}`

        if (reportFormat === "Excel") {
          await exportToExcel(`${filenameBase}.xlsx`, "Analytics", headers, rows)
        } else if (reportFormat === "CSV") {
          exportToCsv(`${filenameBase}.csv`, headers, rows)
        } else {
          const doc = new jsPDF()
          const pageWidth = doc.internal.pageSize.getWidth()
          doc.setFontSize(14)
          doc.text("SYSTEM ANALYTICS REPORT", pageWidth / 2, 25, { align: "center" })
          doc.setFontSize(9)
          doc.text(`Period: ${periodLabel}`, pageWidth / 2, 32, { align: "center" })
          autoTable(doc, {
            startY: 40,
            head: [headers],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [12, 35, 64] },
          })
          doc.save(`${filenameBase}.pdf`)
        }
      } else {
        // Resident Demographic Reports
        let filteredRes = residents.filter(r => filterByDate((r as any).createdAt))
        if (reportType === "Seniors Summary") {
          filteredRes = filteredRes.filter(r => (r.age || 0) >= 60 || r.categories.includes("Senior Citizen"))
        } else if (reportType === "Adults Summary") {
          filteredRes = filteredRes.filter(r => (r.age || 0) >= 18 && (r.age || 0) < 60)
        } else if (reportType === "Minors Summary") {
          filteredRes = filteredRes.filter(r => (r.age || 0) < 18)
        } else if (reportType === "Voters List") {
          filteredRes = filteredRes.filter(r => r.isVoter)
        } else if (reportType === "Non-Voters List") {
          filteredRes = filteredRes.filter(r => !r.isVoter)
        } else if (reportType === "Expired Accounts") {
          filteredRes = filteredRes.filter(r => r.status === "Expired")
        }

        const headers = ["Full Name", "Age", "Gender", "Address", "Contact", "Status", "Is Voter"]
        const rows = filteredRes.map(r => [
          r.name || '',
          r.age?.toString() || "N/A",
          r.gender || 'N/A',
          r.address || '',
          r.contactNumber || 'N/A',
          r.status || 'N/A',
          r.isVoter ? "Yes" : "No"
        ])
        const filenameBase = `${reportType.replace(/\s+/g, "_")}_${periodLabel.replace(/\s+/g, "_")}`

        if (reportFormat === "Excel") {
          await exportToExcel(`${filenameBase}.xlsx`, reportType.slice(0, 31), headers, rows)
        } else if (reportFormat === "CSV") {
          exportToCsv(`${filenameBase}.csv`, headers, rows)
        } else {
          const doc = new jsPDF()
          const pageWidth = doc.internal.pageSize.getWidth()
          doc.setFontSize(14)
          doc.text(reportType.toUpperCase(), pageWidth / 2, 25, { align: "center" })
          doc.setFontSize(9)
          doc.text(`Period: ${periodLabel}`, pageWidth / 2, 32, { align: "center" })
          autoTable(doc, {
            startY: 40,
            head: [['Full Name', 'Age', 'Gender', 'Address', 'Status', 'Voter']],
            body: filteredRes.map(r => [
              r.name,
              r.age?.toString() || "N/A",
              r.gender || "N/A",
              r.address || "N/A",
              r.status,
              r.isVoter ? "Yes" : "No"
            ]),
            theme: 'striped',
            headStyles: { fillColor: [12, 35, 64] },
          })
          doc.save(`${filenameBase}.pdf`)
        }
      }

      showToastPreset("reportGenerated")
      setShowGenerateDialog(false)
    } catch (e) {
      console.error("Report generation failed:", e)
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const nonVoterCount = adminStats.totalResidents - adminStats.voterCount

  const reports = [
    { title: "Full Population", description: "All registered residents", count: `${adminStats.totalResidents} records`, icon: Users, color: "#0C2340", pct: 100 },
    { title: "Seniors Summary", description: "60 years old and above", count: `${adminStats.seniorCount} records`, icon: Users, color: "#2a5080", pct: adminStats.totalResidents ? Math.round((adminStats.seniorCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Adults Summary", description: "18 years old and above", count: `${adminStats.adultCount} records`, icon: Users, color: "#3b82f6", pct: adminStats.totalResidents ? Math.round((adminStats.adultCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Minors Summary", description: "Under 18 years old", count: `${adminStats.minorCount} records`, icon: Users, color: "#C5A55A", pct: adminStats.totalResidents ? Math.round((adminStats.minorCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Voters List", description: "Registered voters", count: `${adminStats.voterCount} records`, icon: Shield, color: "#10b981", pct: adminStats.totalResidents ? Math.round((adminStats.voterCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Non-Voters List", description: "Not registered to vote", count: `${nonVoterCount} records`, icon: Shield, color: "#ef4444", pct: adminStats.totalResidents ? Math.round((nonVoterCount / adminStats.totalResidents) * 100) : 0 },
    { title: "Expired Accounts", description: "Accounts needing renewal", count: `${adminStats.expiredResidents} records`, icon: Clock, color: "#f59e0b", pct: adminStats.totalResidents ? Math.round((adminStats.expiredResidents / adminStats.totalResidents) * 100) : 0 },
  ]

  const rejectedCount = documentRequests.filter(r => r.status === "Rejected").length
  const generatedDocuments = documentRequests.filter(r => (r as any).hasGenerated === true)
  const generatedCount = generatedDocuments.length

  const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
  const thisMonthGenerated = generatedDocuments.filter(r => {
    const ts = getIssuanceTimestamp(r)
    return ts !== null && ts >= currentMonthStart
  }).length

  const documentReports = [
    { title: "Documents by Date Range", description: "All generated documents", icon: FileText, color: "#0C2340", hasDatePicker: true },
    { title: "Rejected Requests", description: "All rejected with reasons", count: `${rejectedCount} records`, icon: Activity, color: "#ef4444" },
    { title: "Full Analytics PDF", description: "Complete system analytics", details: "Charts, stats, trends", icon: BarChart3, color: "#C5A55A" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">System Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Generate comprehensive system-wide PDF reports</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center mb-2">
            <FileText className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
          </div>
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Documents Generated</p>
          <span className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">{generatedCount}</span>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-2xs font-medium text-slate-400">{trueTotal} total requests</span>
          </div>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center mb-2">
            <Download className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
          </div>
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Most Requested</p>
          <span className="text-lg font-bold text-[#0C2340] dark:text-blue-50">{mostRequested ? mostRequested.name : "N/A"}</span>
          <p className="text-2xs text-slate-400 mt-1">{mostRequested ? `${mostRequested.value} of ${trueTotal} requests` : "No data available"}</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center mb-2">
            <Clock className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
          </div>
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Avg Generation</p>
          <span className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">Instant</span>
          <p className="text-2xs text-slate-400 mt-1">Direct PDF export</p>
        </Card>
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-[#0C2340]/10 dark:bg-slate-800/[0.06] flex items-center justify-center mb-2">
            <BarChart3 className="w-4 h-4 text-[#0C2340] dark:text-blue-50" />
          </div>
          <p className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">This Month</p>
          <span className="text-2xl font-bold text-[#0C2340] dark:text-blue-50">{thisMonthGenerated}</span>
          <p className="text-2xs text-slate-400 mt-1">Documents this month</p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-12 gap-6">
        {/* Generation Trend */}
        <Card className="col-span-8 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50">Report Generation Trend</h2>
              <p className="text-xs-plus text-slate-500 dark:text-slate-400 mt-0.5">Monthly breakdown by report category</p>
            </div>
            <div className="flex items-center gap-4 text-2xs">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#2a5080]" />Documents</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#0C2340] dark:bg-slate-800" />Population</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#C5A55A]" />Requests</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={reportGenerationTrend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradPop" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0C2340" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#0C2340" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradDoc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2a5080" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#2a5080" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontWeight: 600, color: "#0C2340" }} />
              <Area type="monotone" dataKey="documents" stroke="#2a5080" strokeWidth={2} fill="url(#gradDoc)" name="Documents Generated" />
              <Area type="monotone" dataKey="population" stroke="#0C2340" strokeWidth={2} fill="url(#gradPop)" name="New Residents" />
              <Area type="monotone" dataKey="analytics" stroke="#C5A55A" strokeWidth={2} fill="none" name="Requests Submitted" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Type Breakdown Pie */}
        <Card className="col-span-4 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-1">Report Distribution</h2>
          <p className="text-xs-plus text-slate-500 dark:text-slate-400 mb-3">By report type</p>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={reportTypeBreakdown} cx="50%" cy="50%" innerRadius={38} outerRadius={58} dataKey="value" stroke="none" paddingAngle={3}>
                {reportTypeBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="text-sm font-bold" fill="#0C2340">{trueTotal}</text>
              <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" className="text-[9px]" fill="#94a3b8">total</text>
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {reportTypeBreakdown.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-2xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-slate-600 dark:text-slate-400">{r.name}</span>
                </span>
                <span className="font-semibold text-[#0C2340] dark:text-blue-50">{r.name === "None" ? "-" : r.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Population Reports */}
      <div>
        <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-3">Population Reports</h3>
        <div className="grid grid-cols-4 gap-4">
          {reports.map((report) => (
            <Card
              key={report.title}
              onClick={() => {
                setReportType(report.title)
                setShowGenerateDialog(true)
              }}
              className="p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:border-[#0C2340]/40"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${report.color}10` }}>
                  <report.icon className="w-4 h-4" style={{ color: report.color }} />
                </div>
                <span className="text-2xs font-bold text-[#C5A55A]">{report.pct}%</span>
              </div>
              <h4 className="text-xs font-semibold text-[#0C2340] dark:text-blue-50 mb-0.5">{report.title}</h4>
              <p className="text-2xs text-slate-500 dark:text-slate-400 mb-1">{report.description}</p>
              <p className="text-2xs font-medium text-slate-600 dark:text-slate-400">{report.count}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Document Reports */}
      <div>
        <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-3">Document Reports</h3>
        <div className="grid grid-cols-3 gap-4">
          {documentReports.map((report) => (
            <Card
              key={report.title}
              onClick={() => {
                if (report.hasDatePicker) {
                  setShowDateRangeModal(true)
                } else if (report.title === "Rejected Requests") {
                  setReportType("Rejected Requests")
                  setShowGenerateDialog(true)
                } else {
                  setReportType("Full Analytics")
                  setShowGenerateDialog(true)
                }
              }}
              className="p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:border-[#0C2340]/40"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: `${report.color}10` }}>
                <report.icon className="w-4 h-4" style={{ color: report.color }} />
              </div>
              <h4 className="text-xs font-semibold text-[#0C2340] dark:text-blue-50 mb-0.5">{report.title}</h4>
              <p className="text-2xs text-slate-500 dark:text-slate-400 mb-1">{report.description}</p>
              {report.hasDatePicker && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDateRangeModal(true)
                  }}
                  className="mt-1 px-3 py-1 text-2xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Select dates
                </button>
              )}
              {report.count && <p className="text-2xs font-medium text-slate-600 dark:text-slate-400">{report.count}</p>}
              {report.details && <p className="text-2xs text-slate-500 dark:text-slate-400">{report.details}</p>}
            </Card>
          ))}
        </div>
      </div>

      {/* Custom Report Builder */}
      <Card className="p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-[#0C2340] dark:text-blue-50 mb-4">Generate Custom Report</h3>
        <div className="grid grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
            >
              <option value="Full Population">Full Population</option>
              <option value="Seniors Summary">Seniors Summary</option>
              <option value="Adults Summary">Adults Summary</option>
              <option value="Minors Summary">Minors Summary</option>
              <option value="Voters List">Voters List</option>
              <option value="Non-Voters List">Non-Voters List</option>
              <option value="Expired Accounts">Expired Accounts</option>
              <option value="Rejected Requests">Rejected Requests</option>
              <option value="Full Analytics">Full Analytics</option>
            </select>
          </div>
          <div>
            <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
            >
              <option value="All">All Years</option>
              {yearsList.map(y => <option key={y} value={y.toString()}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
            >
              <option value="All">All Months</option>
              {monthNames.map((m, i) => <option key={m} value={i.toString()}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Format</label>
            <select
              value={reportFormat}
              onChange={(e) => setReportFormat(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900"
            >
              <option value="PDF">PDF</option>
              <option value="CSV">CSV</option>
              <option value="Excel">Excel</option>
            </select>
          </div>
          <Button onClick={() => setShowGenerateDialog(true)} className="bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]">Generate Report</Button>
        </div>
      </Card>

      {/* Generate Dialog */}
      <ModalOverlay isOpen={showGenerateDialog} onClose={() => setShowGenerateDialog(false)}>
        <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50 mb-3">Generate Report?</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            This will generate a {reportType} report in {reportFormat} format for {selectedMonth === "All" && selectedYear === "All" ? "all time" : `${selectedMonth !== "All" ? monthNames[parseInt(selectedMonth)] : ""} ${selectedYear !== "All" ? selectedYear : ""}`.trim()}.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)} disabled={isGeneratingReport}>Cancel</Button>
            <Button onClick={handleGenerateReport} className="min-w-[140px] bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]" disabled={isGeneratingReport}>
              {isGeneratingReport ? "Generating..." : "Confirm"}
            </Button>
          </div>
        </div>
      </ModalOverlay>

      {/* Date Range Modal (#2) */}
      <ModalOverlay isOpen={showDateRangeModal} onClose={() => setShowDateRangeModal(false)}>
        <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50 mb-2">Documents by Date Range</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Select a start and end date (Asia/Manila time) to generate the document issuance report.
          </p>
          <div className="space-y-4 mb-4">
            <div>
              <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Start Date</label>
              <input
                type="date"
                value={dateRangeStart}
                onChange={(e) => { setDateRangeStart(e.target.value); setDateRangeError("") }}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">End Date</label>
              <input
                type="date"
                value={dateRangeEnd}
                onChange={(e) => { setDateRangeEnd(e.target.value); setDateRangeError("") }}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
            </div>
            {dateRangeError && (
              <p className="text-xs text-red-600 font-medium">{dateRangeError}</p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowDateRangeModal(false)} disabled={isGeneratingReport}>Cancel</Button>
            <Button
              onClick={handleGenerateDateRangeReport}
              className="min-w-[140px] bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]"
              disabled={isGeneratingReport}
            >
              {isGeneratingReport ? "Generating..." : "Generate PDF"}
            </Button>
          </div>
        </div>
      </ModalOverlay>
    </div>
  )
}
