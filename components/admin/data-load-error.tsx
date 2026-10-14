"use client"

import { AlertTriangle, RefreshCw } from "lucide-react"
import { describeDataLoadError } from "../../lib/admin/data-load-error-state"

export function DataLoadError({ error, retry, hasData }: { error?: string | null; retry: () => void; hasData: boolean }) {
  if (!error) return null
  const message = describeDataLoadError(error, hasData)
  return (
    <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div><p className="text-sm font-semibold">{message.title}</p><p className="text-xs">{message.detail}</p></div>
      </div>
      <button type="button" onClick={retry} className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-amber-400 bg-white px-3 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</button>
    </div>
  )
}
