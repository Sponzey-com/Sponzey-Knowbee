import {
  type CanonicalResultLanguage,
  type CanonicalResultReportFacts,
  buildCanonicalResultReportFacts,
} from "../contracts/canonical-result-report.js"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import type { NodeResultReport } from "../contracts/enterprise-topology.js"
import type { BlockedStopReportDecision } from "../contracts/stop-report-decision.js"
import type { CanonicalTerminalEvidenceResult } from "./canonical-terminal-evidence.js"

function localized(language: CanonicalResultLanguage, ko: string, en: string): string {
  return language === "ko" ? ko : en
}

export function buildCanonicalCompletionExhaustedReport(input: {
  runId: string
  primaryLanguage: CanonicalResultLanguage
  evidenceRefs: readonly string[]
}): CanonicalResultReportFacts {
  return buildCanonicalResultReportFacts({
    goalId: `goal:${input.runId}`,
    workId: canonicalWorkIdForRootRun(input.runId),
    outcome: "blocked",
    primaryLanguage: input.primaryLanguage,
    completedScope: [],
    unresolvedScope: [
      localized(input.primaryLanguage, "사용자가 요청한 실행 결과", "The requested execution outcome"),
    ],
    reasonCode: "solution_paths_exhausted",
    verifiedReasonFacts: [
      localized(
        input.primaryLanguage,
        "결과 검토에서 허용된 다른 실행 경로가 남아 있지 않음이 확인되었습니다.",
        "Result review confirmed that no materially different permitted execution path remains.",
      ),
    ],
    evidenceRefs: [...new Set(input.evidenceRefs)],
    nextActions: [{
      kind: "required_condition",
      text: localized(
        input.primaryLanguage,
        "요청한 기능을 제공하는 연결이나 기능이 추가되면 다시 요청하세요.",
        "Retry after a connection or capability that provides the requested function becomes available.",
      ),
    }],
  })
}

export function buildCanonicalCompletionBlockedReport(input: {
  runId: string
  primaryLanguage: CanonicalResultLanguage
  evidenceRefs: readonly string[]
}): CanonicalResultReportFacts {
  return buildCanonicalResultReportFacts({
    goalId: `goal:${input.runId}`,
    workId: canonicalWorkIdForRootRun(input.runId),
    outcome: "blocked",
    primaryLanguage: input.primaryLanguage,
    completedScope: [],
    unresolvedScope: [
      localized(input.primaryLanguage, "사용자가 요청한 실행 결과", "The requested execution outcome"),
    ],
    reasonCode: "verified_result_blocker",
    verifiedReasonFacts: [
      localized(
        input.primaryLanguage,
        "결과 검토에서 실행을 막는 조건과 허용된 대안 평가 근거가 확인되었습니다.",
        "Result review verified a blocking condition and evidence for the permitted alternatives evaluated.",
      ),
    ],
    evidenceRefs: [...new Set(input.evidenceRefs)],
    nextActions: [{
      kind: "required_condition",
      text: localized(
        input.primaryLanguage,
        "확인된 차단 조건을 해소한 뒤 다시 요청하세요.",
        "Resolve the verified blocking condition, then retry the request.",
      ),
    }],
  })
}

export function buildCanonicalPartialTopologyReport(input: {
  runId: string
  primaryLanguage: CanonicalResultLanguage
  report: NodeResultReport
}): CanonicalResultReportFacts {
  const completedScope = input.report.outputs
    .filter((output) => output.status === "satisfied" || output.status === "partial")
    .map((output, index) =>
      output.outputId.includes(":")
        ? localized(
            input.primaryLanguage,
            `검증된 완료 항목 ${index + 1}`,
            `Verified completed item ${index + 1}`,
          )
        : output.outputId,
    )
  if (completedScope.length === 0) {
    completedScope.push(
      localized(
        input.primaryLanguage,
        "검증된 부분 실행 결과",
        "Verified partial execution result",
      ),
    )
  }
  const unresolvedIds = [
    ...new Set([
      ...input.report.unmetSuccessCriteriaIds,
      ...input.report.outputs
        .filter((output) => output.status === "missing")
        .map((output) => output.outputId),
    ]),
  ]
  const unresolvedScope = unresolvedIds.map((value, index) =>
    value.includes(":")
      ? localized(input.primaryLanguage, `미완료 항목 ${index + 1}`, `Unresolved item ${index + 1}`)
      : value,
  )
  if (unresolvedScope.length === 0) {
    unresolvedScope.push(
      localized(input.primaryLanguage, "남은 성공 기준", "Remaining success criteria"),
    )
  }
  const verifiedReasonFacts =
    input.report.risksOrGaps.length > 0
      ? [
          ...new Set(
            input.report.risksOrGaps.map((value) =>
              /[:_]/u.test(value)
                ? localized(
                    input.primaryLanguage,
                    "결과 검증에서 출력 간 충돌 또는 누락이 확인되었습니다.",
                    "Result verification found an output conflict or omission.",
                  )
                : value,
            ),
          ),
        ]
      : [
          localized(
            input.primaryLanguage,
            "결과 검증에서 미완료 항목이 확인되었습니다.",
            "Result verification found unresolved items.",
          ),
        ]

  return buildCanonicalResultReportFacts({
    goalId: `goal:${input.runId}`,
    workId: canonicalWorkIdForRootRun(input.runId),
    outcome: "partial",
    primaryLanguage: input.primaryLanguage,
    completedScope,
    unresolvedScope,
    reasonCode: "topology_result_partially_verified",
    verifiedReasonFacts,
    evidenceRefs: [
      ...new Set([
        input.report.resultReportId,
        ...input.report.outputs.map((output) => output.outputId),
      ]),
    ],
    nextActions: [
      {
        kind: "user_action",
        text: localized(
          input.primaryLanguage,
          "미완료 항목의 조건을 보완한 뒤 다시 실행하세요.",
          "Provide the missing conditions for the unresolved items, then retry.",
        ),
      },
    ],
  })
}

