"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
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
]

export function SuperAdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout } = useAuth()
  const { beginNavigation, pendingPath } = useNavigationLoading()
  const activePath = pendingPath ?? pathname
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

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
      <aside className="w-[232px] shrink-0 bg-[#0C2340] h-screen sticky top-0 flex flex-col" role="navigation">
        <nav className="py-3 flex-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = activePath === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className={cn(
                  "flex items-center gap-3 mx-2 mb-0.5 px-4 py-2.5 text-[13px] transition-colors rounded-md relative",
                  isActive
                    ? "bg-white/10 text-white font-semibold"
                    : "text-blue-200/60 hover:text-white hover:bg-white/5",
                )}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#C5A55A] rounded-r-full" />}
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
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
