"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { 
  useAuth, 
  isVerificationOnlyRole, 
  isDocumentProcessingRole, 
  isResidentManagementRole, 
  isReadOnlyAdminRole 
} from "@/lib/auth"
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
import { useAdminData } from "@/hooks/admin"
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  FilePlus,
  BarChart3,
  Bell,
  ClipboardList,
  LogOut,
  ChevronDown,
  UserPlus,
  FileEdit,
  RefreshCw,
  History,
  Layers,
  ListOrdered,
  CreditCard,
} from "lucide-react"

const baseNavigation = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Resident Management", href: "/admin/residents", icon: Users },
  { name: "Verifications", href: "/admin/verifications", icon: ShieldCheck },
  { name: "Document Processing", href: "/admin/requests", icon: Layers },
  { name: "Category Reports", href: "/admin/reports", icon: BarChart3 },
  { name: "Notifications", href: "/admin/notifications", icon: Bell },
  { name: "Activity Logs", href: "/admin/logs", icon: ClipboardList },
]

const verifSubItems = [
  { name: "New Registrations", href: "/admin/verifications", icon: UserPlus },
  { name: "Profile Edits", href: "/admin/verifications/profile-edits", icon: FileEdit },
  { name: "Reactivation", href: "/admin/verifications/reactivation", icon: RefreshCw },
  { name: "History", href: "/admin/verifications/history", icon: History },
]

const residentsSubItems = [
  { name: "Residents", href: "/admin/residents", icon: Users },
  { name: "Statistics", href: "/admin/residents/statistics", icon: BarChart3 },
]

const docSubItems = [
  { name: "Processing Queue", href: "/admin/requests", icon: ListOrdered },
  { name: "Payment Process", href: "/admin/requests/payments", icon: CreditCard },
  { name: "Generate Documents", href: "/admin/generate", icon: FilePlus },
  { name: "Statistics", href: "/admin/requests/statistics", icon: BarChart3 },
  { name: "History", href: "/admin/requests/history", icon: History },
]

