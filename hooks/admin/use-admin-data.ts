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
    COLOR_ADMIN_ORANGE,
    COLOR_ADMIN_PURPLE,
} from "@/lib/constants"
import { useAuth } from "@/lib/auth"

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

    const { user } = useAuth()
    const userCreatedAt = user?.createdAt || 0

    useEffect(() => {
        const unsubscribeFunctions: (() => void)[] = []

        unsubscribeFunctions.push(onSnapshot(collection(db, COLLECTION_USERS), (snapshot) => {
            const allUserDocuments = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as any))
            const residentList = allUserDocuments.filter(userData => userData.role === "resident" && userData.isVerified !== false).map(userData => ({
                id: userData.id,
                name: userData.name,
                initials: userData.initials || "U",
                age: userData.dateOfBirth ? Math.floor((new Date().getTime() - new Date(userData.dateOfBirth).getTime()) / 31557600000) : 0,
                gender: (userData.gender || userData.sex || "Other") as "Male" | "Female" | "Other",
                address: userData.address || "",
                categories: userData.statuses || [userData.status].filter(Boolean) || [],
                status: (userData.status === "Expired" ? "Expired" : "Verified") as "Verified" | "Expired" | "Expiring",
                isVoter: (userData.statuses || []).includes("Registered Voter"),
                expiryDate: userData.accountExpiry || "",
                dateOfBirth: userData.dateOfBirth || "",
                contactNumber: userData.contactNumber || "",
                email: userData.email || "",
                profilePicture: userData.profilePicture || "",
                createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate().toISOString() : (userData.createdAt || new Date().toISOString()),
            }))
            setResidents(residentList)
            
            setStats(prev => ({ ...prev, 
                totalResidents: residentList.length, 
                activeResidents: residentList.length,
                seniorCount: residentList.filter(resident => resident.categories.includes("Senior Citizen")).length,
                minorCount: residentList.filter(resident => resident.categories.includes("Underage")).length,
                adultCount: residentList.filter(resident => resident.categories.includes("Adult") || resident.categories.includes("Resident")).length,
                voterCount: residentList.filter(resident => resident.isVoter).length
            }))
        }, (err) => console.error("users snapshot error:", err)))

        unsubscribeFunctions.push(onSnapshot(collection(db, COLLECTION_VERIFICATIONS), (snapshot) => {
            const allVerifications = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as PendingVerification))
            const pendingVerifications = allVerifications.filter(verification => !verification.status || verification.status === "pending")
            const rejectedVerificationsList = allVerifications.filter(verification => verification.status === "rejected")
            setVerifications(pendingVerifications)
            setRejectedVerifications(rejectedVerificationsList)
            setStats(prev => ({ ...prev, pendingVerifications: pendingVerifications.length }))
        }, (err) => console.error("verifications snapshot error:", err)))

        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_DOCUMENT_REQUESTS), orderBy("createdAt", "desc")), (snapshot) => {
            const allRequests = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as AdminDocumentRequest))
            setDocumentRequests(allRequests)
            
            const pendingRequests = allRequests.filter(request => request.status === "Pending")
            const approvedRequests = allRequests.filter(request => request.status === "Approved" || request.status === "On Process" || request.status === "Ready for Pick Up" || request.status === "Completed")
            const rejectedRequests = allRequests.filter(request => request.status === "Rejected")
            
            setStats(prev => ({
                ...prev,
                pendingRequests: pendingRequests.length,
                approvedRequests: approvedRequests.length,
                rejectedRequests: rejectedRequests.length,
                totalRequests: allRequests.length,
                totalDocumentsGenerated: approvedRequests.length
            }))
        }, (err) => console.error("documentRequests snapshot error:", err)))

        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_NOTIFICATIONS), where("targetId", "==", "admin")), (snapshot) => {
            let adminNotifications = snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as AdminNotification))
            adminNotifications = adminNotifications.filter(n => (n.createdAt || 0) >= userCreatedAt)
            adminNotifications.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            setNotifications(adminNotifications)
            setStats(prev => ({ ...prev, unreadNotifications: adminNotifications.filter(notification => !notification.isRead).length }))
        }, (err) => console.error("notifications snapshot error:", err)))

        unsubscribeFunctions.push(onSnapshot(query(collection(db, COLLECTION_ACTIVITY_LOGS), orderBy("timestamp", "desc")), (snapshot) => {
            setActivityLogs(snapshot.docs.map(snapshotDoc => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as ActivityLog)))
        }, (err) => console.error("activityLogs snapshot error:", err)))

        // A brief delay ensures all listeners are initialized before the UI renders data.
        setTimeout(() => setIsLoaded(true), 500)

        return () => unsubscribeFunctions.forEach(unsubscribe => unsubscribe())
    }, [userCreatedAt])

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
        addResident: useCallback(async () => {
            throw new Error("Residents cannot be added manually. They must register through the resident portal to maintain data integrity.")
        }, []),
        updateResident: useCallback(async (id: string, updates: Partial<AdminResident>, adminName?: string, residentName?: string, removePhotoReason?: string) => {
            await updateDoc(doc(db, COLLECTION_USERS, id), updates)
            if (removePhotoReason) {
                await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
                    targetId: id,
                    type: "warning",
                    title: "Profile Picture Removed",
                    message: `Your profile picture was removed by an administrator. Reason: ${removePhotoReason}`,
                    timestamp: "Just now",
                    isRead: false,
                    createdAt: Date.now()
                })
            }
            if (adminName && residentName) {
                let auditDetails = `Edited profile information for ${residentName}`
                if (removePhotoReason) {
                    auditDetails += `. Removed profile picture. Reason: ${removePhotoReason}`
                }
                
                await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
                    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                    timestamp: Date.now().toString(),
                    admin: { name: adminName, initials: adminName.charAt(0).toUpperCase(), color: COLOR_ADMIN_BLUE },
                    role: "Admin",
                    actionType: "Edited Resident",
                    details: auditDetails,
                    residentName: residentName,
                    targetId: id,
                    targetCollection: "residents"
                })
            }
        }, []),
        deleteResident: useCallback(async (id: string, adminName?: string, residentName?: string) => {
            // Soft-delete instead of physical delete: Firebase Auth would let the user log back in
            // and auto-recreate a blank profile if the Firestore document were physically removed.
            await updateDoc(doc(db, COLLECTION_USERS, id), { role: "Deleted" })
            if (adminName && residentName) {
                await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
                    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                    timestamp: Date.now().toString(),
                    admin: { name: adminName, initials: adminName.charAt(0).toUpperCase(), color: COLOR_ADMIN_RED },
                    role: "Admin",
                    actionType: "Deleted Resident",
                    details: `Deleted resident account for ${residentName}`,
                    residentName: residentName,
                    targetId: id,
                    targetCollection: "residents"
                })
            }
        }, []),
        deactivateResident: useCallback(async (id: string, adminName?: string, residentName?: string) => {
            await updateDoc(doc(db, COLLECTION_USERS, id), { status: "Expired" })
            if (adminName && residentName) {
                await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
                    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                    timestamp: Date.now().toString(),
                    admin: { name: adminName, initials: adminName.charAt(0).toUpperCase(), color: COLOR_ADMIN_AMBER },
                    role: "Admin",
                    actionType: "Deactivated Resident",
                    details: `Deactivated account for ${residentName}`,
                    residentName: residentName,
                    targetId: id,
                    targetCollection: "residents"
                })
            }
        }, []),
        activateResident: useCallback(async (id: string, adminName?: string, residentName?: string) => {
            await updateDoc(doc(db, COLLECTION_USERS, id), { status: "Active" })
            if (adminName && residentName) {
                await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date()),
                    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                    timestamp: Date.now().toString(),
                    admin: { name: adminName, initials: adminName.charAt(0).toUpperCase(), color: COLOR_ADMIN_GREEN },
                    role: "Admin",
                    actionType: "Activated Resident",
                    details: `Re-activated account for ${residentName}`,
                    residentName: residentName,
                    targetId: id,
                    targetCollection: "residents"
                })
            }
        }, []),

        // Verifications
        addVerification: useCallback(async () => {
            throw new Error("This operation is only permitted from the resident portal.")
        }, []),
        approveVerification: useCallback(async (id: string, adminName?: string, adminEmail?: string) => {
            await updateDoc(doc(db, COLLECTION_VERIFICATIONS, id), { status: "approved" })
            const verification = verifications.find(ver => ver.id === id)
            if (verification && verification.residentId) {
                if (verification.type === "profile-edit" && verification.changes) {
                    // Apply each changed field to the resident's user document.
                    const profileUpdates: Record<string, any> = {}
                    verification.changes.forEach((profileChange: any) => {
                        if (profileChange.field === "Full Name") profileUpdates.name = profileChange.newValue
                        if (profileChange.field === "Date of Birth") profileUpdates.dateOfBirth = profileChange.newValue
                        if (profileChange.field === "Contact Number") profileUpdates.contactNumber = profileChange.newValue
                        if (profileChange.field === "Email Address") profileUpdates.email = profileChange.newValue
                        if (profileChange.field === "Address") profileUpdates.address = profileChange.newValue
                        if (profileChange.field === "Resident Statuses") {
                            profileUpdates.statuses = profileChange.newValue === "None" ? [] : profileChange.newValue.split(", ")
                            if (profileUpdates.statuses.length > 0) profileUpdates.status = profileUpdates.statuses[0]
                        }
                    })
                    if (Object.keys(profileUpdates).length > 0) {
                        await updateDoc(doc(db, COLLECTION_USERS, verification.residentId), profileUpdates)
                    }

                    await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
                        targetId: verification.residentId,
                        type: "success",
                        title: "Profile Edit Approved",
                        message: "Your profile changes have been approved and applied.",
                        timestamp: "Just now",
                        isRead: false,
                        createdAt: Date.now()
                    })

                    if (adminName) {
                        await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                            admin: { name: adminName, email: adminEmail || "", initials: adminName.charAt(0).toUpperCase(), color: COLOR_ADMIN_GREEN },
                            actionType: "approved",
                            action: "Approved Profile Edit",
                            details: `Approved profile edits for Resident ID ${verification.residentId}`,
                            residentName: (verification as any).name || "Unknown Resident",
                            date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()),
                            time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                            timestamp: Date.now().toString()
                        })
                    }
                } else {
                    if (verification.type === "reactivation") {
                        await updateDoc(doc(db, COLLECTION_USERS, verification.residentId), { isVerified: true, status: "Active" })
                    } else {
                        await updateDoc(doc(db, COLLECTION_USERS, verification.residentId), { isVerified: true })
                    }
                    
                    const actionPrefix = verification.type === "reactivation" ? "Reactivation" : "Verification"
                    
                    await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
                        targetId: verification.residentId,
                        type: "success",
                        title: `${actionPrefix} Approved`,
                        message: `Your account ${actionPrefix.toLowerCase()} has been approved.`,
                        timestamp: "Just now",
                        isRead: false,
                        createdAt: Date.now()
                    })

                    if (adminName) {
                        await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                            admin: { name: adminName, email: adminEmail || "", initials: adminName.charAt(0).toUpperCase(), color: COLOR_ADMIN_GREEN },
                            actionType: "approved",
                            action: `Approved ${actionPrefix}`,
                            details: `Approved ${actionPrefix.toLowerCase()} for Resident ID ${verification.residentId}`,
                            residentName: (verification as any).name || "Unknown Resident",
                            date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()),
                            time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                            timestamp: Date.now().toString()
                        })
                    }
                }
            }
        }, [verifications]),
        rejectVerification: useCallback(async (id: string, reason: string, adminName?: string, adminEmail?: string) => {
            if (!reason || reason.trim().length < 10) {
                throw new Error("Rejection requires a reason of at least 10 characters.")
            }
            await updateDoc(doc(db, COLLECTION_VERIFICATIONS, id), { status: "rejected", rejectionReason: reason })
            const verification = verifications.find(ver => ver.id === id)
            if (verification && verification.residentId) {
                await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
                    targetId: verification.residentId,
                    type: "error",
                    title: "Verification Rejected",
                    message: `Your verification was rejected: ${reason}`,
                    timestamp: "Just now",
                    isRead: false,
                    createdAt: Date.now()
                })

                if (adminName) {
                    await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                        admin: { name: adminName, email: adminEmail || "", initials: adminName.charAt(0).toUpperCase(), color: COLOR_ADMIN_RED },
                        actionType: "rejected",
                        action: verification.type === "profile-edit" ? "Rejected Profile Edit" : (verification.type === "reactivation" ? "Rejected Reactivation" : "Rejected Verification"),
                        details: `Rejected ${verification.type === "profile-edit" ? "profile edit" : (verification.type === "reactivation" ? "reactivation" : "verification")} for Resident ID ${verification.residentId}. Reason: ${reason}`,
                        residentName: (verification as any).name || "Unknown Resident",
                        date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()),
                        time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                        timestamp: Date.now().toString()
                    })
                }
            }
        }, [verifications]),

        // Document Requests
        addDocumentRequest: useCallback(async () => {
            throw new Error("This operation is only permitted from the resident portal.")
        }, []),
        updateRequestStatus: useCallback(async (id: string, status: "Approved" | "On Process" | "Awaiting Payment" | "Ready for Pick Up" | "Completed" | "Rejected", reason?: string, adminName?: string, adminEmail?: string) => {
            try {
                if (status === "Rejected" && (!reason || reason.trim().length < 10)) {
                    throw new Error("Rejection requires a reason of at least 10 characters.")
                }

                await updateDoc(doc(db, COLLECTION_DOCUMENT_REQUESTS, id), { 
                    status, 
                    ...(reason ? { rejectReason: reason } : {}),
                    [`statusTimestamps.${status}`]: Date.now()
                })
                
                const documentRequest = documentRequests.find(request => request.id === id)
                if (documentRequest && documentRequest.residentId) {
                    await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
                        targetId: documentRequest.residentId,
                        type: status === "Rejected" ? "error" : "info",
                        title: `Document ${status}`,
                        message: `Your request for ${documentRequest.documentType} is now ${status}.${reason ? ` Reason: ${reason}` : ""}`,
                        timestamp: "Just now",
                        isRead: false,
                        createdAt: Date.now()
                    })

                    if (adminName) {
                        await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                            admin: { name: adminName, email: adminEmail || "", initials: adminName.charAt(0).toUpperCase(), color: status === "Rejected" ? COLOR_ADMIN_RED : COLOR_ADMIN_GREEN },
                            actionType: status.toLowerCase(),
                            action: `Updated Document Status`,
                            details: `Updated ${documentRequest.documentType} to ${status} for ${documentRequest.residentName}.${reason ? ` Reason: ${reason}` : ""}`,
                            residentName: documentRequest.residentName,
                            date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()),
                            time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                            timestamp: Date.now().toString()
                        })
                    }
                }
            } catch (error: any) {
                console.error("Error updating document request (id:", id, "):", error)
                throw error
            }
        }, [documentRequests]),
        deleteDocumentRequest: useCallback(async (id: string) => {
            await deleteDoc(doc(db, COLLECTION_DOCUMENT_REQUESTS, id))
        }, []),
        updateRequestGenerated: useCallback(async (id: string) => {
            await updateDoc(doc(db, COLLECTION_DOCUMENT_REQUESTS, id), { hasGenerated: true })
        }, []),

        confirmPayment: useCallback(async (id: string, adminName: string, adminEmail?: string, paymentMethodOverride?: "cash" | "gcash", paymentRefOverride?: string) => {
            const documentRequest = documentRequests.find(request => request.id === id)
            if (!documentRequest) return
            const receiptYear = new Date().getFullYear()
            const receiptNumber = `REC-${receiptYear}-${Date.now().toString().slice(-5)}`
            
            const paymentUpdates: any = {
                paymentStatus: "paid",
                paymentConfirmedAt: Date.now(),
                paymentConfirmedBy: adminName,
                receiptNumber,
            }
            if (documentRequest.status === "Pending" || documentRequest.status === "Awaiting Payment") {
                paymentUpdates.status = "On Process"
                paymentUpdates["statusTimestamps.On Process"] = Date.now()
            }

            if (paymentMethodOverride) paymentUpdates.paymentMethod = paymentMethodOverride
            if (paymentRefOverride) {
                if (paymentMethodOverride === "gcash") paymentUpdates.gcashRefNumber = paymentRefOverride
                else paymentUpdates.paymentReferenceNumber = paymentRefOverride
            }

            await updateDoc(doc(db, COLLECTION_DOCUMENT_REQUESTS, id), paymentUpdates)
            if (documentRequest.residentId) {
                await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
                    targetId: documentRequest.residentId,
                    type: "success",
                    title: "Payment Confirmed",
                    message: `Your payment for ${documentRequest.documentType} has been confirmed. Receipt #: ${receiptNumber}`,
                    timestamp: "Just now",
                    isRead: false,
                    createdAt: Date.now()
                })
                const confirmedPaymentMethod = paymentMethodOverride || documentRequest.paymentMethod || "Cash"
                await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                    admin: { name: adminName, email: adminEmail || "", initials: adminName.charAt(0).toUpperCase(), color: COLOR_ADMIN_GREEN },
                    actionType: "approved",
                    action: "Payment Confirmed",
                    details: `Confirmed ${confirmedPaymentMethod} payment for ${documentRequest.documentType} (${documentRequest.residentName}). Receipt: ${receiptNumber}`,
                    residentName: documentRequest.residentName,
                    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()),
                    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                    timestamp: Date.now().toString()
                })
            }
        }, [documentRequests]),

        markPayLater: useCallback(async (id: string, adminName: string, adminEmail?: string) => {
            const documentRequest = documentRequests.find(request => request.id === id)
            if (!documentRequest) return
            
            const { updateDoc, doc, collection, addDoc } = await import("firebase/firestore")
            const { db } = await import("@/lib/firebase")

            await updateDoc(doc(db, "document_requests", id), {
                paymentStatus: "unpaid",
                paymentMethod: "cash"
            })
            if (documentRequest.residentId) {
                await addDoc(collection(db, "notifications"), {
                    targetId: documentRequest.residentId,
                    type: "info",
                    title: "Payment Option Updated",
                    message: `Your payment method for ${documentRequest.documentType} was marked as Pay Later by the admin.`,
                    timestamp: "Just now",
                    isRead: false,
                    createdAt: Date.now()
                })
                await addDoc(collection(db, "activity_logs"), {
                    admin: { name: adminName, email: adminEmail || "", initials: adminName.charAt(0).toUpperCase(), color: "bg-blue-600" },
                    actionType: "updated",
                    action: "Payment Updated to Pay Later",
                    details: `Admin ${adminName} marked payment for ${documentRequest.documentType} as Pay Later.`,
                    residentName: documentRequest.residentName,
                    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()),
                    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                    timestamp: Date.now().toString()
                })
            }
        }, [documentRequests]),

        waivePayment: useCallback(async (id: string, adminName: string, adminEmail?: string) => {
            const documentRequest = documentRequests.find(request => request.id === id)
            if (!documentRequest) return
            await updateDoc(doc(db, COLLECTION_DOCUMENT_REQUESTS, id), {
                status: "On Process",
                paymentStatus: "waived",
                paymentConfirmedAt: Date.now(),
                paymentConfirmedBy: adminName,
                "statusTimestamps.On Process": Date.now()
            })
            if (documentRequest.residentId) {
                await addDoc(collection(db, COLLECTION_NOTIFICATIONS), {
                    targetId: documentRequest.residentId,
                    type: "info",
                    title: "Fee Waived",
                    message: `The document fee for your ${documentRequest.documentType} request has been waived.`,
                    timestamp: "Just now",
                    isRead: false,
                    createdAt: Date.now()
                })
                await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                    admin: { name: adminName, email: adminEmail || "", initials: adminName.charAt(0).toUpperCase(), color: COLOR_ADMIN_AMBER },
                    actionType: "approved",
                    action: "Fee Waived",
                    details: `Waived document fee for ${documentRequest.documentType} (${documentRequest.residentName}).`,
                    residentName: documentRequest.residentName,
                    date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date()),
                    time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                    timestamp: Date.now().toString()
                })
            }
        }, [documentRequests]),

        // Notifications
        addNotification: useCallback(async (input: Omit<AdminNotification, "id">) => {
            await addDoc(collection(db, COLLECTION_NOTIFICATIONS), { ...input, createdAt: Date.now() })
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
            await addDoc(collection(db, COLLECTION_ACTIVITY_LOGS), {
                ...input,
                time: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()),
                timestamp: Date.now()
            })
        }, []),
        clearActivityLogs: useCallback(async () => {
             // Delete all logs concurrently rather than sequentially to minimize total round-trip time.
             await Promise.all(activityLogs.map(activityLog => deleteDoc(doc(db, COLLECTION_ACTIVITY_LOGS, activityLog.id))))
        }, [activityLogs]),
    }
}
