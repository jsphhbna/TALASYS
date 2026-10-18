"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthGuard } from "@/hooks/auth"
import { useResidentData } from "@/hooks/resident"
import { ResidentPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ModalOverlay } from "@/components/ui/modal-overlay"
import { toast } from "@/hooks/use-toast"
import { Bell, Loader2, Trash2 } from "lucide-react"

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
  const { isAuthorized, user } = useAuthGuard()
  const { notifications, markAllNotificationsRead, deleteAllNotifications } = useResidentData()
  const router = useRouter()
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const deleteAllInFlightRef = useRef(false)

  if (!isAuthorized) {
    return null
  }

  const handleMarkAllRead = async () => {
    if (isMarkingAllRead) return

    setIsMarkingAllRead(true)
    try {
      await markAllNotificationsRead()
      toast({
        title: "Notifications marked as read",
        description: "All notifications have been marked as read.",
      })
    } catch (err: any) {
      console.error("Failed to mark all notifications read:", err)
      toast({
        title: "Action failed",
        description: "Could not mark all notifications as read. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsMarkingAllRead(false)
    }
  }

  const handleDeleteAll = async () => {
    if (deleteAllInFlightRef.current || notifications.length === 0) return
    deleteAllInFlightRef.current = true
    setIsDeletingAll(true)
    try {
      const deletedCount = await deleteAllNotifications()
      setShowDeleteAllDialog(false)
      toast({
        title: "Notifications deleted",
        description: `${deletedCount} notification${deletedCount === 1 ? "" : "s"} deleted.`,
      })
    } catch (err: any) {
      console.error("Failed to delete resident notifications:", err)
      toast({
        title: "Delete All failed",
        description: "Your notifications were not fully deleted. Please try again.",
        variant: "destructive",
      })
    } finally {
      deleteAllInFlightRef.current = false
      setIsDeletingAll(false)
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length

  return (
    <ResidentPageShell>
      {/* Page Title */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 mb-1 tracking-tight">Notifications</h1>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleMarkAllRead}
            className="text-xs-plus text-[#0C2340] dark:text-blue-50 font-medium hover:underline flex gap-1 items-center disabled:opacity-50 disabled:no-underline"
            disabled={isMarkingAllRead || unreadCount === 0}
          >
            <span>✓✓</span> {isMarkingAllRead ? "Marking..." : "Mark all as read"}
          </button>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowDeleteAllDialog(true)} disabled={isDeletingAll || notifications.length === 0} className="h-8 gap-1.5 text-red-600 hover:text-red-700">
            <Trash2 className="h-3.5 w-3.5" /> Delete All
          </Button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="w-full">
          <Card>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">You have no notifications</p>
              </div>
            ) : notifications.map((notification, index) => {
              const relativeTime = formatRelativeTime(notification.createdAt)
              return (
                <button
                  key={notification.id}
                  onClick={() => {
                    // Navigate based on notification type
                    if (notification.title.includes("Request")) {
                      router.push("/resident/history")
                    } else if (notification.title.includes("Verified") || notification.title.includes("Verification")) {
                      router.push("/resident/profile")
                    } else if (notification.title.includes("Document")) {
                      router.push("/resident/history")
                    }
                  }}
                  className={`w-full text-left p-4 flex items-start gap-4 transition-colors hover:bg-slate-100 dark:bg-slate-800/50 ${index < notifications.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""
                    } ${notification.type === "urgent" ? "bg-red-50 hover:bg-red-100/50" : notification.isRead ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-950"}`}
                >
                  <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${notification.type === "urgent"
                        ? "bg-red-200 dark:bg-red-900/40"
                        : notification.type === "success"
                          ? "bg-green-200 dark:bg-green-900/40"
                          : notification.type === "info"
                            ? "bg-blue-200 dark:bg-blue-900/40"
                            : "bg-slate-200 dark:bg-slate-800"
                        }`}
                    >
                      <span
                        className={`text-base ${notification.type === "urgent"
                          ? "text-red-600 dark:text-red-400"
                          : notification.type === "success"
                            ? "text-green-600 dark:text-green-400"
                            : notification.type === "info"
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-slate-600 dark:text-slate-400"
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
                      className={`text-sm font-bold mb-1 ${notification.isRead ? "text-slate-600 dark:text-slate-400" : "text-slate-900 dark:text-slate-100"
                        }`}
                    >
                      {notification.title}
                    </p>
                    <p className={`text-xs ${notification.isRead ? "text-slate-400" : "text-slate-600 dark:text-slate-400"}`}>
                      {notification.message}
                    </p>
                  </div>

                  <span className="text-xs-plus text-slate-400 whitespace-nowrap flex-shrink-0">
                    {relativeTime}
                  </span>
                </button>
              )
            })}

          </Card>
      </div>

      <ModalOverlay isOpen={showDeleteAllDialog} onClose={() => { if (!isDeletingAll) setShowDeleteAllDialog(false) }} title="Delete all notifications">
        <Card className="w-full max-w-md p-0 shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Delete all notifications?</h2>
          </div>
          <div className="p-6 space-y-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This permanently deletes all {notifications.length} notification{notifications.length === 1 ? "" : "s"} belonging to your resident account. Audit records are not affected.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeleteAllDialog(false)} disabled={isDeletingAll}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteAll} disabled={isDeletingAll || notifications.length === 0}>
                {isDeletingAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isDeletingAll ? "Deleting..." : "Delete All"}
              </Button>
            </div>
          </div>
        </Card>
      </ModalOverlay>
    </ResidentPageShell>
  )
}
