import { describe, expect, it } from "vitest"
import {
  getYeonjangSideEffectMethodContract,
  validateYeonjangSideEffectToolContract,
} from "../packages/core/src/capabilities/yeonjang-side-effect-contract.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"
import type { AgentTool } from "../packages/core/src/tools/types.ts"

const hypotheticalBrowserFocusTool = {
  name: "yeonjang_browser_focus",
  description: "Hypothetical browser focus tool.",
  parameters: { type: "object", properties: {} },
  riskLevel: "moderate",
  requiresApproval: true,
  runtimeHealthMode: "required",
  runtimeMethodIds: ["browser.focus"],
  execute: async () => ({ success: false, output: "not registered" }),
} satisfies AgentTool

describe("Task 121 Yeonjang browser.focus side-effect method contract", () => {
  it("recognizes browser.focus as an approval-gated side-effect method without exposing a production tool binding", () => {
    expect(getYeonjangSideEffectMethodContract("browser.focus")).toMatchObject({
      method: "browser.focus",
      toolNames: [],
      riskLevel: "moderate",
      sideEffectClass: "process_control",
      permissionSetting: "allow_browser_control",
      approvalRequired: true,
      idempotencyRequired: true,
      preEffectAuthorizationRequired: true,
      postCheckRequired: true,
      postCheckMode: "target_observation_required",
      defaultLiveSmokeAllowed: false,
      rawPayloadVisibility: "audit_only",
    })
  })

  it("keeps hypothetical browser.focus tool blocked until an explicit tool binding is added", () => {
    expect(validateYeonjangSideEffectToolContract({
      method: "browser.focus",
      tool: hypotheticalBrowserFocusTool,
    })).toEqual({
      ok: false,
      reasonCode: "tool_name_not_bound",
    })
    expect(validateYeonjangSideEffectToolContract({
      method: "browser.focus",
      tool: { ...hypotheticalBrowserFocusTool, runtimeMethodIds: [] },
    })).toEqual({
      ok: false,
      reasonCode: "tool_missing_runtime_method",
    })
  })

  it("still keeps browser.focus out of production mapping, Skill catalog, and Rust dispatch", () => {
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).toContain("browser.focus")
    expect(YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)).toContain("yeonjang_browser_focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })
})
