export type UiPerformanceMode = "beginner" | "advanced" | "admin"
export type UiViewportClass = "mobile" | "tablet" | "desktop"

export interface UiApiBudget {
  mode: UiPerformanceMode
  route: string
  criticalApiAllowlist: string[]
  forbiddenApiPatterns: string[]
  maxInitialRequests: number
  lazyAfterFirstPaint: boolean
}

export interface UiListWindowPolicy {
  mode: UiPerformanceMode
  route: string
  defaultLimit: number
  hardLimit: number
  virtualizeAbove: number
  serverSideFilterRequiredAbove: number
}

export interface UiAccessibilityPolicy {
  viewport: UiViewportClass
  minTouchTargetPx: number
  inputStacksVertically: boolean
  approvalButtonsWrap: boolean
  requiresAriaLabel: boolean
  statusRequiresTextLabel: boolean
}

export const CANONICAL_UI_PERFORMANCE_ROUTES = canonicalRoutes as readonly [
  "/chat",
  "/work/runs",
  "/agents",
  "/capabilities/skills",
  "/settings/basics",
]

export type CanonicalUiPerformanceRoute = (typeof CANONICAL_UI_PERFORMANCE_ROUTES)[number]

export interface CanonicalUiRouteBudget {
  route: CanonicalUiPerformanceRoute
  criticalApiAllowlist: readonly string[]
  forbiddenOwnerPatterns: readonly string[]
  maxCriticalRequests: number
  lazyOwners: readonly string[]
}

export type CanonicalUiRouteBudgetIssueCode =
  | "route_missing"
  | "route_unknown"
  | "route_duplicate"
  | "request_budget_exceeded"
  | "request_budget_invalid"
  | "allowlist_forbidden_conflict"

export interface CanonicalUiRouteBudgetIssue {
  code: CanonicalUiRouteBudgetIssueCode
  subject: string
}

export const CANONICAL_UI_ROUTE_BUDGETS = canonicalBudgets as readonly CanonicalUiRouteBudget[]

export function resolveCanonicalUiRouteBudget(route: string): CanonicalUiRouteBudget | null {
  return resolveCanonicalBudget(route) as CanonicalUiRouteBudget | null
}

export function validateCanonicalUiRouteBudgets(
  budgets: readonly ({ route: string } & Omit<CanonicalUiRouteBudget, "route">)[],
): { ok: boolean; issues: CanonicalUiRouteBudgetIssue[] } {
  return validateCanonicalBudgets(budgets) as {
    ok: boolean
    issues: CanonicalUiRouteBudgetIssue[]
  }
}

const BEGINNER_HOME_BUDGET: UiApiBudget = {
  mode: "beginner",
  route: "/chat",
  criticalApiAllowlist: ["/api/ui/shell", "/api/runs", "/api/chat", "/api/status"],
  forbiddenApiPatterns: [
    "/api/admin",
    "/api/audit",
    "/api/doctor?full",
    "/api/gateway/logs",
    "/api/raw",
    "raw",
  ],
  maxInitialRequests: 4,
  lazyAfterFirstPaint: true,
}

const ADVANCED_DASHBOARD_BUDGET: UiApiBudget = {
  mode: "advanced",
  route: "/advanced/dashboard",
  criticalApiAllowlist: ["/api/status", "/api/runs", "/api/operations/summary", "/api/doctor"],
  forbiddenApiPatterns: ["/api/admin", "/api/raw"],
  maxInitialRequests: 4,
  lazyAfterFirstPaint: true,
}

const ADMIN_BUDGET: UiApiBudget = {
  mode: "admin",
  route: "/admin",
  criticalApiAllowlist: [
    "/api/admin/shell",
    "/api/admin/live",
    "/api/admin/tool-lab",
    "/api/admin/runtime-inspectors",
    "/api/admin/platform-inspectors",
  ],
  forbiddenApiPatterns: ["/api/raw"],
  maxInitialRequests: 5,
  lazyAfterFirstPaint: true,
}

