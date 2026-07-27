import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  CANONICAL_UI_ROUTE_REQUEST_POLICIES,
  CURRENT_WEBUI_STARTUP_REQUEST_BASELINE,
  canonicalizeUiRequest,
  validateUiRouteRequests,
} from "../packages/webui/src/lib/ui-request-baseline.ts"

describe("task003 initial request and hidden panel baseline", () => {
  it("canonicalizes pagination while removing sensitive and arbitrary query values", () => {
    expect(
      canonicalizeUiRequest({
        method: "get",
        requestPath: "/api/items?token=secret-value&limit=20&page=2&search=private words&cursor=opaque",
      }),
    ).toEqual({
      method: "GET",
      pathname: "/api/items",
      safePath: "/api/items?cursor=%3Cpresent%3E&limit=20&page=2&search=%3Cpresent%3E&token=%3Credacted%3E",
      queryKey: "GET /api/items?cursor=<present>&limit=20&page=2&search=<present>&token=<redacted>",
    })
  })

  it("separates duplicate, forbidden, unapproved, over-budget, and hidden panel diagnostics", () => {
    const policy = {
      route: "/capabilities/mcp",
      criticalQueryKeys: ["GET /api/capabilities/summary"],
      maxInitialRequests: 1,
      forbiddenPathPrefixes: ["/api/admin", "/api/audit"],
      activePanelOwner: "capabilities.mcp",
      backgroundOwnerAllowlist: ["shell.connection"],
    }
    const observations = [
      {
        route: "/capabilities/mcp",
        lifecycle: "before_first_paint" as const,
        requestPath: "/api/capabilities/summary",
        queryKey: "GET /api/capabilities/summary",
        owner: "capability.summary.read",
        panelOwner: "capabilities.mcp",
      },
      {
        route: "/capabilities/mcp",
        lifecycle: "before_first_paint" as const,
        requestPath: "/api/capabilities/summary",
        queryKey: "GET /api/capabilities/summary",
        owner: "capability.summary.read",
        panelOwner: "capabilities.mcp",
      },
      {
        route: "/capabilities/mcp",
        lifecycle: "before_first_paint" as const,
        requestPath: "/api/admin/live",
        queryKey: "GET /api/admin/live",
        owner: "admin.live.read",
        panelOwner: "capabilities.skills",
      },
    ]

    expect(validateUiRouteRequests({ policy, observations })).toEqual({
      ok: false,
      diagnostics: [
        { queryKey: "GET /api/capabilities/summary", reasonCode: "initial_query_duplicated" },
        { actual: 3, ceiling: 1, reasonCode: "initial_request_budget_exceeded" },
        { reasonCode: "forbidden_request_observed", requestPath: "/api/admin/live" },
        { queryKey: "GET /api/admin/live", reasonCode: "initial_query_not_allowed" },
        {
          activePanelOwner: "capabilities.mcp",
          panelOwner: "capabilities.skills",
          queryKey: "GET /api/admin/live",
          reasonCode: "hidden_panel_request_observed",
        },
      ],
    })
  })

  it("keeps lazy requests outside initial budgets and permits declared background owners", () => {
    const policy = CANONICAL_UI_ROUTE_REQUEST_POLICIES.find((item) => item.route === "/chat")!
    expect(
      validateUiRouteRequests({
        policy,
        observations: [
          {
            route: "/chat",
            lifecycle: "after_first_paint",
            requestPath: "/api/runs?limit=20",
            queryKey: "GET /api/runs?limit=20",
            owner: "work.runs.read",
            panelOwner: "chat",
          },
          {
            route: "/chat",
            lifecycle: "background",
            requestPath: "/api/status",
            queryKey: "GET /api/status",
            owner: "shell.connection",
            panelOwner: "shell.connection",
          },
        ],
      }),
    ).toEqual({ ok: true, diagnostics: [] })
  })

  it("records the current startup gap without treating it as accepted behavior", () => {
    const policy = CANONICAL_UI_ROUTE_REQUEST_POLICIES.find((item) => item.route === "/chat")!
    const result = validateUiRouteRequests({
      policy,
      observations: CURRENT_WEBUI_STARTUP_REQUEST_BASELINE,
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((item) => item.reasonCode)).toEqual(
      expect.arrayContaining([
        "initial_query_duplicated",
        "initial_request_budget_exceeded",
        "initial_query_not_allowed",
      ]),
    )
    expect(CURRENT_WEBUI_STARTUP_REQUEST_BASELINE).toHaveLength(10)
  })

  it("contains no runtime environment, network, storage, or logging side effects", () => {
    const source = readFileSync("packages/webui/src/lib/ui-request-baseline.ts", "utf8")
    expect(source).not.toMatch(/process\.env|fetch\(|XMLHttpRequest/)
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
    expect(source).not.toMatch(/console\.|logger\./)
  })
})
