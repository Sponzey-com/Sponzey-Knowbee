import { createHash } from "node:crypto"

import type { AIProvider } from "../ai/types.js"
import { createDeterministicTokenEstimator } from "../ai/web-token-estimator.js"
import {
  createFileBackedWebEvidencePipelineAdapter,
} from "../ai/web-evidence-pipeline-factory.js"
import {
  createFileBackedWebResearchMethodProvider,
} from "../ai/web-research-method-factory.js"
import type { ToolDispatcher } from "../tools/dispatcher.js"
import type { ToolContext } from "../tools/types.js"
import {
  projectWebResearchLinkCandidates,
  type WebResearchLinkCandidate,
} from "../contracts/web-research-link-candidate.js"
import type { WebResearchFingerprintPort } from "../contracts/web-research-method.js"
import type { ToolResult } from "../tools/types.js"
import {
  projectWebFetchResultForAgent,
  projectWebSearchResultForAgent,
} from "./web-evidence-agent-bridge.js"
import {
  runDirectWebEvidencePipeline,
  runWebEvidencePipeline,
} from "./web-evidence-pipeline.js"
import { createWebEvidenceSourceFetchPort } from "./web-evidence-tool-dispatch-adapter.js"
import {
  dispatchRunScopedTool,
  type AdmittedCapabilityExecutionScope,
} from "./run-scoped-tool-admission.js"
import { executeWebResearchTerminalProposal } from "./web-research-terminal-use-case.js"

export interface CanonicalWebEvidenceSearchInput {
  readonly requestGoal: string
  readonly requiredFactKeys: readonly string[]
  readonly modelContextTokens: number
  readonly systemToolText: string
  readonly conversationText: string
  readonly searchResult: Parameters<typeof projectWebSearchResultForAgent>[0]["searchResult"]
  readonly freshnessPolicy: "normal" | "latest_approximate" | "strict_timestamp"
  readonly signal: AbortSignal
}

export interface CanonicalWebEvidenceFetchInput {
  readonly requestGoal: string
  readonly requiredFactKeys: readonly string[]
  readonly modelContextTokens: number
  readonly systemToolText: string
  readonly conversationText: string
  readonly documentResult: Parameters<typeof projectWebFetchResultForAgent>[0]["documentResult"]
  readonly signal: AbortSignal
}

export interface CanonicalWebEvidenceRuntime {
  projectSearchResult(
    input: CanonicalWebEvidenceSearchInput,
  ): ReturnType<typeof projectWebSearchResultForAgent>
  projectFetchResult(
    input: CanonicalWebEvidenceFetchInput,
  ): ReturnType<typeof projectWebFetchResultForAgent>
}

export interface CanonicalWebEvidenceTraceObserver {
  onInternalFetchStarted(input: Readonly<{
    actionReceiptId: string
    candidateRef: string
    strategyFingerprint: `sha256:${string}`
  }>): void
  onInternalFetchFinished(input: Readonly<{
    actionReceiptId: string
    candidateRef: string
    strategyFingerprint: `sha256:${string}`
    result: ToolResult
  }>): void
  onVerificationFinished(input: Readonly<{
    success: boolean
    reasonCode: string | null
  }>): void
}

