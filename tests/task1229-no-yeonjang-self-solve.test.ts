import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  buildTruthfulNoYeonjangResult,
  decideNoYeonjangCapabilityGap,
  type YeonjangIdentityBoundarySnapshot,
} from "../packages/core/src/index.ts"
import { renderNoYeonjangCapabilityGuidance } from "../packages/core/src/runs/no-yeonjang-capability-guidance.ts"

const now = Date.UTC(2026, 6, 14, 11, 0, 0)

function snapshot(options: { capability?: string; online?: boolean; trusted?: boolean } = {}): YeonjangIdentityBoundarySnapshot {
  const hasInstance = options.capability !== undefined
  return {
    schemaVersion: 1,
    capturedAt: now,
    runtime: { kind: "knowbee_runtime", runtimeId: "runtime:main", hostComputerId: "computer:local", observedAt: now },
    instances: hasInstance
      ? [{
          kind: "yeonjang_instance",
          instanceId: "instance:local",
          label: "내 연장",
          instanceAlias: "local",
          callNames: ["내 컴퓨터"],
          locality: "local",
          computerId: "computer:local",
          connectionState: options.online === false ? "offline" : "online",
          trustState: options.trusted === false ? "pending" : "trusted",
          capabilitySnapshotRef: "capability:v1",
          permissionSnapshotRef: "permission:v1",
          capabilityIds: [options.capability!],
          observedAt: now,
        }]
      : [],
    computers: [{ kind: "computer", computerId: "computer:local", label: "내 Mac", operatingSystemId: "os:local", observedAt: now }],
    operatingSystems: [{
      kind: "operating_system", operatingSystemId: "os:local", family: "macos", version: "15", architecture: "aarch64", observedAt: now,
    }],
  }
}

const selfStep = { stepId: "step:plan", summary: "작업 워크플로우 초안 작성", executionKind: "knowbee_only" as const }
const screenStep = {
  stepId: "step:screen",
  summary: "현재 화면 캡처",
  executionKind: "yeonjang_required" as const,
  requiredCapability: "screen.capture",
  requiredCapabilityName: "화면 캡처 기능",
  userFacingReason: "현재 연결되어 사용할 수 있는 연장이 없습니다.",
  userNextAction: "연장을 연결한 뒤 다시 요청하세요.",
}

