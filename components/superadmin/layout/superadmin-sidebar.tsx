"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { useNavigationLoading } from "@/components/providers/navigation-loading-provider"
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
import {
  LayoutDashboard,
  UserCog,
  FileBarChart,
  PieChart,
  FolderKanban,
  Settings,
  ScrollText,
  Bell,
  LogOut,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/superadmin/dashboard", icon: LayoutDashboard },
  { name: "Admin Management", href: "/superadmin/admins", icon: UserCog },
  { name: "System Reports", href: "/superadmin/reports", icon: FileBarChart },
  { name: "Reason Analytics", href: "/superadmin/analytics", icon: PieChart },
  { name: "Category Reports", href: "/superadmin/category-reports", icon: FolderKanban },
  { name: "System Configuration", href: "/superadmin/config", icon: Settings },
  { name: "Audit Logs", href: "/superadmin/audit", icon: ScrollText },
  { name: "Notifications", href: "/admin/notifications", icon: Bell },
]

export function SuperAdminSidebarNav({ onItemClick }: { onItemClick?: () => void } = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const { beginNavigation, pendingPath } = useNavigationLoading()
  const activePath = pendingPath ?? pathname

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const isModifiedClick = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
    if (isModifiedClick || pathname === href) {
      if (onItemClick) onItemClick()
      return
    }

    e.preventDefault()
    beginNavigation(href)
    router.push(href)
    if (onItemClick) onItemClick()
  }

  return (
    <nav className="min-h-0 py-3 flex-1 overflow-y-auto overscroll-contain">
      {navigation.map((item) => {
        const isActive = activePath === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.name}
            href={item.href}
            title={item.name}
            aria-label={item.name}
            onClick={(e) => handleNavClick(e, item.href)}
            className={cn(
              "flex items-center gap-2 mx-1 mb-0.5 px-2.5 py-2 text-sm-minus transition-colors rounded-md relative",
              isActive
                ? "bg-white/10 text-white font-medium"
                : "text-blue-200/70 hover:text-white hover:bg-white/5 font-medium",
            )}
          >
            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#C5A55A] rounded-r-full" />}
            <Icon className="w-4 h-4 shrink-0" />
            <span className="font-medium leading-snug">{item.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function SuperAdminSidebar() {
  const { logout } = useAuth()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleLogout = () => {
    setShowLogoutDialog(false)
    logout()
  }

  return (
    <>
      <aside className="hidden md:flex w-[236px] lg:w-[244px] xl:w-[252px] 2xl:w-[260px] shrink-0 min-h-0 bg-[#0C2340] dark:bg-slate-800 z-20 isolate h-[calc(100vh-4rem)] sticky top-16 flex-col" role="navigation">
        <SuperAdminSidebarNav />
        <div className="p-2.5 border-t border-white/10 shrink-0">
          <button
            onClick={() => setShowLogoutDialog(true)}
            title="Sign Out"
            aria-label="Sign Out"
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm-minus text-blue-200/70 hover:text-white hover:bg-white/5 rounded-md transition-colors font-medium"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Sign Out</span>
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
            <Button onClick={handleLogout} className="bg-[#0C2340] dark:bg-slate-800 hover:bg-[#1a3a5c]">Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
