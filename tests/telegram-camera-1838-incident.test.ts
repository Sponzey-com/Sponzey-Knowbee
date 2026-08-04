import { describe, expect, it } from "vitest"
import { validateYeonjangSideEffectToolContract } from "../packages/core/src/capabilities/yeonjang-side-effect-contract.ts"
import { parseUserInputRequirement } from "../packages/core/src/contracts/user-input-requirement.ts"
import { yeonjangCameraCaptureTool } from "../packages/core/src/tools/builtin/yeonjang.ts"
import type { AgentTool } from "../packages/core/src/tools/types.ts"
import { TELEGRAM_CAMERA_1838_INCIDENT } from "./fixtures/telegram-camera-1838-incident.ts"

describe("Telegram camera 18:38 incident characterization", () => {
  it("keeps approval, effect, command response and terminal projection as separate facts", () => {
    const incident = TELEGRAM_CAMERA_1838_INCIDENT

    expect(incident.approvals).toHaveLength(3)
    expect(incident.approvals.every(
      ({ registryStatus, policyDecision }) =>
        registryStatus === "consumed" && policyDecision === "allow",
    )).toBe(true)
    expect(incident.operation).toMatchObject({
      count: 1,
      state: "MANUAL_INTERVENTION",
    })
    expect(incident.attempts.map(({ error }) => error)).toEqual([
      "SIDE_EFFECT_MANUAL_INTERVENTION",
      "SIDE_EFFECT_OPERATION_BLOCKED",
      "SIDE_EFFECT_OPERATION_BLOCKED",
    ])
    expect(incident.command).toEqual({
      method: "camera.capture",
      sent: true,
      responseReceived: false,
      onlineHeartbeatAfterSend: true,
      reasonCode: "camera_capture_timeout",
    })
    expect(parseUserInputRequirement(
      incident.terminalProjection.inputRequirement,
    )).toBeNull()
  })

  it("accepts the production camera binding and rejects a same-name test fake", () => {
    expect(validateYeonjangSideEffectToolContract({
      method: "camera.capture",
      tool: yeonjangCameraCaptureTool,
    })).toMatchObject({
      ok: true,
      contract: {
        method: "camera.capture",
        approvalRequired: true,
        postCheckRequired: true,
      },
    })

    const fake = {
      name: "yeonjang_camera_capture",
      riskLevel: "dangerous",
      requiresApproval: true,
    } as Pick<
      AgentTool,
      "name" | "requiresApproval" | "riskLevel" | "runtimeMethodIds"
    >
    expect(validateYeonjangSideEffectToolContract({
      method: "camera.capture",
      tool: fake,
    })).toEqual({
      ok: false,
      reasonCode: "tool_missing_runtime_method",
    })
  })
})
