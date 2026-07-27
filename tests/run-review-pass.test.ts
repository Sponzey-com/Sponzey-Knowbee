import { describe, expect, it, vi } from "vitest"
import { runReviewPass } from "../packages/core/src/runs/review-pass.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"

describe("run review pass", () => {
  it("returns review and synthetic approval together", async () => {
    const reviewTaskCompletion = vi.fn().mockResolvedValue({
      status: "ask_user",
      summary: "화면 캡처 진행 전 승인이 필요합니다.",
      reason: "권한이 필요합니다.",
      userMessage: "화면 기록 권한을 허용해 주세요.",
      remainingItems: ["화면 기록 권한 허용"],
    })

    const result = await runReviewPass({
      executionProfile: {
        approvalRequired: true,
        approvalTool: "screen_capture",
      },
      originalRequest: "메인 화면을 캡처해서 보여줘",
      preview: "스크린샷 캡처 권한이 필요합니다.",
      priorAssistantMessages: [],
      config: DEFAULT_CONFIG,
      usesWorkerRuntime: true,
      requiresPrivilegedToolExecution: true,
      successfulTools: [],
      requiresSuccessfulToolEvidence: true,
      completionConditions: ["화면 캡처가 사용자에게 전달됨"],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
    }, {
      reviewTaskCompletion,
    })

    expect(result.review?.status).toBe("ask_user")
    expect(reviewTaskCompletion).toHaveBeenCalledWith(expect.objectContaining({
      completionConditions: ["화면 캡처가 사용자에게 전달됨"],
      requiresSuccessfulToolEvidence: true,
    }))
    expect(result.syntheticApproval?.toolName).toBe("screen_capture")
  })

  it("swallows review errors and reports them through callback", async () => {
    const onReviewError = vi.fn()
    const reviewTaskCompletion = vi.fn().mockRejectedValue(
      new Error("403 <html><body>review failed token=sk-review-secret-1234567890 path=/Users/me/private/review.json</body></html>"),
    )

    const result = await runReviewPass({
      executionProfile: {
        approvalRequired: false,
        approvalTool: "none",
      },
      originalRequest: "안녕이라고 말해줘",
      preview: "안녕",
      priorAssistantMessages: [],
      config: DEFAULT_CONFIG,
      usesWorkerRuntime: false,
      requiresPrivilegedToolExecution: false,
      successfulTools: [],
      completionConditions: ["인사 응답이 전달됨"],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
    }, {
      reviewTaskCompletion,
      onReviewError,
    })

    expect(result.review).toBeNull()
    expect(result.reviewFailureReasonCode).toBe("completion_review_provider_failed")
    expect(result.syntheticApproval).toBeNull()
    expect(reviewTaskCompletion).toHaveBeenCalledTimes(3)
    expect(onReviewError).toHaveBeenCalledWith("인증 또는 접근 차단 문제로 서버가 HTML 오류 페이지를 반환했습니다.")
    expect(JSON.stringify(onReviewError.mock.calls)).not.toContain("sk-review-secret")
    expect(JSON.stringify(onReviewError.mock.calls)).not.toContain("/Users/me/private")
  })

  it("retries only the review provider while preserving execution evidence", async () => {
    const completedReview = {
      status: "complete" as const,
      summary: "근거 검토 완료",
      reason: "요청이 충족되었습니다.",
      remainingItems: [],
      followupEvidenceRefs: [],
    }
    const reviewTaskCompletion = vi.fn()
      .mockRejectedValueOnce(new Error("temporary provider failure"))
      .mockRejectedValueOnce(new Error("temporary provider failure"))
      .mockResolvedValueOnce(completedReview)

    const result = await runReviewPass({
      executionProfile: {
        approvalRequired: false,
        approvalTool: "none",
      },
      originalRequest: "현재 값을 알려줘",
      preview: "검색 결과",
      priorAssistantMessages: [],
      config: DEFAULT_CONFIG,
      usesWorkerRuntime: true,
      requiresPrivilegedToolExecution: false,
      successfulTools: [{ toolName: "web_search", output: "bounded evidence" }],
      completionConditions: ["현재 값 보고"],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
    }, {
      reviewTaskCompletion,
    })

    expect(reviewTaskCompletion).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({
      review: completedReview,
      syntheticApproval: null,
    })
    expect(result).not.toHaveProperty("reviewFailureReasonCode")
  })

  it("classifies an invalid structured review without re-running execution", async () => {
    const result = await runReviewPass({
      executionProfile: {
        approvalRequired: false,
        approvalTool: "none",
      },
      originalRequest: "현재 값을 알려줘",
      preview: "검색 결과",
      priorAssistantMessages: [],
      config: DEFAULT_CONFIG,
      usesWorkerRuntime: true,
      requiresPrivilegedToolExecution: false,
      successfulTools: [],
      completionConditions: ["현재 값 보고"],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
    }, {
      reviewTaskCompletion: vi.fn().mockResolvedValue(null),
    })

    expect(result).toMatchObject({
      review: null,
      reviewFailureReasonCode: "completion_review_contract_invalid",
    })
  })

  it("does not regenerate an ordinary reply solely because final dispatch follows review", async () => {
    const result = await runReviewPass({
      executionProfile: {
        approvalRequired: false,
        approvalTool: "none",
      },
      originalRequest: "현재 값을 알려줘",
      preview: "현재 값은 100이며 기준 시각과 출처는 다음과 같습니다.",
      priorAssistantMessages: [],
      config: DEFAULT_CONFIG,
      usesWorkerRuntime: true,
      requiresPrivilegedToolExecution: false,
      successfulTools: [{ toolName: "web_fetch", output: "bounded evidence" }],
      completionConditions: ["현재 값과 기준 시각 및 출처 보고"],
      successfulFileDeliveries: [],
      sawRealFilesystemMutation: false,
      deliveryOutcome: {
        mode: "reply",
        directArtifactDeliveryRequested: false,
        hasSuccessfulArtifactDelivery: false,
        hasSuccessfulTextDelivery: false,
        textDeliverySatisfied: false,
        deliverySatisfied: false,
        requiresDirectArtifactRecovery: false,
      },
    }, {
      reviewTaskCompletion: vi.fn().mockResolvedValue({
        status: "followup",
        summary: "답안 내용은 충족됐고 최종 전달만 남았습니다.",
        reason: "최종 전달은 아직 실행되지 않았습니다.",
        followupPrompt: "같은 내용을 최종 답변으로 다시 작성하세요.",
        followupEvidenceRefs: ["tool-result:web:current"],
        followupExecutionMode: "response_only",
        followupRequiredToolNames: [],
        remainingItems: ["최종 답변 전달"],
        criterionAssessments: [
          {
            criterionKey: "existence",
            applicable: true,
            verdict: "satisfied",
            evidenceRefs: ["tool-result:web:current"],
            uncertainty: "",
            reason: "값이 확인됐습니다.",
          },
          {
            criterionKey: "accuracy",
            applicable: true,
            verdict: "satisfied",
            evidenceRefs: ["tool-result:web:current"],
            uncertainty: "",
            reason: "근거와 일치합니다.",
          },
          {
            criterionKey: "completeness",
            applicable: true,
            verdict: "satisfied",
            evidenceRefs: ["tool-result:web:current"],
            uncertainty: "",
            reason: "요청 항목이 포함됐습니다.",
          },
          {
            criterionKey: "freshness",
            applicable: true,
            verdict: "satisfied",
            evidenceRefs: ["tool-result:web:current"],
            uncertainty: "",
            reason: "기준 시각이 있습니다.",
          },
          {
            criterionKey: "target_match",
            applicable: true,
            verdict: "satisfied",
            evidenceRefs: ["tool-result:web:current"],
            uncertainty: "",
            reason: "대상이 일치합니다.",
          },
          {
            criterionKey: "constraint_compliance",
            applicable: true,
            verdict: "satisfied",
            evidenceRefs: ["tool-result:web:current"],
            uncertainty: "",
            reason: "제약을 충족합니다.",
          },
          {
            criterionKey: "delivery",
            applicable: true,
            verdict: "unsatisfied",
            evidenceRefs: [],
            uncertainty: "",
            reason: "최종 전달 전입니다.",
          },
        ],
        conditionAssessments: [{
          conditionId: "condition:current-value",
          verdict: "satisfied",
          evidenceRefs: ["tool-result:web:current"],
          uncertainty: "",
          reason: "요청한 답안이 준비됐습니다.",
        }],
      }),
    })

    expect(result.review).toMatchObject({
      status: "complete",
      remainingItems: [],
      criterionAssessments: [
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          criterionKey: "delivery",
          applicable: false,
          verdict: "satisfied",
        }),
      ],
    })
    expect(result.review).not.toHaveProperty("followupPrompt")
    expect(result.review).not.toHaveProperty("followupExecutionMode")
  })
})
