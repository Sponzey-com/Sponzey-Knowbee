import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput,
  evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-postcheck-llm-review-admission.ts"

const OBSERVATION = projectYeonjangBrowserActiveTabInfo({
  browserName: "Google Chrome",
  title: "Private Ticket",
  url: "https://example.test/account?token=private",
  profileName: "Profile 1",
  profilePath: "/Users/example/Profile 1",
  pid: 7711,
  windowId: "window-private",
  tabId: "tab-private",
  observationStatus: "available",
})

function finalProjection() {
  if (!OBSERVATION.ok) throw new Error(OBSERVATION.reasonCode)
  const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
    publicTargetName: "Studio Mac",
    observation: OBSERVATION.observation,
  })
  const finalResult = buildYeonjangBrowserActiveTabInfoFinalResultProjection({
    publicTargetName: "Studio Mac",
    observation: OBSERVATION.observation,
    evidenceRef,
    verificationStatus: "unverifiable",
  })
  if (!finalResult.ok) throw new Error(finalResult.reasonCode)
  return finalResult.projection
}

describe("Task 215 Yeonjang browser.active_tab_info post-check LLM review admission", () => {
  it("builds LLM review input only from final projection and completion criteria", () => {
    const input = buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput({
      originalRequest: "현재 활성 브라우저 탭이 업무 티켓인지 확인해줘.",
      completionCriteria: ["활성 브라우저 이름과 URL scheme evidence가 요청 판단에 충분해야 한다."],
      finalProjection: finalProjection(),
      commandAccepted: true,
      rawDetails: {
        title: "Private Ticket",
        url: "https://example.test/account?token=private",
        profilePath: "/Users/example/Profile 1",
        pid: 7711,
        windowId: "window-private",
        tabId: "tab-private",
      },
    })

    expect(input).toMatchObject({
      schemaVersion: "yeonjang-browser-active-tab-info-llm-review-admission-v1",
      method: "browser.active_tab_info",
      commandAccepted: true,
      finalProjection: {
        method: "browser.active_tab_info",
        publicTargetName: "Studio Mac",
        evidenceRef: expect.stringMatching(/^tool-result:yeonjang:browser-active-tab-info:[a-f0-9]{48}$/u),
      },
      successCanBeConcludedWithoutReview: false,
    })
    expect(input.completionCriteria).toEqual([
      "활성 브라우저 이름과 URL scheme evidence가 요청 판단에 충분해야 한다.",
    ])

    const serialized = JSON.stringify(input)
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("/Users/example")
    expect(serialized).not.toContain("7711")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
  })

  it("maps LLM review outcomes to verificationStatus without treating command acceptance as success", () => {
    const projection = finalProjection()
    const reviewInput = buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput({
      originalRequest: "활성 브라우저 탭을 확인해줘.",
      completionCriteria: ["활성 탭 정보가 요청 확인에 충분해야 한다."],
      finalProjection: projection,
      commandAccepted: true,
    })

    expect(evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision({
      admissionInput: reviewInput,
      review: {
        verdict: "satisfied",
        evidenceRefs: [projection.evidenceRef],
        reason: "Redacted active tab observation satisfies the request.",
      },
    })).toEqual({
      verificationStatus: "verified",
      reasonCode: "llm_review_satisfied",
      goalSuccess: true,
      evidenceRefs: [projection.evidenceRef],
    })

    expect(evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision({
      admissionInput: reviewInput,
      review: {
        verdict: "uncertain",
        evidenceRefs: [projection.evidenceRef],
        reason: "Need raw page title, but raw title is audit-only.",
      },
    })).toEqual({
      verificationStatus: "unverifiable",
      reasonCode: "llm_review_uncertain",
      goalSuccess: false,
      evidenceRefs: [projection.evidenceRef],
    })

    expect(evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision({
      admissionInput: reviewInput,
      review: {
        verdict: "failed",
        evidenceRefs: [projection.evidenceRef],
        reason: "The active tab evidence does not satisfy the request.",
      },
    })).toEqual({
      verificationStatus: "failed",
      reasonCode: "llm_review_failed",
      goalSuccess: false,
      evidenceRefs: [projection.evidenceRef],
    })
  })

  it("fails closed when the LLM review cites missing or unsafe evidence references", () => {
    const projection = finalProjection()
    const reviewInput = buildYeonjangBrowserActiveTabInfoLlmReviewAdmissionInput({
      originalRequest: "활성 브라우저 탭을 확인해줘.",
      completionCriteria: ["활성 탭 정보가 요청 확인에 충분해야 한다."],
      finalProjection: projection,
      commandAccepted: true,
    })

    expect(evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision({
      admissionInput: reviewInput,
      review: {
        verdict: "satisfied",
        evidenceRefs: [],
        reason: "No evidence.",
      },
    })).toEqual({
      verificationStatus: "unverifiable",
      reasonCode: "llm_review_evidence_required",
      goalSuccess: false,
      evidenceRefs: [],
    })

    expect(evaluateYeonjangBrowserActiveTabInfoLlmReviewDecision({
      admissionInput: reviewInput,
      review: {
        verdict: "satisfied",
        evidenceRefs: ["tool-result:yeonjang:browser-active-tab-info:Private Ticket token=private"],
        reason: "Unsafe raw evidence.",
      },
    })).toEqual({
      verificationStatus: "unverifiable",
      reasonCode: "llm_review_evidence_ref_unsafe",
      goalSuccess: false,
      evidenceRefs: [],
    })
  })
})
