import { describe, expect, it, vi } from "vitest"
import { CanonicalExecutionFailure } from "../packages/core/src/runs/canonical-execution-failure.ts"
import { applyRootRunDriverFailure } from "../packages/core/src/runs/root-run-driver-failure.ts"

describe("apply root run driver failure", () => {
  it("applies fatal failure and blocks direct error chunk delivery", async () => {
    const moduleDependencies = {
      applyFatalFailure: vi.fn(),
      deliverChunk: vi.fn(async () => undefined),
    }
    const appendRunEvent = vi.fn()

    await applyRootRunDriverFailure(
      {
        runId: "run-1",
        sessionId: "session-1",
        source: "cli",
        onChunk: undefined,
        aborted: false,
        failure: new Error("boom"),
      },
      {
        appendRunEvent,
        setRunStepStatus: vi.fn(),
        updateRunStatus: vi.fn(),
        rememberRunFailure: vi.fn(),
        markAbortedRunCancelledIfActive: vi.fn(),
        onDeliveryError: vi.fn(),
      },
      {
        applyFatalFailure: moduleDependencies.applyFatalFailure,
      },
    )

    expect(moduleDependencies.applyFatalFailure).toHaveBeenCalledTimes(1)
    expect(appendRunEvent).toHaveBeenCalledWith(
      "run-1",
      "user_facing_error_delivery_blocked:llm_required",
    )
    expect(moduleDependencies.deliverChunk).not.toHaveBeenCalled()
  })

  it("preserves typed canonical failure fields independently from its message", async () => {
    const applyFatalFailure = vi.fn()
    const appendRunEvent = vi.fn()
    const failure = new CanonicalExecutionFailure({
      phase: "review",
      reasonCode: "completion_receipt_context_mismatch",
      retryable: false,
      message: "provider wording changed and contains private payload: secret-value",
    })

    await applyRootRunDriverFailure(
      {
        runId: "run-canonical-rejection",
        sessionId: "session-canonical-rejection",
        source: "webui",
        onChunk: undefined,
        aborted: false,
        failure,
      },
      {
        appendRunEvent,
        setRunStepStatus: vi.fn(),
        updateRunStatus: vi.fn(),
        rememberRunFailure: vi.fn(),
        markAbortedRunCancelledIfActive: vi.fn(),
      },
      {
        applyFatalFailure,
      },
    )

    expect(applyFatalFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "canonical_failure:completion_receipt_context_mismatch",
        message: "Canonical execution contract validation failed.",
        extraEvents: [
          "runtime_failure_kind:schema",
          "canonical_failure_phase:review",
          "canonical_failure_reason:completion_receipt_context_mismatch",
          "canonical_failure_retryable:false",
        ],
      }),
      expect.any(Object),
    )
    expect(failure).toMatchObject({
      phase: "review",
      reasonCode: "completion_receipt_context_mismatch",
      retryable: false,
    })
    expect(appendRunEvent).not.toHaveBeenCalledWith(
      "run-canonical-rejection",
      expect.stringContaining("completion_receipt_context_mismatch"),
    )
    expect(JSON.stringify(applyFatalFailure.mock.calls)).not.toContain("secret-value")
  })

  it("does not classify a generic Error from canonical-looking text", async () => {
    const applyFatalFailure = vi.fn()

    await applyRootRunDriverFailure(
      {
        runId: "run-generic-error",
        sessionId: "session-generic-error",
        source: "telegram",
        onChunk: undefined,
        aborted: false,
        failure: new Error(
          "Canonical completion transition was not accepted: completion_receipt_context_mismatch",
        ),
      },
      {
        appendRunEvent: vi.fn(),
        setRunStepStatus: vi.fn(),
        updateRunStatus: vi.fn(),
        rememberRunFailure: vi.fn(),
        markAbortedRunCancelledIfActive: vi.fn(),
      },
      {
        applyFatalFailure,
      },
    )

    expect(applyFatalFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.not.stringContaining("canonical_failure:"),
      }),
      expect.any(Object),
    )
  })

  it("renders and delivers a fatal outcome through the LLM while preserving failed status", async () => {
    const applyFatalFailure = vi.fn()
    const completeRunWithAssistantMessage = vi.fn(async () => ({
      status: "completed" as const,
    }))
    const appendRunEvent = vi.fn()
    const finalizationDependencies = {
      appendRunEvent,
    } as never
    const responseContext = {
      originalRequest: "현재 주가를 확인해줘",
      model: "test-model",
      providerId: "test-provider",
      config: {} as never,
      workDir: "/workspace",
      identityContext: {
        promptLocale: "ko",
        mainAgentSelfName: "마당쇠",
        promptContext: "identity",
      },
    }

    await applyRootRunDriverFailure(
      {
        runId: "run-deliver-failure",
        sessionId: "session-deliver-failure",
        source: "telegram",
        onChunk: vi.fn(),
        aborted: false,
        failure: new Error("secret provider failure"),
        responseContext,
      },
      {
        appendRunEvent,
        setRunStepStatus: vi.fn(),
        updateRunStatus: vi.fn(),
        rememberRunFailure: vi.fn(),
        markAbortedRunCancelledIfActive: vi.fn(),
        finalizationDependencies,
      },
      {
        applyFatalFailure,
        completeRunWithAssistantMessage,
      },
    )

    expect(completeRunWithAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-deliver-failure",
        sessionId: "session-deliver-failure",
        source: "telegram",
        textSource: "runtime_deterministic",
        responseContext,
        preserveRunStatusAfterDelivery: true,
        dependencies: finalizationDependencies,
      }),
    )
    expect(JSON.stringify(completeRunWithAssistantMessage.mock.calls)).not.toContain(
      "secret provider failure",
    )
    expect(appendRunEvent).toHaveBeenCalledWith(
      "run-deliver-failure",
      "user_facing_error_delivery_completed:llm_reviewed",
    )
  })

  it("records an explicit pending event when LLM failure delivery cannot complete", async () => {
    const appendRunEvent = vi.fn()
    await applyRootRunDriverFailure(
      {
        runId: "run-pending-failure",
        sessionId: "session-pending-failure",
        source: "webui",
        onChunk: undefined,
        aborted: false,
        failure: new Error("failure"),
        responseContext: {
          originalRequest: "요청",
          model: "test-model",
          providerId: "test-provider",
          config: {} as never,
          workDir: "/workspace",
        },
      },
      {
        appendRunEvent,
        setRunStepStatus: vi.fn(),
        updateRunStatus: vi.fn(),
        rememberRunFailure: vi.fn(),
        markAbortedRunCancelledIfActive: vi.fn(),
        finalizationDependencies: { appendRunEvent } as never,
      },
      {
        applyFatalFailure: vi.fn(),
        completeRunWithAssistantMessage: vi.fn(async () => ({
          status: "blocked_by_final_response_rendering" as const,
        })),
      },
    )

    expect(appendRunEvent).toHaveBeenCalledWith(
      "run-pending-failure",
      "user_facing_error_delivery_pending:blocked_by_final_response_rendering",
    )
  })
})
