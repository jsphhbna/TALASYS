"use client"

import Link from "next/link"
import { showToastPreset } from "@/lib/app-toast"

export function Footer() {
  const handleComingSoon = (e: React.MouseEvent) => {
    e.preventDefault()
    showToastPreset("actionRequired")
  }

  return (
    <footer className="bg-[#0C2340] dark:bg-slate-800 text-slate-100 py-8 px-6 border-t border-[#1a3a5c]/50" role="contentinfo">
      <div className="max-w-7xl mx-auto" suppressHydrationWarning>
        {/* Footer Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6" suppressHydrationWarning>
          {/* Brand Section */}
          <div>
            <h3 className="text-lg font-bold text-white mb-2 tracking-tight">TALASYS</h3>
            <p className="text-sm text-blue-200/50">Barangay Digital Services Platform</p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-3">Quick Links</h4>
            <ul className="space-y-1.5">
              <li>
                <Link href="/dashboard" className="text-sm text-blue-200/50 hover:text-white transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/request" className="text-sm text-blue-200/50 hover:text-white transition-colors">
                  Request Document
                </Link>
              </li>
              <li>
                <Link href="/history" className="text-sm text-blue-200/50 hover:text-white transition-colors">
                  Track Request
                </Link>
              </li>
            </ul>
          </div>

          {/* Support / Contact */}
          <div>
            <h4 className="text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-3">Contact Us</h4>
            <ul className="space-y-2">
              <li className="flex flex-col">
                <span className="text-xs text-blue-200/50 uppercase tracking-wide">Telephone</span>
                <span className="text-sm text-blue-200/80">(02) 711 5820</span>
              </li>
              <li className="flex flex-col">
                <span className="text-xs text-blue-200/50 uppercase tracking-wide">Email</span>
                <a href="mailto:barangay634zone64stamesa@gmail.com" className="text-sm text-blue-200/80 hover:text-white transition-colors break-all">
                  barangay634zone64stamesa@gmail.com
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-3">Legal</h4>
            <ul className="space-y-1.5">
              <li>
                <Link href="/legal?tab=privacy" className="text-sm text-blue-200/50 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal?tab=terms" className="text-sm text-blue-200/50 hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal?tab=security" className="text-sm text-blue-200/50 hover:text-white transition-colors">
                  Security
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 my-6" />

        {/* Bottom Section */}
        <div className="flex flex-col md:flex-row items-center justify-between">
          <p className="text-xs text-blue-200/40 mb-4 md:mb-0">© 2025 TALASYS. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-200/40 hover:text-white transition-colors">
              Twitter
            </a>
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-200/40 hover:text-white transition-colors">
              Facebook
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-200/40 hover:text-white transition-colors">
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
