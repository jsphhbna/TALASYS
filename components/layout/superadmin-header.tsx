"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { BrandMark } from "@/components/layout/brand-mark"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export function SuperAdminHeader() {
  const { user, logout } = useAuth()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleLogout = () => {
    setShowLogoutDialog(false)
    logout()
  }

  return (
    <>
      <header
        className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center justify-between px-4 sm:px-6 shadow-md border-b border-[#1a3a5c]/50"
        role="banner"
      >
        <BrandMark subtitle="Super Admin Portal" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 focus:outline-none group">
              <span className="text-blue-100/80 text-sm hidden sm:inline group-hover:text-white transition-colors">
                Super Admin
              </span>
              <div className="w-8 h-8 rounded-full bg-[#C5A55A]/20 border border-[#C5A55A]/40 flex items-center justify-center hover:bg-[#C5A55A]/30 transition-colors cursor-pointer">
                <span className="text-[#C5A55A] text-xs font-semibold">{user?.initials}</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">{user?.name || "Super Admin"}</p>
                <p className="text-xs text-muted-foreground">Super Administrator</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowLogoutDialog(true)}
              className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Sign Out</DialogTitle>
            <DialogDescription>Are you sure you want to sign out of your account?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogoutDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogout} className="bg-[#0C2340] hover:bg-[#1a3a5c]">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
