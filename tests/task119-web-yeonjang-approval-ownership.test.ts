import { describe, expect, it } from "vitest"
import {
  getYeonjangSensitiveOperationForTool,
  requiresDefaultYeonjangToolApproval,
} from "../packages/core/src/orchestration/product-parameter-policy.ts"
import { requiresApprovalAtExecutionBoundary } from "../packages/core/src/tools/dispatcher.ts"

const readOnlyWebTools = ["web_search", "web_fetch"] as const
const yeonjangMutationTools = [
  "file_write",
  "shell_exec",
  "app_launch",
  "screen_capture",
  "keyboard_type",
  "mouse_click",
] as const

describe("Task 119 web and Yeonjang approval ownership", () => {
  it.each(readOnlyWebTools)("does not classify core %s as a Yeonjang operation", (toolName) => {
    expect(getYeonjangSensitiveOperationForTool(toolName)).toBeNull()
    expect(requiresDefaultYeonjangToolApproval(toolName)).toBe(false)
  })

  it.each(readOnlyWebTools)("admits safe core %s without an on-miss approval", (toolName) => {
    expect(
      requiresApprovalAtExecutionBoundary({
        tool: { name: toolName, riskLevel: "safe", requiresApproval: false },
        approvalMode: "on-miss",
        capabilityApprovalRequired: false,
      }),
    ).toBe(false)
  })

  it.each(yeonjangMutationTools)("keeps %s behind the safe-default approval", (toolName) => {
    expect(getYeonjangSensitiveOperationForTool(toolName)).not.toBeNull()
    expect(
      requiresApprovalAtExecutionBoundary({
        tool: { name: toolName, riskLevel: "safe", requiresApproval: false },
        approvalMode: "off",
        capabilityApprovalRequired: false,
      }),
    ).toBe(true)
  })

  it("still honors an explicit capability approval requirement for web retrieval", () => {
    expect(
      requiresApprovalAtExecutionBoundary({
        tool: { name: "web_search", riskLevel: "safe", requiresApproval: false },
        approvalMode: "on-miss",
        capabilityApprovalRequired: true,
      }),
    ).toBe(true)
  })
})
