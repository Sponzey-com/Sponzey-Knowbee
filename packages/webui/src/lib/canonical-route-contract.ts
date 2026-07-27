export const CANONICAL_ROUTE_REGISTRY_VERSION = "canonical-ui-routes:v1" as const

export type CanonicalRouteId = "chat" | "work" | "agents" | "capabilities" | "settings"
export type CanonicalDomain =
  | "conversation"
  | "work_runs"
  | "agent_topology"
  | "skills"
  | "mcp"
  | "yeonjang"
  | "environment"
  | "authentication"
  | "language"

export interface CanonicalRouteDefinition {
  routeId: CanonicalRouteId
  path: string
  labelKey: string
  pageOwner: string
  access: "user" | "restricted"
  activationKind: "read_only" | "mutation"
  ownedDomains: readonly CanonicalDomain[]
}

export const CANONICAL_ROUTE_REGISTRY: readonly CanonicalRouteDefinition[] = [
  {
    routeId: "chat",
    path: "/chat",
    labelKey: "navigation.chat",
    pageOwner: "chat.workspace",
    access: "user",
    activationKind: "mutation",
    ownedDomains: ["conversation"],
  },
  {
    routeId: "work",
    path: "/work",
    labelKey: "navigation.work",
    pageOwner: "work.workspace",
    access: "user",
    activationKind: "read_only",
    ownedDomains: ["work_runs"],
  },
  {
    routeId: "agents",
    path: "/agents",
    labelKey: "navigation.agents",
    pageOwner: "agents.workspace",
    access: "user",
    activationKind: "mutation",
    ownedDomains: ["agent_topology"],
  },
  {
    routeId: "capabilities",
    path: "/capabilities",
    labelKey: "navigation.capabilities",
    pageOwner: "capabilities.workspace",
    access: "user",
    activationKind: "mutation",
    ownedDomains: ["skills", "mcp", "yeonjang"],
  },
  {
    routeId: "settings",
    path: "/settings",
    labelKey: "navigation.settings",
    pageOwner: "settings.workspace",
    access: "user",
    activationKind: "mutation",
    ownedDomains: ["environment", "authentication", "language"],
  },
] as const

const EXPECTED_DOMAINS: Readonly<Record<CanonicalRouteId, readonly CanonicalDomain[]>> = {
  chat: ["conversation"],
  work: ["work_runs"],
  agents: ["agent_topology"],
  capabilities: ["skills", "mcp", "yeonjang"],
  settings: ["environment", "authentication", "language"],
}

