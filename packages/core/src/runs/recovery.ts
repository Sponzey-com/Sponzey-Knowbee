import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { join } from "node:path"
import { type PromptTemplateVariables, loadPromptTemplate } from "../memory/knowbee-md.js"
import { loadPromptValue } from "../memory/prompt-fragments.js"
import { UNTRUSTED_EVIDENCE_SOURCE_KINDS } from "../security/trust-boundary.js"
import type { ToolEvidenceSourceReceipt } from "../tools/types.js"
import { admitYeonjangEvidenceForReview } from "../yeonjang/evidence-admission.js"
import { displayHomePath } from "./delivery.js"
import type { AssistantTextDeliveryOutcome, DeliverySource } from "./delivery.js"
import { sanitizeUserFacingError } from "./error-sanitizer.js"
import type { SanitizedErrorKind } from "./error-sanitizer.js"

export interface FailedCommandTool {
  toolName: string
  output: string
  params?: unknown
}

export interface SuccessfulToolEvidence {
  toolName: string
  output: string
  details?: unknown
  evidenceSource?: Readonly<ToolEvidenceSourceReceipt>
}

export type ToolEvidenceTrustReasonCode =
  | "tool_evidence_data_only"
  | "tool_evidence_source_missing"
  | "tool_evidence_source_ref_invalid"
  | "tool_evidence_isolation_invalid"

export function evaluateSuccessfulToolEvidenceTrust(
  evidence: SuccessfulToolEvidence,
): { allowed: boolean; reasonCode: ToolEvidenceTrustReasonCode; sourceRef: string } {
  const source = evidence.evidenceSource
  if (!source) {
    return { allowed: false, reasonCode: "tool_evidence_source_missing", sourceRef: "unavailable" }
  }
  const sourceRefMatch = /^tool-result:([a-z_]+):([a-f0-9]{64})$/u.exec(source.sourceRef)
  if (
    !sourceRefMatch
    || sourceRefMatch[1] !== source.sourceKind
    || !UNTRUSTED_EVIDENCE_SOURCE_KINDS.includes(source.sourceKind)
  ) {
    return { allowed: false, reasonCode: "tool_evidence_source_ref_invalid", sourceRef: "unavailable" }
  }
  if (source.trustClass !== "untrusted_external" || source.instructionIsolation !== "data_only") {
    return { allowed: false, reasonCode: "tool_evidence_isolation_invalid", sourceRef: source.sourceRef }
  }
  return { allowed: true, reasonCode: "tool_evidence_data_only", sourceRef: source.sourceRef }
}

function trustEligibleSuccessfulTools(
  evidence: SuccessfulToolEvidence[],
): SuccessfulToolEvidence[] {
  return evidence.filter((item) => evaluateSuccessfulToolEvidenceTrust(item).allowed)
}

export type RecoveryAlternativeKind =
  | "other_tool"
  | "other_extension"
  | "other_channel"
  | "other_schedule"
  | "same_channel_retry"

export interface RecoveryAlternative {
  kind: RecoveryAlternativeKind
  label: string
}

interface RecoveryCandidateBase {
  key: string
  summary: string
  reason: string
  alternatives: RecoveryAlternative[]
}

export interface DeliveryRecoveryCandidate extends RecoveryCandidateBase {
  remainingItems: string[]
}

export interface CommandFailureRecoveryCandidate extends RecoveryCandidateBase {}

export interface GenericExecutionRecoveryCandidate extends RecoveryCandidateBase {}

export interface YeonjangFailureEvidenceRecoveryPayload {
  summary: string
  reason: string
  toolNames: string[]
}

export interface RecoveryKeyParts {
  action: string
  error: string
  reasonCode?: string | undefined
  evidenceRefs?: readonly string[] | undefined
  toolName?: string | undefined
  targetId?: string | undefined
  channel?: DeliverySource | string | undefined
}

const RECOVERY_PROMPT_SECTION_TEXT_SOURCE_ID = "recovery_prompt_section_text_user"

function recoveryPromptSectionText(key: string, variables: PromptTemplateVariables = {}): string {
  const entries = loadPromptValue(RECOVERY_PROMPT_SECTION_TEXT_SOURCE_ID, variables, { required: true })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line): [string, string] => {
      const separator = line.indexOf("=")
      if (separator < 0) return [line, ""]
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
    })
  const value = new Map(entries).get(key)
  if (!value) throw new Error(`recovery prompt section text missing: ${key}`)
  return value
}

