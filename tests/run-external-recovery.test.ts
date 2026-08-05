import { describe, expect, it } from "vitest"
import { planExternalRecovery } from "../packages/core/src/runs/external-recovery.ts"

describe("external recovery planning", () => {
  it("does not resend a deterministic provider contract rejection", () => {
    const plan = planExternalRecovery({
      kind: "ai",
      taskProfile: "general_chat",
      current: {
        model: "gpt-5",
        providerId: "openai",
        provider: undefined,
        targetId: "provider:openai",
        targetLabel: "OpenAI",
        workerRuntime: undefined,
      },
      payload: {
        summary: "AI 실행 계약 오류",
        reason: "AI provider invocation failed.",
        message: "AI provider invocation failed.",
        providerFailureReasonCode: "provider_contract_rejected",
      },
      seenKeys: new Set(),
      originalRequest: "카메라로 사진을 찍어줘",
      previousResult: "",
    })

    expect(plan.nextMessage).toBe("")
    expect(plan.reviewRequired).toBe(true)
    expect(plan.duplicateStop).toBeUndefined()
  })

  it("returns the same ai recovery to completion review instead of deciding terminal state", () => {
    const seenKeys = new Set<string>()
    const firstPlan = planExternalRecovery({
      kind: "ai",
      taskProfile: "general_chat",
      current: {
        model: "gpt-4o-mini",
        providerId: "openai",
        provider: undefined,
        targetId: "provider:openai",
        targetLabel: "OpenAI",
        workerRuntime: undefined,
      },
      payload: {
        summary: "AI 오류 복구",
        reason: "403 blocked",
        message: "challenge",
      },
      seenKeys,
      originalRequest: "hello",
      previousResult: "",
      dependencies: {
        resolveRoute: () => ({
          targetId: "provider:openai",
          targetLabel: "OpenAI",
          providerId: "openai",
          model: "gpt-4o-mini",
          reason: "same",
        }),
      },
    })

    seenKeys.add(firstPlan.recoveryKey)

    const repeatedPlan = planExternalRecovery({
      kind: "ai",
      taskProfile: "general_chat",
      current: {
        model: "gpt-4o-mini",
        providerId: "openai",
        provider: undefined,
        targetId: "provider:openai",
        targetLabel: "OpenAI",
        workerRuntime: undefined,
      },
      payload: {
        summary: "AI 오류 복구",
        reason: "403 blocked",
        message: "challenge",
      },
      seenKeys,
      originalRequest: "hello",
      previousResult: "",
      dependencies: {
        resolveRoute: () => ({
          targetId: "provider:openai",
          targetLabel: "OpenAI",
          providerId: "openai",
          model: "gpt-4o-mini",
          reason: "same",
        }),
      },
    })

    expect(repeatedPlan.reviewRequired).toBe(true)
    expect(repeatedPlan.nextMessage).toBe("")
    expect(repeatedPlan.duplicateStop).toBeUndefined()
  })

  it("falls back from worker runtime to default inference path when route does not change", () => {
    const plan = planExternalRecovery({
      kind: "worker_runtime",
      taskProfile: "operations",
      current: {
        model: "gpt-4o-mini",
        providerId: "openai",
        provider: undefined,
        targetId: "worker:internal_ai",
        targetLabel: "외부 작업 세션",
        workerRuntime: {
          kind: "internal_ai",
          targetId: "worker:internal_ai",
          label: "외부 작업 세션",
          command: "disabled",
        },
      },
      payload: {
        summary: "worker 복구",
        reason: "runtime failed",
        message: "exit 1",
      },
      seenKeys: new Set(),
      originalRequest: "do work",
      previousResult: "partial",
      dependencies: {
        resolveRoute: () => ({
          targetId: "worker:internal_ai",
          targetLabel: "외부 작업 세션",
          providerId: "openai",
          model: "gpt-4o-mini",
          workerRuntime: {
            kind: "internal_ai",
            targetId: "worker:internal_ai",
            label: "외부 작업 세션",
            command: "disabled",
          },
          reason: "same",
        }),
      },
    })

    expect(plan.routeChanged).toBe(false)
    expect(plan.nextState.workerRuntime).toBeUndefined()
    expect(plan.routeEventLabel).toContain("기본 추론 경로")
    expect(plan.nextMessage).toContain("[Worker Runtime Error Recovery]")
    expect(plan.nextMessage).toContain("Failed approach: 외부 작업 세션 / gpt-4o-mini")
    expect(plan.nextMessage).toContain("Recover on the same AI connection (외부 작업 세션) and target")
    expect(plan.nextMessage).not.toContain("Avoid these targets:")
  })

  it("keeps recovery on the same AI connection even when another target is proposed", () => {
    const plan = planExternalRecovery({
      kind: "ai",
      taskProfile: "general_chat",
      current: {
        model: "gpt-4o-mini",
        providerId: "openai",
        provider: undefined,
        targetId: "provider:openai",
        targetLabel: "OpenAI",
        workerRuntime: undefined,
      },
      payload: {
        summary: "ai 복구",
        reason: "rate limit",
        message: "too many requests",
      },
      seenKeys: new Set(),
      originalRequest: "hello",
      previousResult: "partial",
      dependencies: {
        resolveRoute: () => ({
          targetId: "provider:anthropic",
          targetLabel: "Anthropic",
          providerId: "anthropic",
          model: "claude-sonnet",
          reason: "reroute",
        }),
      },
    })

    expect(plan.routeChanged).toBe(false)
    expect(plan.nextState.targetLabel).toBe("OpenAI")
    expect(plan.routeEventLabel).toBeUndefined()
    expect(plan.nextMessage).toContain("Failed approach: OpenAI / openai / gpt-4o-mini")
    expect(plan.nextMessage).toContain("Recover on the same AI connection (OpenAI) and target")
    expect(plan.nextMessage).not.toContain("Anthropic")
  })
})
