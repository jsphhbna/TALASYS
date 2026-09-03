"use client"

import Link from "next/link"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useResidentData } from "@/hooks/use-resident-data"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function DashboardPage() {
  const { user, isAuthorized } = useAuthGuard()
  const { requests } = useResidentData()

  if (!isAuthorized || !user) {
    return null
  }

  const approvedRequests = requests.filter((request) =>
    request.status === "Approved" ||
    request.status === "On Process" ||
    request.status === "Ready for Pick Up" ||
    request.status === "Completed"
  )
  const pendingRequests = requests.filter((request) => request.status === "Pending")



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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        {/* Account Status Card */}
        <Card className={`p-6 border-l-4 shadow-sm ${user.status === "Expired" ? "border-l-red-600" : user.isVerified === false ? "border-l-amber-500" : "border-l-[#0C2340]"}`}>
          <p className="text-xs text-slate-500 mb-2 font-medium">Account Status</p>
          <p className={`text-[22px] font-bold mb-2 ${user.status === "Expired" ? "text-red-600" : user.isVerified === false ? "text-amber-500" : "text-green-600"}`}>
            {user.status === "Expired" ? "Deactivated" : user.isVerified === false ? "Under Review" : "Active"}
          </p>
          {user.status === "Expired" ? (
             <p className="text-[11px] text-red-500 font-medium leading-snug">
               Your account is currently inactive. You must request reactivation from your profile.
             </p>
          ) : user.isVerified === false ? (
             <p className="text-[11px] text-amber-600 font-medium leading-snug">
               Your registration is pending admin verification.
             </p>
          ) : (
            <>
              <p className="text-xs text-slate-600 mb-1">Valid until: {user.accountExpiry || "N/A"}</p>
              <p className="text-[11px] text-slate-400 font-medium">{daysRemaining} days remaining</p>
              <div className="mt-4 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-green-500 h-full w-4/5 rounded-full" />
              </div>
            </>
          )}
        </Card>

        {/* Total Requests */}
        <Card className="p-6 shadow-sm">
          <p className="text-xs text-slate-500 mb-2 font-medium">Total Requests</p>
          <p className="text-[32px] font-bold text-[#0C2340] leading-none mb-2">{requests.length}</p>
          <p className="text-[11px] text-slate-600">
            {approvedRequests.length} approved • {pendingRequests.length} pending
          </p>
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



    </ResidentPageShell>
  )
}
