import React, { type ButtonHTMLAttributes, type ReactNode } from "react"

export type ButtonVariant = "primary" | "secondary" | "danger"

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  children: ReactNode
  variant?: ButtonVariant
  pending?: boolean
  disabled?: boolean
}

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  primary: "border-stone-900 bg-stone-900 text-white hover:bg-stone-800",
  secondary: "border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
  danger: "border-red-700 bg-red-700 text-white hover:bg-red-800",
}

export function Button({
  children,
  variant = "secondary",
  pending = false,
  disabled = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const unavailable = disabled || pending
  return (
    <button
      {...props}
      type={type}
      disabled={unavailable}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-[var(--ui-surface-radius)] border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${className}`.trim()}
    >
      {children}
    </button>
  )
}
