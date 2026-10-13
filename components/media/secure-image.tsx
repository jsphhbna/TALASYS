"use client"

import { useState, useEffect } from "react"
import { auth } from "@/lib/firebase"
import { FileText, ExternalLink, Loader2 } from "lucide-react"

export function useSecureMediaUrl(
  originalUrl?: string | null,
  recordId?: string,
  recordType?: "verification" | "request" | "user"
) {
  const initiallySensitive = !!originalUrl && ["talasys/proofs", "talasys/receipts", "talasys/letters", "talasys/signatures", "talasys/residents"].some(folder => originalUrl.includes(folder))
  const [url, setUrl] = useState<string | null>(initiallySensitive ? null : (originalUrl || null))
  const [loading, setLoading] = useState(initiallySensitive)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    if (!originalUrl) {
      setUrl(null)
      setLoading(false)
      return
    }

    const isSensitive =
      originalUrl.includes("talasys/proofs") ||
      originalUrl.includes("talasys/receipts") ||
      originalUrl.includes("talasys/letters") ||
      originalUrl.includes("talasys/signatures") ||
      originalUrl.includes("talasys/residents")

    if (!isSensitive) {
      setUrl(originalUrl)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    const fetchSigned = async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) {
          if (isCurrent) {
            setUrl(null)
            setError("Sign in to view this protected media.")
          }
          return
        }

        const res = await fetch("/api/media/view", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            mediaUrl: originalUrl,
            recordId,
            recordType,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          if (isCurrent && data.deliveryUrl) {
            setUrl(data.deliveryUrl)
          }
        } else {
          const body = await res.json().catch(() => ({}))
          if (isCurrent) {
            setUrl(null)
            setError(body.error || "You are not authorized to view this protected media.")
          }
        }
      } catch (err: any) {
        if (isCurrent) {
          setError(err.message)
          setUrl(null)
        }
      } finally {
        if (isCurrent) setLoading(false)
      }
    }

    fetchSigned()
    return () => {
      isCurrent = false
    }
  }, [originalUrl, recordId, recordType])

  return { url, loading, error }
}

interface SecureMediaViewerProps {
  url?: string | null
  src?: string | null
  alt?: string
  className?: string
  recordId?: string
  recordType?: "verification" | "request" | "user"
  onZoom?: (url: string) => void
}

export function SecureMediaViewer({
  url,
  src,
  alt = "Document Evidence",
  className = "w-full max-h-64 object-cover",
  recordId,
  recordType,
  onZoom,
}: SecureMediaViewerProps) {
  const targetUrl = url || src
  const { url: secureUrl, loading, error } = useSecureMediaUrl(targetUrl, recordId, recordType)
  const isPdf = (targetUrl || "").toLowerCase().endsWith(".pdf")

  if (!targetUrl) {
    return <div className="text-xs text-slate-400 italic">No document available</div>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-slate-100 dark:bg-slate-900 rounded-lg">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !secureUrl) {
    return <div role="alert" className="p-4 text-sm text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-900">{error || "Protected media is unavailable."}</div>
  }

  if (isPdf) {
    return (
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-red-500" />
          <div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{alt}</p>
            <p className="text-2xs text-slate-400">PDF Document</p>
          </div>
        </div>
        <a
          href={secureUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 rounded-md hover:bg-blue-100"
        >
          View PDF <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    )
  }

  const activeSrc = secureUrl

  return (
    <button
      type="button"
      onClick={() => {
        if (activeSrc) onZoom?.(activeSrc)
      }}
      className="block w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 hover:opacity-95 transition-opacity"
    >
      <img
        src={activeSrc}
        alt={alt}
        className={`${className} cursor-zoom-in`}
      />
    </button>
  )
}
