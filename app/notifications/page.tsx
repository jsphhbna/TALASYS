"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthGuard } from "@/hooks/use-auth-guard"
import { useResidentData } from "@/hooks/use-resident-data"
import { useMounted } from "@/hooks/use-mounted"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { delay } from "@/lib/async-delay"
import { showToastPreset } from "@/lib/app-toast"

function formatRelativeTime(createdAt: number): string {
  const now = Date.now()
  const diff = now - createdAt
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(createdAt))
}

export default function NotificationsPage() {
  const { user, isAuthorized } = useAuthGuard()
  const { notifications, markNotificationRead } = useResidentData()
  const router = useRouter()
  const mounted = useMounted()
  
  const [filter, setFilter] = useState("all") // all, unread
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)

  if (!isAuthorized || !user || !mounted) {
    return null
  }

  const handleMarkAllRead = async () => {
    if (isMarkingAllRead) return

    setIsMarkingAllRead(true)
    await delay(450)
    markAllNotificationsRead()
    setIsMarkingAllRead(false)
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
                {notifications.map((notification, index) => {
                  const relativeTime = formatRelativeTime(notification.createdAt)
                  return (
                  <button
                    key={notification.id}
                    onClick={() => {
                      // Navigate based on notification type
                      if (notification.title.includes("Request")) {
                        router.push("/history")
                      } else if (notification.title.includes("Verified") || notification.title.includes("Verification")) {
                        router.push("/profile")
                      } else if (notification.title.includes("Document")) {
                        router.push("/history")
                      }
                    }}
                    className={`w-full text-left p-4 flex items-start gap-4 transition-colors hover:bg-slate-100/50 ${index < notifications.length - 1 ? "border-b border-slate-100" : ""
                      } ${notification.type === "urgent" ? "bg-red-50 hover:bg-red-100/50" : notification.isRead ? "bg-white" : "bg-slate-50"}`}
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
                      {relativeTime}
                    </span>
                  </button>
                  )
                })}

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

            </div>
          </div>
    </ResidentPageShell>
  )
}
