import React from "react"

export interface SkeletonProps {
  width: string
  height: string
  label: string
  className?: string
}

export function Skeleton({ width, height, label, className = "" }: SkeletonProps) {
  if (!width.trim() || !height.trim()) throw new Error("Skeleton dimensions are required")
  if (!label.trim()) throw new Error("Skeleton label is required")
  return (
    <span
      role="status"
      aria-label={label}
      style={{ width, height }}
      className={`inline-block shrink-0 animate-pulse rounded-[var(--ui-surface-radius)] bg-stone-200 motion-reduce:animate-none ${className}`.trim()}
    />
  )
}
