import { describe, expect, it } from "vitest"
import {
  CANONICAL_UI_ROUTE_BUDGETS,
  resolveCanonicalUiRouteBudget,
  validateCanonicalUiRouteBudgets,
} from "../packages/webui/src/lib/ui-performance.ts"
import { webUiBuildGateExitCode } from "../scripts/collect-webui-build-baseline.mjs"
import { buildWebUiBuildBaseline } from "../scripts/lib/webui-build-baseline.mjs"
import {
  evaluateCanonicalRoutePerformance,
  sanitizeBrowserRequest,
} from "../scripts/lib/webui-live-performance-evidence.mjs"

describe("task048 canonical UI performance manifest", () => {
  it("defines the five representative canonical routes without mode fallback", () => {
    expect(CANONICAL_UI_ROUTE_BUDGETS.map((budget) => budget.route)).toEqual([
      "/chat",
      "/work/runs",
      "/agents",
      "/capabilities/skills",
      "/settings/basics",
    ])
    expect(validateCanonicalUiRouteBudgets(CANONICAL_UI_ROUTE_BUDGETS)).toEqual({
      ok: true,
      issues: [],
    })
    expect(resolveCanonicalUiRouteBudget("/unknown")).toBeNull()
  })

  it("rejects missing, duplicate, excessive, and conflicting route budgets", () => {
    const invalid = [
      ...CANONICAL_UI_ROUTE_BUDGETS.filter((budget) => budget.route !== "/settings/basics"),
      { ...CANONICAL_UI_ROUTE_BUDGETS[0], route: "/chat", maxCriticalRequests: 4 },
      {
        ...CANONICAL_UI_ROUTE_BUDGETS[1],
        route: "/unknown",
        forbiddenOwnerPatterns: [CANONICAL_UI_ROUTE_BUDGETS[1]?.criticalApiAllowlist[0]],
      },
    ]
    const result = validateCanonicalUiRouteBudgets(invalid)
    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "route_missing",
        "route_duplicate",
        "route_unknown",
        "request_budget_exceeded",
        "allowlist_forbidden_conflict",
      ]),
    )
  })
})

describe("task048 deterministic performance gates", () => {
  it("fails the build CLI for either incomplete evidence or a budget violation", () => {
    expect(webUiBuildGateExitCode({ complete: true }, { ok: true })).toBe(0)
    expect(webUiBuildGateExitCode({ complete: false }, { ok: true })).toBe(1)
    expect(webUiBuildGateExitCode({ complete: true }, { ok: false })).toBe(1)
  })

  it("resolves a stable dynamic chunk name when Rollup emits a virtual manifest key", () => {
    const baseline = buildWebUiBuildBaseline({
      mode: "production",
      manifest: {
        "index.html": { file: "assets/index.js", isEntry: true },
        "_AgentsPage-hash.js": {
          file: "assets/AgentsPage-hash.js",
          name: "AgentsPage",
          isDynamicEntry: true,
        },
      },
      assetMetrics: {
        "assets/index.js": { bytes: 10, gzipBytes: 10 },
        "assets/AgentsPage-hash.js": { bytes: 10, gzipBytes: 10 },
      },
      routeBindings: [{ route: "/agents", chunkName: "AgentsPage" }],
    })
    expect(baseline.complete).toBe(true)
    expect(baseline.routes[0]).toEqual(
      expect.objectContaining({
        route: "/agents",
        source: "chunk:AgentsPage",
      }),
    )
  })

  it("evaluates route request, vital, long-task, and overflow ceilings", () => {
    const budget = CANONICAL_UI_ROUTE_BUDGETS[1]
    if (!budget) throw new Error("work_route_budget_missing")
    const acceptedRequests = budget.criticalApiAllowlist
      .slice(0, budget.maxCriticalRequests)
      .map((path) => ({
        method: "GET",
        safePath: path,
        queryKey: `GET ${path}`,
        startMs: 1,
      }))
    const accepted = evaluateCanonicalRoutePerformance({
      budget,
      sample: {
        route: "/work/runs",
        metrics: { lcpMs: 900, cls: 0.01, usableMs: 500, maxLongTaskMs: 42 },
        requests: acceptedRequests,
        horizontalOverflow: false,
      },
    })
    expect(accepted).toEqual({ ok: true, issues: [] })

    const rejected = evaluateCanonicalRoutePerformance({
      budget,
      sample: {
        route: "/work/runs",
        metrics: { lcpMs: 2_501, cls: 0.11, usableMs: 801, maxLongTaskMs: 51 },
        requests: [
          ...acceptedRequests,
          { method: "GET", safePath: "/api/schedules", queryKey: "GET /api/schedules", startMs: 2 },
        ],
        horizontalOverflow: true,
      },
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "lcp_budget_exceeded",
        "cls_budget_exceeded",
        "usable_budget_exceeded",
        "long_task_budget_exceeded",
        "forbidden_owner_requested",
        "horizontal_overflow",
      ]),
    )
  })

  it("keeps arbitrary query values out of performance receipts", () => {
    const receipt = sanitizeBrowserRequest({
      method: "GET",
      requestUrl: "http://localhost/api/skills?search=private-name&token=secret",
      applicationOrigin: "http://localhost",
      startMs: 1,
    })
    expect(JSON.stringify(receipt)).not.toMatch(/private-name|secret/u)
  })
})
