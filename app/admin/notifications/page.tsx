"use client"

import { useRef, useState } from "react"
import { ModalOverlay } from "@/components/ui/modal-overlay"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/admin"
import { Bell, UserPlus, Clock, FileText, Mail, Loader2, Trash2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth"
import { canManageNotificationsRole, isAnyAdminRole } from "@/lib/auth/auth-types"

function formatRelativeTime(createdAt: number): string {
  if (!createdAt) return "Just now"
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

export default function Notifications() {
  const { user } = useAuth()
  const canManage = canManageNotificationsRole(user?.role)
  const { notifications: adminNotifications, markAllNotificationsRead, markNotificationRead, deleteAllNotifications, addNotification, residents } = useAdminData()
  const [activeFilter, setActiveFilter] = useState("all")
  const [selectedNotification, setSelectedNotification] = useState<any>(null)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [broadcastMessage, setBroadcastMessage] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false)
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const deleteAllInFlightRef = useRef(false)
  const canDismiss = isAnyAdminRole(user?.role)

  const unreadCount = adminNotifications.filter(n => !n.isRead).length

  const filters = [
    { id: "all", label: "All" },
    { id: "unread", label: `Unread (${unreadCount})` },
    { id: "registrations", label: "Registrations" },
    { id: "expiring", label: "Expiring" },
    { id: "requests", label: "Requests" },
  ]

  const filteredNotifications = adminNotifications.filter((notif) => {
    if (activeFilter === "all") return true
    if (activeFilter === "unread") return !notif.isRead
    if (activeFilter === "registrations") return notif.type === "registration"
    if (activeFilter === "expiring") return notif.type === "expiring"
    if (activeFilter === "requests") return notif.type === "reactivation" || notif.type === "info"
    return true
  })

  const getNotifIcon = (type: string) => {
    switch (type) {
      case "registration": return <UserPlus className="w-4 h-4 text-blue-600" />
      case "expiring": return <Clock className="w-4 h-4 text-amber-600" />
      case "reactivation": return <Bell className="w-4 h-4 text-purple-600" />
      case "success": return <FileText className="w-4 h-4 text-emerald-600" />
      case "error": return <Bell className="w-4 h-4 text-red-600" />
      default: return <Mail className="w-4 h-4 text-slate-500 dark:text-slate-400" />
    }
  }

  const getPriorityBadge = (type: string, isRead: boolean) => {
    if (isRead) return null
    if (type === "expiring") return <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-semibold">URGENT</span>
    if (type === "registration") return <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-semibold">NEW</span>
    if (type === "reactivation") return <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px] font-semibold">ACTION</span>
    return null
  }

  const handleMarkAllRead = async () => {
    if (!canManage || isMarkingAllRead) return
    setIsMarkingAllRead(true)
    try {
      await markAllNotificationsRead()
      toast({
        title: "Notifications marked as read",
        description: "All notifications have been marked as read.",
      })
    } catch (err: any) {
      console.error("Failed to mark admin notifications read:", err)
      toast({
        title: "Action failed",
        description: "Could not mark notifications as read. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsMarkingAllRead(false)
    }
  }

  const handleDeleteAll = async () => {
    if (!canDismiss || deleteAllInFlightRef.current || adminNotifications.length === 0) return
    deleteAllInFlightRef.current = true
    setIsDeletingAll(true)
    try {
      const deletedCount = await deleteAllNotifications()
      setShowDeleteAllDialog(false)
      toast({
        title: "Notifications cleared",
        description: `${deletedCount} notification${deletedCount === 1 ? "" : "s"} removed from your view.`,
      })
    } catch (err: any) {
      console.error("Failed to clear admin notification view:", err)
      toast({
        title: "Delete All failed",
        description: "Your notifications were not fully cleared. Please try again.",
        variant: "destructive",
      })
    } finally {
      deleteAllInFlightRef.current = false
      setIsDeletingAll(false)
    }
  }

  const handleBroadcast = async () => {
    if (!canManage || !broadcastMessage.trim()) return
    setIsSending(true)
    try {
      const activeResidents = residents.filter(r => r.status === "Verified" || r.status === "Expiring")
      const residentResults = await Promise.allSettled(
        activeResidents.map(r =>
          addNotification({
            targetId: r.id,
            type: "info",
            title: "Barangay Announcement",
            message: broadcastMessage,
            timestamp: "Just now",
            isRead: false,
            createdAt: Date.now()
          })
        )
      )

      let successes = 0
      let failures = 0
      residentResults.forEach(res => {
        if (res.status === "fulfilled") successes++
        else failures++
      })

      try {
        await addNotification({
          targetId: "admin",
          type: "info",
          title: "Broadcast Sent",
          message: `Sent: "${broadcastMessage}" (${successes} succeeded, ${failures} failed out of ${activeResidents.length})`,
          timestamp: "Just now",
          isRead: false,
          createdAt: Date.now()
        })
      } catch (adminLogErr) {
        console.warn("Could not log broadcast to admin notifications:", adminLogErr)
      }

      if (failures === 0) {
        toast({
          title: "Broadcast sent",
          description: `Successfully delivered announcement to ${successes} residents.`,
        })
        setBroadcastMessage("")
      } else if (successes > 0) {
        toast({
          title: "Partial broadcast delivery",
          description: `Delivered to ${successes} residents, but ${failures} failed.`,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Broadcast delivery failed",
          description: `Failed to deliver announcement to ${failures} residents.`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to send broadcast", error)
      toast({
        title: "Broadcast error",
        description: "An unexpected error occurred while sending the broadcast.",
        variant: "destructive",
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleNotificationClick = async (notification: any) => {
    setSelectedNotification(notification)
    setShowPreviewDialog(true)

    // View Only users can preview notifications freely without attempting forbidden Firestore writes (R04)
    if (canManage && !notification.isRead) {
      try {
        await markNotificationRead(notification.id)
      } catch (err: any) {
        console.error("Failed to mark notification as read:", err)
      }
    }
  }

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] dark:text-blue-50 tracking-tight">Notifications</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">System alerts and resident notifications</p>
      </div>



      {/* Filter Tabs */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-4 py-2 text-xs rounded-lg transition-colors ${activeFilter === filter.id ? "bg-[#0C2340] dark:bg-slate-800 text-white" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-950"
                }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canManage && (
            <button
              onClick={handleMarkAllRead}
              disabled={isMarkingAllRead || unreadCount === 0}
              className="text-xs-plus text-[#0C2340] dark:text-blue-50 font-medium hover:underline flex gap-1 items-center disabled:opacity-50 disabled:no-underline"
            >
              <span>✓✓</span> {isMarkingAllRead ? "Marking..." : "Mark all as read"}
            </button>
          )}
          {canDismiss && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteAllDialog(true)}
              disabled={isDeletingAll || adminNotifications.length === 0}
              className="h-8 gap-1.5 text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete All
            </Button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <Card className="shadow-sm">
        {/* Send Notification */}
        {canManage ? (
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center gap-4 rounded-t-xl">
            <input
              type="text"
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBroadcast()}
              disabled={isSending}
              placeholder="Send notification to everyone..."
              className="flex-1 px-4 py-2 text-sm border-none bg-transparent focus:outline-none"
            />
            <Button
              size="sm"
              onClick={handleBroadcast}
              disabled={isSending || !broadcastMessage.trim()}
              className="h-9 px-6 bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]"
            >
              {isSending ? "Sending..." : "Send"}
            </Button>
          </div>
        ) : (
          <div className="p-3 px-5 bg-slate-50/70 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 rounded-t-xl flex items-center gap-2">
            <Mail className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Viewing notifications in read-only mode ({user?.role || "View Only"}). Broadcast and status modification are restricted to operational roles.</span>
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">You have no notifications</p>
            </div>
          ) : filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={`p-5 hover:bg-slate-50 dark:bg-slate-950 cursor-pointer transition-colors ${!notification.isRead
                ? notification.type === "registration" ? "bg-blue-50/50" :
                  notification.type === "expiring" ? "bg-amber-50/50" :
                    notification.type === "reactivation" ? "bg-purple-50/50" :
                      "bg-white dark:bg-slate-900"
                : "bg-white dark:bg-slate-900"
                }`}
            >
              <div className="flex items-start gap-3.5">
                {!notification.isRead && (
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${notification.type === "registration" ? "bg-blue-600" :
                    notification.type === "expiring" ? "bg-amber-500" :
                      notification.type === "reactivation" ? "bg-purple-600" :
                        "bg-slate-400"
                    }`} />
                )}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${notification.type === "registration" ? "bg-blue-100" :
                  notification.type === "expiring" ? "bg-amber-100" :
                    notification.type === "reactivation" ? "bg-purple-100" :
                      notification.type === "success" ? "bg-emerald-100" :
                        notification.type === "error" ? "bg-red-100" :
                          "bg-blue-100"
                  }`}>
                  {getNotifIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-xs font-semibold ${notification.isRead ? "text-slate-500 dark:text-slate-400" : "text-[#0C2340] dark:text-blue-50"}`}>
                      {notification.title}
                    </p>
                    {getPriorityBadge(notification.type, notification.isRead)}
                  </div>
                  <p className={`text-xs-plus mb-1 ${notification.isRead ? "text-slate-400" : "text-slate-600 dark:text-slate-400"}`}>
                    {notification.message}
                  </p>
                  <p className="text-2xs text-slate-400">{formatRelativeTime(notification.createdAt)}</p>
                </div>
                {notification.actionUrl && !notification.isRead && (
                  <Button size="sm" className="h-7 px-4 text-2xs bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]">
                    {notification.type === "expiring" ? "View List" : "Review"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Detail Dialog */}
      {showPreviewDialog && selectedNotification && (
        <ModalOverlay isOpen={true} onClose={() => setShowPreviewDialog(false)} title="Notification Details">
          <Card className="w-full max-w-lg p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Notification Details</h3>
              <button onClick={() => setShowPreviewDialog(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-400 text-xl">✕</button>
            </div>
            <div className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${selectedNotification.type === "registration" ? "bg-blue-100" :
                  selectedNotification.type === "expiring" ? "bg-amber-100" :
                    selectedNotification.type === "reactivation" ? "bg-purple-100" :
                      selectedNotification.type === "success" ? "bg-emerald-100" :
                        selectedNotification.type === "error" ? "bg-red-100" :
                          "bg-blue-100"
                  }`}>
                  {getNotifIcon(selectedNotification.type)}
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-bold text-[#0C2340] dark:text-blue-50 mb-1">{selectedNotification.title}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{selectedNotification.message}</p>
                  <p className="text-2xs text-slate-400">{selectedNotification.timestamp}</p>
                </div>
              </div>
              {selectedNotification.actionUrl && (
                <Button
                  onClick={() => { window.location.href = selectedNotification.actionUrl }}
                  className="w-full h-10 bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1c33]"
                >
                  {selectedNotification.type === "expiring" ? "View List" : "Review"}
                </Button>
              )}
            </div>
          </Card>
        </ModalOverlay>
      )}

      <ModalOverlay isOpen={showDeleteAllDialog} onClose={() => { if (!isDeletingAll) setShowDeleteAllDialog(false) }} title="Delete all notifications">
        <Card className="w-full max-w-md p-0 shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-[#0C2340] dark:text-blue-50">Delete all notifications?</h2>
          </div>
          <div className="p-6 space-y-5">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This clears all {adminNotifications.length} notification{adminNotifications.length === 1 ? "" : "s"} from your view only. Other staff members keep their own notification history.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDeleteAllDialog(false)} disabled={isDeletingAll}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteAll} disabled={isDeletingAll || adminNotifications.length === 0}>
                {isDeletingAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isDeletingAll ? "Deleting..." : "Delete All"}
              </Button>
            </div>
          </div>
        </Card>
      </ModalOverlay>
    </AdminPageShell>
  )
}
