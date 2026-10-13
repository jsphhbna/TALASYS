"use client"

import { useEffect, useState } from "react"
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Clock, Download, Loader2 } from "lucide-react"

export function BackupHistoryList() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryTrigger, setRetryTrigger] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const q = query(
      collection(db, "backupLogs"),
      orderBy("timestamp", "desc"),
      limit(5)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setLogs(fetchedLogs)
      setError(null)
      setLoading(false)
    }, (err) => {
      console.error("Error fetching backup logs:", err)
      setError(err?.message || "Failed to load backup logs")
      setLoading(false)
    })

    return () => unsubscribe()
  }, [retryTrigger])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading history...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center text-sm text-red-600 dark:text-red-400">
        <p className="font-medium">Failed to load backup history: {error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); setRetryTrigger(c => c + 1) }}
          className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 underline inline-block cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        No backups have been generated yet.
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {logs.map((log) => {
        const dateObj = new Date(log.timestamp)
        const dateStr = dateObj.toLocaleDateString(undefined, { 
          year: 'numeric', month: 'short', day: 'numeric' 
        })
        const timeStr = dateObj.toLocaleTimeString(undefined, { 
          hour: '2-digit', minute: '2-digit' 
        })
        
        return (
          <div key={log.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {dateStr} at {timeStr}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                  Format: {log.type || 'unknown'}
                </p>
              </div>
            </div>
            <div className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <Download className="w-3 h-3" />
              Successful
            </div>
          </div>
        )
      })}
    </div>
  )
}
