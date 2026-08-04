import type { ResponseLanguageMode } from "../agent/intake.js"
import {
  buildMainAgentIdentityPromptContext,
  resolveMainAgentSelfName,
  resolvePromptLocaleForRequest,
} from "../agent/main-agent-identity.js"
import {
  type AIProvider,
  type AIProviderConfigSnapshot,
  type ChatParams,
  getProvider,
} from "../ai/index.js"
import { detectPrimaryMessageLanguage } from "../channels/language.js"
import type { KnowbeeConfig } from "../config/types.js"
import { createLogger } from "../logger/index.js"
import { loadPromptTemplate } from "../memory/knowbee-md.js"
import type { UserFacingTextSource } from "./loop-directive.js"
import type { CanonicalExecutionFailurePhase } from "./canonical-execution-failure.js"
import {
  authorizeUserFacingResponse,
  buildLlmResponseReviewReceipt,
  type LlmResponseReviewReceipt,
  type UserFacingResponseContentKind,
} from "./user-facing-response-gate.js"

const log = createLogger("runs:final-response")

export interface FinalResponseIdentityContext {
  promptLocale: "ko" | "en"
  mainAgentSelfName: string
  promptContext: string
}

/** Exact, allowlisted failure facts that a final-response model must acknowledge unchanged. */
export interface FinalResponseFailureEvidence {
  schemaVersion: 1
  phase: CanonicalExecutionFailurePhase
  reasonCode: string
  retryable: boolean
  executionObserved: boolean
  deliveryObserved: boolean
  evidenceRefs: readonly string[]
}

export interface FinalResponseRenderInput {
  runId?: string | undefined
  requestGroupId?: string | undefined
  sessionId?: string | undefined
  originalRequest: string
  rawText: string
  textSource: UserFacingTextSource
  responseLanguageMode?: ResponseLanguageMode | undefined
  model: string | undefined
  providerId?: string | undefined
  provider?: AIProvider | undefined
  config: AIProviderConfigSnapshot
  workDir: string
  identityContext?: FinalResponseIdentityContext | undefined
  contentKind?: UserFacingResponseContentKind | undefined
  failureEvidence?: FinalResponseFailureEvidence | undefined
}

function responseLanguageMatches(text: string, expected: "ko" | "en"): boolean {
  const detected = detectPrimaryMessageLanguage(text)
  return detected === "unknown" || detected === expected
}

function preserveConfiguredMainAgentIdentityFact(input: {
  rawText: string
  renderedText: string
  mainAgentSelfName: string
}): string {
  const configuredName = input.mainAgentSelfName.normalize("NFC").trim()
  if (!configuredName) return input.renderedText
  const rawText = input.rawText.normalize("NFC")
  const renderedText = input.renderedText.normalize("NFC")
  return rawText.includes(configuredName) && !renderedText.includes(configuredName)
    ? input.rawText
    : input.renderedText
}

function allowsAdditionalResponseLanguages(mode: ResponseLanguageMode | undefined): boolean {
  return mode === "translation" || mode === "language_comparison" || mode === "multilingual"
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  return start >= 0 && end > start ? text.slice(start, end + 1) : null
}

function parseFailureResponseEnvelope(
  text: string,
  evidence: FinalResponseFailureEvidence,
): string | null {
  const json = extractJsonObject(text)
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as Partial<Record<string, unknown>>
    if (Object.keys(parsed).some((key) => key !== "text" && key !== "accepted_failure")) {
      return null
    }
    if (typeof parsed.text !== "string" || !parsed.text.trim()) return null
    const accepted = parsed.accepted_failure
    if (!accepted || typeof accepted !== "object" || Array.isArray(accepted)) return null
    const fields = accepted as Partial<Record<string, unknown>>
    const allowedKeys = new Set([
      "phase",
      "reason_code",
      "retryable",
      "execution_observed",
      "delivery_observed",
      "evidence_refs",
    ])
    if (Object.keys(fields).some((key) => !allowedKeys.has(key))) return null
    if (
      fields.phase !== evidence.phase ||
      fields.reason_code !== evidence.reasonCode ||
      fields.retryable !== evidence.retryable ||
      fields.execution_observed !== evidence.executionObserved ||
      fields.delivery_observed !== evidence.deliveryObserved ||
      !Array.isArray(fields.evidence_refs) ||
      fields.evidence_refs.length !== evidence.evidenceRefs.length ||
      fields.evidence_refs.some((reference, index) => reference !== evidence.evidenceRefs[index])
    ) {
      return null
    }
    return parsed.text.trim()
  } catch {
    return null
  }
}

