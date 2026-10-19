import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { AuthProvider } from "@/lib/auth"
import { NavigationLoadingProvider } from "@/components/providers/navigation-loading-provider"
import { ResidentMobileNavGate } from "@/components/resident/layout/resident-mobile-nav-gate"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

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
  const isE2E = process.env.TALASYS_E2E_MODE === "true" || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === "talasys-e2e" || process.env.FIREBASE_PROJECT_ID === "talasys-e2e"

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {isE2E && (
          <script
            id="__talasys_e2e_config"
            dangerouslySetInnerHTML={{
              __html: `window.__TALASYS_E2E_CONFIG__ = ${JSON.stringify({
                projectId: "talasys-e2e",
                authUrl: process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL || "http://127.0.0.1:9199",
                firestoreHost: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "127.0.0.1",
                firestorePort: Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8180),
              })};`,
            }}
          />
        )}
      </head>
      <body suppressHydrationWarning className={`font-sans antialiased flex flex-col min-h-screen`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <NavigationLoadingProvider>
              <div className="flex-1 flex flex-col page-transition" suppressHydrationWarning>{children}</div>
              <ResidentMobileNavGate />
              <Toaster />
              <SonnerToaster richColors position="top-right" />
            </NavigationLoadingProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
