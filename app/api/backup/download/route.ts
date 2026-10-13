import { NextResponse } from "next/server"
import { adminDb, adminAuth } from "@/lib/firebase-admin"
import * as xlsx from "xlsx"
import { rateLimit } from "@/lib/rate-limit"

async function handleBackupDownload(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown"
    const { success, resetTime } = rateLimit(`backup:${ip}`, 2, 10000) // 2 requests per 10s
    
    if (!success) {
      return NextResponse.json(
        { error: "Too Many Requests. Please wait before retrying." }, 
        { 
          status: 429,
          headers: {
            "X-RateLimit-Reset": resetTime.toString(),
            "Cache-Control": "no-store, no-cache, must-revalidate, private"
          }
        }
      )
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") || "json"

    // #53: Prohibit placing privileged bearer tokens in URLs
    if (searchParams.get("token")) {
      return NextResponse.json(
        { error: "Security violation: Privileged bearer token in URL query parameter is prohibited (#53). Transmit token via Authorization: Bearer header." },
        { status: 400, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
      )
    }

    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing Authorization header with Bearer token" },
        { status: 401, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
      )
    }

    const token = authHeader.split("Bearer ")[1].trim()

    if (!adminDb || !adminAuth) {
      return NextResponse.json(
        { error: "Firebase Admin not configured on this server." },
        { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
      )
    }

    let decodedToken
    try {
      // checkRevoked = true enforces immediate revocation checks (#53)
      decodedToken = await adminAuth.verifyIdToken(token, true)
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or revoked authentication token." },
        { status: 401, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
      )
    }

    // Authorize caller against Firestore user profile
    const userDoc = await adminDb.collection("users").doc(decodedToken.uid).get()
    const userData = userDoc.data()
    const role = userData?.role
    const status = userData?.status

    if (
      !userDoc.exists || 
      !["superadmin", "SuperAdmin", "Super Admin"].includes(role) ||
      status === "Locked" ||
      status === "Deleted"
    ) {
      return NextResponse.json(
        { error: "Forbidden: Requires active Super Admin privileges." },
        { status: 403, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
      )
    }

    const collectionsToBackup = [
      "users", 
      "documentRequests", 
      "verifications", 
      "notifications", 
      "activityLogs", 
      "systemAlerts", 
      "systemConfig"
    ]
    const backupData: Record<string, any[]> = {}

    for (const colName of collectionsToBackup) {
      const snap = await adminDb.collection(colName).get()
      backupData[colName] = snap.docs.map((doc: any) => ({
        _id: doc.id,
        ...doc.data()
      }))
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")

    // Record backup log in Firestore
    try {
      await adminDb.collection("backupLogs").add({
        timestamp: Date.now(),
        date: new Date().toISOString(),
        initiatedBy: userData?.name || "Super Admin",
        format: type,
        totalCollections: collectionsToBackup.length,
        status: "success"
      })
    } catch (logErr) {
      console.warn("Could not log backup to Firestore:", logErr)
    }

    if (type === "json") {
      const jsonString = JSON.stringify(backupData, null, 2)
      return new NextResponse(jsonString, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="backup-${timestamp}.json"`,
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          "Pragma": "no-cache"
        }
      })
    }

    if (type === "excel") {
      const wb = xlsx.utils.book_new()

      for (const [collectionName, data] of Object.entries(backupData)) {
        if (data.length === 0) {
          const ws = xlsx.utils.json_to_sheet([{ _empty: "No data" }])
          xlsx.utils.book_append_sheet(wb, ws, collectionName)
          continue
        }

        const flatData = data.map(item => {
          const flat: any = {}
          for (const [key, val] of Object.entries(item)) {
            // Guard prototype pollution keys
            if (key === "__proto__" || key === "constructor" || key === "prototype") continue
            flat[key] = typeof val === "object" && val !== null ? JSON.stringify(val) : val
          }
          return flat
        })

        const ws = xlsx.utils.json_to_sheet(flatData)
        xlsx.utils.book_append_sheet(wb, ws, collectionName)
      }

      const excelBuffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" })
      
      return new NextResponse(excelBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="backup-${timestamp}.xlsx"`,
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
          "Pragma": "no-cache"
        }
      })
    }

    return NextResponse.json({ error: "Invalid type requested" }, { status: 400 })
  } catch (error: any) {
    console.error("Backup generation error:", error)
    return NextResponse.json(
      { error: "Internal Server Error during backup export." },
      { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } }
    )
  }
}

export async function GET(request: Request) {
  return handleBackupDownload(request)
}

export async function POST(request: Request) {
  return handleBackupDownload(request)
}
