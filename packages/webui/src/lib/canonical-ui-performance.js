export const CANONICAL_UI_PERFORMANCE_ROUTES = Object.freeze([
  "/chat",
  "/work/runs",
  "/agents",
  "/capabilities/skills",
  "/settings/basics",
])

export const CANONICAL_UI_ROUTE_BUDGETS = Object.freeze([
  {
    route: "/chat",
    criticalApiAllowlist: ["/api/work/snapshot"],
    forbiddenOwnerPatterns: [
      "/api/tasks",
      "/api/runs/operations/summary",
      "/api/agent-workspace",
      "/api/schedules",
      "/api/catalog",
    ],
    maxCriticalRequests: 1,
    lazyOwners: ["agents", "schedules", "capability_catalog"],
  },
  {
    route: "/work/runs",
    criticalApiAllowlist: ["/api/work/snapshot"],
    forbiddenOwnerPatterns: [
      "/api/tasks",
      "/api/runs/operations/summary",
      "/api/schedules",
      "/api/agent-workspace",
      "/api/catalog",
    ],
    maxCriticalRequests: 1,
    lazyOwners: ["schedules", "agents", "capability_catalog"],
  },
  {
    route: "/agents",
    criticalApiAllowlist: ["/api/agent-workspace", "/api/topology", "/api/agents"],
    forbiddenOwnerPatterns: ["/api/schedules", "/api/catalog/skills", "/api/catalog/mcp"],
    maxCriticalRequests: 3,
    lazyOwners: ["schedules", "skill_catalog", "mcp_catalog"],
  },
  {
    route: "/capabilities/skills",
    criticalApiAllowlist: ["/api/catalog/skills", "/api/skills", "/api/capabilities"],
    forbiddenOwnerPatterns: ["/api/catalog/mcp", "/api/yeonjang", "/api/agent-workspace"],
    maxCriticalRequests: 3,
    lazyOwners: ["mcp_catalog", "yeonjang_catalog", "agents"],
  },
  {
    route: "/settings/basics",
    criticalApiAllowlist: ["/api/setup/draft", "/api/setup/checks", "/api/ui/shell"],
    forbiddenOwnerPatterns: ["/api/agent-workspace", "/api/schedules", "/api/runs"],
    maxCriticalRequests: 3,
    lazyOwners: ["agents", "schedules", "runs"],
  },
])

export function resolveCanonicalUiRouteBudget(route) {
  return CANONICAL_UI_ROUTE_BUDGETS.find((budget) => budget.route === route) ?? null
}

export function validateCanonicalUiRouteBudgets(budgets) {
  const expected = new Set(CANONICAL_UI_PERFORMANCE_ROUTES)
  const counts = new Map()
  const issues = []
  for (const budget of budgets) {
    counts.set(budget.route, (counts.get(budget.route) ?? 0) + 1)
    if (!expected.has(budget.route)) issues.push({ code: "route_unknown", subject: budget.route })
    if (!Number.isInteger(budget.maxCriticalRequests) || budget.maxCriticalRequests < 0) {
      issues.push({ code: "request_budget_invalid", subject: budget.route })
    } else if (budget.maxCriticalRequests > 3) {
      issues.push({ code: "request_budget_exceeded", subject: budget.route })
    }
    const conflict = budget.criticalApiAllowlist.find((allowed) =>
      budget.forbiddenOwnerPatterns.some(
        (forbidden) => allowed.includes(forbidden) || forbidden.includes(allowed),
      ),
    )
    if (conflict) issues.push({ code: "allowlist_forbidden_conflict", subject: budget.route })
  }
  for (const route of expected) {
    const count = counts.get(route) ?? 0
    if (count === 0) issues.push({ code: "route_missing", subject: route })
    if (count > 1) issues.push({ code: "route_duplicate", subject: route })
  }
  return { ok: issues.length === 0, issues }
}
