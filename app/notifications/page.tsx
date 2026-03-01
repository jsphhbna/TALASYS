"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useResidentData } from "@/hooks/use-resident-data"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"

export default function NotificationsPage() {
  const { isAuthorized } = useAuthGuard()
  const { notifications, markAllNotificationsRead } = useResidentData()
  const router = useRouter()
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)

  if (!isAuthorized) {
    return null
  }

  const handleMarkAllRead = async () => {
    if (isMarkingAllRead) return

    setIsMarkingAllRead(true)
    await delay(450)
    markAllNotificationsRead()
    setIsMarkingAllRead(false)
  }

  const handleReactivation = () => {
    showToastPreset("reactivationStarted")
    router.push("/register")
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <ResidentPageShell>
          {/* Page Title */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[#0C2340] mb-1 tracking-tight">Notifications</h1>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Notifications List */}
            <div className="lg:col-span-2">
              <Card>
                {notifications.map((notification, index) => (
                  <div
                    key={notification.id}
                    className={`p-4 flex items-start gap-4 ${index < notifications.length - 1 ? "border-b border-slate-100" : ""
                      } ${notification.type === "urgent" ? "bg-red-50" : notification.isRead ? "bg-white" : "bg-slate-50"}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${notification.type === "urgent"
                          ? "bg-red-200"
                          : notification.type === "success"
                            ? "bg-green-200"
                            : notification.type === "info"
                              ? "bg-blue-200"
                              : "bg-slate-200"
                        }`}
                    >
                      <span
                        className={`text-base ${notification.type === "urgent"
                            ? "text-red-600"
                            : notification.type === "success"
                              ? "text-green-600"
                              : notification.type === "info"
                                ? "text-blue-600"
                                : "text-slate-600"
                          }`}
                      >
                        {notification.type === "urgent"
                          ? "⚠"
                          : notification.type === "success"
                            ? "✓"
                            : notification.type === "info"
                              ? "i"
                              : "✓"}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-bold mb-1 ${notification.isRead ? "text-slate-600" : "text-slate-900"
                          }`}
                      >
                        {notification.title}
                      </p>
                      <p className={`text-xs ${notification.isRead ? "text-slate-400" : "text-slate-600"}`}>
                        {notification.message}
                      </p>
                    </div>

                    <span className="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0">
                      {notification.timestamp}
                    </span>
                  </div>
                ))}

                <div className="p-4 text-right border-t border-slate-100">
                  <button onClick={handleMarkAllRead} className="text-xs text-[#0C2340] font-medium hover:underline" disabled={isMarkingAllRead || unreadCount === 0}>
                    {isMarkingAllRead ? "Marking..." : "Mark All as Read"}
                  </button>
                </div>
              </Card>
            </div>

            {/* Right: Account Status */}
            <div className="space-y-6">
              {/* Account Status Card */}
              <Card className="p-6 shadow-sm">
                <h3 className="text-lg font-bold text-[#0C2340] text-center mb-6">Account Status</h3>

                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 rounded-full bg-green-50 flex items-center justify-center mb-6 border-2 border-green-200">
                    <span className="text-5xl text-green-600">✓</span>
                  </div>

                  <p className="text-xl font-bold text-green-600 mb-2">Account Active</p>
                  <p className="text-sm text-slate-600 mb-1 text-center">Valid until May 27, 2026</p>
                  <p className="text-xs text-slate-600 text-center">You can request documents normally</p>
                </div>
              </Card>

              {/* Reactivation Process Preview (Optional Display) */}
              <Card className="p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-[#0C2340] mb-4">Reactivation Process</h3>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#0C2340] flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[10px] font-medium">1</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-[#0C2340] font-medium">Re-upload Documents</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-slate-600 text-[10px]">2</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-600">Admin Verification</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-slate-600 text-[10px]">3</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-600">Account Reactivated</p>
                    </div>
                  </div>
                </div>

                <div className="relative group">
                  <button
                    disabled
                    className="w-full mt-6 py-2.5 px-4 text-sm font-medium text-slate-500 bg-slate-200 rounded cursor-not-allowed"
                  >
                    Request Activation
                  </button>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Account still active...
                  </div>
                </div>
              </Card>
            </div>
          </div>
    </ResidentPageShell>
  )
}
