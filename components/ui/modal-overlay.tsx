"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface ModalOverlayProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  title?: string
}

export function ModalOverlay({ isOpen, onClose, children, className, title }: ModalOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    // Save previous active element for return focus
    previousActiveElementRef.current = document.activeElement as HTMLElement | null

    // Lock ALL background scrolling when modal is open.
    const preventScroll = (e: Event) => {
      const target = e.target as HTMLElement
      const scrollable = target.closest('.overflow-y-auto, .overflow-auto, .modal-scroll-container')
      if (scrollable) return
      e.preventDefault()
    }

    document.addEventListener("wheel", preventScroll, { passive: false })
    document.addEventListener("touchmove", preventScroll, { passive: false })

    const originalHtmlOverflow = document.documentElement.style.overflow
    const originalBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = "hidden"
    document.body.style.overflow = "hidden"
    const mainStage = document.getElementById("main-scroll-stage")
    if (mainStage) mainStage.style.overflow = "hidden"

    // Escape key listener & Focus Trap
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
        return
      }

      if (e.key === "Tab" && containerRef.current) {
        const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusableElements.length === 0) {
          e.preventDefault()
          return
        }

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    // Initial focus: focus first interactive element or dialog container
    const timer = setTimeout(() => {
      if (containerRef.current) {
        const firstFocusable = containerRef.current.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (firstFocusable) {
          firstFocusable.focus()
        } else {
          containerRef.current.focus()
        }
      }
    }, 50)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("wheel", preventScroll)
      document.removeEventListener("touchmove", preventScroll)
      document.removeEventListener("keydown", handleKeyDown)

      document.documentElement.style.overflow = originalHtmlOverflow
      document.body.style.overflow = originalBodyOverflow
      if (mainStage) mainStage.style.overflow = ""

      // Return focus to trigger element
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === "function") {
        previousActiveElementRef.current.focus()
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div 
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto overscroll-none modal-scroll-container animate-in fade-in duration-200",
        className
      )}
      onMouseDown={(e) => { 
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div 
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Dialog Window"}
        tabIndex={-1}
        className="min-h-full flex items-center justify-center p-4 py-10 outline-none"
        onMouseDown={(e) => { 
          if (e.target === e.currentTarget) {
            onClose()
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
