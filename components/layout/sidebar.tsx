"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"
import { useNavigationLoading } from "@/components/providers/navigation-loading-provider"
import { useResidentData } from "@/hooks/use-resident-data"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { LayoutDashboard, User, FileText, Clock, Bell, LogOut } from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  badge?: number
}

const navItemsBase: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: "My Profile", href: "/profile", icon: <User className="w-4 h-4" /> },
  { label: "Request Document", href: "/request", icon: <FileText className="w-4 h-4" /> },
  { label: "Request History", href: "/history", icon: <Clock className="w-4 h-4" /> },
  { label: "Notifications", href: "/notifications", icon: <Bell className="w-4 h-4" /> },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout } = useAuth()
  const { unreadCount } = useResidentData()
  const { beginNavigation, pendingPath } = useNavigationLoading()
  const activePath = pendingPath ?? pathname
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const navItems = navItemsBase.map((item) =>
    item.href === "/notifications" ? { ...item, badge: unreadCount } : item,
  )

  const handleLogout = () => {
    setShowLogoutDialog(false)
    logout()
  }

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const isModifiedClick = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
    if (isModifiedClick || pathname === href) {
      return
    }

    e.preventDefault()
    beginNavigation(href)
    router.push(href)
  }

  return (
    <>
      <aside className="hidden md:flex w-[232px] shrink-0 bg-[#0C2340] h-screen sticky top-0 flex-col" role="navigation">
        <nav className="flex-1 pt-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activePath === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className={cn(
                  "flex items-center gap-3 mx-2 mb-0.5 px-4 py-2.5 rounded-md text-[13px] relative transition-colors",
                  isActive
                    ? "bg-white/10 text-white font-semibold"
                    : "text-blue-200/60 hover:text-white hover:bg-white/5",
                )}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#C5A55A] rounded-r-full" />}
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-medium">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <button
            onClick={() => setShowLogoutDialog(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-blue-200/60 hover:text-white hover:bg-white/5 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

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