export function buildRecoveryKey(parts: RecoveryKeyParts): string {
  // knowbee-critical-decision-audit: recovery.normalized_error_key
  // Recovery dedupe prefers an exact reason/evidence identity and keeps sanitized
  // error-kind fallback only for legacy unstructured failures.
  const reasonCode = parts.reasonCode?.trim()
  const errorKind: SanitizedErrorKind | string = reasonCode
    ? `reason:${reasonCode}`
    : sanitizeUserFacingError(parts.error).kind
  const evidenceRefs = [...new Set(
    (parts.evidenceRefs ?? []).map((ref) => ref.trim()).filter(Boolean),
  )].sort()
  const evidenceFingerprint = evidenceRefs.length > 0
    ? createHash("sha256").update(evidenceRefs.join("\u0000")).digest("hex")
    : null
  return [
    "recovery",
    normalizeRecoveryKeyPart(parts.action || "unknown_action"),
    `target=${normalizeRecoveryKeyPart(parts.targetId ?? "none")}`,
    `channel=${normalizeRecoveryKeyPart(parts.channel ?? "none")}`,
    `tool=${normalizeRecoveryKeyPart(parts.toolName ?? "none")}`,
    `error=${normalizeRecoveryKeyPart(errorKind)}`,
    ...(evidenceFingerprint ? [`evidence=sha256:${evidenceFingerprint}`] : []),
  ].join("::")
}

function normalizeRecoveryKeyPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
  return normalized || "none"
}

export function isCommandFailureRecoveryTool(toolName: string): boolean {
  return toolName === "shell_exec" || toolName === "app_launch" || toolName === "process_kill"
}

function normalizeCommandFailureKey(toolName: string, output: string, params?: unknown): string {
  return buildRecoveryKey({
    action: "command_failure",
    toolName,
    targetId: commandFailureTargetFingerprint(params),
    error: output,
  })
}

function commandFailureTargetFingerprint(params: unknown): string | undefined {
  if (!params || typeof params !== "object") return undefined
  const command = (params as Record<string, unknown>).command
  if (typeof command !== "string" || !command.trim()) return undefined
  return command
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
}

export function describeCommandFailureReason(output: string): string {
  // knowbee-critical-decision-audit: recovery.command_failure_reason
  // Error-message classification only selects recovery candidates; it must not decide user intent or schedule identity.
  if (/(not found|command not found|enoent|is not recognized)/i.test(output)) {
    return "실행 명령을 찾지 못해 다른 명령이나 다른 도구 경로를 찾아야 합니다."
  }
  if (/(permission denied|operation not permitted|eacces|권한)/i.test(output)) {
    return "권한 또는 접근 제한 때문에 같은 방법으로는 실행할 수 없습니다."
  }
  if (/(no such file|cannot find|not a directory|경로|파일을 찾을 수 없음)/i.test(output)) {
    return "대상 경로나 파일 이름이 맞지 않아 다른 경로나 다른 생성 방법을 찾아야 합니다."
  }
  if (/(timeout|timed out|시간 초과)/i.test(output)) {
    return "시간 초과가 발생해 더 짧거나 다른 실행 방법을 찾아야 합니다."
  }
  return "이전 명령이 실패해서 다른 방법을 찾아 다시 시도해야 합니다."
}

export function selectCommandFailureRecovery(params: {
  failedTools: FailedCommandTool[]
  commandFailureSeen: boolean
  commandRecoveredWithinSamePass: boolean
  seenKeys: Set<string>
}): CommandFailureRecoveryCandidate | null {
  if (!params.commandFailureSeen || params.commandRecoveredWithinSamePass || params.failedTools.length === 0) {
    return null
  }

  for (let index = params.failedTools.length - 1; index >= 0; index -= 1) {
    const failedTool = params.failedTools[index]
    if (!failedTool) continue
    const key = normalizeCommandFailureKey(failedTool.toolName, failedTool.output, failedTool.params)
    if (params.seenKeys.has(key)) continue

    return {
      key,
      summary: `${failedTool.toolName} 실패 후 다른 방법을 자동으로 찾는 중입니다.`,
      reason: describeCommandFailureReason(failedTool.output),
      alternatives: inferCommandFailureAlternatives(failedTool),
    }
  }

  return null
}

