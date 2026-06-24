"use client"

import { useState } from "react"
import { AdminPageShell } from "@/components/layout/page-shells"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAdminData } from "@/hooks/use-admin-data"
import { Bell, UserPlus, Clock, FileText, Mail } from "lucide-react"

export default function Notifications() {
  const { notifications: adminNotifications, markAllNotificationsRead, markNotificationRead, addNotification, residents } = useAdminData()
  const [activeFilter, setActiveFilter] = useState("all")
  const [selectedNotification, setSelectedNotification] = useState<any>(null)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [broadcastMessage, setBroadcastMessage] = useState("")
  const [isSending, setIsSending] = useState(false)

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
      default: return <Mail className="w-4 h-4 text-slate-500" />
    }
  }

  const getPriorityBadge = (type: string, isRead: boolean) => {
    if (isRead) return null
    if (type === "expiring") return <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-semibold">URGENT</span>
    if (type === "registration") return <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-semibold">NEW</span>
    if (type === "reactivation") return <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[9px] font-semibold">ACTION</span>
    return null
  }

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    setIsSending(true);
    try {
      const activeResidents = residents.filter(r => r.status === "Active");
      const promises = activeResidents.map(r => 
        addNotification({
          targetId: r.id,
          type: "info",
          title: "Barangay Announcement",
          message: broadcastMessage,
          timestamp: "Just now",
          isRead: false
        })
      );
      
      // Also add one for admin log visibility
      promises.push(
        addNotification({
          targetId: "admin",
          type: "info",
          title: "Broadcast Sent",
          message: `Sent: "${broadcastMessage}" to ${activeResidents.length} residents`,
          timestamp: "Just now",
          isRead: false
        })
      );

      await Promise.all(promises);
      setBroadcastMessage("");
    } catch (error) {
      console.error("Failed to send broadcast", error);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0C2340] tracking-tight">Notifications</h1>
        <p className="text-sm text-slate-500 mt-0.5">System alerts and resident notifications</p>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-4 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-2">
            <Bell className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total Unread</p>
          <p className="text-2xl font-bold text-red-600">{unreadCount}</p>
        </Card>
        {[
          { type: "Registrations", count: adminNotifications.filter(n => n.type === "registration").length, color: "#2563eb" },
          { type: "Expiring", count: adminNotifications.filter(n => n.type === "expiring").length, color: "#d97706" },
          { type: "Requests", count: adminNotifications.filter(n => n.type === "success" || n.type === "reactivation").length, color: "#16a34a" }
        ].map((ns, i) => (
          <Card key={i} className="p-4 shadow-sm">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ backgroundColor: `${ns.color}15` }}>
              {i === 0 ? <UserPlus className="w-4 h-4" style={{ color: ns.color }} /> : i === 1 ? <Clock className="w-4 h-4" style={{ color: ns.color }} /> : <FileText className="w-4 h-4" style={{ color: ns.color }} />}
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{ns.type}</p>
            <p className="text-2xl font-bold" style={{ color: ns.color }}>{ns.count}</p>
          </Card>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-4 py-2 text-xs rounded-lg transition-colors ${activeFilter === filter.id ? "bg-[#0C2340] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <button onClick={() => markAllNotificationsRead()} className="text-[11px] text-[#0C2340] font-medium hover:underline flex gap-1 items-center">
          <span>✓✓</span> Mark all as read
        </button>
      </div>

      {/* Notifications List */}
      <Card className="shadow-sm">
        <div className="divide-y divide-slate-100">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">You have no notifications</p>
            </div>
          ) : filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => { markNotificationRead(notification.id); setSelectedNotification(notification); setShowPreviewDialog(true) }}
              className={`p-5 hover:bg-slate-50 cursor-pointer transition-colors ${!notification.isRead
                ? notification.type === "registration" ? "bg-blue-50/50" :
                  notification.type === "expiring" ? "bg-amber-50/50" :
                    notification.type === "reactivation" ? "bg-purple-50/50" :
                      "bg-white"
                : "bg-white"
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
                    <p className={`text-[12px] font-semibold ${notification.isRead ? "text-slate-500" : "text-[#0C2340]"}`}>
                      {notification.title}
                    </p>
                    {getPriorityBadge(notification.type, notification.isRead)}
                  </div>
                  <p className={`text-[11px] mb-1 ${notification.isRead ? "text-slate-400" : "text-slate-600"}`}>
                    {notification.message}
                  </p>
                  <p className="text-[10px] text-slate-400">{notification.timestamp}</p>
                </div>
                {notification.actionUrl && !notification.isRead && (
                  <Button size="sm" className="h-7 px-4 text-[10px] bg-[#0C2340] hover:bg-[#0a1c33]">
                    {notification.type === "expiring" ? "View List" : "Review"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Send Notification */}
        <div className="p-4 bg-[#0C2340]/[0.03] border-t border-slate-200 flex items-center gap-4">
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
            className="h-9 px-6 bg-[#0C2340] hover:bg-[#0a1c33]"
          >
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </Card>

      {/* Detail Dialog */}
      {showPreviewDialog && selectedNotification && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg p-0 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-[#0C2340]">Notification Details</h3>
              <button onClick={() => setShowPreviewDialog(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
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
                  <h4 className="text-base font-bold text-[#0C2340] mb-1">{selectedNotification.title}</h4>
                  <p className="text-sm text-slate-600 mb-2">{selectedNotification.message}</p>
                  <p className="text-[10px] text-slate-400">{selectedNotification.timestamp}</p>
                </div>
              </div>
              {selectedNotification.actionUrl && (
                <Button
                  onClick={() => { window.location.href = selectedNotification.actionUrl }}
                  className="w-full h-10 bg-[#0C2340] hover:bg-[#0a1c33]"
                >
                  {selectedNotification.type === "expiring" ? "View List" : "Review"}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </AdminPageShell>
  )
}
