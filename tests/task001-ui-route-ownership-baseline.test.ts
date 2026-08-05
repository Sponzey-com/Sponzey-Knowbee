import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  UI_ROUTE_BASELINE,
  UI_ROUTE_BASELINE_VERSION,
  UI_WORKFLOW_OWNERSHIP_BASELINE,
  validateUiRouteBaseline,
  validateUiWorkflowOwnership,
} from "../packages/webui/src/lib/ui-architecture-baseline.ts"

function appRoutePaths(): string[] {
  const source = readFileSync("packages/webui/src/App.tsx", "utf8")
  return [...source.matchAll(/\bpath="([^"]+)"/g)].map((match) => match[1] ?? "")
}

describe("task001 UI route and ownership baseline", () => {
  it("keeps the versioned route baseline synchronized with the App route tree", () => {
    expect(UI_ROUTE_BASELINE_VERSION).toBe("ui-route-baseline:v1")

    const result = validateUiRouteBaseline({
      actualRoutePaths: appRoutePaths(),
      baseline: UI_ROUTE_BASELINE,
    })

    expect(result).toEqual({ ok: true, diagnostics: [] })
  })

  it("reports missing, unknown, and duplicate route patterns with stable reason codes", () => {
    const result = validateUiRouteBaseline({
      actualRoutePaths: ["/chat", "/unknown", "/unknown"],
      baseline: [
        { path: "/chat", exposure: "user", componentOwner: "ChatPage" },
        { path: "/settings", exposure: "user", componentOwner: "SetupPage" },
      ],
    })

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        { reasonCode: "actual_route_duplicate", routePath: "/unknown" },
        { reasonCode: "actual_route_not_registered", routePath: "/unknown" },
        { reasonCode: "registered_route_missing", routePath: "/settings" },
      ],
    })
  })

  it("defines explicit query, command, and store ownership for the first Phase 0 workflows", () => {
    expect(UI_WORKFLOW_OWNERSHIP_BASELINE.map((item) => item.workflowId)).toEqual([
      "settings.workspace",
      "agents.workspace",
      "capabilities.setup_embedded",
    ])

    expect(validateUiWorkflowOwnership(UI_WORKFLOW_OWNERSHIP_BASELINE)).toEqual({
      ok: true,
      diagnostics: [],
    })
  })

  it("rejects ambiguous command ownership and restricted data on a user workflow", () => {
    const result = validateUiWorkflowOwnership([
      {
        workflowId: "first",
        routes: ["/first"],
        componentOwners: ["FirstPage"],
        queryOwners: ["first.query"],
        commandOwners: ["shared.save"],
        storeDependencies: ["firstStore"],
        exposure: "user",
        dataClasses: ["user_projection"],
      },
      {
        workflowId: "second",
        routes: ["/second"],
        componentOwners: ["SecondPage"],
        queryOwners: ["second.query"],
        commandOwners: ["shared.save"],
        storeDependencies: ["secondStore"],
        exposure: "user",
        dataClasses: ["raw_system_prompt"],
      },
    ])

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          owner: "shared.save",
          reasonCode: "command_owner_duplicated",
          workflowId: "second",
        },
        {
          dataClass: "raw_system_prompt",
          reasonCode: "restricted_data_exposed_to_user",
          workflowId: "second",
        },
      ],
    })
  })

  it("does not depend on runtime environment or logging side effects", () => {
    const source = readFileSync("packages/webui/src/lib/ui-architecture-baseline.ts", "utf8")

    expect(source).not.toMatch(/process\.env/)
    expect(source).not.toMatch(/console\.|logger\./)
    expect(source).not.toMatch(/fetch\(|localStorage|sessionStorage/)
  })
})
