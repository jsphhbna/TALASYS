"use client"

import { useCallback, useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, deleteDoc, addDoc, getCountFromServer } from "firebase/firestore"
import type {
    AdminResident,
    PendingVerification,
    AdminDocumentRequest,
    AdminNotification,
    ActivityLog,
} from "@/lib/admin-store"

export function useAdminData() {
    const [residents, setResidents] = useState<AdminResident[]>([])
    const [verifications, setVerifications] = useState<PendingVerification[]>([])
    const [rejectedVerifications, setRejectedVerifications] = useState<PendingVerification[]>([])
    const [documentRequests, setDocumentRequests] = useState<AdminDocumentRequest[]>([])
    const [notifications, setNotifications] = useState<AdminNotification[]>([])
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
    const [isLoaded, setIsLoaded] = useState(false)

    const [stats, setStats] = useState({
        totalResidents: 0,
        activeResidents: 0,
        expiringResidents: 0,
        expiredResidents: 0,
        pendingVerifications: 0,
        pendingRequests: 0,
        approvedRequests: 0,
        rejectedRequests: 0,
        totalRequests: 0,
        unreadNotifications: 0,
        totalDocumentsGenerated: 0,
        seniorCount: 0,
        minorCount: 0,
        adultCount: 0,
        voterCount: 0,
    })

    useEffect(() => {
        const unsubs: (() => void)[] = []

        unsubs.push(onSnapshot(collection(db, "users"), (snap) => {
            const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
            const res = allUsers.filter(u => u.role === "resident").map(u => ({
                id: u.id,
                name: u.name,
                initials: u.initials || "U",
                age: u.dateOfBirth ? Math.floor((new Date().getTime() - new Date(u.dateOfBirth).getTime()) / 31557600000) : 0,
                gender: "Male" as const,
                address: u.address || "",
                categories: u.statuses || [u.status].filter(Boolean) || [],
                status: "Active" as const,
                isVoter: (u.statuses || []).includes("Registered Voter"),
                expiryDate: u.accountExpiry || "",
                dateOfBirth: u.dateOfBirth || "",
                contactNumber: u.contactNumber || "",
                email: u.email || "",
            }))
            setResidents(res)
            
            // Stats updates based on users
            setStats(prev => ({ ...prev, 
                totalResidents: res.length, 
                activeResidents: res.length,
                seniorCount: res.filter(r => r.categories.includes("Senior Citizen")).length,
                minorCount: res.filter(r => r.categories.includes("Underage")).length,
                adultCount: res.filter(r => r.categories.includes("Adult") || r.categories.includes("Resident")).length,
                voterCount: res.filter(r => r.isVoter).length
            }))
        }, (err) => console.error("users snapshot error:", err)))

        unsubs.push(onSnapshot(collection(db, "verifications"), (snap) => {
            const allVerif = snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingVerification))
            const pending = allVerif.filter(v => !v.status || v.status === "pending")
            const rejected = allVerif.filter(v => v.status === "rejected")
            setVerifications(pending)
            setRejectedVerifications(rejected)
            setStats(prev => ({ ...prev, pendingVerifications: pending.length }))
        }, (err) => console.error("verifications snapshot error:", err)))

        unsubs.push(onSnapshot(query(collection(db, "documentRequests"), orderBy("createdAt", "desc")), (snap) => {
            const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminDocumentRequest))
            setDocumentRequests(reqs)
            
            const pending = reqs.filter(r => r.status === "Pending")
            const approved = reqs.filter(r => r.status === "Approved" || r.status === "On Process" || r.status === "Ready for Pick Up" || r.status === "Completed")
            const rejected = reqs.filter(r => r.status === "Rejected")
            
            setStats(prev => ({
                ...prev,
                pendingRequests: pending.length,
                approvedRequests: approved.length,
                rejectedRequests: rejected.length,
                totalRequests: reqs.length,
                totalDocumentsGenerated: approved.length
            }))
        }, (err) => console.error("documentRequests snapshot error:", err)))

        unsubs.push(onSnapshot(query(collection(db, "notifications"), where("targetId", "==", "admin")), (snap) => {
            const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AdminNotification))
            notifs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            setNotifications(notifs)
            setStats(prev => ({ ...prev, unreadNotifications: notifs.filter(n => !n.isRead).length }))
        }, (err) => console.error("notifications snapshot error:", err)))

        unsubs.push(onSnapshot(query(collection(db, "activityLogs"), orderBy("timestamp", "desc")), (snap) => {
            setActivityLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)))
        }, (err) => console.error("activityLogs snapshot error:", err)))

        setTimeout(() => setIsLoaded(true), 500)

        return () => unsubs.forEach(u => u())
    }, [])

    const refresh = useCallback(() => {}, [])

    return {
        residents,
        verifications,
        rejectedVerifications,
        documentRequests,
        notifications,
        activityLogs,
        stats,
        isLoaded,
        refresh,

        // Residents
        addResident: useCallback(async () => { throw new Error("Add via Auth flow only.") }, []),
        updateResident: useCallback(async (id: string, updates: Partial<AdminResident>) => {
            await updateDoc(doc(db, "users", id), updates)
        }, []),
        deleteResident: useCallback(async (id: string, adminName?: string, residentName?: string) => {
            // We soft-delete the document by changing its role. 
            // If we physically delete it, Firebase Auth will let them log in and auto-recreate a blank profile.
            await updateDoc(doc(db, "users", id), { role: "Deleted" })
            if (adminName && residentName) {
                await addDoc(collection(db, "activityLogs"), {
                    action: "Deleted Resident",
                    adminName: adminName,
                    residentName: residentName,
                    time: "Just now",
                    timestamp: Date.now()
                })
            }
        }, []),

        // Verifications
        addVerification: useCallback(async () => { throw new Error("Residents only.") }, []),
        approveVerification: useCallback(async (id: string) => {
            await updateDoc(doc(db, "verifications", id), { status: "approved" })
            const v = verifications.find(ver => ver.id === id)
            if (v && v.residentId) {
                await updateDoc(doc(db, "users", v.residentId), { isVerified: true })
                await addDoc(collection(db, "notifications"), {
                    targetId: v.residentId,
                    type: "success",
                    title: "Verification Approved",
                    message: "Your account verification has been approved.",
                    timestamp: "Just now",
                    isRead: false,
                    createdAt: Date.now()
                })
            }
        }, [verifications]),
        rejectVerification: useCallback(async (id: string, reason: string) => {
            if (!reason || reason.trim().length < 10) {
                throw new Error("Rejection requires a reason of at least 10 characters.");
            }
            await updateDoc(doc(db, "verifications", id), { status: "rejected", rejectReason: reason })
            const v = verifications.find(ver => ver.id === id)
            if (v && v.residentId) {
                await addDoc(collection(db, "notifications"), {
                    targetId: v.residentId,
                    type: "error",
                    title: "Verification Rejected",
                    message: `Your verification was rejected: ${reason}`,
                    timestamp: "Just now",
                    isRead: false,
                    createdAt: Date.now()
                })

                await addDoc(collection(db, "activityLogs"), {
                    admin: { name: "Admin", email: "admin@system.com" },
                    actionType: "rejected",
                    action: "Rejected Verification",
                    details: `Rejected verification for Resident ID ${v.residentId}. Reason: ${reason}`,
                    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    timestamp: Date.now()
                })
            }
        }, [verifications]),

        // Document Requests
        addDocumentRequest: useCallback(async () => { throw new Error("Residents only.") }, []),
        updateRequestStatus: useCallback(async (id: string, status: "Approved" | "On Process" | "Ready for Pick Up" | "Completed" | "Rejected", reason?: string) => {
            if (status === "Rejected" && (!reason || reason.trim().length < 10)) {
                throw new Error("Rejection requires a reason of at least 10 characters.");
            }

            await updateDoc(doc(db, "documentRequests", id), { status, ...(reason ? { rejectReason: reason } : {}) })
            
            // Optionally, add a notification for the resident here.
            const req = documentRequests.find(r => r.id === id)
            if (req && req.residentId) {
                await addDoc(collection(db, "notifications"), {
                    targetId: req.residentId,
                    type: status === "Rejected" ? "error" : "info",
                    title: `Document ${status}`,
                    message: `Your request for ${req.documentType} is now ${status}.${reason ? ` Reason: ${reason}` : ""}`,
                    timestamp: "Just now",
                    isRead: false,
                    createdAt: Date.now()
                })

                if (status === "Rejected") {
                    await addDoc(collection(db, "activityLogs"), {
                        admin: { name: "Admin", email: "admin@system.com" },
                        actionType: "rejected",
                        action: "Rejected Document",
                        details: `Rejected ${req.documentType} for ${req.residentName}. Reason: ${reason}`,
                        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                        timestamp: Date.now()
                    })
                }
            }
        }, [documentRequests]),
        deleteDocumentRequest: useCallback(async (id: string) => {
            await deleteDoc(doc(db, "documentRequests", id))
        }, []),

        // Notifications
        addNotification: useCallback(async (input: Omit<AdminNotification, "id">) => {
            await addDoc(collection(db, "notifications"), { ...input, createdAt: Date.now() })
        }, []),
        markNotificationRead: useCallback(async (id: string) => {
            await updateDoc(doc(db, "notifications", id), { isRead: true })
        }, []),
        markAllNotificationsRead: useCallback(async () => {
            for (const n of notifications.filter(n => !n.isRead)) {
                await updateDoc(doc(db, "notifications", n.id), { isRead: true })
            }
        }, [notifications]),
        deleteNotification: useCallback(async (id: string) => {
            await deleteDoc(doc(db, "notifications", id))
        }, []),

        // Activity Logs
        addActivityLog: useCallback(async (input: Omit<ActivityLog, "id" | "time">) => {
            await addDoc(collection(db, "activityLogs"), {
                ...input,
                time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                timestamp: Date.now()
            })
        }, []),
        clearActivityLogs: useCallback(async () => {
             // In Firestore, you shouldn't clear logs from the client easily for security, 
             // but if needed we iterate and delete.
             for (const l of activityLogs) {
                 await deleteDoc(doc(db, "activityLogs", l.id))
             }
        }, [activityLogs]),
    }
}