export const UI_API_BUDGETS: UiApiBudget[] = [
  BEGINNER_HOME_BUDGET,
  ADVANCED_DASHBOARD_BUDGET,
  ADMIN_BUDGET,
]

export const UI_LIST_WINDOW_POLICIES: UiListWindowPolicy[] = [
  {
    mode: "advanced",
    route: "/work/runs",
    defaultLimit: 50,
    hardLimit: 200,
    virtualizeAbove: 100,
    serverSideFilterRequiredAbove: 200,
  },
  {
    mode: "advanced",
    route: "/advanced/audit",
    defaultLimit: 50,
    hardLimit: 200,
    virtualizeAbove: 100,
    serverSideFilterRequiredAbove: 200,
  },
  {
    mode: "admin",
    route: "/admin",
    defaultLimit: 120,
    hardLimit: 500,
    virtualizeAbove: 200,
    serverSideFilterRequiredAbove: 500,
  },
]

export function getUiApiBudget(mode: UiPerformanceMode, route: string): UiApiBudget {
  return (
    UI_API_BUDGETS.find((budget) => budget.mode === mode && route.startsWith(budget.route)) ??
    BEGINNER_HOME_BUDGET
  )
}

export function isApiAllowedForBudget(apiPath: string, budget: UiApiBudget): boolean {
  const normalized = apiPath.trim()
  if (!normalized) return false
  if (budget.forbiddenApiPatterns.some((pattern) => normalized.includes(pattern))) return false
  return budget.criticalApiAllowlist.some(
    (allowed) =>
      normalized === allowed ||
      normalized.startsWith(`${allowed}?`) ||
      normalized.startsWith(`${allowed}/`),
  )
}

export function validateApiCallsForBudget(
  apiPaths: string[],
  budget: UiApiBudget,
): {
  ok: boolean
  allowed: string[]
  blocked: string[]
  overBudget: boolean
} {
  const allowed: string[] = []
  const blocked: string[] = []
  for (const path of apiPaths) {
    if (isApiAllowedForBudget(path, budget)) allowed.push(path)
    else blocked.push(path)
  }
  return {
    ok: blocked.length === 0 && allowed.length <= budget.maxInitialRequests,
    allowed,
    blocked,
    overBudget: allowed.length > budget.maxInitialRequests,
  }
}

export function getUiListWindowPolicy(mode: UiPerformanceMode, route: string): UiListWindowPolicy {
  return (
    UI_LIST_WINDOW_POLICIES.find(
      (policy) => policy.mode === mode && route.startsWith(policy.route),
    ) ?? {
      mode,
      route,
      defaultLimit: 50,
      hardLimit: 200,
      virtualizeAbove: 100,
      serverSideFilterRequiredAbove: 200,
    }
  )
}

export function clampUiListLimit(
  requested: number | undefined,
  policy: UiListWindowPolicy,
): number {
  if (requested == null || !Number.isFinite(requested)) return policy.defaultLimit
  return Math.max(1, Math.min(policy.hardLimit, Math.floor(requested)))
}

export function shouldVirtualizeList(itemCount: number, policy: UiListWindowPolicy): boolean {
  return itemCount >= policy.virtualizeAbove
}

export function getUiAccessibilityPolicy(viewport: UiViewportClass): UiAccessibilityPolicy {
  return {
    viewport,
    minTouchTargetPx: viewport === "mobile" ? 44 : 40,
    inputStacksVertically: viewport === "mobile",
    approvalButtonsWrap: true,
    requiresAriaLabel: true,
    statusRequiresTextLabel: true,
  }
}
import {
  CANONICAL_UI_ROUTE_BUDGETS as canonicalBudgets,
  CANONICAL_UI_PERFORMANCE_ROUTES as canonicalRoutes,
  resolveCanonicalUiRouteBudget as resolveCanonicalBudget,
  validateCanonicalUiRouteBudgets as validateCanonicalBudgets,
} from "./canonical-ui-performance.js"