function parseLanguageExceptionReview(text: string, requestedMode: ResponseLanguageMode): boolean {
  const json = extractJsonObject(text)
  if (!json) return false
  try {
    const parsed = JSON.parse(json) as Partial<Record<string, unknown>>
    return (
      parsed.allowed === true &&
      parsed.mode === requestedMode &&
      typeof parsed.reason === "string" &&
      parsed.reason.trim().length > 0
    )
  } catch {
    return false
  }
}

type EvidenceConsistencyReview =
  | { supported: true }
  | { supported: false; reasonCode: string; correctedText: string }

function parseEvidenceConsistencyReview(text: string): EvidenceConsistencyReview | null {
  const json = extractJsonObject(text)
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as Partial<Record<string, unknown>>
    const allowedKeys = new Set(["supported", "reason_code", "corrected_text"])
    if (Object.keys(parsed).some((key) => !allowedKeys.has(key))) return null
    if (parsed.supported === true && parsed.reason_code === "evidence_consistent") {
      return { supported: true }
    }
    if (
      parsed.supported === false &&
      typeof parsed.reason_code === "string" &&
      parsed.reason_code.trim() &&
      typeof parsed.corrected_text === "string"
    ) {
      return {
        supported: false,
        reasonCode: parsed.reason_code.trim().slice(0, 120),
        correctedText: parsed.corrected_text.trim(),
      }
    }
  } catch {
    return null
  }
  return null
}

async function reviewEvidenceConsistency(input: {
  provider: AIProvider
  model: string
  originalRequest: string
  responseText: string
  failureEvidence: FinalResponseFailureEvidence
  workDir: string
  observability?: ChatParams["observability"]
}): Promise<EvidenceConsistencyReview | null> {
  try {
    const system = loadPromptTemplate({
      sourceId: "final_response_evidence_review",
      workDir: input.workDir,
    })
    const user = loadPromptTemplate({
      sourceId: "final_response_evidence_review_user",
      workDir: input.workDir,
      variables: {
        originalRequestJson: JSON.stringify(input.originalRequest),
        responseTextJson: JSON.stringify(input.responseText),
        failureEvidenceJson: JSON.stringify(input.failureEvidence),
      },
    })
    let output = ""
    for await (const chunk of input.provider.chat({
      model: input.model,
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 600,
      ...(input.observability ? { observability: input.observability } : {}),
    })) {
      if (chunk.type === "text_delta") output += chunk.delta
    }
    return parseEvidenceConsistencyReview(output.trim())
  } catch {
    return null
  }
}

async function reviewResponseLanguageMode(input: {
  provider: AIProvider
  model: string
  requestedMode: ResponseLanguageMode | undefined
  originalRequest: string
  workDir: string
  observability?: ChatParams["observability"]
}): Promise<ResponseLanguageMode> {
  const requestedMode = input.requestedMode ?? "same_as_request"
  if (!allowsAdditionalResponseLanguages(requestedMode)) return "same_as_request"

  try {
    const system = loadPromptTemplate({
      sourceId: "response_language_exception_review",
      workDir: input.workDir,
    })
    const user = loadPromptTemplate({
      sourceId: "response_language_exception_review_user",
      workDir: input.workDir,
      variables: {
        originalRequestJson: JSON.stringify(input.originalRequest),
        requestedMode,
      },
    })
    let output = ""
    for await (const chunk of input.provider.chat({
      model: input.model,
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 300,
      ...(input.observability ? { observability: input.observability } : {}),
    })) {
      if (chunk.type === "text_delta") output += chunk.delta
    }
    if (parseLanguageExceptionReview(output.trim(), requestedMode)) return requestedMode
  } catch {
    // Review failure narrows permission to the default single-language policy.
  }
  log.fieldDebug("response language exception rejected", {
    requestedMode,
    reasonCode: "explicit_request_unconfirmed",
  })
  return "same_as_request"
}

