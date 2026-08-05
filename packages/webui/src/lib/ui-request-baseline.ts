export type UiRequestLifecycle = "before_first_paint" | "after_first_paint" | "background"

export interface UiRequestObservation {
  route: string
  lifecycle: UiRequestLifecycle
  requestPath: string
  queryKey: string
  owner: string
  observedAtMs?: number
  panelOwner?: string
}

export interface UiRouteRequestPolicy {
  route: string
  criticalQueryKeys: string[]
  maxInitialRequests: number
  forbiddenPathPrefixes: string[]
  activePanelOwner: string
  backgroundOwnerAllowlist: string[]
}

export const CANONICAL_UI_ROUTE_REQUEST_POLICIES: readonly UiRouteRequestPolicy[] = [
  {
    route: "/chat",
    criticalQueryKeys: ["GET /api/status", "GET /api/ui/shell"],
    maxInitialRequests: 2,
    forbiddenPathPrefixes: ["/api/admin", "/api/audit", "/api/raw"],
    activePanelOwner: "chat",
    backgroundOwnerAllowlist: ["shell.connection"],
  },
  {
    route: "/work",
    criticalQueryKeys: ["GET /api/ui/shell", "GET /api/tasks?limit=50"],
    maxInitialRequests: 2,
    forbiddenPathPrefixes: ["/api/admin", "/api/audit", "/api/raw"],
    activePanelOwner: "work",
    backgroundOwnerAllowlist: ["shell.connection"],
  },
  {
    route: "/agents",
    criticalQueryKeys: ["GET /api/ui/shell", "GET /api/agent-topology"],
    maxInitialRequests: 2,
    forbiddenPathPrefixes: ["/api/admin", "/api/audit", "/api/raw"],
    activePanelOwner: "agents",
    backgroundOwnerAllowlist: ["shell.connection"],
  },
  {
    route: "/capabilities",
    criticalQueryKeys: ["GET /api/ui/shell", "GET /api/capabilities/summary"],
    maxInitialRequests: 2,
    forbiddenPathPrefixes: ["/api/admin", "/api/audit", "/api/raw"],
    activePanelOwner: "capabilities",
    backgroundOwnerAllowlist: ["shell.connection"],
  },
  {
    route: "/settings",
    criticalQueryKeys: ["GET /api/ui/shell", "GET /api/setup/draft"],
    maxInitialRequests: 2,
    forbiddenPathPrefixes: ["/api/admin", "/api/audit", "/api/raw"],
    activePanelOwner: "settings",
    backgroundOwnerAllowlist: ["shell.connection"],
  },
] as const

function startupObservation(
  requestPath: string,
  owner: string,
  observedAtMs: number,
): UiRequestObservation {
  const canonical = canonicalizeUiRequest({ method: "GET", requestPath })
  return {
    route: "/chat",
    lifecycle: "before_first_paint",
    requestPath: canonical.safePath,
    queryKey: canonical.queryKey,
    owner,
    observedAtMs,
  }
}

// Source-derived Phase 0 inventory. A later browser adapter replaces assumptions with observed receipts.
export const CURRENT_WEBUI_STARTUP_REQUEST_BASELINE: readonly UiRequestObservation[] = [
  startupObservation("/api/status", "auth.session", 1),
  startupObservation("/api/status", "shell.connection", 2),
  startupObservation("/api/capabilities", "capability.runtime.read", 3),
  startupObservation("/api/setup/status", "setup.state.read", 4),
  startupObservation("/api/setup/draft", "setup.draft.read", 5),
  startupObservation("/api/setup/checks", "setup.checks.read", 6),
  startupObservation("/api/ui/shell", "shell.projection.read", 7),
  startupObservation("/api/runs", "work.runs.read", 8),
  startupObservation("/api/tasks", "work.tasks.read", 9),
  startupObservation("/api/runs/operations/summary", "work.operations.read", 10),
] as const

