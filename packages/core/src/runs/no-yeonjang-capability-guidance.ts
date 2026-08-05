import { detectPrimaryMessageLanguage } from "../channels/language.js"
import type { TruthfulNoYeonjangResult } from "../contracts/no-yeonjang-capability-gap.js"
import {
  renderUserFacingNoticeText,
  type UserFacingNoticeRenderDependencies,
  type UserFacingNoticeRenderResolution,
} from "./user-facing-notice-rendering.js"

export type NoYeonjangCapabilityGuidanceResolution =
  | { status: "ready"; text: string; textSource: "llm_reviewed" }
  | { status: "blocked"; reason: string }

export type NoYeonjangGuidanceRenderer = (input: {
  originalRequest: string
  rawText: string
  textSource: "runtime_deterministic"
  contentKind: "final_report"
  reasonPrefix: string
  dependencies?: UserFacingNoticeRenderDependencies | undefined
}) => Promise<UserFacingNoticeRenderResolution>

const FALSE_EXECUTION_CLAIMS = [
  /(?:컴퓨터|시스템).{0,16}(?:상태.{0,8})?(?:확인|점검|조작|제어|변경).{0,8}(?:했|완료)/iu,
  /파일.{0,16}(?:생성|작성|변경|수정|이동|복사|삭제).{0,8}(?:했|완료)/iu,
  /(?:앱|애플리케이션|프로그램).{0,16}(?:실행|시작|종료).{0,8}(?:했|완료)/iu,
  /(?:브라우저|창|윈도우|browser|window).{0,16}(?:포커스|앞으로|활성화|focus|activate).{0,12}(?:했|완료|completed|focused|activated)/iu,
  /화면.{0,16}(?:캡처|촬영|클릭|실행|조작|제어|입력).{0,8}(?:했|완료)/iu,
  /키보드.{0,16}(?:입력|타이핑|단축키|실행|조작|제어).{0,8}(?:했|완료)/iu,
  /마우스.{0,16}(?:이동|클릭|실행|조작|제어).{0,8}(?:했|완료)/iu,
  /(?:명령|명령어|셸|터미널).{0,16}(?:실행|호출).{0,8}(?:했|완료)/iu,
  /(?:computer|system|file|app|application|screen|keyboard|mouse|command|shell).{0,32}(?:completed|executed|inspected|checked|created|written|changed|modified|moved|copied|deleted|launched|captured|typed|clicked)/iu,
] as const
const INTERNAL_DETAIL = /(?:instance|computer|session|snapshot|receipt|fingerprint)[_-]?(?:id|ref)?\s*[:=]/iu

export async function renderNoYeonjangCapabilityGuidance(input: {
  originalRequest: string
  primaryLanguage: "ko" | "en"
  result: TruthfulNoYeonjangResult
  dependencies?: UserFacingNoticeRenderDependencies | undefined
  renderNotice?: NoYeonjangGuidanceRenderer | undefined
}): Promise<NoYeonjangCapabilityGuidanceResolution> {
  const originalRequest = input.originalRequest.trim()
  if (!originalRequest) return { status: "blocked", reason: "no_yeonjang_guidance_request_missing" }
  const rawText = JSON.stringify({
    instruction: "Report completed self-solve results and explicitly state that blocked computer actions were not executed. Include only the supplied capability need, verified reason, and next action.",
    language: input.primaryLanguage,
    status: input.result.status,
    completed_results: input.result.completedSelfSolveResults,
    blocked_actions: input.result.blockedSteps.map((step) => ({
      action: step.summary,
      execution_status: step.status,
      required_capability: step.requiredCapabilityName,
      required_capability_id: step.requiredCapability,
      reason: step.reasonCode,
      verified_reason: step.userFacingReason,
      next_action: step.userNextAction,
    })),
  })
  const render = input.renderNotice ?? ((params) => renderUserFacingNoticeText(params))
  const rendered = await render({
    originalRequest,
    rawText,
    textSource: "runtime_deterministic",
    contentKind: "final_report",
    reasonPrefix: "no_yeonjang_capability_guidance",
    dependencies: input.dependencies,
  })
  if (rendered.status !== "ready") return rendered
  const text = rendered.text.trim()
  if (text.length > 900) return { status: "blocked", reason: "no_yeonjang_guidance_too_long" }
  if (input.result.blockedSteps.length > 0 && FALSE_EXECUTION_CLAIMS.some((pattern) => pattern.test(text))) {
    return { status: "blocked", reason: "no_yeonjang_guidance_false_execution_claim" }
  }
  if (INTERNAL_DETAIL.test(text)) return { status: "blocked", reason: "no_yeonjang_guidance_internal_detail" }
  const language = detectPrimaryMessageLanguage(text)
  if (language !== "unknown" && language !== input.primaryLanguage) {
    return { status: "blocked", reason: "no_yeonjang_guidance_language_mismatch" }
  }
  for (const blocked of input.result.blockedSteps) {
    if (!text.includes(blocked.requiredCapabilityName)
      || !text.includes(blocked.userFacingReason)
      || !text.includes(blocked.userNextAction)) {
      return { status: "blocked", reason: "no_yeonjang_guidance_required_fact_missing" }
    }
  }
  return { status: "ready", text, textSource: "llm_reviewed" }
}
