"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { BrandMark } from "@/components/layout/brand-mark"
import { ThemeToggle } from "@/components/theme-toggle"
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
import { User, LogOut } from "lucide-react"

export function Header() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleLogout = () => {
    setShowLogoutDialog(false)
    logout()
  }

  return (
    <>
      <header
        className="h-16 bg-gradient-to-r from-[#0C2340] to-[#1a3a5c] flex items-center justify-between px-4 sm:px-8 shadow-md border-b border-[#1a3a5c]/50"
        role="banner"
      >
        <BrandMark subtitle="Barangay Digital Services" />

        <div className="flex items-center gap-4">
          <ThemeToggle />
          {user && (
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 focus:outline-none group">
                <span className="text-blue-100/80 text-sm hidden md:inline group-hover:text-white transition-colors">
                  {user.name}
                </span>
                <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm hover:bg-white/20 transition-colors cursor-pointer">
                  <span className="text-white text-sm font-medium">{user.initials}</span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/profile")} className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                My Profile
              </DropdownMenuItem>
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
        )}
        </div>
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
