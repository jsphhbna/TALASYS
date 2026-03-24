"use client"

import { useCallback, useEffect, useState } from "react"
import {
    getAdminResidents,
    getAdminVerifications,
    getAdminDocumentRequests,
    getAdminNotifications,
    getAdminActivityLogs,
    getAdminDashboardStats,
    addAdminResident,
    updateAdminResident,
    deleteAdminResident,
    addAdminVerification,
    approveVerification,
    rejectVerification,
    addAdminDocumentRequest,
    updateDocumentRequestStatus,
    deleteAdminDocumentRequest,
    addAdminNotification,
    markAdminNotificationRead,
    markAllAdminNotificationsRead,
    deleteAdminNotification,
    addAdminActivityLog,
    clearAdminActivityLogs,
    subscribeToAdminStorage,
    type AdminResident,
    type PendingVerification,
    type AdminDocumentRequest,
    type AdminNotification,
    type ActivityLog,
} from "@/lib/admin-store"
import { subscribeToResidentStorage } from "@/lib/local-storage-store"

export function useAdminData() {
    const [residents, setResidents] = useState<AdminResident[]>([])
    const [verifications, setVerifications] = useState<PendingVerification[]>([])
    const [documentRequests, setDocumentRequests] = useState<AdminDocumentRequest[]>([])
    const [notifications, setNotifications] = useState<AdminNotification[]>([])
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
    const [isLoaded, setIsLoaded] = useState(false)

    const refresh = useCallback(() => {
        setResidents(getAdminResidents())
        setVerifications(getAdminVerifications())
        setDocumentRequests(getAdminDocumentRequests())
        setNotifications(getAdminNotifications())
        setActivityLogs(getAdminActivityLogs())
        setIsLoaded(true)
    }, [])

    useEffect(() => {
        refresh()
        const unsubscribeAdmin = subscribeToAdminStorage(refresh)
        const unsubscribeResident = subscribeToResidentStorage(refresh)
        return () => {
            unsubscribeAdmin()
            unsubscribeResident()
        }
    }, [refresh])

    const stats = getAdminDashboardStats()

    return {
        // Data
        residents,
        verifications,
        documentRequests,
        notifications,
        activityLogs,
        stats,
        isLoaded,
        refresh,

        // Residents
        addResident: useCallback((input: Omit<AdminResident, "id" | "initials">) => { const r = addAdminResident(input); refresh(); return r }, [refresh]),
        updateResident: useCallback((id: string, updates: Partial<AdminResident>) => { const r = updateAdminResident(id, updates); refresh(); return r }, [refresh]),
        deleteResident: useCallback((id: string) => { deleteAdminResident(id); refresh() }, [refresh]),

        // Verifications
        addVerification: useCallback((input: Omit<PendingVerification, "id" | "initials">) => { const v = addAdminVerification(input); refresh(); return v }, [refresh]),
        approveVerification: useCallback((id: string) => { const v = approveVerification(id); refresh(); return v }, [refresh]),
        rejectVerification: useCallback((id: string) => { const v = rejectVerification(id); refresh(); return v }, [refresh]),

        // Document Requests
        addDocumentRequest: useCallback((input: Omit<AdminDocumentRequest, "id" | "residentInitials">) => { const r = addAdminDocumentRequest(input); refresh(); return r }, [refresh]),
        updateRequestStatus: useCallback((id: string, status: "Approved" | "Rejected") => { const r = updateDocumentRequestStatus(id, status); refresh(); return r }, [refresh]),
        deleteDocumentRequest: useCallback((id: string) => { deleteAdminDocumentRequest(id); refresh() }, [refresh]),

        // Notifications
        addNotification: useCallback((input: Omit<AdminNotification, "id">) => { const n = addAdminNotification(input); refresh(); return n }, [refresh]),
        markNotificationRead: useCallback((id: string) => { markAdminNotificationRead(id); refresh() }, [refresh]),
        markAllNotificationsRead: useCallback(() => { markAllAdminNotificationsRead(); refresh() }, [refresh]),
        deleteNotification: useCallback((id: string) => { deleteAdminNotification(id); refresh() }, [refresh]),

        // Activity Logs
        addActivityLog: useCallback((input: Omit<ActivityLog, "id" | "time">) => { const l = addAdminActivityLog(input); refresh(); return l }, [refresh]),
        clearActivityLogs: useCallback(() => { clearAdminActivityLogs(); refresh() }, [refresh]),
    }
}