export type CanonicalRouteDiagnostic = {
  routeId: string
  reasonCode:
    | "canonical_route_id_duplicated"
    | "canonical_route_path_duplicated"
    | "canonical_page_owner_duplicated"
    | "canonical_label_missing"
    | "canonical_route_not_user_visible"
    | "canonical_domain_owner_invalid"
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function validateCanonicalRouteRegistry(registry: readonly CanonicalRouteDefinition[]): {
  ok: boolean
  diagnostics: CanonicalRouteDiagnostic[]
} {
  const diagnostics: CanonicalRouteDiagnostic[] = []
  const ids = new Set<string>()
  const paths = new Set<string>()
  const owners = new Set<string>()
  for (const route of registry) {
    if (ids.has(route.routeId)) {
      diagnostics.push({ routeId: route.routeId, reasonCode: "canonical_route_id_duplicated" })
    }
    if (paths.has(route.path)) {
      diagnostics.push({ routeId: route.routeId, reasonCode: "canonical_route_path_duplicated" })
    }
    if (owners.has(route.pageOwner)) {
      diagnostics.push({ routeId: route.routeId, reasonCode: "canonical_page_owner_duplicated" })
    }
    ids.add(route.routeId)
    paths.add(route.path)
    owners.add(route.pageOwner)
    if (!route.labelKey.trim()) {
      diagnostics.push({ routeId: route.routeId, reasonCode: "canonical_label_missing" })
    }
    if (route.access !== "user") {
      diagnostics.push({ routeId: route.routeId, reasonCode: "canonical_route_not_user_visible" })
    }
    if (!sameValues(route.ownedDomains, EXPECTED_DOMAINS[route.routeId])) {
      diagnostics.push({ routeId: route.routeId, reasonCode: "canonical_domain_owner_invalid" })
    }
  }
  return { ok: diagnostics.length === 0, diagnostics }
}

export interface LegacyCanonicalRedirect {
  redirectId: string
  from: string
  target: string
  preservedQueryKeys: readonly string[]
}

function redirect(
  from: string,
  target: string,
  preservedQueryKeys: readonly string[] = [],
): LegacyCanonicalRedirect {
  return { redirectId: `redirect:${from}`, from, target, preservedQueryKeys }
}

export const LEGACY_CANONICAL_REDIRECTS: readonly LegacyCanonicalRedirect[] = [
  redirect("/tasks", "/work/runs", ["status", "page", "filter"]),
  redirect("/runs", "/work/runs", ["status", "page", "filter"]),
  redirect("/advanced/runs", "/work/runs", ["status", "page", "filter"]),
  redirect("/dashboard", "/work", ["range"]),
  redirect("/advanced/dashboard", "/work", ["range"]),
  redirect("/status", "/settings/status"),
  redirect("/sub-agents", "/agents", ["selected", "tab"]),
  redirect("/topology", "/agents", ["selected", "tab"]),
  redirect("/enterprise-topology", "/agents", ["selected", "tab"]),
  redirect("/advanced/topology", "/agents", ["selected", "tab"]),
  redirect("/advanced/enterprise-topology", "/agents", ["selected", "tab"]),
  redirect("/advanced/orchestration", "/agents", ["selected", "tab"]),
  redirect("/tools", "/capabilities", ["tab", "selected"]),
  redirect("/advanced/tools", "/capabilities", ["tab", "selected"]),
  redirect("/extensions", "/capabilities/yeonjang", ["selected"]),
  redirect("/advanced/extensions", "/capabilities/yeonjang", ["selected"]),
  redirect("/plugins", "/capabilities/skills", ["selected"]),
  redirect("/advanced/plugins", "/capabilities/skills", ["selected"]),
  redirect("/setup", "/settings", ["section"]),
  redirect("/ai", "/settings/ai", ["selected"]),
  redirect("/advanced/ai", "/settings/ai", ["selected"]),
  redirect("/channels", "/settings/channels", ["selected"]),
  redirect("/advanced/channels", "/settings/channels", ["selected"]),
  redirect("/memory", "/settings/memory", ["section"]),
  redirect("/advanced/memory", "/settings/memory", ["section"]),
  redirect("/release", "/settings/update"),
  redirect("/advanced/release", "/settings/update"),
] as const

export type LegacyCanonicalRedirectDiagnostic = {
  redirectId: string
  reasonCode:
    | "redirect_source_duplicated"
    | "redirect_target_not_canonical"
    | "redirect_self_cycle"
    | "redirect_cycle"
    | "redirect_sensitive_query_allowlisted"
}

const SENSITIVE_QUERY_KEY = /(token|secret|password|credential|auth|api[_-]?key|internal[_-]?id)/i

export function validateLegacyCanonicalRedirects(input: {
  registry: readonly CanonicalRouteDefinition[]
  redirects: readonly LegacyCanonicalRedirect[]
}): { ok: boolean; diagnostics: LegacyCanonicalRedirectDiagnostic[] } {
  const diagnostics: LegacyCanonicalRedirectDiagnostic[] = []
  const sources = new Set<string>()
  const bySource = new Map(input.redirects.map((item) => [item.from, item]))
  const roots = input.registry.map((item) => item.path)
  for (const item of input.redirects) {
    if (sources.has(item.from)) {
      diagnostics.push({ redirectId: item.redirectId, reasonCode: "redirect_source_duplicated" })
    }
    sources.add(item.from)
    if (!roots.some((root) => item.target === root || item.target.startsWith(`${root}/`))) {
      diagnostics.push({ redirectId: item.redirectId, reasonCode: "redirect_target_not_canonical" })
    }
    if (item.from === item.target) {
      diagnostics.push({ redirectId: item.redirectId, reasonCode: "redirect_self_cycle" })
    } else {
      const visited = new Set([item.from])
      let next: string | null = item.target
      while (next) {
        if (visited.has(next)) {
          diagnostics.push({ redirectId: item.redirectId, reasonCode: "redirect_cycle" })
          break
        }
        visited.add(next)
        next = bySource.get(next)?.target ?? null
      }
    }
    if (item.preservedQueryKeys.some((key) => SENSITIVE_QUERY_KEY.test(key))) {
      diagnostics.push({
        redirectId: item.redirectId,
        reasonCode: "redirect_sensitive_query_allowlisted",
      })
    }
  }
  return { ok: diagnostics.length === 0, diagnostics }
}

export function resolveCanonicalRedirect(input: {
  pathname: string
  query: string
  redirects: readonly LegacyCanonicalRedirect[]
}): { from: string; to: string; discardedQueryKeys: string[] } | null {
  const route = input.redirects.find((item) => item.from === input.pathname)
  if (!route) return null
  const source = new URLSearchParams(
    input.query.startsWith("?") ? input.query.slice(1) : input.query,
  )
  const target = new URLSearchParams()
  const discardedQueryKeys: string[] = []
  for (const [key, value] of source) {
    if (route.preservedQueryKeys.includes(key) && !SENSITIVE_QUERY_KEY.test(key)) {
      target.append(key, value)
    } else if (!discardedQueryKeys.includes(key)) {
      discardedQueryKeys.push(key)
    }
  }
  const query = target.toString()
  return {
    from: input.pathname,
    to: `${route.target}${query ? `?${query}` : ""}`,
    discardedQueryKeys,
  }
}

export interface CanonicalRouteReadinessEvidence {
  contract: "verified" | "missing"
  readProjection: "verified" | "unverified"
  mutationParity: "verified" | "unverified" | "not_required"
  deepLink: "verified" | "unverified"
  backRefresh: "verified" | "unverified"
}

export type CanonicalRouteActivationReason =
  | "route_contract_missing"
  | "read_projection_missing"
  | "mutation_parity_missing"
  | "deep_link_verification_missing"
  | "back_refresh_verification_missing"

export function evaluateCanonicalRouteActivation(input: {
  route: CanonicalRouteDefinition
  evidence: CanonicalRouteReadinessEvidence
}): { active: boolean; reasonCodes: CanonicalRouteActivationReason[] } {
  const reasonCodes: CanonicalRouteActivationReason[] = []
  if (input.evidence.contract !== "verified") reasonCodes.push("route_contract_missing")
  if (input.evidence.readProjection !== "verified") reasonCodes.push("read_projection_missing")
  if (input.route.activationKind === "mutation" && input.evidence.mutationParity !== "verified") {
    reasonCodes.push("mutation_parity_missing")
  }
  if (input.evidence.deepLink !== "verified") reasonCodes.push("deep_link_verification_missing")
  if (input.evidence.backRefresh !== "verified")
    reasonCodes.push("back_refresh_verification_missing")
  return { active: reasonCodes.length === 0, reasonCodes }
}