export function buildCanonicalBlockedRuntimeReport(input: {
  primaryLanguage: CanonicalResultLanguage
  terminalEvidence: Extract<CanonicalTerminalEvidenceResult, { status: "available" }>
}): CanonicalResultReportFacts {
  const evidence = input.terminalEvidence
  return buildCanonicalResultReportFacts({
    goalId: `goal:${evidence.rootRunId}`,
    workId: evidence.workId,
    outcome: "blocked",
    primaryLanguage: input.primaryLanguage,
    completedScope: [],
    unresolvedScope: [localized(input.primaryLanguage, "사용자 요청", "Requested work")],
    reasonCode: evidence.cause.reasonCode,
    verifiedReasonFacts: [
      localized(
        input.primaryLanguage,
        "실행 정책 검증에서 안전한 대안이 소진된 차단 조건이 확인되었습니다.",
        "Execution policy verification confirmed a blocking condition after safe alternatives were exhausted.",
      ),
    ],
    evidenceRefs: evidence.evidenceRefs,
    nextActions: [
      {
        kind: "required_condition",
        text: localized(
          input.primaryLanguage,
          "확인된 차단 조건을 해소한 뒤 요청을 다시 검토하세요.",
          "Resolve the verified blocking condition before the request is reviewed again.",
        ),
      },
    ],
  })
}

export function buildCanonicalTopologyTerminalReport(input: {
  runId: string
  primaryLanguage: CanonicalResultLanguage
  decision: Extract<BlockedStopReportDecision, { status: "stop_and_report" }>
}): CanonicalResultReportFacts {
  const report = input.decision.reportInput
  const permissionBlocked = report.reasonCode === "permission_denied"
  const impossible = report.reasonCode === "concrete_impossibility"
  const outcome = permissionBlocked ? ("blocked" as const) : ("impossible" as const)
  const reason = permissionBlocked
    ? localized(
        input.primaryLanguage,
        "필요한 권한이 없어 확인된 실행 경로를 계속할 수 없습니다.",
        "The verified execution paths cannot continue without the required permission.",
      )
    : impossible
      ? localized(
          input.primaryLanguage,
          "확인된 조건에서는 요청 결과를 만들 수 없습니다.",
          "The requested outcome cannot be produced under the verified conditions.",
        )
      : localized(
          input.primaryLanguage,
          "검증 가능한 해결 경로를 모두 실행했지만 성공 기준을 충족하지 못했습니다.",
          "All verifiable solution paths were attempted without satisfying the success criteria.",
        )
  const unresolvedScope = report.unresolvedItemIds.map((_, index) =>
    localized(input.primaryLanguage, `미완료 항목 ${index + 1}`, `Unresolved item ${index + 1}`),
  )
  const nextActionTexts =
    report.nextActions.length > 0
      ? [...new Set(report.nextActions.map((value) => value.trim().slice(0, 240)).filter(Boolean))]
      : [
          localized(
            input.primaryLanguage,
            permissionBlocked
              ? "필요한 권한을 제공한 뒤 다시 요청하세요."
              : "요청 조건이나 사용 가능한 수단이 바뀌면 다시 요청하세요.",
            permissionBlocked
              ? "Provide the required permission, then retry."
              : "Retry when the request conditions or available capabilities change.",
          ),
        ]
  return buildCanonicalResultReportFacts({
    goalId: report.goalId,
    workId: canonicalWorkIdForRootRun(input.runId),
    outcome,
    primaryLanguage: input.primaryLanguage,
    completedScope: report.partialResultRefs.map((_, index) =>
      localized(
        input.primaryLanguage,
        `검증된 부분 결과 ${index + 1}`,
        `Verified partial result ${index + 1}`,
      ),
    ),
    unresolvedScope,
    reasonCode: report.reasonCode,
    verifiedReasonFacts: [reason],
    evidenceRefs: report.evidenceRefs,
    nextActions: nextActionTexts.map((text) => ({
      kind: permissionBlocked ? ("required_condition" as const) : ("user_action" as const),
      text,
    })),
  })
}