function normalizeExecutionRecoveryKey(
  toolNames: string[],
  reason: string,
  reasonCode?: string,
  evidenceRefs?: string[],
): string {
  const normalizedTools = [...new Set(toolNames)].sort().join(",")
  const normalizedEvidenceRefs = [...new Set(
    (evidenceRefs ?? []).map((ref) => ref.trim()).filter(Boolean),
  )].sort()
  return buildRecoveryKey({
    action: "execution_failure",
    toolName: normalizedTools || "none",
    error: reason,
    ...(reasonCode?.trim() ? { reasonCode: reasonCode.trim() } : {}),
    ...(normalizedEvidenceRefs.length > 0
      ? { evidenceRefs: normalizedEvidenceRefs }
      : {}),
  })
}

export function selectGenericExecutionRecovery(params: {
  executionRecovery: {
    summary: string
    reason: string
    toolNames: string[]
    reasonCode?: string | undefined
    evidenceRefs?: string[] | undefined
  }
  seenKeys: Set<string>
}): GenericExecutionRecoveryCandidate | null {
  if (params.executionRecovery.toolNames.length === 0) return null
  const key = normalizeExecutionRecoveryKey(
    params.executionRecovery.toolNames,
    params.executionRecovery.reason,
    params.executionRecovery.reasonCode,
    params.executionRecovery.evidenceRefs,
  )
  if (params.seenKeys.has(key)) return null
  return {
    key,
    summary: params.executionRecovery.summary,
    reason: params.executionRecovery.reason,
    alternatives: inferGenericExecutionAlternatives(params.executionRecovery.toolNames),
  }
}

export function buildYeonjangFailureEvidenceRecoveryPayload(
  evidence: SuccessfulToolEvidence,
): YeonjangFailureEvidenceRecoveryPayload | null {
  if (!evidence.toolName.startsWith("yeonjang_")) return null

  const admission = admitYeonjangEvidenceForReview({
    result: {
      success: true,
      output: evidence.output,
      details: evidence.details,
      ...(evidence.evidenceSource ? { evidenceSource: evidence.evidenceSource } : {}),
    },
    expectedToolName: evidence.toolName,
  })

  if (admission.status === "admitted") return null

  if (admission.reasonCode !== "YEONJANG_POST_CHECK_UNVERIFIED") {
    return {
      summary: `${evidence.toolName} Yeonjang evidence was not admissible.`,
      reason: `Yeonjang recovery required: reason=${admission.reasonCode}`,
      toolNames: [evidence.toolName],
    }
  }

  const normalizedEvidence = recordValue(recordValue(evidence.details)?.evidence)
  const targetRef = stringField(normalizedEvidence, "targetRef") ?? "unknown"
  const targetEvidenceRef = targetRef === "unknown"
    ? "unavailable"
    : `sha256:${createHash("sha256").update(targetRef).digest("hex")}`
  const postCheck = recordValue(normalizedEvidence?.postCheck)
  const postCheckKind = stringField(postCheck, "kind") ?? "unknown"
  const postCheckReason = stringField(postCheck, "reason")
  const boundedPostCheckReason =
    postCheckReason && /^[a-z0-9_:-]{1,96}$/u.test(postCheckReason)
      ? postCheckReason
      : postCheckReason
        ? "post_check_failed"
        : null
  const methodIds = Array.isArray(normalizedEvidence?.methodIds)
    ? normalizedEvidence.methodIds.filter((method): method is string => typeof method === "string" && method.trim().length > 0)
    : []
  const method = methodIds[0] ?? "unknown"

  return {
    summary: `${evidence.toolName} Yeonjang evidence failed verification.`,
    reason: [
      "Yeonjang recovery required",
      `target_ref=${targetEvidenceRef}`,
      `method=${method}`,
      `post_check=${postCheckKind}`,
      ...(boundedPostCheckReason ? [`reason=${boundedPostCheckReason}`] : []),
    ].join("; "),
    toolNames: [evidence.toolName],
  }
}

