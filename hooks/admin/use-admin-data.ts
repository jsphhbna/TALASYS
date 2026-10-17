"use client"

import { useCallback, useEffect, useState } from "react"
import { db, auth } from "@/lib/firebase"
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, deleteDoc, addDoc, getCountFromServer, limit } from "firebase/firestore"
import { callAdminOperation, updateResidentIdentity } from "@/lib/admin/client-operation"
import type {
    AdminResident,
    PendingVerification,
    AdminDocumentRequest,
    AdminNotification,
    ActivityLog,
} from "@/lib/admin"
import {
    COLLECTION_USERS,
    COLLECTION_VERIFICATIONS,
    COLLECTION_DOCUMENT_REQUESTS,
    COLLECTION_NOTIFICATIONS,
    COLLECTION_ACTIVITY_LOGS,
    COLOR_ADMIN_BLUE,
    COLOR_ADMIN_GREEN,
    COLOR_ADMIN_RED,
    COLOR_ADMIN_AMBER,
} from "@/lib/constants"
import { useAuth } from "@/lib/auth"
import { normalizeAuditLog } from "@/lib/security/audit-utils"
import { fetchOrderedCollectionPages } from "@/lib/firestore-pagination"

export function useAdminData() {
    const [residents, setResidents] = useState<AdminResident[]>([])
    const [verifications, setVerifications] = useState<PendingVerification[]>([])
    const [rejectedVerifications, setRejectedVerifications] = useState<PendingVerification[]>([])
    const [deniedVerifications, setDeniedVerifications] = useState<PendingVerification[]>([])
    const [documentRequests, setDocumentRequests] = useState<AdminDocumentRequest[]>([])
    const [notifications, setNotifications] = useState<AdminNotification[]>([])
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
    const [isLoaded, setIsLoaded] = useState(false)
    const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({})
    const error = Object.values(sourceErrors).join("; ") || null
    const [refreshCounter, setRefreshCounter] = useState(0)

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

    const { user } = useAuth()
    const userCreatedAt = user?.createdAt || 0

    useEffect(() => {
        const unsubscribeFunctions: (() => void)[] = []
        const sourcesLoaded = new Set<string>()
        const checkReady = (sourceKey: string) => {
            setSourceErrors(previous => { const next = { ...previous }; delete next[sourceKey]; return next })
            sourcesLoaded.add(sourceKey)
            if (sourcesLoaded.size >= 5) {
                setIsLoaded(true)
            }
        }

        // Note: Missing orderBy, so a limit() here would fetch the oldest records. Pagination requires a composite index.
        unsubscribeFunctions.push(onSnapshot(collection(db, COLLECTION_USERS), (snapshot) => {
            const allUserDocuments = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as any))
            const now = Date.now()
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

            const residentList = allUserDocuments.filter(userData => userData.role === "resident" && userData.isVerified !== false).map(userData => {
                let lifecycleStatus: "Verified" | "Expired" | "Expiring" | "Locked" | "Deleted" | "Deleted by Resident" = "Verified"
                if (userData.status === "Locked" || userData.status === "Deleted" || userData.status === "Deleted by Resident") {
                    lifecycleStatus = userData.status
                } else if (userData.status === "Expired") {
                    lifecycleStatus = "Expired"
                } else if (userData.accountExpiry) {
                    const expiryTime = new Date(userData.accountExpiry).getTime()
                    if (!isNaN(expiryTime)) {
                        if (expiryTime < now) {
                            lifecycleStatus = "Expired"
                        } else if (expiryTime <= now + thirtyDaysMs) {
                            lifecycleStatus = "Expiring"
                        }
                    }
                }

                return {
                    id: userData.id,
                    name: userData.name,
                    initials: userData.initials || "U",
                    age: userData.dateOfBirth ? Math.floor((new Date().getTime() - new Date(userData.dateOfBirth).getTime()) / 31557600000) : 0,
                    gender: (userData.gender || userData.sex || "Other") as "Male" | "Female" | "Other",
                    address: userData.address || "",
                    categories: userData.statuses || [userData.status].filter(Boolean) || [],
                    status: lifecycleStatus,
                    isVoter: (userData.statuses || []).includes("Registered Voter"),
                    expiryDate: userData.accountExpiry || "",
                    dateOfBirth: userData.dateOfBirth || "",
                    contactNumber: userData.contactNumber || "",
                    email: userData.email || "",
                    profilePicture: userData.profilePicture || "",
                    createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate().toISOString() : (userData.createdAt || new Date().toISOString()),
                    registrationDenied: userData.registrationDenied === true,
                }
            })
            setResidents(residentList)
            
            const expiredCount = residentList.filter(r => r.status === "Expired").length
            const expiringCount = residentList.filter(r => r.status === "Expiring").length
            const verifiedCount = residentList.filter(r => r.status === "Verified").length

            setStats(prev => ({ ...prev, 
                totalResidents: residentList.length, 
                activeResidents: verifiedCount + expiringCount,
                expiringResidents: expiringCount,
                expiredResidents: expiredCount,
                seniorCount: residentList.filter(resident => resident.categories.includes("Senior Citizen")).length,
                minorCount: residentList.filter(resident => resident.categories.includes("Underage")).length,
                adultCount: residentList.filter(resident => resident.categories.includes("Adult") || resident.categories.includes("Resident")).length,
                voterCount: residentList.filter(resident => resident.isVoter).length
            }))
            checkReady("users")
        }, (err) => {
            console.error("users snapshot error:", err)
            setSourceErrors(previous => ({ ...previous, users: err.message || "Failed to load residents" }))
            setIsLoaded(true)
        }))

        unsubscribeFunctions.push(onSnapshot(collection(db, COLLECTION_VERIFICATIONS), (snapshot) => {
            const allVerifications = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as PendingVerification))
            const pendingVerifications = allVerifications.filter(verification => !verification.status || verification.status === "pending")
            const rejectedVerificationsList = allVerifications.filter(verification => verification.status === "rejected")
            const deniedVerificationsList = allVerifications.filter(verification => verification.status === "denied")
            setVerifications(pendingVerifications)
            setRejectedVerifications(rejectedVerificationsList)
            setDeniedVerifications(deniedVerificationsList)
            setStats(prev => ({ ...prev, pendingVerifications: pendingVerifications.length }))
            checkReady("verifications")
        }, (err) => {
            console.error("verifications snapshot error:", err)
            setSourceErrors(previous => ({ ...previous, verifications: err.message || "Failed to load verifications" }))
            setIsLoaded(true)
        }))

        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_DOCUMENT_REQUESTS), orderBy("createdAt", "desc"), limit(200)), async () => {
          try {
            const allRequests = await fetchOrderedCollectionPages<AdminDocumentRequest>(db, COLLECTION_DOCUMENT_REQUESTS, "createdAt", 200)
            setDocumentRequests(allRequests)
            
            const pendingRequests = allRequests.filter(request => request.status === "Pending")
            const approvedRequests = allRequests.filter(request => request.status === "Approved" || request.status === "On Process" || request.status === "Ready for Pick Up" || request.status === "Completed")
            const rejectedRequests = allRequests.filter(request => request.status === "Rejected")
            const actuallyGenerated = allRequests.filter(request => (request as any).hasGenerated === true)
            
            setStats(prev => ({
                ...prev,
                pendingRequests: pendingRequests.length,
                approvedRequests: approvedRequests.length,
                rejectedRequests: rejectedRequests.length,
                totalRequests: allRequests.length,
                totalDocumentsGenerated: actuallyGenerated.length
            }))
            checkReady("requests")
          } catch (err: any) {
            console.error("documentRequests pagination error:", err)
            setSourceErrors(previous => ({ ...previous, requests: err.message || "Failed to load complete document request queue" }))
            setIsLoaded(true)
          }
        }, (err) => {
            console.error("documentRequests snapshot error:", err)
            setSourceErrors(previous => ({ ...previous, requests: err.message || "Failed to load document requests" }))
            setIsLoaded(true)
        }))

        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_NOTIFICATIONS), where("targetId", "==", "admin")), (snapshot) => {
            let adminNotifications = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as AdminNotification))
            adminNotifications = adminNotifications.filter(n => (n.createdAt || 0) >= userCreatedAt)
            
            // Filter by Admin Role to ensure admins only see relevant notifications
            if (user?.role === "Verification Only" || user?.role === "Verifications" || user?.role === "Resident Management") {
                adminNotifications = adminNotifications.filter(n => n.actionUrl?.includes("/admin/verifications") || n.type === "registration")
            } else if (user?.role === "Documents Only" || user?.role === "Document Processing") {
                adminNotifications = adminNotifications.filter(n => n.actionUrl?.includes("/admin/requests") || n.type === "info")
            }
            
            adminNotifications.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            setNotifications(adminNotifications)
            setStats(prev => ({ ...prev, unreadNotifications: adminNotifications.filter(notification => !notification.isRead).length }))
            checkReady("notifications")
        }, (err) => {
            console.error("notifications snapshot error:", err)
            setSourceErrors(previous => ({ ...previous, notifications: err.message || "Failed to load notifications" }))
            setIsLoaded(true)
        }))

        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_ACTIVITY_LOGS), orderBy("timestamp", "desc"), limit(250)), async () => {
          try {
            const allLogs = await fetchOrderedCollectionPages<any>(db, COLLECTION_ACTIVITY_LOGS, "timestamp", 250)
            setActivityLogs(allLogs.map(normalizeAuditLog) as unknown as ActivityLog[])
            checkReady("activityLogs")
          } catch (err: any) {
            console.error("activityLogs pagination error:", err)
            setSourceErrors(previous => ({ ...previous, activityLogs: err.message || "Failed to load complete activity history" }))
            setIsLoaded(true)
          }
        }, (err) => {
            console.error("activityLogs snapshot error:", err)
            setSourceErrors(previous => ({ ...previous, activityLogs: err.message || "Failed to load activity logs" }))
            setIsLoaded(true)
        }))

        return () => unsubscribeFunctions.forEach(unsubscribe => unsubscribe())
    }, [userCreatedAt, refreshCounter])

    const refresh = useCallback(() => {
        setSourceErrors({})
        setIsLoaded(false)
        setRefreshCounter(prev => prev + 1)
    }, [])

    return {
        residents,
        verifications,
        rejectedVerifications,
        deniedVerifications,
        documentRequests,
        notifications,
        activityLogs,
        stats,
        isLoaded,
        error,
        hasError: !!error,
        refresh,

        // Residents
        addResident: useCallback(async () => {
            throw new Error("Residents cannot be added manually. They must register through the resident portal to maintain data integrity.")
        }, []),
        updateResident: useCallback(async (id: string, updates: Partial<AdminResident>, adminName?: string, residentName?: string, removePhotoReason?: string, originalEmail?: string) => {
            const { email, id: _id, role: _role, status: _status, isVerified: _verified, ...profileUpdates } = updates as any
            const existingResident = residents.find(r => r.id === id)
            const existingEmail = (originalEmail || existingResident?.email || "").trim().toLowerCase()
            const targetEmail = typeof email === "string" ? email.trim().toLowerCase() : ""
            const isEmailChanged = Boolean(targetEmail && existingEmail && targetEmail !== existingEmail)

            if (isEmailChanged) {
                await updateResidentIdentity(id, targetEmail, profileUpdates, removePhotoReason)
            } else {
                const isPhotoOnlyRemoval = (profileUpdates.profilePicture === "" || profileUpdates.profilePicture === null) &&
                    Object.keys(profileUpdates).length === 1 &&
                    Boolean(removePhotoReason)

                if (isPhotoOnlyRemoval) {
                    await callAdminOperation("resident.profilePhoto.remove", {
                        targetId: id,
                        payload: {
                            removePhotoReason
                        }
                    })
                } else {
                    await callAdminOperation("resident.update", {
                        targetId: id,
                        payload: {
                            updates: profileUpdates,
                            removePhotoReason
                        }
                    })
                }
            }
        }, [residents]),
        deleteResident: useCallback(async (id: string, adminName?: string, residentName?: string) => {
            // Soft-delete instead of physical delete: Firebase Auth would let the user log back in
            // and auto-recreate a blank profile if the Firestore document were physically removed.
            await callAdminOperation("resident.delete", { targetId: id })
        }, []),
        deactivateResident: useCallback(async (id: string, adminName?: string, residentName?: string) => {
            await callAdminOperation("resident.deactivate", { targetId: id })
        }, []),
        activateResident: useCallback(async (id: string, adminName?: string, residentName?: string) => {
            await callAdminOperation("resident.activate", { targetId: id })
        }, []),

        // Verifications
        addVerification: useCallback(async () => {
            throw new Error("This operation is only permitted from the resident portal.")
        }, []),
        approveVerification: useCallback(async (id: string, adminName?: string, adminEmail?: string) => {
            const token = await auth.currentUser?.getIdToken()
            if (!token) throw new Error("Active session token required to approve verification.")
            const attemptId = crypto.randomUUID()
            const response = await fetch("/api/admin/verifications/approve", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ verificationId: id, attemptId }),
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(payload.error || (payload.operationIncomplete
                    ? "Approval is incomplete and requires reconciliation. Retry after resolving the reported state."
                    : "Verification approval failed."))
            }
        }, []),
        rejectVerification: useCallback(async (id: string, reason: string, adminName?: string, adminEmail?: string) => {
            if (!reason || reason.trim().length < 10) {
                throw new Error("Rejection requires a reason of at least 10 characters.")
            }
            await callAdminOperation("verification.reject", { targetId: id, payload: { reason: reason.trim() } })
        }, [verifications]),
        denyRegistration: useCallback(async (id: string, reason: string) => {
            if (!reason || reason.trim().length < 10) {
                throw new Error("Denial requires a reason of at least 10 characters.")
            }
            await callAdminOperation("verification.denyRegistration", { targetId: id, payload: { reason: reason.trim() } })
        }, []),

        // Document Requests
        addDocumentRequest: useCallback(async () => {
            throw new Error("This operation is only permitted from the resident portal.")
        }, []),
        updateRequestStatus: useCallback(async (id: string, status: "Approved" | "On Process" | "Awaiting Payment" | "Ready for Pick Up" | "Completed" | "Rejected", reason?: string, adminName?: string, adminEmail?: string) => {
            try {
                if (status === "Rejected" && (!reason || reason.trim().length < 10)) {
                    throw new Error("Rejection requires a reason of at least 10 characters.")
                }

                await callAdminOperation("request.updateStatus", { targetId: id, payload: { status, reason } })
            } catch (error: any) {
                console.error("Error updating document request (id:", id, "):", error)
                throw error
            }
        }, [documentRequests]),
        deleteDocumentRequest: useCallback(async (id: string) => {
            await callAdminOperation("request.delete", { targetId: id })
        }, []),
        updateRequestGenerated: useCallback(async (id: string, options?: { confirmedAddress?: string; confirmedAge?: number }) => {
            await callAdminOperation("request.markGenerated", {
                targetId: id,
                payload: {
                    ...(options?.confirmedAddress ? { confirmedAddress: options.confirmedAddress } : {}),
                    ...(options?.confirmedAge !== undefined ? { confirmedAge: options.confirmedAge } : {}),
                }
            })
        }, []),
        reprintDocumentRequest: useCallback(async (id: string) => {
            await callAdminOperation("request.reprint", {
                targetId: id,
            })
        }, []),
        confirmBeneficiaryDetails: useCallback(async (id: string, details: { confirmedAddress: string; confirmedAge?: number; notes?: string }) => {
            await callAdminOperation("request.confirmBeneficiary", {
                targetId: id,
                payload: details
            })
        }, []),
        reissueCorrectedDocument: useCallback(async (id: string, details: { address: string; age?: number; correctionReason: string }) => {
            await callAdminOperation("request.reissueCorrected", {
                targetId: id,
                payload: details
            })
        }, []),

        confirmPayment: useCallback(async (id: string, adminName: string, adminEmail?: string, paymentMethodOverride?: "cash" | "gcash", paymentRefOverride?: string) => {
            await callAdminOperation("request.confirmPayment", { targetId: id, payload: { paymentMethod: paymentMethodOverride, paymentReference: paymentRefOverride } })
        }, [documentRequests]),

        markPayLater: useCallback(async (id: string, adminName: string, adminEmail?: string) => {
            await callAdminOperation("request.markPayLater", { targetId: id })
        }, [documentRequests]),

        waivePayment: useCallback(async (id: string, adminName: string, adminEmail?: string) => {
            await callAdminOperation("request.waivePayment", { targetId: id })
        }, [documentRequests]),

        // Notifications
        addNotification: useCallback(async (input: Omit<AdminNotification, "id">) => {
            await callAdminOperation("notification.create", { payload: { notification: input as any } })
        }, []),
        markNotificationRead: useCallback(async (id: string) => {
            await updateDoc(doc(db, COLLECTION_NOTIFICATIONS, id), { isRead: true })
        }, []),
        markAllNotificationsRead: useCallback(async () => {
            // Fetch all unread notifications first, then delete concurrently to avoid sequential round-trips.
            await Promise.all(
                notifications.filter(notification => !notification.isRead).map(notification =>
                    updateDoc(doc(db, COLLECTION_NOTIFICATIONS, notification.id), { isRead: true })
                )
            )
        }, [notifications]),
        deleteNotification: useCallback(async (id: string) => {
            await deleteDoc(doc(db, COLLECTION_NOTIFICATIONS, id))
        }, []),

        // Activity Logs
        addActivityLog: useCallback(async (input: Omit<ActivityLog, "id" | "time">) => {
            throw new Error("Authoritative audit events are derived by typed server operations and cannot be submitted independently.")
        }, []),
        clearActivityLogs: useCallback(async () => {
            throw new Error("Audit log deletion is restricted to a dedicated server-authorized retention workflow.")
        }, []),
    }
}
