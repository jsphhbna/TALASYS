"use client"

import Link from "next/link"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useResidentData } from "@/hooks/use-resident-data"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function DashboardPage() {
  const { user, isAuthorized } = useAuthGuard()
  const { requests, notifications } = useResidentData()

  if (!isAuthorized || !user) {
    return null
  }

  const approvedRequests = requests.filter((request) => request.status === "Approved")
  const pendingRequests = requests.filter((request) => request.status === "Pending")
  const recentRequests = requests.slice(0, 3)
  const recentNotifications = notifications.slice(0, 2)

  // Calculate days remaining until account expiry
  const expiryDate = new Date(user.accountExpiry)
  const today = new Date()
  const daysRemaining = Number.isNaN(expiryDate.getTime())
    ? 0
    : Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  return (
    <ResidentPageShell mainClassName="flex-1 p-4 sm:p-6 lg:p-10 overflow-y-auto">
      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-[#0C2340] mb-1 tracking-tight">Welcome back, {user.name.split(" ")[0]}!</h1>
        <p className="text-sm text-slate-500">Here's an overview of your account and recent activity</p>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {/* Account Status Card */}
        <Card className="p-6 border-l-4 border-l-[#0C2340] shadow-sm">
          <p className="text-xs text-slate-500 mb-2 font-medium">Account Status</p>
          <p className="text-[22px] font-bold text-green-600 mb-2">Active</p>
          <p className="text-xs text-slate-600 mb-1">Valid until: {user.accountExpiry || "N/A"}</p>
          <p className="text-[11px] text-slate-400 font-medium">{daysRemaining} days remaining</p>
          <div className="mt-4 bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-green-500 h-full w-4/5 rounded-full" />
          </div>
        </Card>

        {/* Total Requests */}
        <Card className="p-6 shadow-sm">
          <p className="text-xs text-slate-500 mb-2 font-medium">Total Requests</p>
          <p className="text-[32px] font-bold text-[#0C2340] leading-none mb-2">{requests.length}</p>
          <p className="text-[11px] text-slate-600">
            {approvedRequests.length} approved • {pendingRequests.length} pending
          </p>
        </Card>

        {/* Downloads */}
        <Card className="p-6 shadow-sm">
          <p className="text-xs text-slate-500 mb-2 font-medium">Downloads</p>
          <p className="text-[32px] font-bold text-[#0C2340] leading-none mb-2">{approvedRequests.length}</p>
          <p className="text-[11px] text-slate-600">Documents ready</p>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-[#0C2340] mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Link href="/request?type=clearance">
            <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer h-full border-t-2 border-t-[#0C2340]/10 hover:border-t-[#0C2340]/40">
              <div className="text-xl mb-3">📄</div>
              <p className="text-sm font-semibold text-[#0C2340]">Barangay Clearance</p>
            </Card>
          </Link>
          <Link href="/request?type=indigency">
            <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer h-full border-t-2 border-t-[#0C2340]/10 hover:border-t-[#0C2340]/40">
              <div className="text-xl mb-3">📋</div>
              <p className="text-sm font-semibold text-[#0C2340]">Certificate of Indigency</p>
            </Card>
          </Link>
          <Link href="/request?type=residency">
            <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer h-full border-t-2 border-t-[#0C2340]/10 hover:border-t-[#0C2340]/40">
              <div className="text-xl mb-3">🏠</div>
              <p className="text-sm font-semibold text-[#0C2340]">Certificate of Residency</p>
            </Card>
          </Link>
          <Link href="/request">
            <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer h-full border-t-2 border-t-[#0C2340]/10 hover:border-t-[#0C2340]/40">
              <div className="text-xl mb-3">➕</div>
              <p className="text-sm font-semibold text-[#0C2340]">More Documents</p>
            </Card>
          </Link>
        </div>
      </div>

      {/* Recent Requests Table */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-[#0C2340] mb-4">Recent Requests</h2>
        <Card className="shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#0C2340]/[0.03] border-b border-slate-200">
                  <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Document</th>
                  <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Purpose</th>
                  <th className="text-left px-6 py-3.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((request) => (
                  <tr key={request.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-6 py-3.5 text-sm font-medium text-[#0C2340]">{request.documentType}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{request.dateRequested}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium ${request.status === "Approved"
                          ? "bg-green-100 text-green-700"
                          : request.status === "Pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-700"
                          }`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{request.purpose}</td>
                    <td className="px-6 py-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-300 text-slate-600 text-[11px] h-7 bg-transparent"
                      >
                        Track
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 text-right border-t border-slate-100">
            <Link href="/history" className="text-sm text-[#0C2340] font-medium hover:underline">
              View All Requests →
            </Link>
          </div>
        </Card>
      </div>

      {/* Notifications Panel */}
      <div>
        <h2 className="text-base font-semibold text-[#0C2340] mb-4">Notifications</h2>
        <Card className="divide-y divide-slate-100">
          {recentNotifications.map((notification) => (
            <div key={notification.id} className="p-4 flex items-start gap-4">
              <div
                className={`w-4 h-4 rounded-full mt-1 flex-shrink-0 ${notification.type === "success"
                  ? "bg-green-500"
                  : notification.type === "info"
                    ? "bg-blue-500"
                    : "bg-slate-400"
                  }`}
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#0C2340] mb-1">{notification.title}</p>
                <p className="text-xs text-slate-600">{notification.message}</p>
              </div>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">{notification.timestamp}</span>
            </div>
          ))}
        </Card>
      </div>
    </ResidentPageShell>
  )
}