async function renderResponseAttempt(input: {
  provider: AIProvider
  model: string
  system: string
  originalRequest: string
  rawText: string
  textSource: UserFacingTextSource
  failureEvidence?: FinalResponseFailureEvidence | undefined
  workDir: string
  observability?: ChatParams["observability"]
}): Promise<string> {
  const user = loadPromptTemplate({
    sourceId: "final_response_user",
    workDir: input.workDir,
    variables: {
      originalRequest: input.originalRequest,
      rawText: input.rawText,
      textSource: input.textSource,
      failureEvidenceJson: input.failureEvidence
        ? JSON.stringify(input.failureEvidence)
        : "not_applicable",
    },
  })
  let output = ""
  for await (const chunk of input.provider.chat({
    model: input.model,
    system: input.system,
    messages: [{ role: "user", content: user }],
    maxTokens: 1200,
    ...(input.observability ? { observability: input.observability } : {}),
  })) {
    if (chunk.type === "text_delta") output += chunk.delta
  }
  return output.trim()
}

export interface FinalResponseRenderResult {
  text: string
  textSource: "llm_reviewed"
  promptSourceId: "final_response"
  rawTextSource: UserFacingTextSource
  reviewReceipt?: LlmResponseReviewReceipt | undefined
}

export function finalResponseRenderProvenanceEvent(input: {
  eventPrefix: string
  rendered: Partial<FinalResponseRenderResult>
  fallbackRawTextSource: UserFacingTextSource
}): string {
  return [
    `${input.eventPrefix}_provenance`,
    input.rendered.textSource ?? "llm_reviewed",
    input.rendered.promptSourceId ?? "final_response",
    input.rendered.rawTextSource ?? input.fallbackRawTextSource,
  ].join(":")
}

function resolveRenderProvider(input: FinalResponseRenderInput): AIProvider | null {
  if (input.provider) return input.provider
  const providerId = input.providerId?.trim()
  if (!providerId) return null
  try {
    return getProvider(providerId, input.config)
  } catch {
    return null
  }
}

export function buildFinalResponseIdentityContext(input: {
  config: KnowbeeConfig
  originalRequest: string
  workDir: string
}): FinalResponseIdentityContext {
  const promptLocale = resolvePromptLocaleForRequest(
    input.config.profile.language,
    input.originalRequest,
  )
  const mainAgentSelfName = resolveMainAgentSelfName(input.config, promptLocale)
  return {
    promptLocale,
    mainAgentSelfName,
    promptContext: buildMainAgentIdentityPromptContext(input.config, promptLocale, input.workDir),
  }
}

