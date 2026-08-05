import type { AIProvider, ChatParams } from "../ai/types.js"
import type { LoadedPromptSource } from "../memory/knowbee-md.js"
import { loadPromptSourceRegistry } from "../memory/knowbee-md.js"
import type { ExtensionLiveSmokeDiagnosisPort } from "../runs/extension-live-smoke-runner.js"
import type {
  WebRetrievalLiveDiagnosisPort,
  WebRetrievalLivePlanPort,
  WebRetrievalLiveRediagnosisPort,
} from "../runs/web-retrieval-live-runner.js"
import type { YeonjangLiveSmokeDiagnosisPort } from "../runs/yeonjang-live-smoke-runner.js"
import {
  type UntrustedEvidenceSourceKind,
  createUntrustedEvidenceEnvelope,
  projectUntrustedEvidenceForPrompt,
  redactUntrustedEvidenceContent,
} from "../security/trust-boundary.js"

export type LiveAcceptanceLlmAdapterErrorCode =
  | "live_acceptance_prompt_missing"
  | "live_acceptance_prompt_ambiguous"
  | "live_acceptance_llm_config_invalid"
  | "live_acceptance_llm_cancelled"
  | "live_acceptance_llm_provider_failed"

export class LiveAcceptanceLlmAdapterError extends Error {
  readonly code: LiveAcceptanceLlmAdapterErrorCode

  constructor(code: LiveAcceptanceLlmAdapterErrorCode) {
    super(code)
    this.name = "LiveAcceptanceLlmAdapterError"
    this.code = code
  }
}

export interface LiveAcceptanceLlmPorts {
  readonly webPlan: WebRetrievalLivePlanPort
  readonly webDiagnosis: WebRetrievalLiveDiagnosisPort
  readonly webRediagnosis?: WebRetrievalLiveRediagnosisPort
  readonly extensionDiagnosis: ExtensionLiveSmokeDiagnosisPort
  readonly yeonjangDiagnosis: YeonjangLiveSmokeDiagnosisPort
}

export interface FileBackedLiveAcceptanceLlmPortsInput {
  readonly provider: AIProvider
  readonly model: string
  readonly workDir: string
  readonly maxTokens?: number
  readonly observabilityContext?: Pick<
    NonNullable<ChatParams["observability"]>,
    "runId" | "requestGroupId" | "sessionId"
  >
}

type LiveAcceptanceLlmOperation =
  | "web_source_selection"
  | "web_result_diagnosis"
  | "web_rediagnosis"
  | "extension_result_diagnosis"
  | "yeonjang_result_diagnosis"

type LiveAcceptanceLlmAdapterResultError = {
  readonly liveAcceptanceLlmAdapterError:
    | "invalid_json"
    | "json_object_required"
    | "output_too_large"
}

const PROMPT_SOURCE_ID = "live_acceptance_evidence"
const DEFAULT_MAX_TOKENS = 1_200
const MAX_OUTPUT_CHARS = 64_000
const MAX_EVIDENCE_CHARS = 32_000

export function selectLiveAcceptancePromptSource(
  sources: readonly LoadedPromptSource[],
): LoadedPromptSource {
  const matches = sources.filter(
    (source) =>
      source.sourceId === PROMPT_SOURCE_ID &&
      source.locale === "en" &&
      source.usageScope === "internal" &&
      source.enabled &&
      source.content.trim().length > 0,
  )
  if (matches.length === 0) {
    throw new LiveAcceptanceLlmAdapterError("live_acceptance_prompt_missing")
  }
  if (matches.length !== 1) {
    throw new LiveAcceptanceLlmAdapterError("live_acceptance_prompt_ambiguous")
  }
  const selected = matches[0]
  if (!selected) throw new LiveAcceptanceLlmAdapterError("live_acceptance_prompt_missing")
  return selected
}

function boundedEvidenceContent(value: unknown): string {
  let serialized = "[unserializable-evidence]"
  try {
    serialized = JSON.stringify(value)
  } catch {
    // The bounded placeholder keeps malformed external objects outside the provider payload.
  }
  return serialized.slice(0, MAX_EVIDENCE_CHARS)
}

function projectEvidence(input: {
  operation: LiveAcceptanceLlmOperation
  sourceKind: UntrustedEvidenceSourceKind
  sourceRef: string
  value: unknown
}) {
  const redaction = redactUntrustedEvidenceContent(boundedEvidenceContent(input.value))
  return projectUntrustedEvidenceForPrompt(
    createUntrustedEvidenceEnvelope({
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      contentLabel: input.operation,
      ownerScope: { ownerType: "system", ownerId: "live-acceptance" },
      content: redaction.content,
      redactionState: "redacted",
    }),
  )
}

function parseOutput(rawOutput: string): unknown | LiveAcceptanceLlmAdapterResultError {
  if (rawOutput.length > MAX_OUTPUT_CHARS) {
    return Object.freeze({ liveAcceptanceLlmAdapterError: "output_too_large" })
  }
  try {
    const parsed: unknown = JSON.parse(rawOutput)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : Object.freeze({ liveAcceptanceLlmAdapterError: "json_object_required" })
  } catch {
    return Object.freeze({ liveAcceptanceLlmAdapterError: "invalid_json" })
  }
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new LiveAcceptanceLlmAdapterError("live_acceptance_llm_cancelled")
  }
}

