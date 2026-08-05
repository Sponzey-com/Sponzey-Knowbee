export type CanonicalCompatibilityReason =
  | "canonical_authoritative_bridge"
  | "canonical_child_fallback"

export interface CanonicalCompatibilityResolution {
  from: string
  to: string
  discardedQueryKeys: string[]
  reasonCode: CanonicalCompatibilityReason
}

interface CompatibilityTargetRule {
  path: string
  target: string
  allowedQueryKeys: readonly string[]
}

const TARGET_RULES: readonly CompatibilityTargetRule[] = [
  { path: "/capabilities", target: "/setup", allowedQueryKeys: ["tab", "selected"] },
  { path: "/capabilities/skills", target: "/advanced/plugins", allowedQueryKeys: ["selected"] },
  { path: "/capabilities/mcp", target: "/setup", allowedQueryKeys: ["selected", "tab"] },
] as const

const SENSITIVE_QUERY_KEY = /(token|secret|password|credential|auth|api[_-]?key|internal[_-]?id)/i

function familyRoot(pathname: string): "/work" | "/agents" | "/capabilities" | "/settings" | null {
  for (const root of ["/work", "/agents", "/capabilities", "/settings"] as const) {
    if (pathname === root || pathname.startsWith(`${root}/`)) return root
  }
  return null
}

function resolveRule(
  pathname: string,
): { rule: CompatibilityTargetRule; fallback: boolean } | null {
  const findRule = (path: string) => TARGET_RULES.find((item) => item.path === path) ?? null
  const exact = TARGET_RULES.find((item) => item.path === pathname)
  if (exact) return { rule: exact, fallback: false }
  const root = familyRoot(pathname)
  if (!root) return null
  const rule = findRule(root)
  return rule ? { rule, fallback: true } : null
}

export function resolveCanonicalCompatibilityTarget(input: {
  pathname: string
  query: string
}): CanonicalCompatibilityResolution | null {
  const resolved = resolveRule(input.pathname)
  if (!resolved) return null
  const source = new URLSearchParams(
    input.query.startsWith("?") ? input.query.slice(1) : input.query,
  )
  const target = new URLSearchParams()
  const discardedQueryKeys: string[] = []
  for (const [key, value] of source) {
    if (resolved.rule.allowedQueryKeys.includes(key) && !SENSITIVE_QUERY_KEY.test(key)) {
      target.append(key, value)
    } else if (!discardedQueryKeys.includes(key)) {
      discardedQueryKeys.push(key)
    }
  }
  const query = target.toString()
  return {
    from: input.pathname,
    to: `${resolved.rule.target}${query ? `?${query}` : ""}`,
    discardedQueryKeys,
    reasonCode: resolved.fallback ? "canonical_child_fallback" : "canonical_authoritative_bridge",
  }
}

export function resolveCanonicalNavigationOwner(pathname: string): string | null {
  return resolveRule(pathname)?.rule.target === "/advanced/plugins"
    ? "/setup"
    : (resolveRule(pathname)?.rule.target ?? null)
}
