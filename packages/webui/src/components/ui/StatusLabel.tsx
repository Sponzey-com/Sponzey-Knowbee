import React, { type ReactNode } from "react"

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger"

export interface StatusLabelProps {
  tone?: StatusTone
  children: ReactNode
  className?: string
}

const TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  neutral: "border-stone-300 bg-stone-100 text-stone-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
}

export function StatusLabel({ tone = "neutral", children, className = "" }: StatusLabelProps) {
  if (typeof children !== "string" || !children.trim()) throw new Error("StatusLabel text is required")
  return (
    <span
      role="status"
      data-tone={tone}
      className={`inline-flex min-h-6 items-center rounded-[var(--ui-surface-radius)] border px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  )
}
