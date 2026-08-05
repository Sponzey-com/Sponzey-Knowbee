import React from "react"

export type InlineNoticeTone = "info" | "success" | "warning" | "danger"

export interface InlineNoticeProps {
  tone: InlineNoticeTone
  title: string
  children: string
  className?: string
}

const TONE_CLASS: Readonly<Record<InlineNoticeTone, string>> = {
  info: "border-sky-200 bg-sky-50 text-sky-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-red-200 bg-red-50 text-red-950",
}

export function InlineNotice({ tone, title, children, className = "" }: InlineNoticeProps) {
  if (!title.trim() || !children.trim()) throw new Error("InlineNotice title and body are required")
  return (
    <section
      role={tone === "danger" ? "alert" : "status"}
      data-tone={tone}
      className={`rounded-[var(--ui-surface-radius)] border px-4 py-3 ${TONE_CLASS[tone]} ${className}`.trim()}
    >
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 break-words text-sm leading-6 [overflow-wrap:anywhere]">{children}</p>
    </section>
  )
}
