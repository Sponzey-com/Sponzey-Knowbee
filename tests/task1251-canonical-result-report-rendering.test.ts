import { describe, expect, it, vi } from "vitest"
import {
  type CanonicalResultReportInput,
  applyCanonicalResultReport,
  buildCanonicalResultReportFacts,
  renderCanonicalResultReport,
} from "../packages/core/src/index.ts"

const facts = buildCanonicalResultReportFacts({
  goalId: "goal:1",
  workId: "work:1",
  outcome: "blocked",
  primaryLanguage: "ko",
  completedScope: [],
  unresolvedScope: ["scope:file-write"],
  reasonCode: "permission_required",
  verifiedReasonFacts: ["File-write permission was denied."],
  evidenceRefs: ["evidence:permission:1"],
  nextActions: [{ kind: "required_condition", text: "Grant file-write permission and retry." }],
} satisfies CanonicalResultReportInput)
const reviewPolicy = {
  maxRepairAttempts: 1,
  maxReasonCharacters: 320,
  maxNextActionCharacters: 240,
  maxReportCharacters: 700,
}

describe("task1251 canonical result report rendering", () => {
  it("renders and delivers a structured LLM report once", async () => {
    const render = vi.fn(async () => ({
      result: "blocked" as const,
      reason: "파일 쓰기 권한이 없어 작업이 차단되었습니다.",
      nextAction: "파일 쓰기 권한을 허용한 뒤 다시 요청하세요.",
      text: "결과: 차단. 파일 쓰기 권한이 없어 작업이 차단되었습니다. 파일 쓰기 권한을 허용한 뒤 다시 요청하세요.",
    }))
    const deliver = vi.fn(async () => undefined)
    await expect(
      applyCanonicalResultReport({
        originalRequest: "파일을 저장해줘",
        facts,
        render,
        reviewPolicy,
        deliver,
      }),
    ).resolves.toMatchObject({ status: "delivered", outcome: "blocked" })
    expect(render).toHaveBeenCalledOnce()
    expect(deliver).toHaveBeenCalledOnce()
    expect(JSON.stringify(render.mock.calls[0]?.[0])).not.toMatch(
      /goal:1|work:1|evidence:permission:1/,
    )
  })

  it.each([
    [
      { result: "blocked", reason: "", nextAction: "권한을 허용하세요.", text: "차단되었습니다." },
      "reason_sentence_count_invalid",
    ],
    [
      {
        result: "blocked",
        reason: "첫째 이유입니다. 둘째 이유입니다. 셋째 이유입니다.",
        nextAction: "권한을 허용하세요.",
        text: "차단되었습니다.",
      },
      "reason_sentence_count_invalid",
    ],
    [
      {
        result: "completed",
        reason: "완료되지 않았습니다.",
        nextAction: "권한을 허용하세요.",
        text: "차단되었습니다.",
      },
      "result_mismatch",
    ],
    [
      {
        result: "blocked",
        reason: "아마 권한 문제인 것 같습니다.",
        nextAction: "권한을 허용하세요.",
        text: "차단되었습니다.",
      },
      "speculative_reason",
    ],
    [
      {
        result: "blocked",
        reason: "diagnosis_id: abc 때문에 차단되었습니다.",
        nextAction: "권한을 허용하세요.",
        text: "차단되었습니다.",
      },
      "internal_detail_exposed",
    ],
    [
      {
        result: "blocked",
        reason: "Permission was denied.",
        nextAction: "Grant permission.",
        text: "Result: blocked. Grant permission.",
      },
      "language_mismatch",
    ],
  ] as const)("blocks invalid structured output %#", async (output, reasonCode) => {
    await expect(
      renderCanonicalResultReport({
        originalRequest: "파일을 저장해줘",
        facts,
        render: async () => output,
        reviewPolicy,
      }),
    ).resolves.toEqual({ status: "blocked", reasonCode })
  })

  it("requires a concise next action for a non-completed result", async () => {
    await expect(
      renderCanonicalResultReport({
        originalRequest: "파일을 저장해줘",
        facts,
        render: async () => ({
          result: "blocked",
          reason: "권한이 없습니다.",
          nextAction: "",
          text: "작업이 차단되었습니다.",
        }),
        reviewPolicy,
      }),
    ).resolves.toEqual({ status: "blocked", reasonCode: "next_action_missing" })
  })

  it("never invokes delivery after review blocks output", async () => {
    const deliver = vi.fn(async () => undefined)
    await expect(
      applyCanonicalResultReport({
        originalRequest: "파일을 저장해줘",
        facts,
        render: async () => ({
          result: "blocked",
          reason: "첫째입니다. 둘째입니다. 셋째입니다.",
          nextAction: "권한을 허용하세요.",
          text: "차단되었습니다.",
        }),
        reviewPolicy,
        deliver,
      }),
    ).resolves.toMatchObject({ status: "blocked" })
    expect(deliver).not.toHaveBeenCalled()
  })

  it("repairs one invalid LLM result before delivery", async () => {
    const render = vi
      .fn()
      .mockResolvedValueOnce({
        result: "blocked",
        reason: "",
        nextAction: "권한을 허용하세요.",
        text: "차단되었습니다.",
      })
      .mockResolvedValueOnce({
        result: "blocked",
        reason: "권한이 없습니다.",
        nextAction: "권한을 허용하세요.",
        text: "결과: 차단. 권한이 없습니다. 권한을 허용하세요.",
      })
    const deliver = vi.fn(async () => undefined)
    await expect(
      applyCanonicalResultReport({
        originalRequest: "파일을 저장해줘",
        facts,
        render,
        reviewPolicy,
        deliver,
      }),
    ).resolves.toEqual({ status: "delivered", outcome: "blocked" })
    expect(render).toHaveBeenCalledTimes(2)
    expect(render.mock.calls[1]?.[0]).toMatchObject({
      reviewFeedback: "reason_sentence_count_invalid",
    })
    expect(deliver).toHaveBeenCalledOnce()
  })
})
