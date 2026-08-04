import { createHash } from "node:crypto"
import type { UserInputRequirement } from "../contracts/user-input-requirement.js"
import { loadBundledPromptTemplate } from "../memory/knowbee-md.js"
import {
  containsInternalEvidenceText,
  redactInternalEvidenceText,
} from "../security/internal-evidence-redaction.js"
import type { SuccessfulToolEvidence } from "./recovery.js"
import {
  buildEmptyResultRecoveryPrompt,
  buildTruncatedOutputRecoveryPrompt,
} from "./recovery.js"
import type { CompletionFlowDecision } from "./completion-flow.js"
import {
  buildNextAttemptToolPolicy,
  type NextAttemptToolPolicy,
} from "./next-attempt-tool-policy.js"

export type CompletionApplicationDecision =
  | {
      kind: "complete"
      summary: string
      persistedText: string
      statusText: string
    }
  | {
      kind: "stop"
      summary: string
      reason: string
      remainingItems?: string[]
    }
  | {
      kind: "retry"
      budgetKind: "execution" | "interpretation"
      summary: string
      detail?: string
      title?: string
      eventLabel: string
      nextMessage: string
      reviewStepStatus: "running" | "completed"
      executingStepSummary: string
      updateRunStatusSummary?: string
      structuredFollowupKey?: string
      markTruncatedOutputRecoveryAttempted?: boolean
      clearWorkerRuntime?: boolean
      requiredToolNames?: string[]
      nextAttemptToolPolicy?: NextAttemptToolPolicy
    }
  | {
      kind: "awaiting_user"
      summary: string
      reason?: string
      remainingItems?: string[]
      userMessage?: string
      inputRequirement?: UserInputRequirement
    }

export interface CompletionFollowupTransitionIdentity {
  kind: "completion_followup"
  actionProposal: string
  reason: string
  remainingItems: string[]
  summary: string
  evidenceRefs: string[]
  executionMode: "tool" | "response_only" | "legacy"
  requiredToolNames: string[]
  targetRefs: string[]
}

export function decideCompletionApplication(params: {
  decision: CompletionFlowDecision
  originalRequest: string
  previousResult: string
  successfulTools: SuccessfulToolEvidence[]
  sawRealFilesystemMutation: boolean
  usedTurns: number
  maxTurns: number
  interpretationBudgetLimit: number
  executionBudgetLimit: number
  canRetryInterpretation: boolean
  canRetryExecution: boolean
  followupAlreadySeen: boolean
}): CompletionApplicationDecision {
  const { decision } = params

  if (decision.kind === "complete") {
    return decision
  }

  if (decision.kind === "invalid_followup") {
    return {
      kind: "stop",
      summary: decision.summary,
      reason: decision.reason,
      remainingItems: decision.remainingItems,
    }
  }

  if (decision.kind === "blocked") {
    return {
      kind: "stop",
      summary: decision.summary,
      reason: decision.reason,
      remainingItems: decision.remainingItems,
    }
  }

  if (decision.kind === "recover_empty_result") {
    if (!params.canRetryExecution) {
      return {
        kind: "stop",
        summary: "실행 결과가 비어 있고 완료 근거가 없어 자동 진행을 멈췄습니다.",
        reason: decision.reason,
        remainingItems: decision.remainingItems,
      }
    }

    return {
      kind: "retry",
      budgetKind: "execution",
      summary: decision.summary,
      detail: decision.reason,
      title: "empty_result_recovery",
      eventLabel: "빈 결과 복구",
      nextMessage: buildEmptyResultRecoveryPrompt({
        originalRequest: params.originalRequest,
        previousResult: params.previousResult,
        successfulTools: params.successfulTools,
        sawRealFilesystemMutation: params.sawRealFilesystemMutation,
      }),
      reviewStepStatus: "running",
      executingStepSummary: decision.summary,
      updateRunStatusSummary: decision.summary,
    }
  }

  if (decision.kind === "followup") {
    // knowbee-critical-decision-audit: completion.followup_structured_key_dedupe
    const structuredFollowupKey = buildStructuredFollowupKey(
      decision,
      decision.evidenceRevisionRefs,
    )
    if (params.followupAlreadySeen) {
      return {
        kind: "stop",
        summary: "같은 후속 지시가 반복되어 자동 진행을 멈췄습니다.",
        reason: decision.reason || "반복 후속 지시 감지",
        remainingItems: decision.remainingItems,
      }
    }

    if (!params.canRetryInterpretation) {
      return {
        kind: "stop",
        summary: "해석/후속 처리를 자동으로 계속할 수 없습니다.",
        reason: decision.reason || "새 안전 대안이나 필요한 결정 정보가 부족합니다.",
        ...(decision.remainingItems ? { remainingItems: decision.remainingItems } : {}),
      }
    }

    return {
      kind: "retry",
      budgetKind: "interpretation",
      summary: decision.summary,
      eventLabel: "후속 처리",
      nextMessage: buildCompletionFollowupExecutionMessage(decision),
      reviewStepStatus: "completed",
      executingStepSummary: decision.summary,
      structuredFollowupKey,
      ...(decision.followupExecutionMode
        ? {
            nextAttemptToolPolicy: buildNextAttemptToolPolicy({
              followupExecutionMode: decision.followupExecutionMode,
              requiredToolNames: decision.followupRequiredToolNames,
            }),
            requiredToolNames:
              decision.followupExecutionMode === "response_only"
                ? []
                : [...new Set(decision.followupRequiredToolNames ?? [])],
          }
        : decision.followupRequiredToolNames?.length
          ? {
              nextAttemptToolPolicy: buildNextAttemptToolPolicy({
                followupExecutionMode: "tool",
                requiredToolNames: decision.followupRequiredToolNames,
              }),
              requiredToolNames: [...new Set(decision.followupRequiredToolNames)],
            }
          : {}),
    }
  }

  if (decision.kind === "retry_truncated") {
    if (!params.canRetryExecution) {
      return {
        kind: "stop",
        summary: "실행 복구를 자동으로 계속할 수 없습니다.",
        reason: decision.reason || "새 안전 대안이나 필요한 결정 정보가 부족합니다.",
        ...(decision.remainingItems ? { remainingItems: decision.remainingItems } : {}),
      }
    }

    return {
      kind: "retry",
      budgetKind: "execution",
      summary: decision.summary,
      eventLabel: "중간 절단 복구",
      nextMessage: buildTruncatedOutputRecoveryPrompt({
        originalRequest: params.originalRequest,
        previousResult: params.previousResult,
        summary: decision.summary,
        ...(decision.reason ? { reason: decision.reason } : {}),
        ...(decision.remainingItems ? { remainingItems: decision.remainingItems } : {}),
      }),
      reviewStepStatus: "completed",
      executingStepSummary: "중간에 끊긴 작업을 다른 방식으로 이어갑니다.",
      updateRunStatusSummary: "중간에 끊긴 작업을 다른 방식으로 이어갑니다.",
      markTruncatedOutputRecoveryAttempted: true,
      clearWorkerRuntime: true,
    }
  }

  return {
    kind: "awaiting_user",
    summary: decision.summary,
    ...(decision.reason ? { reason: decision.reason } : {}),
    ...(decision.remainingItems ? { remainingItems: decision.remainingItems } : {}),
    ...(decision.userMessage ? { userMessage: decision.userMessage } : {}),
    inputRequirement: decision.inputRequirement,
  }
}

