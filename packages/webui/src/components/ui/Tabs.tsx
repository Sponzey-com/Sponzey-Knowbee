import React from "react"

export interface TabItem {
  id: string
  label: string
  href: string
}

export interface TabsProps {
  label: string
  activeId: string
  items: readonly TabItem[]
  className?: string
}

export function Tabs({ label, activeId, items, className = "" }: TabsProps) {
  const activeCount = items.filter((item) => item.id === activeId).length
  if (activeCount !== 1) throw new Error("Tabs require exactly one active item")
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("Tab item ids must be unique")
  }
  return (
    <nav aria-label={label} className={className}>
      <div role="tablist" className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = item.id === activeId
          return (
            <a
              key={item.id}
              role="tab"
              href={item.href}
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              tabIndex={active ? 0 : -1}
              className={`inline-flex min-h-[44px] min-w-0 items-center rounded-[var(--ui-surface-radius)] border px-3 py-2 text-sm font-semibold leading-5 focus-visible:outline-none focus-visible:shadow-[var(--ui-focus-shadow)] ${active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"}`}
            >
              <span className="break-words">{item.label}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
