import React, { type ButtonHTMLAttributes, type ReactNode } from "react"

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string
  children: ReactNode
}

export function IconButton({
  label,
  children,
  className = "",
  type = "button",
  ...props
}: IconButtonProps) {
  if (!label.trim()) throw new Error("IconButton label is required")
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--ui-surface-radius)] border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
    >
      {children}
    </button>
  )
}
