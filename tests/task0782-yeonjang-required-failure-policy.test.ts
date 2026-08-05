import { describe, expect, it } from "vitest"
import { buildYeonjangRequiredFailure } from "../packages/core/src/tools/builtin/yeonjang-required-failure.ts"

describe("task0782 Yeonjang required failure policy", () => {
  it("builds a structured unavailable-method failure with user next action", () => {
    const result = buildYeonjangRequiredFailure({ method: "system.exec" })

    expect(result).toEqual(expect.objectContaining({
      success: false,
      error: "YEONJANG_REQUIRED",
    }))
    expect(result.output).toContain("system.exec")
    expect(result.output).toContain("다음 행동:")
    expect(result.details).toEqual(expect.objectContaining({
      requiredExecutor: "yeonjang",
      requiredMethod: "system.exec",
      missingYeonjangCapability: "system.exec",
      reasonCode: "method_unavailable_or_disconnected",
      knowbeeOnlyFallbackAvailable: true,
      userNextAction: "Yeonjang을 연결하거나 해당 기능을 지원하는 인스턴스를 선택한 뒤 다시 실행하세요.",
    }))
  })

  it("builds a structured forbidden-core-local-path failure", () => {
    const result = buildYeonjangRequiredFailure({
      reason: "창 포커스 제어는 현재 코어 로컬 경로에서 금지되어 있습니다.",
      reasonCode: "core_local_path_forbidden",
    })

    expect(result.error).toBe("YEONJANG_REQUIRED")
    expect(result.output).toContain("코어 로컬 경로")
    expect(result.details).toEqual(expect.objectContaining({
      requiredExecutor: "yeonjang",
      missingYeonjangCapability: null,
      reasonCode: "core_local_path_forbidden",
      knowbeeOnlyFallbackAvailable: true,
    }))
  })
})
