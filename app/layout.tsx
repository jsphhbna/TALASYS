import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider } from "@/lib/auth-context"
import { NavigationLoadingProvider } from "@/components/providers/navigation-loading-provider"
import { Footer } from "@/components/layout/footer"
import { ResidentMobileNavGate } from "@/components/layout/resident-mobile-nav-gate"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "TALASYS - Barangay Digital Services",
  description: "Digital services platform for barangay residents",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`font-sans antialiased flex flex-col min-h-screen overflow-x-hidden`}>
        <AuthProvider>
          <NavigationLoadingProvider>
            <div className="flex-1 flex flex-col">{children}</div>
            <ResidentMobileNavGate />
            <Footer />
            <Toaster />
          </NavigationLoadingProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
