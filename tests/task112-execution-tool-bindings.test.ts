import { describe, expect, it } from "vitest"
import { projectAgentExecutionToolBindings } from "../packages/core/src/runs/execution-tool-bindings.ts"

describe("task112 execution tool bindings", () => {
  it("projects only tools executable from the current source", () => {
    const bindings = projectAgentExecutionToolBindings({
      toolsEnabled: true,
      source: "webui",
      tools: [
        {
          name: "web_search",
          description: "Search public web sources",
          riskLevel: "safe",
          requiresApproval: false,
          evidenceSourceKind: "web",
        },
        {
          name: "telegram_only",
          description: "Telegram-only operation",
          riskLevel: "safe",
          requiresApproval: false,
          availableSources: ["telegram"],
        },
        {
          name: "dangerous_action",
          description: "Mutate a protected target",
          riskLevel: "dangerous",
          requiresApproval: true,
        },
      ] as never,
    })

    expect(bindings).toEqual([
      {
        tool_id: "dangerous_action",
        label: "Mutate a protected target",
        permission_scope: "approval_required",
      },
      {
        tool_id: "web_search",
        label: "Search public web sources",
        permission_scope: "external",
      },
    ])
  })

  it("returns no execution bindings when tools are disabled for the run", () => {
    expect(projectAgentExecutionToolBindings({
      toolsEnabled: false,
      source: "webui",
      tools: [{
        name: "web_search",
        description: "Search public web sources",
        riskLevel: "safe",
        requiresApproval: false,
      }] as never,
    })).toEqual([])
  })
})
