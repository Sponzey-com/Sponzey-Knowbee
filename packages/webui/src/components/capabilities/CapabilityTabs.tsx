import React from "react"
import { Link, useInRouterContext } from "react-router-dom"
import { useUiI18n } from "../../lib/ui-i18n"

export function CapabilityTabs({ active }: { active: "skills" | "mcp" | "yeonjang" }) {
  const { text } = useUiI18n()
  const inRouter = useInRouterContext()
  const items = [
    { id: "skills" as const, path: "/capabilities/skills", label: "Skills" },
    { id: "mcp" as const, path: "/capabilities/mcp", label: "MCP" },
    { id: "yeonjang" as const, path: "/capabilities/yeonjang", label: text("연장", "Yeonjang") },
  ]
  return (
    <nav
      aria-label={text("기능 연결 종류", "Capability types")}
      className="mt-5 flex gap-1 border-b border-stone-200"
    >
      {items.map((item) => {
        const className = `min-h-11 border-b-2 px-4 py-3 text-sm font-semibold ${active === item.id ? "border-stone-950 text-stone-950" : "border-transparent text-stone-500 hover:text-stone-900"}`
        return inRouter ? (
          <Link
            key={item.path}
            to={item.path}
            aria-current={active === item.id ? "page" : undefined}
            className={className}
          >
            {item.label}
          </Link>
        ) : (
          <a
            key={item.path}
            href={item.path}
            aria-current={active === item.id ? "page" : undefined}
            className={className}
          >
            {item.label}
          </a>
        )
      })}
    </nav>
  )
}
