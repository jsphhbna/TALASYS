"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, ArrowRight, X } from "lucide-react"
import Link from "next/link"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"

export function BackupReminderBanner() {
  const [needsBackup, setNeedsBackup] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "systemConfig", "backup_status"), (statusDoc) => {
      try {
        const data = statusDoc.data()
        
        if (!data?.lastBackupDate) {
          setNeedsBackup(true)
          return
        }

        // Compare using local timezone so it rolls over at exactly local midnight
        const todayStr = new Date().toLocaleDateString() 
        const backupDate = new Date(data.lastBackupDate)
        const lastBackupStr = backupDate.toLocaleDateString()

        if (lastBackupStr !== todayStr) {
          setNeedsBackup(true)
        } else {
          setNeedsBackup(false)
        }
      } catch (err) {
        console.error("Failed to check backup status", err)
      }
    }, (error) => {
      console.error("Failed to subscribe to backup status", error)
    })

    return () => unsubscribe()
  }, [])

  if (!needsBackup || dismissed) return null

  return (
    <div className="bg-red-500 text-white px-4 py-3 flex items-center justify-between shadow-md relative z-50">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-100" />
        <div className="text-sm font-medium">
          <span className="font-bold mr-1">Daily Backup Required:</span> 
          The database has not been backed up today. Please generate a backup to secure your data.
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Link 
          href="/superadmin/config" 
          className="text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors"
        >
          Go to Backups <ArrowRight className="w-3 h-3" />
        </Link>
        <button 
          onClick={() => setDismissed(true)}
          className="text-red-200 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