export function createFileBackedLiveAcceptanceLlmPorts(
  input: FileBackedLiveAcceptanceLlmPortsInput,
): LiveAcceptanceLlmPorts {
  const model = input.model.trim()
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS
  if (
    !model ||
    !input.workDir.trim() ||
    !Number.isSafeInteger(maxTokens) ||
    maxTokens <= 0 ||
    maxTokens > 8_192
  ) {
    throw new LiveAcceptanceLlmAdapterError("live_acceptance_llm_config_invalid")
  }
  const prompt = selectLiveAcceptancePromptSource(loadPromptSourceRegistry(input.workDir))
  const system = prompt.content.trim()

  const invoke = async (invokeInput: {
    operation: LiveAcceptanceLlmOperation
    operationCode:
      | "live_web_source_plan"
      | "live_web_result_diagnosis"
      | "live_web_rediagnosis"
      | "live_extension_result_diagnosis"
      | "live_yeonjang_result_diagnosis"
    stage: "planning" | "review"
    runId: string
    signal: AbortSignal
    sourceKind: UntrustedEvidenceSourceKind
    sourceRef: string
    evidence: unknown
  }): Promise<unknown> => {
    checkCancelled(invokeInput.signal)
    let rawOutput = ""
    const evidence = projectEvidence({
      operation: invokeInput.operation,
      sourceKind: invokeInput.sourceKind,
      sourceRef: invokeInput.sourceRef,
      value: invokeInput.evidence,
    })
    try {
      for await (const chunk of input.provider.chat({
        model,
        system,
        messages: [
          {
            role: "user",
            content: JSON.stringify({ kind: invokeInput.operation, evidence }),
          },
        ],
        maxTokens,
        signal: invokeInput.signal,
        observability: {
          runId: input.observabilityContext?.runId ?? invokeInput.runId,
          requestGroupId: input.observabilityContext?.requestGroupId ?? invokeInput.runId,
          ...(input.observabilityContext?.sessionId
            ? { sessionId: input.observabilityContext.sessionId }
            : {}),
          stage: invokeInput.stage,
          operationCode: invokeInput.operationCode,
        },
      })) {
        checkCancelled(invokeInput.signal)
        if (chunk.type !== "text_delta") continue
        rawOutput += chunk.delta
        if (rawOutput.length > MAX_OUTPUT_CHARS) {
          return Object.freeze({ liveAcceptanceLlmAdapterError: "output_too_large" })
        }
      }
    } catch {
      checkCancelled(invokeInput.signal)
      throw new LiveAcceptanceLlmAdapterError("live_acceptance_llm_provider_failed")
    }
    checkCancelled(invokeInput.signal)
    return parseOutput(rawOutput)
  }

  const ports: LiveAcceptanceLlmPorts = {
    webPlan: (value) =>
      invoke({
        operation: "web_source_selection",
        operationCode: "live_web_source_plan",
        stage: "planning",
        runId: value.runId,
        signal: value.signal,
        sourceKind: "web",
        sourceRef: `live-web-source-plan:${value.runId}`,
        evidence: {
          runId: value.runId,
          scenario: value.scenario,
          candidates: value.candidates,
          diagnosisPayload: value.diagnosisPayload,
        },
      }),
    webDiagnosis: (value) =>
      invoke({
        operation: "web_result_diagnosis",
        operationCode: "live_web_result_diagnosis",
        stage: "review",
        runId: value.runId,
        signal: value.signal,
        sourceKind: "web",
        sourceRef: value.evidenceRef,
        evidence: {
          runId: value.runId,
          scenario: value.scenario,
          evidenceRef: value.evidenceRef,
          requestedTargetFingerprint: value.requestedTargetFingerprint,
          diagnosisPayload: value.diagnosisPayload,
        },
      }),
    webRediagnosis: (value) =>
      invoke({
        operation: "web_rediagnosis",
        operationCode: "live_web_rediagnosis",
        stage: "planning",
        runId: value.runId,
        signal: value.signal,
        sourceKind: "web",
        sourceRef: `live-web-rediagnosis:${value.runId}`,
        evidence: {
          runId: value.runId,
          scenario: value.scenario,
          searchRequest: value.searchRequest,
          failure: value.failure,
          attemptFingerprints: value.attemptFingerprints,
          diagnosisPayload: value.diagnosisPayload,
        },
      }),
    extensionDiagnosis: (value) =>
      invoke({
        operation: "extension_result_diagnosis",
        operationCode: "live_extension_result_diagnosis",
        stage: "review",
        runId: value.runId,
        signal: value.signal,
        sourceKind: value.scenario.capability,
        sourceRef: value.evidenceRef,
        evidence: {
          runId: value.runId,
          scenario: value.scenario,
          evidenceRef: value.evidenceRef,
          diagnosisPayload: value.diagnosisPayload,
        },
      }),
    yeonjangDiagnosis: (value) =>
      invoke({
        operation: "yeonjang_result_diagnosis",
        operationCode: "live_yeonjang_result_diagnosis",
        stage: "review",
        runId: value.runId,
        signal: value.signal,
        sourceKind: "yeonjang",
        sourceRef: value.evidenceRef,
        evidence: {
          runId: value.runId,
          scenario: value.scenario,
          evidenceRef: value.evidenceRef,
          diagnosisPayload: value.diagnosisPayload,
        },
      }),
  }
  return Object.freeze(ports)
}