const SENSITIVE_QUERY_KEY = /(token|secret|password|credential|auth|api[_-]?key)/i
const NUMERIC_QUERY_KEYS = new Set(["limit", "page", "offset"])

export function canonicalizeUiRequest(input: { method: string; requestPath: string }): {
  method: string
  pathname: string
  safePath: string
  queryKey: string
} {
  const method = input.method.trim().toUpperCase() || "GET"
  const url = new URL(input.requestPath, "http://knowbee.invalid")
  const entries = [...url.searchParams.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )
  const safeEntries = entries.map(([key, value]) => {
    if (SENSITIVE_QUERY_KEY.test(key)) return [key, "<redacted>"] as const
    if (NUMERIC_QUERY_KEYS.has(key) && /^\d+$/.test(value)) return [key, value] as const
    return [key, "<present>"] as const
  })
  const safeParams = new URLSearchParams()
  for (const [key, value] of safeEntries) safeParams.append(key, value)
  const safeQuery = safeParams.toString()
  const queryKeySuffix = safeEntries.length > 0
    ? `?${safeEntries.map(([key, value]) => `${key}=${value}`).join("&")}`
    : ""
  return {
    method,
    pathname: url.pathname,
    safePath: `${url.pathname}${safeQuery ? `?${safeQuery}` : ""}`,
    queryKey: `${method} ${url.pathname}${queryKeySuffix}`,
  }
}

export type UiRequestDiagnostic =
  | { reasonCode: "initial_query_duplicated"; queryKey: string }
  | { reasonCode: "initial_request_budget_exceeded"; actual: number; ceiling: number }
  | { reasonCode: "forbidden_request_observed"; requestPath: string }
  | { reasonCode: "initial_query_not_allowed"; queryKey: string }
  | {
      reasonCode: "hidden_panel_request_observed"
      queryKey: string
      activePanelOwner: string
      panelOwner: string
    }

export function validateUiRouteRequests(input: {
  policy: UiRouteRequestPolicy
  observations: readonly UiRequestObservation[]
}): { ok: boolean; diagnostics: UiRequestDiagnostic[] } {
  const diagnostics: UiRequestDiagnostic[] = []
  const initial = input.observations.filter((item) => item.lifecycle === "before_first_paint")
  const queryCounts = new Map<string, number>()
  for (const item of initial) queryCounts.set(item.queryKey, (queryCounts.get(item.queryKey) ?? 0) + 1)

  for (const [queryKey, count] of queryCounts) {
    if (count > 1) diagnostics.push({ reasonCode: "initial_query_duplicated", queryKey })
  }
  if (initial.length > input.policy.maxInitialRequests) {
    diagnostics.push({
      reasonCode: "initial_request_budget_exceeded",
      actual: initial.length,
      ceiling: input.policy.maxInitialRequests,
    })
  }
  for (const item of initial) {
    if (input.policy.forbiddenPathPrefixes.some((prefix) => item.requestPath.startsWith(prefix))) {
      diagnostics.push({ reasonCode: "forbidden_request_observed", requestPath: item.requestPath })
    }
  }
  for (const item of initial) {
    if (!input.policy.criticalQueryKeys.includes(item.queryKey)) {
      diagnostics.push({ reasonCode: "initial_query_not_allowed", queryKey: item.queryKey })
    }
  }
  for (const item of input.observations) {
    if (!item.panelOwner || item.panelOwner === input.policy.activePanelOwner) continue
    if (
      item.lifecycle === "background"
      && input.policy.backgroundOwnerAllowlist.includes(item.panelOwner)
    ) continue
    diagnostics.push({
      reasonCode: "hidden_panel_request_observed",
      queryKey: item.queryKey,
      activePanelOwner: input.policy.activePanelOwner,
      panelOwner: item.panelOwner,
    })
  }

  return { ok: diagnostics.length === 0, diagnostics }
}