const MAX_RUNTIME_LINK_CANDIDATES = 16

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
    .join(",")}}`
}

const createFingerprint: WebResearchFingerprintPort = (namespace, value) =>
  `sha256:${createHash("sha256")
    .update(`knowbee:${namespace}:${canonicalize(value)}`)
    .digest("hex")}`

function detailsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function createCanonicalWebEvidenceRuntime(input: Readonly<{
  provider: AIProvider
  model: string
  workDir: string
  context: ToolContext & { allowWebAccess: true }
  scope: AdmittedCapabilityExecutionScope
  ownerAgentId: string
  dispatcher: Pick<ToolDispatcher, "dispatch" | "get">
  traceObserver?: CanonicalWebEvidenceTraceObserver
  observabilityContext?: Readonly<{
    runId: string
    requestGroupId?: string
    sessionId?: string
  }>
}>): CanonicalWebEvidenceRuntime {
  const estimator = createDeterministicTokenEstimator()
  const ai = createFileBackedWebEvidencePipelineAdapter({
    provider: input.provider,
    model: input.model,
    workDir: input.workDir,
    ...(input.observabilityContext
      ? { observabilityContext: input.observabilityContext }
      : {}),
  })
  const methodProvider = createFileBackedWebResearchMethodProvider({
    provider: input.provider,
    model: input.model,
    workDir: input.workDir,
    ...(input.observabilityContext
      ? { observabilityContext: input.observabilityContext }
      : {}),
  })
  const observedCandidates = new Map<string, WebResearchLinkCandidate>()
  const evidenceRefs = new Set<string>()
  const collectEvidenceRefs = (toolName: "web_search" | "web_fetch", result: ToolResult): void => {
    if (!result.success) return
    const details = detailsRecord(result.details)
    if (toolName === "web_search" && Array.isArray(details.results)) {
      for (const item of details.results) {
        const resultRecord = detailsRecord(item)
        if (typeof resultRecord.evidenceRef === "string" && resultRecord.evidenceRef.trim()) {
          evidenceRefs.add(resultRecord.evidenceRef.trim())
        }
      }
      return
    }
    const document = detailsRecord(details.document)
    if (typeof document.evidenceRef === "string" && document.evidenceRef.trim()) {
      evidenceRefs.add(document.evidenceRef.trim())
    }
  }
  const collectLinkCandidates = (
    result: CanonicalWebEvidenceFetchInput["documentResult"],
  ): void => {
    collectEvidenceRefs("web_fetch", result)
    if (!result.success || observedCandidates.size >= MAX_RUNTIME_LINK_CANDIDATES) return
    const details = detailsRecord(result.details)
    const document = detailsRecord(details.document)
    const evidenceRef =
      typeof document.evidenceRef === "string" ? document.evidenceRef.trim() : ""
    const finalUrl = typeof document.url === "string" ? document.url.trim() : ""
    const observations = Array.isArray(details.linkObservations)
      ? details.linkObservations.filter((item): item is { ordinal: number; url: string } =>
          Boolean(
            item &&
            typeof item === "object" &&
            Number.isSafeInteger((item as { ordinal?: unknown }).ordinal) &&
            typeof (item as { url?: unknown }).url === "string",
          ))
      : []
    if (!evidenceRef || !finalUrl || observations.length === 0) return
    const projection = projectWebResearchLinkCandidates({
      runId: input.context.runId,
      parentEvidenceRef: evidenceRef,
      parentProvenanceRef: `provenance:${createFingerprint("web-parent", {
        evidenceRef,
        finalUrl,
      }).slice("sha256:".length)}`,
      documentFinalUrl: finalUrl,
      observations,
      targetAdmissions: observations.map((observation) => ({
        observedUrl: observation.url,
        status: "allowed" as const,
        canonicalUrl: observation.url,
      })),
      maxCandidates: Math.max(
        1,
        MAX_RUNTIME_LINK_CANDIDATES - observedCandidates.size,
      ),
    }, createFingerprint)
    for (const candidate of projection.candidates) {
      if (observedCandidates.size >= MAX_RUNTIME_LINK_CANDIDATES) break
      observedCandidates.set(candidate.sourceUrl, candidate)
    }
  }
  const attachLinkCandidates = (
    result: Awaited<ReturnType<typeof projectWebFetchResultForAgent>>,
  ): Awaited<ReturnType<typeof projectWebFetchResultForAgent>> => {
    if (observedCandidates.size === 0) return result
    return {
      ...result,
      details: {
        ...detailsRecord(result.details),
        internalObservedFetchCandidates: [...observedCandidates.values()],
      },
    }
  }
  const admitTerminalProjection = async (result: ToolResult): Promise<ToolResult> => {
    if (!result.success) return result
    const terminal = await executeWebResearchTerminalProposal({
      runId: input.context.runId,
      evidenceRefs: [...evidenceRefs],
      attemptedStrategyFingerprints: [],
      completionAllowed: true,
      blockedAllowed: false,
      provider: methodProvider,
      createFingerprint,
    })
    if (terminal.ok && terminal.action.kind === "propose_complete") return result
    const reasonCode = terminal.ok
      ? "web_research_terminal_action_invalid"
      : terminal.reasonCode
    return {
      success: false,
      output: "",
      error: reasonCode,
      details: {
        kind: "web_research_terminal_admission_failure",
        reasonCode,
      },
    }
  }

  return Object.freeze({
    projectSearchResult: async (request: CanonicalWebEvidenceSearchInput) => {
      collectEvidenceRefs("web_search", request.searchResult)
      const internalActions = new Map<string, {
        actionReceiptId: string
        strategyFingerprint: `sha256:${string}`
      }>()
      const fetchSource = createWebEvidenceSourceFetchPort({
        dispatcher: {
          dispatch: (toolName, params, context) =>
            dispatchRunScopedTool({
              scope: input.scope,
              runId: context.runId,
              ownerAgentId: input.ownerAgentId,
              toolName,
              params,
              context,
              dispatcher: input.dispatcher,
            }).then((result) => {
              collectLinkCandidates(result)
              return result
            }),
        },
        context: input.context,
        freshnessPolicy: request.freshnessPolicy,
        onDispatchStarted: ({ candidateRef, url }) => {
          const strategyFingerprint = createFingerprint("web-internal-fetch:v1", {
            candidateRef,
            url,
          })
          const actionReceiptId =
            `receipt:web-internal:${strategyFingerprint.slice("sha256:".length, 39)}`
          internalActions.set(candidateRef, { actionReceiptId, strategyFingerprint })
          input.traceObserver?.onInternalFetchStarted({
            actionReceiptId,
            candidateRef,
            strategyFingerprint,
          })
        },
        onDispatchFinished: ({ candidateRef, result }) => {
          const action = internalActions.get(candidateRef)
          if (!action) return
          input.traceObserver?.onInternalFetchFinished({
            ...action,
            candidateRef,
            result,
          })
        },
      })
      const projected = await projectWebSearchResultForAgent({
        requestGoal: request.requestGoal,
        requiredFactKeys: request.requiredFactKeys,
        modelContextTokens: request.modelContextTokens,
        systemToolText: request.systemToolText,
        conversationText: request.conversationText,
        searchResult: request.searchResult,
        signal: request.signal,
      }, {
        runPipeline: (pipelineInput) =>
          runWebEvidencePipeline(pipelineInput, {
            estimator,
            sourceSelectionPort: ai,
            fetchSource,
            chunkSelectionPort: ai,
            compressionPort: ai,
            evidenceReviewPort: ai,
            verifierPort: ai,
          }),
      })
      const terminalProjection = await admitTerminalProjection(projected)
      input.traceObserver?.onVerificationFinished({
        success: terminalProjection.success,
        reasonCode: terminalProjection.success
          ? null
          : terminalProjection.error?.trim() || "web_evidence_failed",
      })
      return attachLinkCandidates(terminalProjection)
    },
    projectFetchResult: async (request: CanonicalWebEvidenceFetchInput) => {
      collectLinkCandidates(request.documentResult)
      const projected = await projectWebFetchResultForAgent(request, {
        runPipeline: (pipelineInput) =>
          runDirectWebEvidencePipeline(pipelineInput, {
            estimator,
            chunkSelectionPort: ai,
            compressionPort: ai,
            evidenceReviewPort: ai,
            verifierPort: ai,
          }),
      })
      const terminalProjection = await admitTerminalProjection(projected)
      input.traceObserver?.onVerificationFinished({
        success: terminalProjection.success,
        reasonCode: terminalProjection.success
          ? null
          : terminalProjection.error?.trim() || "web_evidence_failed",
      })
      return attachLinkCandidates(terminalProjection)
    },
  })
}
