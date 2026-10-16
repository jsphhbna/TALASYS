"use client"

import { auth } from "@/lib/firebase"

export async function callAdminOperation(operation: string, options: { targetId?: string; payload?: Record<string, unknown>; operationId?: string } = {}) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error("Active administrator session required.")
  const response = await fetch("/api/admin/operations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ operation, operationId: options.operationId || crypto.randomUUID(), targetId: options.targetId, payload: options.payload }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err: any = new Error(result.error || "Administrator operation failed.")
    err.status = response.status
    err.statusCode = response.status
    err.conflictingFields = result.conflictingFields
    throw err
  }
  return result
}

export async function updateResidentIdentity(residentId: string, newEmail: string, profileUpdates: Record<string, unknown>) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error("Active administrator session required.")
  const operationId = crypto.randomUUID()
  const response = await fetch("/api/admin/update-resident-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ residentId, newEmail, profileUpdates, operationId, attemptId: crypto.randomUUID() }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || "Resident identity update failed.")
  return result
}
