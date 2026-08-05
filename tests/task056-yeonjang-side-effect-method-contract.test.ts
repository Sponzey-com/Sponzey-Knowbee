import { describe, expect, it } from "vitest"
import {
  getYeonjangSideEffectMethodContract,
  isYeonjangSideEffectMethod,
  validateYeonjangSideEffectToolContract,
  YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS,
} from "../packages/core/src/capabilities/yeonjang-side-effect-contract.ts"
import { YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"
import {
  appLaunchTool,
  keyboardActionTool,
  keyboardShortcutTool,
  keyboardTypeTool,
  mouseActionTool,
  mouseClickTool,
  mouseMoveTool,
  screenCaptureTool,
  screenFindTextTool,
  shellExecTool,
  yeonjangBroadcastRunTool,
  yeonjangBrowserOpenUrlTool,
  yeonjangCameraCaptureTool,
  yeonjangClipboardWriteTool,
  yeonjangFileDeleteTool,
  yeonjangFilePatchTool,
  yeonjangFileWriteTool,
} from "../packages/core/src/tools/index.ts"

const REQUIRED_METHODS = [
  "file.write",
  "file.patch",
  "file.delete",
  "browser.open_url",
  "browser.focus",
  "clipboard.write",
  "camera.capture",
  "screen.capture",
  "mouse.move",
  "mouse.click",
  "mouse.action",
  "keyboard.type",
  "keyboard.action",
  "application.launch",
  "system.exec",
  "system.control",
] as const

const TOOL_BY_NAME = new Map(
  [
    yeonjangFileWriteTool,
    yeonjangFilePatchTool,
    yeonjangFileDeleteTool,
    yeonjangClipboardWriteTool,
    yeonjangCameraCaptureTool,
    screenCaptureTool,
    screenFindTextTool,
    mouseMoveTool,
    mouseClickTool,
    mouseActionTool,
    keyboardTypeTool,
    keyboardShortcutTool,
    keyboardActionTool,
    appLaunchTool,
    shellExecTool,
    yeonjangBroadcastRunTool,
    yeonjangBrowserOpenUrlTool,
  ].map((tool) => [tool.name, tool]),
)

describe("Task 056 Yeonjang side-effect method contract", () => {
  it("defines approval, idempotency, audit-only payload and post-check for every side-effect method", () => {
    expect(YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS.map((contract) => contract.method).sort()).toEqual(
      [...REQUIRED_METHODS].sort(),
    )

    for (const method of REQUIRED_METHODS) {
      const contract = getYeonjangSideEffectMethodContract(method)
      expect(contract).toMatchObject({
        method,
        approvalRequired: true,
        idempotencyRequired: true,
        preEffectAuthorizationRequired: true,
        postCheckRequired: true,
        defaultLiveSmokeAllowed: false,
        rawPayloadVisibility: "audit_only",
      })
      expect(contract?.riskLevel).not.toBe("safe")
      expect(contract?.sideEffectClass).not.toBe("read_local")
      if (method !== "system.control" && method !== "browser.focus") {
        expect(contract?.toolNames.length).toBeGreaterThan(0)
      }
      expect(contract?.permissionSetting.trim()).toBeTruthy()
      expect(isYeonjangSideEffectMethod(method)).toBe(true)
    }
  })

  it("requires bound tools to expose runtime method, non-safe risk and approval metadata", () => {
    for (const contract of YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS) {
      for (const toolName of contract.toolNames) {
        const tool = TOOL_BY_NAME.get(toolName)
        expect(tool, `${toolName} must be exported from the built-in tool index`).toBeDefined()
        const validation = validateYeonjangSideEffectToolContract({
          method: contract.method,
          tool: tool!,
        })
        expect(
          validation,
          `${contract.method}/${toolName}: ${JSON.stringify(validation)}`,
        ).toMatchObject({ ok: true })
      }
    }
  })

  it("keeps Yeonjang mapping risk and permission metadata aligned with the contract", () => {
    const mappings = new Map(YEONJANG_TOOL_MAPPINGS.map((mapping) => [mapping.toolName, mapping]))

    for (const contract of YEONJANG_SIDE_EFFECT_METHOD_CONTRACTS) {
      for (const toolName of contract.toolNames) {
        const mapping = mappings.get(toolName)
        if (!toolName.startsWith("yeonjang_")) continue
        expect(mapping, `${toolName} must have Yeonjang mapping`).toBeDefined()
        expect(mapping).toMatchObject({
          riskLevel: contract.riskLevel,
          requiresApproval: true,
          permissionSetting: contract.permissionSetting,
          targetKind: "yeonjang_remote",
          evidenceSourceKind: "yeonjang",
        })
        expect(mapping?.methodIds).toContain(contract.method)
      }
    }
  })

  it("does not allow side-effect methods in default read-only live smoke scenarios", () => {
    for (const method of REQUIRED_METHODS) {
      expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).not.toContain(method)
    }
  })
})
