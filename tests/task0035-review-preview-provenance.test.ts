import { describe, expect, it, vi } from "vitest"
import { runReviewEntryPass } from "../packages/core/src/runs/review-entry-pass.ts"
import { prepareRunForReview } from "../packages/core/src/runs/review-transition.ts"

function createReviewTransitionDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    insertMessage: vi.fn(),
    writeReplyLog: vi.fn(),
    createId: () => "message-1",
    now: () => 123,
  }
}

function createReviewEntryDependencies() {
  return {
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    getFinalizationDependencies: vi.fn(() => ({
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      rememberRunSuccess: vi.fn(),
      rememberRunFailure: vi.fn(),
    })),
    insertMessage: vi.fn(),
    writeReplyLog: vi.fn(),
    createId: vi.fn(() => "message-1"),
    now: vi.fn(() => 123),
  }
}

describe("task0035 review preview provenance", () => {
  it("persists reviewed review previews for non-empty previews", () => {
    const dependencies = createReviewTransitionDependencies()

    prepareRunForReview({
      runId: "run-review-preview-source",
      sessionId: "session-review-preview-source",
      source: "telegram",
      preview: "최종 응답 정책을 통과한 중간 결과입니다.",
      previewSource: "llm_reviewed",
      persistRuntimePreview: true,
      dependencies,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-preview-source",
      "user_facing_review_preview_source:llm_reviewed",
    )
    expect(dependencies.insertMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: "최종 응답 정책을 통과한 중간 결과입니다.",
    }))
    expect(dependencies.writeReplyLog).toHaveBeenCalledWith(
      "telegram",
      "최종 응답 정책을 통과한 중간 결과입니다.",
    )
  })

  it("blocks LLM-generated review previews until final_response review", () => {
    const dependencies = createReviewTransitionDependencies()

    prepareRunForReview({
      runId: "run-review-preview-llm-generated",
      sessionId: "session-review-preview-llm-generated",
      source: "telegram",
      preview: "모델이 생성했지만 아직 최종 응답 검토 전입니다.",
      previewSource: "llm_generated",
      persistRuntimePreview: true,
      dependencies,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-preview-llm-generated",
      "user_facing_review_preview_source:llm_generated",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-preview-llm-generated",
      "user_facing_review_preview_delivery_blocked:llm_generated",
    )
    expect(dependencies.insertMessage).not.toHaveBeenCalled()
    expect(dependencies.writeReplyLog).not.toHaveBeenCalled()
  })

  it("does not write an empty review preview reply log", () => {
    const dependencies = createReviewTransitionDependencies()

    prepareRunForReview({
      runId: "run-review-preview-empty",
      sessionId: "session-review-preview-empty",
      source: "webui",
      preview: "   ",
      persistRuntimePreview: true,
      dependencies,
    })

    expect(dependencies.appendRunEvent).not.toHaveBeenCalledWith(
      "run-review-preview-empty",
      expect.stringContaining("user_facing_review_preview_source"),
    )
    expect(dependencies.insertMessage).not.toHaveBeenCalled()
    expect(dependencies.writeReplyLog).not.toHaveBeenCalled()
    expect(dependencies.setRunStepStatus).toHaveBeenNthCalledWith(
      1,
      "run-review-preview-empty",
      "executing",
      "completed",
      "응답 생성을 마쳤습니다.",
    )
  })

  it("blocks deterministic review previews from user-facing delivery", () => {
    const dependencies = createReviewTransitionDependencies()

    prepareRunForReview({
      runId: "run-review-preview-deterministic",
      sessionId: "session-review-preview-deterministic",
      source: "telegram",
      preview: "응답 생성을 마쳤습니다.",
      previewSource: "runtime_deterministic",
      persistRuntimePreview: true,
      dependencies,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-preview-deterministic",
      "user_facing_review_preview_source:runtime_deterministic",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-preview-deterministic",
      "user_facing_review_preview_delivery_blocked:runtime_deterministic",
    )
    expect(dependencies.insertMessage).not.toHaveBeenCalled()
    expect(dependencies.writeReplyLog).not.toHaveBeenCalled()
    expect(dependencies.setRunStepStatus).toHaveBeenNthCalledWith(
      1,
      "run-review-preview-deterministic",
      "executing",
      "completed",
      "응답 생성을 마쳤습니다.",
    )
  })

  it("blocks mixed-source review previews from user-facing delivery", () => {
    const dependencies = createReviewTransitionDependencies()

    prepareRunForReview({
      runId: "run-review-preview-mixed",
      sessionId: "session-review-preview-mixed",
      source: "telegram",
      preview: "LLM answer plus deterministic delivery status.",
      previewSource: "mixed",
      persistRuntimePreview: true,
      dependencies,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-preview-mixed",
      "user_facing_review_preview_source:mixed",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-preview-mixed",
      "user_facing_review_preview_delivery_blocked:mixed",
    )
    expect(dependencies.insertMessage).not.toHaveBeenCalled()
    expect(dependencies.writeReplyLog).not.toHaveBeenCalled()
    expect(dependencies.setRunStepStatus).toHaveBeenNthCalledWith(
      1,
      "run-review-preview-mixed",
      "executing",
      "completed",
      "응답 생성을 마쳤습니다.",
    )
  })

  it("blocks the default LLM-generated preview source in review entry pass", async () => {
    const dependencies = createReviewEntryDependencies()

    await runReviewEntryPass({
      runId: "run-review-entry-preview-source",
      sessionId: "session-review-entry-preview-source",
      source: "cli",
      onChunk: undefined,
      preview: "preview text",
      persistRuntimePreview: false,
      directDeliveryApplication: { kind: "none" },
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      maxDelegationTurns: 2,
    }, dependencies)

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-entry-preview-source",
      "user_facing_review_preview_source:llm_generated",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-entry-preview-source",
      "user_facing_review_preview_delivery_blocked:llm_generated",
    )
    expect(dependencies.insertMessage).not.toHaveBeenCalled()
    expect(dependencies.writeReplyLog).not.toHaveBeenCalled()
  })

  it("passes deterministic review entry preview source into the delivery gate", async () => {
    const dependencies = createReviewEntryDependencies()

    await runReviewEntryPass({
      runId: "run-review-entry-deterministic-preview",
      sessionId: "session-review-entry-deterministic-preview",
      source: "cli",
      onChunk: undefined,
      preview: "deterministic preview",
      previewSource: "runtime_deterministic",
      persistRuntimePreview: true,
      directDeliveryApplication: { kind: "none" },
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      maxDelegationTurns: 2,
    }, dependencies)

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-review-entry-deterministic-preview",
      "user_facing_review_preview_delivery_blocked:runtime_deterministic",
    )
    expect(dependencies.insertMessage).not.toHaveBeenCalled()
    expect(dependencies.writeReplyLog).not.toHaveBeenCalled()
  })
})
