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
import type { AuthUser } from "@/lib/auth-context"

interface ProfileAccountInfoCardProps {
  user: AuthUser
  onDeleteAccount?: () => void
}

function formatAccountCreated(createdAt?: number): string {
  if (!createdAt) return "N/A"
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(createdAt))
}

function computeDaysRemaining(accountExpiry: string): number {
  if (!accountExpiry) return 0
  // Parse the formatted date string (e.g. "Jun 23, 2028")
  const expiryDate = new Date(accountExpiry)
  if (isNaN(expiryDate.getTime())) return 0
  const now = new Date()
  const diff = expiryDate.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function ProfileAccountInfoCard({ user, onDeleteAccount }: ProfileAccountInfoCardProps) {
  const daysRemaining = computeDaysRemaining(user.accountExpiry)
  const isExpired = daysRemaining <= 0
  const isExpiring = daysRemaining > 0 && daysRemaining <= 30

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
    <Card className="p-6">
      <h3 className="text-base font-semibold text-[#0C2340] mb-5">Account Information</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <p className="text-xs text-slate-600 mb-1">Account Created</p>
          <p className="text-sm text-slate-900">{formatAccountCreated(user.createdAt)}</p>
        </div>

        <div>
          <p className="text-xs text-slate-600 mb-1">Account Expiry</p>
          <p className="text-sm text-slate-900">{user.accountExpiry || "N/A"}</p>
        </div>

        <div>
          <p className="text-xs text-slate-600 mb-2">Verification Status</p>
          {user.isVerified ? (
            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700">
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
              Pending Verification
            </span>
          )}
        </div>

        <div>
          <p className="text-xs text-slate-600 mb-1">Days Remaining</p>
          <p className={`text-sm font-bold ${isExpired ? "text-red-500" : isExpiring ? "text-amber-500" : "text-green-500"}`}>
            {isExpired ? "Expired" : `${daysRemaining} days`}
          </p>
        </div>
      </div>

      {(isExpiring || isExpired) && (
        <div className="mt-8 border-t border-slate-100 pt-6">
          <h4 className="text-sm font-semibold text-[#0C2340] mb-4">Reactivation Process</h4>
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#0C2340] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-medium">1</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900">Re-upload Documents</p>
                  <p className="text-[11px] text-slate-500">Submit new proof of residency.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-slate-600 text-[10px]">2</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-900">Admin Verification</p>
                  <p className="text-[11px] text-slate-500">Wait for admin approval.</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-center sm:justify-end min-w-[200px]">
              <div className="w-full relative group">
                <button
                  disabled={!isExpired}
                  className={`w-full py-2.5 px-4 text-sm font-medium rounded transition-colors ${
                    isExpired
                      ? "bg-[#0C2340] text-white hover:bg-[#1a3a5c]"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  Request Reactivation
                </button>
                {!isExpired && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-[11px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    Account must be expired to request
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Section */}
      <div className="mt-8 border-t border-slate-100 pt-6">
        <h4 className="text-sm font-semibold text-red-600 mb-2">Danger Zone</h4>
        <div className="flex flex-col sm:flex-row gap-6 items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-900">Delete Account</p>
            <p className="text-[11px] text-slate-500">Permanently remove your account and all data.</p>
          </div>
          <AlertDialog open={isDialogOpen} onOpenChange={handleOpenChange}>
            <AlertDialogTrigger asChild>
              <button
                className="px-4 py-2 bg-red-50 text-red-600 text-xs font-semibold rounded hover:bg-red-100 transition-colors whitespace-nowrap"
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
                    <span className="text-sm text-slate-500 block mt-2">
                      Deleting your account in {countdown} seconds...
                    </span>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className={isDeleting ? "sm:justify-center" : ""}>
                {isDeleting ? (
                  <button 
                    onClick={handleCancelDeletion}
                    className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded transition-colors w-full sm:w-auto"
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
      </div>
    </Card>
  )
}