function stringField(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function describeRecoveryAlternatives(alternatives: RecoveryAlternative[]): string | null {
  if (alternatives.length === 0) return null
  return `대안 후보: ${alternatives.map((alternative) => alternative.label).join(", ")}`
}

export function buildDirectArtifactDeliveryRecoveryPrompt(params: {
  originalRequest: string
  previousResult: string
  successfulTools: SuccessfulToolEvidence[]
  successfulFileDeliveries: Array<{ channel: string; filePath: string }>
  alternatives?: RecoveryAlternative[]
}): string {
  const toolLines = trustEligibleSuccessfulTools(params.successfulTools)
    .slice(-5)
    .map((tool, index) => `${index + 1}. ${tool.toolName}`)
  const deliveryLines = params.successfulFileDeliveries
    .slice(-3)
    .map((delivery, index) => `${index + 1}. ${delivery.channel}: ${displayHomePath(delivery.filePath)}`)
  const alternativeLines = params.alternatives?.map((alternative) => `- ${alternative.label}`) ?? []

  return loadPromptTemplate({
    sourceId: "direct_artifact_delivery_recovery_user",
    variables: {
      originalRequest: params.originalRequest,
      previousResult: params.previousResult.trim()
        ? `${recoveryPromptSectionText("previous_result")}\n${params.previousResult.trim()}`
        : "",
      successfulTools: toolLines.length > 0
        ? [recoveryPromptSectionText("successful_tool_executions"), ...toolLines].join("\n")
        : "",
      successfulFileDeliveries: deliveryLines.length > 0
        ? [recoveryPromptSectionText("already_delivered_files"), ...deliveryLines].join("\n")
        : "",
      alternatives: alternativeLines.length > 0
        ? [recoveryPromptSectionText("preferred_alternatives"), ...alternativeLines].join("\n")
        : "",
    },
  })
}

export function selectDirectArtifactDeliveryRecovery(params: {
  source: DeliverySource
  successfulFileDeliveries: Array<{ channel: string; filePath: string }>
  seenKeys: Set<string>
}): DeliveryRecoveryCandidate | null {
  const deliveryFingerprint = params.successfulFileDeliveries
    .slice(-3)
    .map((delivery) => `${delivery.channel}:${displayHomePath(delivery.filePath)}`)
    .join("|")
  const key = buildRecoveryKey({
    action: "direct_artifact_delivery",
    channel: params.source,
    toolName: "artifact_delivery",
    error: deliveryFingerprint || "missing artifact delivery",
  })
  if (params.seenKeys.has(key)) return null

  return {
    key,
    summary: "메신저 결과 전달이 아직 끝나지 않아 다른 방법으로 계속 진행합니다.",
    reason: "설명이나 로컬 저장만으로는 완료가 아니며, 요청된 결과물 자체를 메신저로 전달해야 합니다.",
    alternatives: inferDirectArtifactDeliveryAlternatives(params.source),
    remainingItems: ["결과물 자체를 메신저로 실제 전달하는 단계가 남아 있습니다."],
  }
}

export function describeAssistantTextDeliveryFailure(params: {
  source: DeliverySource
  outcome: AssistantTextDeliveryOutcome
}): string {
  const channelLabel =
    params.source === "telegram"
      ? "텔레그램"
      : params.source === "webui"
        ? "WebUI"
        : params.source === "slack"
          ? "Slack"
        : "CLI"

  if (!params.outcome.hasDeliveryFailure) {
    return `${channelLabel} 응답 전달 완료`
  }

  switch (params.outcome.failureStage) {
    case "text_and_done":
      return `${channelLabel} 응답 텍스트와 완료 신호 전달에 실패했습니다.`
    case "text":
      return `${channelLabel} 응답 텍스트 전달에 실패했습니다.`
    case "done":
      return `${channelLabel} 응답 완료 신호 전달에 실패했습니다.`
    default:
      return `${channelLabel} 응답 전달 상태를 확인해야 합니다.`
  }
}

export function buildCommandFailureRecoveryPrompt(params: {
  originalRequest: string
  previousResult: string
  summary: string
  reason: string
  failedTools: FailedCommandTool[]
  alternatives?: RecoveryAlternative[]
}): string {
  const failedLines = params.failedTools.slice(-3).map((tool, index) => {
    const preview = tool.output.trim().replace(/\s+/g, " ").slice(0, 280)
    return `${index + 1}. ${tool.toolName} failed: ${preview}`
  })
  const alternativeLines = params.alternatives?.map((alternative) => `- ${alternative.label}`) ?? []
  const pathAliasLines = buildPathAliasRecoveryHintLines(params.originalRequest, params.failedTools)

  return loadPromptTemplate({
    sourceId: "command_failure_recovery_user",
    variables: {
      originalRequest: params.originalRequest,
      summary: params.summary,
      reason: params.reason,
      failedTools: failedLines.length > 0
        ? [recoveryPromptSectionText("failed_command_records"), ...failedLines].join("\n")
        : "",
      alternatives: alternativeLines.length > 0
        ? [recoveryPromptSectionText("preferred_alternatives"), ...alternativeLines].join("\n")
        : "",
      pathAliasHints: pathAliasLines.length > 0
        ? [recoveryPromptSectionText("path_alias_candidates"), ...pathAliasLines].join("\n")
        : "",
      previousResult: params.previousResult.trim()
        ? `${recoveryPromptSectionText("previous_result")}\n${params.previousResult.trim()}`
        : "",
    },
  })
}

function buildPathAliasRecoveryHintLines(originalRequest: string, failedTools: FailedCommandTool[]): string[] {
  const combined = [
    originalRequest,
    ...failedTools.map((tool) => {
      const params = stringifyRecoveryParams(tool.params)
      return `${tool.output}\n${params}`
    }),
  ].join("\n")

  const hints: string[] = []
  if (mentionsDownloadLocation(combined)) {
    hints.push(`- ${recoveryPromptSectionText("download_location_candidate", {
      downloadPath: displayHomePath(join(homedir(), "Downloads")),
    })}`)
    hints.push(`- ${recoveryPromptSectionText("download_location_phrase_hint")}`)
    hints.push(`- ${recoveryPromptSectionText("preserve_explicit_paths")}`)
  }
  return hints
}

function mentionsDownloadLocation(value: string): boolean {
  return /(downloads?|download\s*folder|다운로드|다운\s*로드|다운도르|다운\s*도르)/iu.test(value)
}

function stringifyRecoveryParams(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

export function buildExecutionRecoveryPrompt(params: {
  originalRequest: string
  previousResult: string
  summary: string
  reason: string
  toolNames: string[]
  reasonCode?: string | undefined
  evidenceRefs?: string[] | undefined
  alternatives?: RecoveryAlternative[]
}): string {
  const toolLine = params.toolNames.length > 0
    ? `${recoveryPromptSectionText("failed_tools")} ${[...new Set(params.toolNames)].join(", ")}`
    : ""
  const alternativeLines = params.alternatives?.map((alternative) => `- ${alternative.label}`) ?? []

  return loadPromptTemplate({
    sourceId: "execution_recovery_user",
    variables: {
      originalRequest: params.originalRequest,
      summary: params.summary,
      reason: [
        params.reason,
        ...(params.reasonCode?.trim()
          ? [`reason_code=${params.reasonCode.trim()}`]
          : []),
        ...[...new Set(
          (params.evidenceRefs ?? []).map((ref) => ref.trim()).filter(Boolean),
        )].sort().map((ref) => `evidence_ref=${ref}`),
      ].join("\n"),
      failedTools: toolLine,
      alternatives: alternativeLines.length > 0
        ? [recoveryPromptSectionText("preferred_alternatives"), ...alternativeLines].join("\n")
        : "",
      previousResult: params.previousResult.trim()
        ? `${recoveryPromptSectionText("previous_result")}\n${params.previousResult.trim()}`
        : "",
    },
  })
}

export function summarizeRawErrorForUser(message: string | undefined): string {
  return message?.trim() ? sanitizeUserFacingError(message).userMessage : ""
}

export function summarizeRawErrorActionHintForUser(message: string | undefined): string {
  return message?.trim() ? (sanitizeUserFacingError(message).actionHint ?? "") : ""
}

export function buildAiErrorRecoveryPrompt(params: {
  originalRequest: string
  previousResult: string
  summary: string
  reason: string
  message: string
  failedRoute?: string | undefined
  avoidTargets?: string[] | undefined
  nextRouteHint?: string | undefined
}): string {
  const avoidTargetLines = dedupeNonEmptyStrings(params.avoidTargets).map((target) => `- ${target}`)
  return loadPromptTemplate({
    sourceId: "ai_error_recovery_user",
    variables: {
      originalRequest: params.originalRequest,
      summary: params.summary,
      reason: params.reason,
      errorDetail: summarizeRawErrorForUser(params.message)
        ? `${recoveryPromptSectionText("error_detail")}\n${summarizeRawErrorForUser(params.message)}`
        : "",
      failedRoute: params.failedRoute?.trim()
        ? `${recoveryPromptSectionText("failed_approach")} ${params.failedRoute.trim()}`
        : "",
      avoidTargets: avoidTargetLines.length > 0
        ? [recoveryPromptSectionText("avoid_targets"), ...avoidTargetLines].join("\n")
        : "",
      nextRouteHint: params.nextRouteHint?.trim()
        ? `${recoveryPromptSectionText("preferred_recovery_route")} ${params.nextRouteHint.trim()}`
        : "",
      previousResult: params.previousResult.trim()
        ? `${recoveryPromptSectionText("previous_result")}\n${params.previousResult.trim()}`
        : "",
    },
  })
}

export function describeWorkerRuntimeErrorReason(message: string): string {
  if (/(exited with code 1|exit code 1|code 1)/i.test(message)) {
    return "작업 세션 프로세스가 오류 종료되어 같은 경로로는 진행할 수 없습니다."
  }
  if (/(not found|enoent|command not found)/i.test(message)) {
    return "작업 세션 실행 명령을 찾지 못했습니다."
  }
  if (/(permission denied|operation not permitted|eacces|권한)/i.test(message)) {
    return "작업 세션 실행 권한 또는 접근 제한 때문에 실패했습니다."
  }
  if (/(timeout|timed out|시간 초과)/i.test(message)) {
    return "작업 세션 응답이 시간 안에 끝나지 않았습니다."
  }
  return "작업 세션 경로에서 오류가 발생해 다른 경로나 다른 대상 전환이 필요합니다."
}

export function buildWorkerRuntimeErrorRecoveryPrompt(params: {
  originalRequest: string
  previousResult: string
  summary: string
  reason: string
  message: string
  failedRoute?: string | undefined
  avoidTargets?: string[] | undefined
  nextRouteHint?: string | undefined
}): string {
  const avoidTargetLines = dedupeNonEmptyStrings(params.avoidTargets).map((target) => `- ${target}`)
  return loadPromptTemplate({
    sourceId: "worker_runtime_error_recovery_user",
    variables: {
      originalRequest: params.originalRequest,
      summary: params.summary,
      reason: params.reason,
      errorDetail: summarizeRawErrorForUser(params.message)
        ? `${recoveryPromptSectionText("error_detail")}\n${summarizeRawErrorForUser(params.message)}`
        : "",
      failedRoute: params.failedRoute?.trim()
        ? `${recoveryPromptSectionText("failed_approach")} ${params.failedRoute.trim()}`
        : "",
      avoidTargets: avoidTargetLines.length > 0
        ? [recoveryPromptSectionText("avoid_targets"), ...avoidTargetLines].join("\n")
        : "",
      nextRouteHint: params.nextRouteHint?.trim()
        ? `${recoveryPromptSectionText("preferred_recovery_route")} ${params.nextRouteHint.trim()}`
        : "",
      previousResult: params.previousResult.trim()
        ? `${recoveryPromptSectionText("previous_result")}\n${params.previousResult.trim()}`
        : "",
    },
  })
}

export function buildAiRecoveryAvoidTargets(
  targetId: string | undefined,
  workerRuntimeKind: string | undefined,
): string[] {
  return [targetId, workerRuntimeKind]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
}

export function buildAiRecoveryKey(params: {
  targetId: string | undefined
  workerRuntimeKind: string | undefined
  providerId: string | undefined
  model: string | undefined
  reason: string
  message: string
}): string {
  const route = params.workerRuntimeKind || params.targetId || params.providerId || params.model || "default"
  const fingerprint = normalizeAiRecoveryFingerprint(params.reason, params.message)
  const credentialPath = normalizeAiRecoveryCredentialPath(params.reason, params.message)
  return credentialPath === "auth=unknown"
    ? `${route}::${fingerprint}`
    : `${route}::${credentialPath}::${fingerprint}`
}

export function buildWorkerRuntimeRecoveryKey(params: {
  targetId: string | undefined
  workerRuntimeKind: string | undefined
  providerId: string | undefined
  model: string | undefined
  reason: string
  message: string
}): string {
  const route = params.workerRuntimeKind || params.targetId || params.providerId || params.model || "default"
  const fingerprint = normalizeAiRecoveryFingerprint(params.reason, params.message)
  return `worker::${route}::${fingerprint}`
}

function normalizeAiRecoveryFingerprint(reason: string, message: string): string {
  const combined = `${reason}\n${message}`
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "<id>")
    .replace(/\b\d{3,}\b/g, "<num>")
    .replace(/\s+/g, " ")
    .trim()

  if (/timeout|timed out|etimedout|deadline/i.test(combined)) return "timeout"
  if (/rate limit|too many requests|429/i.test(combined)) return "rate-limit"
  if (/cloudflare|challenge|auth|unauthorized|forbidden|401|403|api key/i.test(combined)) return "auth"
  if (/context|token|too large|max context|maximum context/i.test(combined)) return "context-limit"
  if (/schema|parameter|unsupported|invalid_request|tool|function/i.test(combined)) return "request-schema"
  if (/network|socket|connect|connection|reset|refused|econn|dns|fetch failed/i.test(combined)) return "network"
  return combined.slice(0, 160)
}

function normalizeAiRecoveryCredentialPath(reason: string, message: string): string {
  const combined = `${reason}\n${message}`.toLowerCase()
  if (/(chatgpt|codex|oauth|auth\.json|refresh token|access token|토큰 갱신)/i.test(combined)) return "auth=chatgpt-oauth"
  if (/(api key|apikey|openai_api_key|x-api-key|bearer|sk-)/i.test(combined)) return "auth=api-key"
  return "auth=unknown"
}

function inferCommandFailureAlternatives(failedTool: FailedCommandTool): RecoveryAlternative[] {
  const alternatives: RecoveryAlternative[] = [{ kind: "other_tool", label: "다른 도구 경로 재시도" }]
  if (failedTool.toolName === "shell_exec" || failedTool.toolName === "app_launch" || failedTool.toolName === "process_kill") {
    alternatives.push({ kind: "other_extension", label: "다른 연장 또는 다른 실행 대상 검토" })
  }
  return alternatives
}

function inferGenericExecutionAlternatives(toolNames: string[]): RecoveryAlternative[] {
  const normalized = [...new Set(toolNames.map((toolName) => toolName.trim()).filter(Boolean))]
  const alternatives: RecoveryAlternative[] = []

  if (normalized.some((toolName) => isScheduleLikeToolName(toolName))) {
    alternatives.push({ kind: "other_schedule", label: "다른 일정 방식 또는 예약 구조 검토" })
  }
  if (normalized.some((toolName) => isExtensionPreferredToolName(toolName))) {
    alternatives.push({ kind: "other_extension", label: "다른 연장 또는 로컬 대체 경로 검토" })
  }
  alternatives.push({ kind: "other_tool", label: "다른 도구 조합 재시도" })

  return dedupeRecoveryAlternatives(alternatives)
}

function inferDirectArtifactDeliveryAlternatives(source: DeliverySource): RecoveryAlternative[] {
  const alternatives: RecoveryAlternative[] = [{ kind: "same_channel_retry", label: "같은 채널 재전송 시도" }]
  alternatives.push({ kind: "other_tool", label: "다른 전달 도구 또는 다른 실행 경로 검토" })
  return alternatives
}

function isExtensionPreferredToolName(toolName: string): boolean {
  return /^(screen_capture|mouse_|keyboard_|shell_exec|app_launch|process_kill|yeonjang_)/.test(toolName)
}

function isScheduleLikeToolName(toolName: string): boolean {
  return /schedule/i.test(toolName)
}

function dedupeRecoveryAlternatives(alternatives: RecoveryAlternative[]): RecoveryAlternative[] {
  const seen = new Set<string>()
  const result: RecoveryAlternative[] = []
  for (const alternative of alternatives) {
    const key = `${alternative.kind}:${alternative.label}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(alternative)
  }
  return result
}

function dedupeNonEmptyStrings(values: string[] | undefined): string[] {
  if (!values) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

export function hasMeaningfulRouteChange(params: {
  currentTargetId: string | undefined
  currentModel: string | undefined
  currentProviderId: string | undefined
  currentWorkerRuntimeKind: string | undefined
  nextTargetId: string | undefined
  nextModel: string | undefined
  nextProviderId: string | undefined
  nextWorkerRuntimeKind: string | undefined
}): boolean {
  return (params.currentWorkerRuntimeKind ?? "") !== (params.nextWorkerRuntimeKind ?? "")
    || (params.currentTargetId ?? "") !== (params.nextTargetId ?? "")
    || (params.currentProviderId ?? "") !== (params.nextProviderId ?? "")
    || (params.currentModel ?? "") !== (params.nextModel ?? "")
}

export function buildFilesystemMutationFollowupPrompt(params: {
  originalRequest: string
  previousResult: string
}): string {
  return loadPromptTemplate({
    sourceId: "filesystem_execution_required_user",
    variables: {
      originalRequest: params.originalRequest,
      previousResult: params.previousResult.trim()
        ? `${recoveryPromptSectionText("previous_incomplete_result")}\n${params.previousResult.trim()}`
        : "",
    },
  })
}

export function buildFilesystemVerificationRecoveryPrompt(params: {
  originalRequest: string
  previousResult: string
  verificationSummary: string
  verificationReason?: string
  missingItems?: string[]
  mutationPaths?: string[]
}): string {
  const missing = params.missingItems?.filter((item) => item.trim()).map((item) => `- ${item}`) ?? []
  const targets = params.mutationPaths?.filter((item) => item.trim()).map((item) => `- ${displayHomePath(item)}`) ?? []

  return loadPromptTemplate({
    sourceId: "filesystem_verification_recovery_user",
    variables: {
      originalRequest: params.originalRequest,
      verificationSummary: params.verificationSummary,
      verificationReason: params.verificationReason?.trim()
        ? `${recoveryPromptSectionText("verification_reason")}\n${params.verificationReason.trim()}`
        : "",
      targetPaths: targets.length > 0
        ? [recoveryPromptSectionText("current_target_paths"), ...targets].join("\n")
        : "",
      missingItems: missing.length > 0
        ? [recoveryPromptSectionText("missing_or_unchecked_items"), ...missing].join("\n")
        : "",
      previousResult: params.previousResult.trim()
        ? `${recoveryPromptSectionText("previous_result")}\n${params.previousResult.trim()}`
        : "",
    },
  })
}

export function buildEmptyResultRecoveryPrompt(params: {
  originalRequest: string
  previousResult: string
  successfulTools: SuccessfulToolEvidence[]
  sawRealFilesystemMutation: boolean
}): string {
  const successfulToolLines = trustEligibleSuccessfulTools(params.successfulTools)
    .slice(-3)
    .map((tool, index) => `${index + 1}. ${tool.toolName}`)

  return loadPromptTemplate({
    sourceId: "empty_result_recovery_user",
    variables: {
      originalRequest: params.originalRequest,
      previousResult: params.previousResult.trim()
        ? `${recoveryPromptSectionText("current_text_result")}\n${params.previousResult.trim()}`
        : "",
      successfulTools: successfulToolLines.length > 0
        ? [recoveryPromptSectionText("successful_tool_executions"), ...successfulToolLines].join("\n")
        : "",
      filesystemMutationNote: params.sawRealFilesystemMutation
        ? recoveryPromptSectionText("filesystem_mutation_note")
        : "",
    },
  })
}

export function shouldRetryTruncatedOutput(params: {
  review: {
    status: string
    summary?: string
    reason?: string
    userMessage?: string
    remainingItems?: string[]
  }
  preview: string
  requiresFilesystemMutation: boolean
}): boolean {
  if (params.review.status !== "ask_user") return false
  if (!params.requiresFilesystemMutation) return false

  const combined = [
    params.review.summary,
    params.review.reason,
    params.review.userMessage,
    ...(params.review.remainingItems ?? []),
    params.preview,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")

  return /(중간[^\n]{0,20}(절단|중단)|절단 오류|코드[^\n]{0,20}(절단|중단)|미완성|incomplete|truncat|cut off|unfinished)/iu.test(combined)
}

export function buildTruncatedOutputRecoveryPrompt(params: {
  originalRequest: string
  previousResult: string
  summary?: string
  reason?: string
  remainingItems?: string[]
}): string {
  const remaining = params.remainingItems?.filter((item) => item.trim()).map((item) => `- ${item}`) ?? []
  return loadPromptTemplate({
    sourceId: "truncated_output_recovery_user",
    variables: {
      originalRequest: params.originalRequest,
      summary: params.summary?.trim()
        ? `${recoveryPromptSectionText("review_summary")}\n${params.summary.trim()}`
        : "",
      reason: params.reason?.trim()
        ? `${recoveryPromptSectionText("review_reason")}\n${params.reason.trim()}`
        : "",
      remainingItems: remaining.length > 0
        ? [recoveryPromptSectionText("remaining_items"), ...remaining].join("\n")
        : "",
      previousResult: params.previousResult.trim()
        ? `${recoveryPromptSectionText("previous_incomplete_result")}\n${params.previousResult.trim()}`
        : "",
    },
  })
}
