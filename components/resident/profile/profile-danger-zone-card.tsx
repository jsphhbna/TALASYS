"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface ProfileDangerZoneCardProps {
  onDeleteAccount?: () => void
}

export function ProfileDangerZoneCard({ onDeleteAccount }: ProfileDangerZoneCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [countdown, setCountdown] = useState(10)

  useEffect(() => {
    let timer: NodeJS.Timeout
    if (isDeleting && countdown > 0) {
      timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000)
    } else if (isDeleting && countdown === 0) {
      // Execute the actual deletion when countdown hits 0
      setIsDeleting(false)
      setIsDialogOpen(false)
      if (onDeleteAccount) onDeleteAccount()
    }
    return () => clearTimeout(timer)
  }, [isDeleting, countdown, onDeleteAccount])

  const handleCancelDeletion = () => {
    setIsDeleting(false)
    setCountdown(10)
    setIsDialogOpen(false)
  }

  const handleStartDeletion = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDeleting(true)
  }

  // If dialog closes via overlay or esc key, we should abort
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancelDeletion()
    } else {
      setIsDialogOpen(true)
    }
  }

  return (
    <Card className="p-6 border-red-100 dark:border-red-900/30 mt-6 shadow-sm bg-white dark:bg-slate-900">
      <h3 className="text-base font-semibold text-red-600 dark:text-red-500 mb-5">Danger Zone</h3>
      
      <div className="flex flex-col sm:flex-row gap-6 items-center justify-between p-4 bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Delete Account</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
            Permanently remove your account and all data. This action cannot be undone and will immediately log you out.
          </p>
        </div>
        <AlertDialog open={isDialogOpen} onOpenChange={handleOpenChange}>
          <AlertDialogTrigger asChild>
            <button
              className="px-6 py-2.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-500 text-sm font-semibold rounded-md border border-red-200 dark:border-red-900/50 hover:bg-red-600 dark:hover:bg-red-600 hover:text-white dark:hover:text-white transition-colors whitespace-nowrap shadow-sm w-full sm:w-auto"
            >
              Delete Account
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isDeleting ? "Account Deletion in Progress" : "Are you absolutely sure?"}
              </AlertDialogTitle>
              <AlertDialogDescription className={isDeleting ? "text-center py-4" : ""}>
                {isDeleting ? (
                  <span className="text-3xl font-bold text-red-600 animate-pulse block my-2">
                    {countdown}
                  </span>
                ) : (
                  "This action cannot be undone. This will permanently delete your account and all associated records from our servers."
                )}
                {isDeleting && (
                  <span className="text-sm text-slate-500 dark:text-slate-400 block mt-2">
                    Deleting your account in {countdown} seconds...
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className={isDeleting ? "sm:justify-center" : ""}>
              {isDeleting ? (
                <button 
                  onClick={handleCancelDeletion}
                  className="px-6 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-900 dark:text-slate-100 font-medium rounded transition-colors w-full sm:w-auto"
                >
                  Abort Deletion
                </button>
              ) : (
                <>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <button 
                    onClick={handleStartDeletion} 
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded transition-colors"
                  >
                    Continue
                  </button>
                </>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  )
}