export function AdminSidebarNav({ onItemClick }: { onItemClick?: () => void } = {}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const { beginNavigation, pendingPath } = useNavigationLoading()
  const activePath = pendingPath ?? pathname
  const [isVerifOpen, setIsVerifOpen] = useState(true)
  const [isResidentsOpen, setIsResidentsOpen] = useState(true)
  const [isDocOpen, setIsDocOpen] = useState(true)

  const { stats, verifications } = useAdminData()
  const badges = {
    pendingVerifs: stats.pendingVerifications || 0,
    pendingRequests: stats.pendingRequests || 0
  }

  const verifCounts = {
    registration: verifications?.filter((v: any) => v.type === "registration").length ?? 0,
    "profile-edit": verifications?.filter((v: any) => v.type === "profile-edit").length ?? 0,
    reactivation: verifications?.filter((v: any) => v.type === "reactivation").length ?? 0,
  }

  const allowedNavNames = getAdminNavigationNames(user?.role)

  const navigation = baseNavigation
    .filter(item => allowedNavNames.includes(item.name))
    .map(item => ({
    ...item,
    badge: item.name === "Verifications" && badges.pendingVerifs > 0
      ? badges.pendingVerifs
      : item.name === "Document Processing" && badges.pendingRequests > 0
        ? badges.pendingRequests
        : undefined,
  }))

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const isModifiedClick = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
    const isSameExact = pathname === href
    if (isModifiedClick || isSameExact) {
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
        const isVerifItem = item.href === "/admin/verifications"
        const isResidentsItem = item.href === "/admin/residents"
        const isDocItem = item.name === "Document Processing"
        const Icon = item.icon

        if (isDocItem) {
          return (
            <div key={item.name}>
              <button
                onClick={() => setIsDocOpen(v => !v)}
                className="w-full flex items-center justify-between mx-1.5 mb-0.5 px-2.5 py-2 text-sm-minus transition-colors rounded-md text-blue-200/60 hover:text-white hover:bg-white/5 font-medium"
                style={{ width: 'calc(100% - 12px)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate whitespace-nowrap">Document Processing</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  {(item.badge ?? 0) > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[16px] px-1 bg-red-500 text-white text-2xs rounded-full font-medium">
                      {item.badge}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isDocOpen ? "rotate-180" : ""}`} />
                </div>
              </button>
              {isDocOpen && (
                <div className="ml-3 mb-1 border-l border-white/10 pl-1.5">
                  {docSubItems.map(sub => {
                    const isSubActive = activePath === sub.href ||
                      (sub.href === "/admin/generate" && activePath.startsWith("/admin/generate")) ||
                      (sub.href === "/admin/requests/payments" && activePath.startsWith("/admin/requests/payments")) ||
                      (sub.href === "/admin/requests/payment-history" && activePath.startsWith("/admin/requests/payment-history")) ||
                      (sub.href === "/admin/requests" && activePath === "/admin/requests")
                    const SubIcon = sub.icon
                    const subBadge = sub.href === "/admin/requests" ? (badges.pendingRequests ?? 0) : 0
                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        onClick={(e) => handleNavClick(e, sub.href)}
                        className={`flex items-center justify-between mx-1 mb-0.5 px-2.5 py-1.5 text-xs transition-colors rounded-md relative ${
                          isSubActive ? "bg-white/10 text-white font-medium" : "text-blue-200/50 hover:text-white hover:bg-white/5 font-medium"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isSubActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-[#C5A55A] rounded-r-full" />}
                          <SubIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">{sub.name}</span>
                        </div>
                        {subBadge > 0 && (
                          <span className="flex items-center justify-center min-w-[16px] h-[15px] px-1 bg-red-500 text-white text-2xs rounded-full font-bold shrink-0 ml-1">
                            {subBadge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }

        if (isResidentsItem) {
          return (
            <div key={item.name}>
              <button
                onClick={() => setIsResidentsOpen(v => !v)}
                className="w-full flex items-center justify-between mx-1.5 mb-0.5 px-2.5 py-2 text-sm-minus transition-colors rounded-md text-blue-200/60 hover:text-white hover:bg-white/5 font-medium"
                style={{ width: 'calc(100% - 12px)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate whitespace-nowrap">Resident Management</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ml-1 ${isResidentsOpen ? "rotate-180" : ""}`} />
              </button>
              {isResidentsOpen && (
                <div className="ml-3 mb-1 border-l border-white/10 pl-1.5">
                  {residentsSubItems.map(sub => {
                    const isSubActive = activePath === sub.href
                    const SubIcon = sub.icon
                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        onClick={(e) => handleNavClick(e, sub.href)}
                        className={`flex items-center gap-2 mx-1 mb-0.5 px-2.5 py-1.5 text-xs transition-colors rounded-md relative ${
                          isSubActive ? "bg-white/10 text-white font-medium" : "text-blue-200/50 hover:text-white hover:bg-white/5 font-medium"
                        }`}
                      >
                        {isSubActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-[#C5A55A] rounded-r-full" />}
                        <SubIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate whitespace-nowrap">{sub.name}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }

        if (isVerifItem) {
          return (
            <div key={item.name}>
              <button
                onClick={() => setIsVerifOpen(v => !v)}
                className="w-full flex items-center justify-between mx-1.5 mb-0.5 px-2.5 py-2 text-sm-minus transition-colors rounded-md text-blue-200/60 hover:text-white hover:bg-white/5 font-medium"
                style={{ width: 'calc(100% - 12px)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate whitespace-nowrap">Verifications</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  {(item.badge ?? 0) > 0 && (
                    <span className="flex items-center justify-center min-w-[18px] h-[16px] px-1 bg-red-500 text-white text-2xs rounded-full font-medium">
                      {item.badge}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isVerifOpen ? "rotate-180" : ""}`} />
                </div>
              </button>

              {isVerifOpen && (
                <div className="ml-3 mb-1 border-l border-white/10 pl-1.5">
                  {verifSubItems.map(sub => {
                    const isSubActive = activePath === sub.href
                    const SubIcon = sub.icon
                    const typeKey = sub.href === "/admin/verifications" ? "registration"
                      : sub.href === "/admin/verifications/profile-edits" ? "profile-edit"
                      : sub.href === "/admin/verifications/reactivation" ? "reactivation"
                      : null
                    const subBadge = typeKey ? (verifCounts as any)[typeKey] : 0
                    return (
                      <Link
                        key={sub.name}
                        href={sub.href}
                        onClick={(e) => handleNavClick(e, sub.href)}
                        className={`flex items-center justify-between mx-1 mb-0.5 px-2.5 py-1.5 text-xs transition-colors rounded-md relative ${
                          isSubActive ? "bg-white/10 text-white font-medium" : "text-blue-200/50 hover:text-white hover:bg-white/5 font-medium"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isSubActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-[#C5A55A] rounded-r-full" />}
                          <SubIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate whitespace-nowrap">{sub.name}</span>
                        </div>
                        {subBadge > 0 && (
                          <span className="flex items-center justify-center min-w-[16px] h-[15px] px-1 bg-red-500 text-white text-2xs rounded-full font-bold shrink-0 ml-1">
                            {subBadge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        }

        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={(e) => handleNavClick(e, item.href)}
            className={cn(
              "flex items-center justify-between mx-1.5 mb-0.5 px-2.5 py-2 text-sm-minus transition-colors rounded-md relative",
              isActive
                ? "bg-white/10 text-white font-medium"
                : "text-blue-200/60 hover:text-white hover:bg-white/5 font-medium",
            )}
          >
            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#C5A55A] rounded-r-full" />}
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate whitespace-nowrap">{item.name}</span>
            </div>
            {(item.badge ?? 0) > 0 && (
              <span className="flex items-center justify-center min-w-[18px] h-[16px] px-1 bg-red-500 text-white text-2xs rounded-full font-medium shrink-0 ml-1">
                {item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

export function getAdminNavigationNames(userRole?: string | null): string[] {
  if (isVerificationOnlyRole(userRole)) return ["Verifications"]
  if (isDocumentProcessingRole(userRole)) return ["Dashboard", "Document Processing", "Notifications"]
  if (isResidentManagementRole(userRole)) return ["Dashboard", "Resident Management", "Category Reports", "Notifications"]
  if (isReadOnlyAdminRole(userRole)) return ["Dashboard", "Resident Management", "Verifications", "Document Processing", "Category Reports", "Notifications", "Activity Logs"]
  return baseNavigation.map(item => item.name)
}

export function AdminSidebar() {
  const { logout } = useAuth()
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const handleLogout = () => {
    setShowLogoutDialog(false)
    logout()
  }

  return (
    <>
      <aside className="hidden md:flex w-[216px] lg:w-[220px] xl:w-[224px] 2xl:w-[232px] shrink-0 min-h-0 bg-[#0C2340] dark:bg-slate-800 h-[calc(100vh-4rem)] sticky top-16 flex-col" role="navigation">
        <AdminSidebarNav />
        <div className="p-2.5 border-t border-white/10 shrink-0">
          <button
            onClick={() => setShowLogoutDialog(true)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-sm-minus text-blue-200/60 hover:text-white hover:bg-white/5 rounded-md transition-colors font-medium"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Sign Out</span>
          </button>
        </div>
      </aside>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
            <DialogDescription>Are you sure you want to sign out? You will need to enter your credentials to access your account again.</DialogDescription>
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