describe("task1229 no-Yeonjang self-solve and truthful capability fallback", () => {
  it("preserves Knowbee-only work while blocking only the unavailable computer action", () => {
    const decision = decideNoYeonjangCapabilityGap({ steps: [selfStep, screenStep], snapshot: snapshot(), maxAgeMs: 1_000 })
    expect(decision).toEqual({
      schemaVersion: 1,
      outcome: "partial_self_solve",
      selfSolveSteps: [{ stepId: "step:plan", summary: "작업 워크플로우 초안 작성" }],
      blockedSteps: [{
        stepId: "step:screen",
        summary: "현재 화면 캡처",
        status: "not_executed",
        requiredCapability: "screen.capture",
        requiredCapabilityName: "화면 캡처 기능",
        reasonCode: "no_runnable_yeonjang_capability",
        userFacingReason: "현재 연결되어 사용할 수 있는 연장이 없습니다.",
        userNextAction: "연장을 연결한 뒤 다시 요청하세요.",
      }],
    })
    expect(buildTruthfulNoYeonjangResult({
      decision,
      selfSolveResults: [{ stepId: "step:plan", result: "세 단계 워크플로우 초안을 작성했습니다." }],
    })).toMatchObject({ status: "partial", blockedSteps: [{ status: "not_executed" }] })
  })

  it("continues conversation, reasoning, planning, guidance, and workflow work without Yeonjang", () => {
    const knowbeeSteps = [
      { stepId: "step:conversation", summary: "사용자와 대화", executionKind: "knowbee_only" as const },
      { stepId: "step:reasoning", summary: "요청 조건 추론", executionKind: "knowbee_only" as const },
      { stepId: "step:planning", summary: "실행 계획 작성", executionKind: "knowbee_only" as const },
      { stepId: "step:guidance", summary: "사용자 안내 작성", executionKind: "knowbee_only" as const },
      { stepId: "step:workflow", summary: "워크플로우 작성", executionKind: "knowbee_only" as const },
    ]
    const decision = decideNoYeonjangCapabilityGap({
      steps: [...knowbeeSteps, screenStep],
      snapshot: snapshot(),
      maxAgeMs: 1_000,
    })
    const result = buildTruthfulNoYeonjangResult({
      decision,
      selfSolveResults: knowbeeSteps.map((step) => ({
        stepId: step.stepId,
        result: `${step.summary} 완료`,
      })),
    })

    expect(decision.outcome).toBe("partial_self_solve")
    expect(result.status).toBe("partial")
    expect(result.completedSelfSolveResults.map((item) => item.stepId)).toEqual(
      knowbeeSteps.map((step) => step.stepId),
    )
    expect(result.blockedSteps).toEqual([
      expect.objectContaining({ stepId: "step:screen", status: "not_executed" }),
    ])
  })

  it("distinguishes complete self-solve from fully blocked guidance", () => {
    const selfSolve = decideNoYeonjangCapabilityGap({ steps: [selfStep], snapshot: snapshot(), maxAgeMs: 1_000 })
    expect(selfSolve.outcome).toBe("self_solve")
    expect(buildTruthfulNoYeonjangResult({
      decision: selfSolve,
      selfSolveResults: [{ stepId: "step:plan", result: "초안을 작성했습니다." }],
    }).status).toBe("completed")

    const guidance = decideNoYeonjangCapabilityGap({ steps: [screenStep], snapshot: snapshot(), maxAgeMs: 1_000 })
    expect(guidance.outcome).toBe("guidance_required")
    expect(buildTruthfulNoYeonjangResult({ decision: guidance, selfSolveResults: [] })).toMatchObject({
      status: "blocked", blockedSteps: [{ status: "not_executed" }],
    })
  })

  it("refuses the fallback when a trusted online Yeonjang can perform the capability", () => {
    expect(() => decideNoYeonjangCapabilityGap({
      steps: [screenStep], snapshot: snapshot({ capability: "screen.capture" }), maxAgeMs: 1_000,
    })).toThrow(/cannot block an available capability/i)
    expect(() => decideNoYeonjangCapabilityGap({
      steps: [screenStep], snapshot: snapshot({ capability: "screen.capture", online: false }), maxAgeMs: 1_000,
    })).not.toThrow()
    expect(() => decideNoYeonjangCapabilityGap({
      steps: [screenStep], snapshot: snapshot({ capability: "screen.capture", trusted: false }), maxAgeMs: 1_000,
    })).not.toThrow()
  })

  it("rejects invalid classifications and incomplete self-solve evidence", () => {
    expect(() => decideNoYeonjangCapabilityGap({
      steps: [{ ...selfStep, requiredCapability: "screen.capture" }], snapshot: snapshot(), maxAgeMs: 1_000,
    })).toThrow(/cannot require/i)
    expect(() => decideNoYeonjangCapabilityGap({
      steps: [selfStep, { ...selfStep }], snapshot: snapshot(), maxAgeMs: 1_000,
    })).toThrow(/unique/i)
    expect(() => decideNoYeonjangCapabilityGap({
      steps: [{ ...screenStep, userNextAction: "" }], snapshot: snapshot(), maxAgeMs: 1_000,
    })).toThrow(/next action/i)

    const decision = decideNoYeonjangCapabilityGap({ steps: [selfStep, screenStep], snapshot: snapshot(), maxAgeMs: 1_000 })
    expect(() => buildTruthfulNoYeonjangResult({ decision, selfSolveResults: [] })).toThrow(/missing/i)
    expect(() => buildTruthfulNoYeonjangResult({
      decision, selfSolveResults: [{ stepId: "step:other", result: "잘못된 결과" }],
    })).toThrow(/does not match/i)
  })

  it("renders preserved partial results and verified guidance only through the LLM boundary", async () => {
    const decision = decideNoYeonjangCapabilityGap({ steps: [selfStep, screenStep], snapshot: snapshot(), maxAgeMs: 1_000 })
    const result = buildTruthfulNoYeonjangResult({
      decision, selfSolveResults: [{ stepId: "step:plan", result: "워크플로우 초안을 작성했습니다." }],
    })
    const renderNotice = vi.fn(async () => ({
      status: "ready" as const,
      text: "워크플로우 초안을 작성했습니다. 화면 캡처는 수행하지 않았습니다. 화면 캡처 기능이 필요하지만 현재 연결되어 사용할 수 있는 연장이 없습니다. 연장을 연결한 뒤 다시 요청하세요.",
      textSource: "llm_reviewed" as const,
    }))
    await expect(renderNoYeonjangCapabilityGuidance({
      originalRequest: "워크플로우를 만들고 화면도 캡처해줘", primaryLanguage: "ko", result, renderNotice,
    })).resolves.toMatchObject({ status: "ready", textSource: "llm_reviewed" })
    expect(renderNotice).toHaveBeenCalledWith(expect.objectContaining({
      textSource: "runtime_deterministic", contentKind: "final_report", reasonPrefix: "no_yeonjang_capability_guidance",
    }))
    expect(renderNotice.mock.calls[0]![0].rawText).toContain("워크플로우 초안을 작성했습니다.")
    expect(renderNotice.mock.calls[0]![0].rawText).toContain("not_executed")
  })

  it.each([
    ["화면 캡처 기능으로 화면 제어를 완료했습니다. 현재 연결되어 사용할 수 있는 연장이 없습니다. 연장을 연결한 뒤 다시 요청하세요.", "no_yeonjang_guidance_false_execution_claim"],
    ["Screen capture is unavailable. Connect Yeonjang and retry.", "no_yeonjang_guidance_language_mismatch"],
    ["instance_id: local의 화면 캡처 기능이 없습니다. 현재 연결되어 사용할 수 있는 연장이 없습니다. 연장을 연결한 뒤 다시 요청하세요.", "no_yeonjang_guidance_internal_detail"],
    ["화면 작업은 수행하지 않았습니다. 연장을 연결한 뒤 다시 요청하세요.", "no_yeonjang_guidance_required_fact_missing"],
    ["화면 캡처 기능이 필요합니다. 나중에 다시 시도하세요.", "no_yeonjang_guidance_required_fact_missing"],
    ["화면 캡처 기능이 필요합니다. 연장을 연결한 뒤 다시 요청하세요.", "no_yeonjang_guidance_required_fact_missing"],
  ])("blocks unsafe or incomplete guidance: %s", async (text, reason) => {
    const decision = decideNoYeonjangCapabilityGap({ steps: [screenStep], snapshot: snapshot(), maxAgeMs: 1_000 })
    const result = buildTruthfulNoYeonjangResult({ decision, selfSolveResults: [] })
    await expect(renderNoYeonjangCapabilityGuidance({
      originalRequest: "화면을 캡처해줘",
      primaryLanguage: "ko",
      result,
      renderNotice: async () => ({ status: "ready", text, textSource: "llm_reviewed" }),
    })).resolves.toEqual({ status: "blocked", reason })
  })

  it.each([
    ["computer.inspect", "컴퓨터 상태 확인", "컴퓨터 상태를 확인했습니다."],
    ["file.write", "파일 생성", "파일을 생성했습니다."],
    ["application.launch", "앱 실행", "앱을 실행했습니다."],
    ["browser.focus", "브라우저 창 포커스 기능", "브라우저 창 포커스를 완료했습니다."],
    ["screen.capture", "화면 캡처", "화면을 캡처했습니다."],
    ["keyboard.type", "키보드 입력", "키보드 입력을 완료했습니다."],
    ["mouse.click", "마우스 클릭", "마우스 클릭을 완료했습니다."],
    ["system.exec", "명령 실행", "터미널 명령을 실행했습니다."],
  ])("rejects an execution claim without a Yeonjang receipt for %s", async (capability, capabilityName, falseClaim) => {
    const blockedStep = {
      ...screenStep,
      stepId: `step:${capability}`,
      summary: capabilityName,
      requiredCapability: capability,
      requiredCapabilityName: capabilityName,
    }
    const decision = decideNoYeonjangCapabilityGap({
      steps: [blockedStep],
      snapshot: snapshot(),
      maxAgeMs: 1_000,
    })
    const result = buildTruthfulNoYeonjangResult({ decision, selfSolveResults: [] })

    await expect(renderNoYeonjangCapabilityGuidance({
      originalRequest: capabilityName,
      primaryLanguage: "ko",
      result,
      renderNotice: async () => ({
        status: "ready",
        text: `${falseClaim} ${capabilityName}이 필요합니다. 현재 연결되어 사용할 수 있는 연장이 없습니다. 연장을 연결한 뒤 다시 요청하세요.`,
        textSource: "llm_reviewed",
      }),
    })).resolves.toEqual({
      status: "blocked",
      reason: "no_yeonjang_guidance_false_execution_claim",
    })
  })

  it("reports browser.focus as not executed when no trusted Yeonjang exposes the capability", async () => {
    const browserFocusStep = {
      stepId: "step:browser-focus",
      summary: "브라우저 창을 앞으로 가져오기",
      executionKind: "yeonjang_required" as const,
      requiredCapability: "browser.focus",
      requiredCapabilityName: "브라우저 창 포커스 기능",
      userFacingReason: "현재 연결된 연장이 브라우저 창 포커스 기능을 제공하지 않습니다.",
      userNextAction: "브라우저 창 포커스 기능을 지원하는 연장을 연결하거나 업데이트한 뒤 다시 요청하세요.",
    }
    const decision = decideNoYeonjangCapabilityGap({
      steps: [browserFocusStep],
      snapshot: snapshot({ capability: "browser.open_url" }),
      maxAgeMs: 1_000,
    })
    const result = buildTruthfulNoYeonjangResult({ decision, selfSolveResults: [] })
    const renderNotice = vi.fn(async () => ({
      status: "ready" as const,
      text: "브라우저 창 포커스 기능은 실행하지 않았습니다. 현재 연결된 연장이 브라우저 창 포커스 기능을 제공하지 않습니다. 브라우저 창 포커스 기능을 지원하는 연장을 연결하거나 업데이트한 뒤 다시 요청하세요.",
      textSource: "llm_reviewed" as const,
    }))

    await expect(renderNoYeonjangCapabilityGuidance({
      originalRequest: "브라우저 창을 앞으로 가져와줘",
      primaryLanguage: "ko",
      result,
      renderNotice,
    })).resolves.toMatchObject({ status: "ready", textSource: "llm_reviewed" })
    expect(result).toMatchObject({
      status: "blocked",
      blockedSteps: [{
        status: "not_executed",
        requiredCapability: "browser.focus",
        requiredCapabilityName: "브라우저 창 포커스 기능",
      }],
    })
    expect(renderNotice.mock.calls[0]![0].rawText).toContain("not_executed")
    expect(renderNotice.mock.calls[0]![0].rawText).toContain("browser.focus")
  })

  it("keeps the capability decision domain independent from external state", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/no-yeonjang-capability-gap.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|fetch\(|readFile|writeFile|globalThis/)
  })
})
