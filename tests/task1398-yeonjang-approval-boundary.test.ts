import { describe, expect, it } from "vitest"
import { buildSafeProductParameterDefaults } from "../packages/core/src/contracts/product-parameters.ts"
import {
  getYeonjangSensitiveOperationForTool,
  requiresDefaultYeonjangToolApproval,
} from "../packages/core/src/orchestration/product-parameter-policy.ts"
import { requiresApprovalAtExecutionBoundary } from "../packages/core/src/tools/dispatcher.ts"

const sensitiveTools = [
  ["file_write", "file_change"],
  ["app_launch", "app_execution"],
  ["shell_exec", "terminal_command"],
  ["screen_capture", "screen_control"],
  ["keyboard_type", "keyboard_input"],
  ["mouse_click", "mouse_input"],
] as const

describe("task1398 Yeonjang sensitive-operation approval boundary", () => {
  it.each(sensitiveTools)(
    "maps %s to %s and requires the safe-default approval",
    (toolName, operation) => {
      expect(getYeonjangSensitiveOperationForTool(toolName)).toBe(operation)
      expect(requiresDefaultYeonjangToolApproval(toolName)).toBe(true)
    },
  )

  it.each([
    "file_patch",
    "file_delete",
    "process_kill",
    "screen_find_text",
    "yeonjang_camera_capture",
    "window_focus",
    "keyboard_shortcut",
    "keyboard_action",
    "mouse_move",
    "mouse_action",
  ])("covers the additional sensitive tool %s", (toolName) => {
    expect(getYeonjangSensitiveOperationForTool(toolName)).not.toBeNull()
    expect(requiresDefaultYeonjangToolApproval(toolName)).toBe(true)
  })

  it.each([
    "yeonjang_status",
    "yeonjang_camera_list",
    "file_read",
    "file_list",
    "web_search",
    "web_fetch",
  ])("does not classify read-only tool %s as a sensitive operation", (toolName) => {
    expect(getYeonjangSensitiveOperationForTool(toolName)).toBeNull()
    expect(requiresDefaultYeonjangToolApproval(toolName)).toBe(false)
  })

  it("recovers invalid product permissions to the canonical approval-required defaults", () => {
    const invalid = buildSafeProductParameterDefaults({ yeonjangPermissions: [] })

    expect(requiresDefaultYeonjangToolApproval("shell_exec", invalid)).toBe(true)
    expect(requiresDefaultYeonjangToolApproval("web_fetch", invalid)).toBe(false)
  })

  it.each(sensitiveTools)(
    "forces %s approval at the execution boundary even when runtime approval mode is off",
    (toolName) => {
      expect(
        requiresApprovalAtExecutionBoundary({
          tool: {
            name: toolName,
            requiresApproval: false,
            riskLevel: "safe",
          },
          approvalMode: "off",
          capabilityApprovalRequired: false,
        }),
      ).toBe(true)
    },
  )

  it("keeps an unclassified read-only tool executable when approval mode is off", () => {
    expect(
      requiresApprovalAtExecutionBoundary({
        tool: {
          name: "yeonjang_status",
          requiresApproval: false,
          riskLevel: "safe",
        },
        approvalMode: "off",
        capabilityApprovalRequired: false,
      }),
    ).toBe(false)
  })
})