export function buildStructuredFollowupKey(
  decision: Extract<CompletionFlowDecision, { kind: "followup" }>,
  evidenceRevisionRefs: readonly string[] = decision.followupEvidenceRefs ?? [],
): string {
  const payload = JSON.stringify(
    buildCompletionFollowupTransitionIdentity(decision, evidenceRevisionRefs),
  )
  const digest = createHash("sha256").update(payload).digest("hex").slice(0, 16)
  return `completion-followup:${digest}`
}

export function buildCompletionFollowupTransitionIdentity(
  decision: Extract<CompletionFlowDecision, { kind: "followup" }>,
  evidenceRevisionRefs: readonly string[] = decision.followupEvidenceRefs ?? [],
): CompletionFollowupTransitionIdentity {
  if (decision.followupExecutionMode === "response_only") {
    return {
      kind: "completion_followup",
      actionProposal: "",
      reason: "",
      remainingItems: [],
      summary: "",
      evidenceRefs: [...new Set(evidenceRevisionRefs)].sort(),
      executionMode: "response_only",
      requiredToolNames: [],
      targetRefs: [],
    }
  }
  const evidenceRefs = decision.followupEvidenceRefs ?? []
  const remainingItems = Array.isArray(decision.remainingItems) ? decision.remainingItems : []
  const normalizedItems = remainingItems
    .map((item) => item.trim().replace(/\s+/gu, " "))
    .filter((item) => item.length > 0)
    .sort()
  return {
    kind: "completion_followup",
    actionProposal: decision.followupPrompt.trim().replace(/\s+/gu, " "),
    reason: decision.reason.trim().replace(/\s+/gu, " "),
    remainingItems: normalizedItems,
    summary: decision.summary.trim().replace(/\s+/gu, " "),
    evidenceRefs: [...evidenceRefs].sort(),
    executionMode: decision.followupExecutionMode ?? "legacy",
    requiredToolNames: [...new Set(decision.followupRequiredToolNames ?? [])].sort(),
    targetRefs: [...new Set(decision.followupTargetRefs ?? [])].sort(),
  }
}

