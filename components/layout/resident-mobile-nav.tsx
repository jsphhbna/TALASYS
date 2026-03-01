"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, User, FileText, Clock, Bell } from "lucide-react"
import { cn } from "@/lib/utils"
import { useNavigationLoading } from "@/components/providers/navigation-loading-provider"
import { useResidentData } from "@/hooks/use-resident-data"

interface ResidentMobileNavItem {
  label: string
  href: string
  icon: typeof LayoutDashboard
  badge?: number
}

const residentNavItems: ResidentMobileNavItem[] = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Profile", href: "/profile", icon: User },
  { label: "Request", href: "/request", icon: FileText },
  { label: "History", href: "/history", icon: Clock },
  { label: "Alerts", href: "/notifications", icon: Bell },
]

export function ResidentMobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { unreadCount } = useResidentData()
  const { beginNavigation, pendingPath } = useNavigationLoading()
  const activePath = pendingPath ?? pathname

  const navItems: ResidentMobileNavItem[] = residentNavItems.map((item) =>
    item.href === "/notifications" ? { ...item, badge: unreadCount } : item,
  )

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
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-[80] bg-white border-t border-slate-200 px-1 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] shadow-[0_-4px_16px_rgba(12,35,64,0.12)] pointer-events-auto">
      <div className="grid grid-cols-5 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activePath === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => handleNavClick(e, item.href)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-[10px] font-medium transition-colors",
                isActive ? "text-[#0C2340] bg-[#0C2340]/[0.06]" : "text-slate-500",
              )}
            >
              <div className="relative">
                <Icon className="h-4 w-4" />
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] leading-4 text-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
