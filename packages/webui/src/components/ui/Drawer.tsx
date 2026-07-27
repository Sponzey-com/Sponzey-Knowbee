import React, { type ReactNode, type RefObject, useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { resolveTrappedFocusIndex } from "../../lib/focus-trap"
import { IconButton } from "./IconButton.js"

export interface DrawerProps {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  returnFocusRef: RefObject<HTMLElement | null>
  closeOnEscape?: boolean
  closeDisabled?: boolean
}

export function Drawer({
  open,
  title,
  children,
  onClose,
  returnFocusRef,
  closeOnEscape = true,
  closeDisabled = false,
}: DrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  if (!title.trim()) throw new Error("Drawer title is required")
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    return () => returnFocusRef.current?.focus()
  }, [open, returnFocusRef])
  if (!open) return null
  const content = (
    <div
      className="fixed inset-0 z-[100] bg-black/30"
      onMouseDown={(event) => {
        if (!closeDisabled && event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && closeOnEscape && !closeDisabled) onClose()
          if (event.key !== "Tab") return
          const focusable = [
            ...(panelRef.current?.querySelectorAll<HTMLElement>(
              "button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
            ) ?? []),
          ]
          if (focusable.length === 0) return
          const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
          const nextIndex = resolveTrappedFocusIndex({
            currentIndex,
            focusableCount: focusable.length,
            shiftKey: event.shiftKey,
          })
          event.preventDefault()
          focusable[nextIndex]?.focus()
        }}
        className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl focus:outline-none max-sm:inset-0 max-sm:max-w-none"
      >
        <header className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-stone-900">
            {title}
          </h2>
          <IconButton label={`Close ${title}`} onClick={onClose} disabled={closeDisabled}>
            <span aria-hidden="true">x</span>
          </IconButton>
        </header>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  )
  return typeof document === "undefined" ? content : createPortal(content, document.body)
}
