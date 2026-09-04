"use client"

import Link from "next/link"
import { ShieldCheck, LogIn, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"

export function LandingNavbar() {
  const [isOpen, setIsOpen] = useState(false)

  const navLinks = [
    { name: "Home", href: "#" },
    { name: "Mission & Vision", href: "#mission" },
    { name: "Officials", href: "#officials" },
    { name: "Contact", href: "#contact" },
  ]

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700" style={{ boxShadow: "var(--shadow-sm)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          
          {/* Logo / Brand */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-[#0C2340] dark:text-blue-50" />
            <span className="font-bold text-xl tracking-tight text-[#0C2340] dark:text-blue-50">Barangay 634</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <div className="flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="text-[15px] font-medium text-slate-600 dark:text-slate-400 hover:text-[#0C2340] dark:text-blue-50 transition-colors"
                  style={{ transitionDuration: "var(--transition-base)" }}
                >
                  {link.name}
                </Link>
              ))}
            </div>
            
            <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-700 pl-6">
              <Link href="/register">
                <Button variant="ghost" className="font-semibold text-[#0C2340] dark:text-blue-50 hover:bg-slate-100 dark:bg-slate-800" style={{ borderRadius: "var(--radius-sm)" }}>
                  Register
                </Button>
              </Link>
              <Link href="/login">
                <Button className="font-semibold bg-[#0C2340] dark:bg-slate-800 hover:bg-[#0a1a30] text-white shadow-sm flex gap-2 items-center" style={{ borderRadius: "var(--radius-sm)" }}>
                  <LogIn className="w-4 h-4" />
                  Portal Login
                </Button>
              </Link>
            </div>
          </div>

          {/* Mobile Navigation Toggle */}
          <div className="md:hidden flex items-center">
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-slate-600 dark:text-slate-400">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <div className="flex flex-col gap-6 mt-8">
                  <div className="flex flex-col gap-4">
                    {navLinks.map((link) => (
                      <Link
                        key={link.name}
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className="text-lg font-medium text-slate-800 dark:text-slate-200 hover:text-[#0C2340] dark:text-blue-50"
                      >
                        {link.name}
                      </Link>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <Link href="/register" onClick={() => setIsOpen(false)} className="w-full">
                      <Button variant="outline" className="w-full justify-center border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        Register
                      </Button>
                    </Link>
                    <Link href="/login" onClick={() => setIsOpen(false)} className="w-full">
                      <Button className="w-full justify-center bg-[#0C2340] dark:bg-slate-800 text-white">
                        <LogIn className="w-4 h-4 mr-2" />
                        Portal Login
                      </Button>
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

        </div>
      </div>
    </nav>
  )
}