export function buildCompletionFollowupExecutionMessage(
  decision: Extract<CompletionFlowDecision, { kind: "followup" }>,
): string {
  const evidenceRefs = decision.followupEvidenceRefs ?? []
  if (evidenceRefs.length === 0) return decision.followupPrompt
  const evidenceRefsBlock = buildFollowupEvidenceRefsBlock(evidenceRefs)
  return loadBundledPromptTemplate({
    sourceId: "completion_followup_evidence_user",
    variables: {
      actionProposalBlock: decision.followupPrompt,
      evidenceRefsBlock,
      requiredToolNamesBlock: decision.followupExecutionMode === "tool"
        && (decision.followupRequiredToolNames?.length ?? 0) > 0
        ? decision.followupRequiredToolNames!.map((name) => `- ${name}`).join("\n")
        : "",
      remainingItemsBlock: decision.remainingItems.length > 0
        ? decision.remainingItems.map((item) => `- ${item}`).join("\n")
        : "- Re-evaluate the original completion conditions.",
    },
  })
}

export function sanitizeCompletionAwaitingUserText(
  value: string | undefined,
  fallback = "작업 결과를 확인하기 위해 추가 확인이 필요합니다.",
): string {
  const original = value ?? ""
  const hadInternalText = containsInternalEvidenceText(original)
  if (!hadInternalText) return original.trim() || fallback
  const sanitized = redactInternalEvidenceText(original, { replacement: "" })
    .replace(/\s+/gu, " ")
    .trim()
  if (hadInternalText && sanitized.length < 8) return fallback
  return sanitized.length > 0 ? sanitized : fallback
}

function buildFollowupEvidenceRefsBlock(evidenceRefs: readonly string[]): string {
  const evidenceLines = evidenceRefs.map((ref) => `- ${ref}`)
  const yeonjangGuidance = buildYeonjangValidationFailureRecoveryGuidance(evidenceRefs)
  if (!yeonjangGuidance) return evidenceLines.join("\n")
  return [...evidenceLines, "", yeonjangGuidance].join("\n")
}

function buildYeonjangValidationFailureRecoveryGuidance(evidenceRefs: readonly string[]): string {
  const failures = evidenceRefs
    .map(parseYeonjangValidationFailureEvidenceRef)
    .filter((failure): failure is YeonjangValidationFailureRef => failure !== null)
  if (failures.length === 0) return ""

  const failureLines = failures.map((failure, index) => {
    const detail = failure.detail ? `; detail=${failure.detail}` : ""
    return `${index + 1}. tool=${failure.toolName}; target=tool:${failure.toolName}:side-effect-goal; reason=${failure.reason}${detail}`
  })

  return [
    "Yeonjang side-effect validation failure recovery:",
    ...failureLines,
    ...buildBrowserFocusRecoveryActionLines(failures),
    "Do not repeat the same side-effect path unless the strategy changes materially or the user explicitly confirms the same action.",
    "Use a materially different method, collect missing observable evidence, or ask the user for confirmation when no safe alternative is available.",
  ].join("\n")
}

function buildBrowserFocusRecoveryActionLines(
  failures: readonly YeonjangValidationFailureRef[],
): string[] {
  const details = new Set(
    failures
      .filter((failure) => failure.toolName === "yeonjang_browser_focus")
      .map((failure) => failure.detail || failure.reason)
      .filter(Boolean),
  )
  if (details.size === 0) return []

  const actions: string[] = []
  if (details.has("target_observation_required")) {
    actions.push("- collect focused target observation before reporting completion")
  }
  if (details.has("focused_target_mismatch")) {
    actions.push("- ask the user to choose the exact browser target")
  }
  if (details.has("side_effect_authorization_required")) {
    actions.push("- request explicit user approval before dispatch")
  }
  if (details.has("pre_dispatch_required")) {
    actions.push("- prepare browser.focus pre-dispatch receipt")
  }
  if (details.has("macos_bridge_not_verified")) {
    actions.push("- verify the macOS bridge before dispatch")
  }
  if (actions.length === 0) {
    actions.push("- collect missing browser.focus verification evidence before retrying")
  }
  return [
    "Browser focus recovery actions:",
    ...actions,
    "Do not repeat commandAccepted-only browser.focus execution.",
  ]
}

type YeonjangValidationFailureRef = {
  toolName: string
  reason: string
  detail?: string
}

function parseYeonjangValidationFailureEvidenceRef(
  evidenceRef: string,
): YeonjangValidationFailureRef | null {
  const prefix = "yeonjang-goal-validation:"
  if (!evidenceRef.startsWith(prefix)) return null
  const parts = evidenceRef.slice(prefix.length).split(":")
  if (parts.length < 2) return null
  const toolName = sanitizeFollowupEvidenceToken(parts[0])
  const reason = sanitizeFollowupEvidenceToken(parts[1])
  const detail = sanitizeFollowupEvidenceToken(parts.slice(2).join(":"))
  if (!toolName || !reason) return null
  return {
    toolName,
    reason,
    ...(detail ? { detail } : {}),
  }
}

function sanitizeFollowupEvidenceToken(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 96)
}