export async function renderFinalResponseText(
  input: FinalResponseRenderInput,
): Promise<FinalResponseRenderResult | null> {
  const model = input.model?.trim()
  const rawText = input.rawText.trim()
  const originalRequest = input.originalRequest.trim()
  if (!model || !rawText || !originalRequest) return null

  const provider = resolveRenderProvider(input)
  if (!provider) return null

  const identityContext = input.identityContext
  if (!identityContext) return null

  const responseLanguageMode = await reviewResponseLanguageMode({
    provider,
    model,
    requestedMode: input.responseLanguageMode,
    originalRequest,
    workDir: input.workDir,
    ...(input.runId || input.requestGroupId
      ? {
          observability: {
            ...(input.runId ? { runId: input.runId } : {}),
            ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
            ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            stage: "final_response",
            operationCode: "response_language_review",
          },
        }
      : {}),
  })

  const system = loadPromptTemplate({
    sourceId: "final_response",
    workDir: input.workDir,
  })
  const systemWithIdentity = [identityContext.promptContext, "\n", system].join("")
  let attemptRawText = rawText
  let attemptTextSource = input.textSource
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await renderResponseAttempt({
      provider,
      model,
      system: systemWithIdentity,
      originalRequest,
      rawText: attemptRawText,
      textSource: attemptTextSource,
      ...(input.failureEvidence ? { failureEvidence: input.failureEvidence } : {}),
      workDir: input.workDir,
      ...(input.runId || input.requestGroupId
        ? {
            observability: {
              ...(input.runId ? { runId: input.runId } : {}),
              ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
              ...(input.sessionId ? { sessionId: input.sessionId } : {}),
              stage: "final_response",
              operationCode: attempt === 0 ? "final_response" : "final_response_repair",
            },
          }
        : {}),
    })
    if (!text) return null
    const acceptedFailureText = input.failureEvidence
      ? parseFailureResponseEnvelope(text, input.failureEvidence)
      : text
    if (!acceptedFailureText) {
      log.fieldDebug("final response failure evidence rejected", {
        phase: input.failureEvidence?.phase,
        reasonCode: input.failureEvidence?.reasonCode,
        attempt: attempt + 1,
      })
      attemptRawText = JSON.stringify({
        failureEvidence: input.failureEvidence,
        validationIssue: "accepted_failure_must_match_exactly",
      })
      attemptTextSource = "runtime_deterministic"
      continue
    }
    const identitySafeText = preserveConfiguredMainAgentIdentityFact({
      rawText: attemptRawText,
      renderedText: acceptedFailureText,
      mainAgentSelfName: identityContext.mainAgentSelfName,
    })

    if (
      allowsAdditionalResponseLanguages(responseLanguageMode) ||
      responseLanguageMatches(identitySafeText, identityContext.promptLocale)
    ) {
      let evidenceReviewedText = identitySafeText
      if (input.failureEvidence) {
        const observabilityBase = input.runId || input.requestGroupId
          ? {
              ...(input.runId ? { runId: input.runId } : {}),
              ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
              ...(input.sessionId ? { sessionId: input.sessionId } : {}),
              stage: "final_response" as const,
            }
          : undefined
        const review = await reviewEvidenceConsistency({
          provider,
          model,
          originalRequest,
          responseText: evidenceReviewedText,
          failureEvidence: input.failureEvidence,
          workDir: input.workDir,
          ...(observabilityBase
            ? { observability: { ...observabilityBase, operationCode: "final_response_evidence_review" } }
            : {}),
        })
        if (!review) return null
        if (!review.supported) {
          if (!review.correctedText) return null
          if (
            !allowsAdditionalResponseLanguages(responseLanguageMode) &&
            !responseLanguageMatches(review.correctedText, identityContext.promptLocale)
          ) return null
          const repairedReview = await reviewEvidenceConsistency({
            provider,
            model,
            originalRequest,
            responseText: review.correctedText,
            failureEvidence: input.failureEvidence,
            workDir: input.workDir,
            ...(observabilityBase
              ? { observability: { ...observabilityBase, operationCode: "final_response_evidence_repair_review" } }
              : {}),
          })
          if (!repairedReview?.supported) return null
          evidenceReviewedText = review.correctedText
        }
      }
      const contentKind = input.contentKind ?? "fixed_notice"
      const reviewReceipt = buildLlmResponseReviewReceipt({
        rawText,
        responseText: evidenceReviewedText,
        rawTextSource: input.textSource,
        contentKind,
      })
      const authorization = authorizeUserFacingResponse({
        rawText,
        responseText: evidenceReviewedText,
        rawTextSource: input.textSource,
        contentKind,
        expectedLanguage: allowsAdditionalResponseLanguages(responseLanguageMode)
          ? "unknown"
          : identityContext.promptLocale,
        receipt: reviewReceipt,
      })
      if (!authorization.ok) return null
      return {
        text: evidenceReviewedText,
        textSource: "llm_reviewed",
        promptSourceId: "final_response",
        rawTextSource: input.textSource,
        reviewReceipt,
      }
    }
    log.fieldDebug("final response language mismatch", {
      expectedLanguage: identityContext.promptLocale,
      responseLanguageMode,
      attempt: attempt + 1,
    })
    attemptRawText = text
    attemptTextSource = "llm_generated"
  }
  log.warn("Blocked final response after language validation failed", {
    expectedLanguage: identityContext.promptLocale,
    responseLanguageMode,
  })
  return null
}
