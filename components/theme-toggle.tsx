"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme()

  const handleToggleTheme = (event: React.MouseEvent) => {
    // Resolve the current theme safely
    const current = theme === 'system' ? systemTheme : theme;
    const isDark = current === "dark"
    const nextTheme = isDark ? "light" : "dark"

    // If browser doesn't support view transitions, just set the theme
    if (!document.startViewTransition) {
      setTheme(nextTheme)
      return
    }

    // Get click coordinates for the center of the circle
    const x = event.clientX
    const y = event.clientY
    // Use a very safe max radius to guarantee it covers the entire document on mobile devices
    // Use scrollWidth/scrollHeight to ensure the radius covers the entire scrollable page, not just the viewport
    const targetWidth = Math.max(window.innerWidth, document.documentElement.scrollWidth || 0, document.body.scrollWidth || 0)
    const targetHeight = Math.max(window.innerHeight, document.documentElement.scrollHeight || 0, document.body.scrollHeight || 0)
    
    const endRadius = Math.hypot(
      Math.max(x, targetWidth - x),
      Math.max(y, targetHeight - y)
    )

    const transition = document.startViewTransition(() => {
      setTheme(nextTheme)
    })

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]
      
      document.documentElement.animate(
        {
          clipPath: clipPath,
        },
        {
          duration: 500,
          easing: "ease-out",
          pseudoElement: "::view-transition-new(root)",
        }
      )
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggleTheme}
      className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 dark:hover:text-slate-100 relative z-50 overflow-hidden"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
