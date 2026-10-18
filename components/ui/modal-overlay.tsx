"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface ModalOverlayProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  title?: string
  style?: React.CSSProperties
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
let openDialogCount = 0
let originalHtmlOverflow = ""
let originalBodyOverflow = ""
const dialogStack: symbol[] = []
const dialogContainerMap = new Map<symbol, HTMLElement>()

const ModalStackContext = createContext<number>(0)

/**
 * Viewport-level dialog primitive for all modal callers.
 * Portals out of transformed route containers to document.body, enforces stack-aware
 * z-index layering for nested dialogs, centers the visible dialog card horizontally
 * and vertically within the viewport, and detects outside clicks in all quadrants
 * around the dialog content.
 */
export function ModalOverlay({ isOpen, onClose, children, className, title, style }: ModalOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const dialogTokenRef = useRef(Symbol("modal-overlay"))
  const stackDepth = useContext(ModalStackContext)
  const [dynamicStackIndex, setDynamicStackIndex] = useState(0)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return

    previousActiveElementRef.current = document.activeElement as HTMLElement | null
    openDialogCount += 1
    dialogStack.push(dialogTokenRef.current)
    if (containerRef.current) {
      dialogContainerMap.set(dialogTokenRef.current, containerRef.current)
    }

    const currentIdx = dialogStack.indexOf(dialogTokenRef.current)
    if (currentIdx >= 0) {
      setDynamicStackIndex(currentIdx)
    }

    if (openDialogCount === 1) {
      originalHtmlOverflow = document.documentElement.style.overflow
      originalBodyOverflow = document.body.style.overflow
      document.documentElement.style.overflow = "hidden"
      document.body.style.overflow = "hidden"
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (dialogStack.at(-1) !== dialogTokenRef.current) return
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab" || !containerRef.current) return
      const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) {
        e.preventDefault()
        containerRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && (document.activeElement === first || !containerRef.current.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !containerRef.current.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    const focusFrame = requestAnimationFrame(() => {
      const dialog = containerRef.current
      if (!dialog || dialogStack.at(-1) !== dialogTokenRef.current || dialog.contains(document.activeElement)) return
      dialog.querySelector<HTMLElement>(FOCUSABLE)?.focus() ?? dialog.focus()
    })

    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener("keydown", handleKeyDown)
      dialogContainerMap.delete(dialogTokenRef.current)
      const stackIndex = dialogStack.lastIndexOf(dialogTokenRef.current)
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1)
      openDialogCount = Math.max(0, openDialogCount - 1)
      if (openDialogCount === 0) {
        document.documentElement.style.overflow = originalHtmlOverflow
        document.body.style.overflow = originalBodyOverflow
      }

      // Restore focus: if a parent dialog remains in the stack, keep focus inside it.
      const remainingTopToken = dialogStack.at(-1)
      const remainingDialog = remainingTopToken ? dialogContainerMap.get(remainingTopToken) : null
      const target = previousActiveElementRef.current
      if (remainingDialog) {
        if (target && remainingDialog.contains(target) && typeof target.focus === "function") {
          target.focus()
        } else {
          remainingDialog.querySelector<HTMLElement>(FOCUSABLE)?.focus() ?? remainingDialog.focus()
        }
      } else if (target && typeof target.focus === "function") {
        target.focus()
      }
    }
  }, [isOpen])

  if (!isOpen || typeof document === "undefined") return null

  const effectiveDepth = Math.max(stackDepth, dynamicStackIndex)
  const computedZIndex = 100 + effectiveDepth * 10

  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    // Only topmost dialog can receive outside click dismissal
    if (dialogStack.at(-1) !== dialogTokenRef.current) return
    // Only direct clicks on backdrop or the container wrapper around content trigger dismissal
    if (event.target === event.currentTarget) {
      onCloseRef.current()
    }
  }

  return createPortal(
    <ModalStackContext.Provider value={effectiveDepth + 1}>
      <div
        className={cn(
          "fixed inset-0 grid place-items-center overflow-y-auto overscroll-contain bg-black/40 p-4 sm:p-6 backdrop-blur-sm animate-in fade-in duration-200",
          className
        )}
        style={{ zIndex: computedZIndex, ...style }}
        onMouseDown={handleBackdropMouseDown}
      >
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={title || "Dialog Window"}
          tabIndex={-1}
          className="my-auto w-full max-w-full flex flex-col items-center justify-center outline-none"
          onMouseDown={handleBackdropMouseDown}
        >
          {children}
        </div>
      </div>
    </ModalStackContext.Provider>,
    document.body,
  )
}
