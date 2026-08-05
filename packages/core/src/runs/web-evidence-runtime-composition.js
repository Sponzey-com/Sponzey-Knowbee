import { createHash } from "node:crypto";
import { createDeterministicTokenEstimator } from "../ai/web-token-estimator.js";
import { createFileBackedWebEvidencePipelineAdapter, } from "../ai/web-evidence-pipeline-factory.js";
import { createFileBackedWebResearchMethodProvider, } from "../ai/web-research-method-factory.js";
import { projectWebResearchLinkCandidates, } from "../contracts/web-research-link-candidate.js";
import { projectWebFetchResultForAgent, projectWebSearchResultForAgent, } from "./web-evidence-agent-bridge.js";
import { runDirectWebEvidencePipeline, runWebEvidencePipeline, } from "./web-evidence-pipeline.js";
import { createWebEvidenceSourceFetchPort } from "./web-evidence-tool-dispatch-adapter.js";
import { dispatchRunScopedTool, } from "./run-scoped-tool-admission.js";
import { executeWebResearchTerminalProposal } from "./web-research-terminal-use-case.js";
const MAX_RUNTIME_LINK_CANDIDATES = 16;
function canonicalize(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalize).join(",")}]`;
    return `{${Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
        .join(",")}}`;
}
const createFingerprint = (namespace, value) => `sha256:${createHash("sha256")
    .update(`knowbee:${namespace}:${canonicalize(value)}`)
    .digest("hex")}`;
function detailsRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
export function createCanonicalWebEvidenceRuntime(input) {
    const estimator = createDeterministicTokenEstimator();
    const ai = createFileBackedWebEvidencePipelineAdapter({
        provider: input.provider,
        model: input.model,
        workDir: input.workDir,
        ...(input.observabilityContext
            ? { observabilityContext: input.observabilityContext }
            : {}),
    });
    const methodProvider = createFileBackedWebResearchMethodProvider({
        provider: input.provider,
        model: input.model,
        workDir: input.workDir,
        ...(input.observabilityContext
            ? { observabilityContext: input.observabilityContext }
            : {}),
    });
    const observedCandidates = new Map();
    const evidenceRefs = new Set();
    const collectEvidenceRefs = (toolName, result) => {
        if (!result.success)
            return;
        const details = detailsRecord(result.details);
        if (toolName === "web_search" && Array.isArray(details.results)) {
            for (const item of details.results) {
                const resultRecord = detailsRecord(item);
                if (typeof resultRecord.evidenceRef === "string" && resultRecord.evidenceRef.trim()) {
                    evidenceRefs.add(resultRecord.evidenceRef.trim());
                }
            }
            return;
        }
        const document = detailsRecord(details.document);
        if (typeof document.evidenceRef === "string" && document.evidenceRef.trim()) {
            evidenceRefs.add(document.evidenceRef.trim());
        }
    };
    const collectLinkCandidates = (result) => {
        collectEvidenceRefs("web_fetch", result);
        if (!result.success || observedCandidates.size >= MAX_RUNTIME_LINK_CANDIDATES)
            return;
        const details = detailsRecord(result.details);
        const document = detailsRecord(details.document);
        const evidenceRef = typeof document.evidenceRef === "string" ? document.evidenceRef.trim() : "";
        const finalUrl = typeof document.url === "string" ? document.url.trim() : "";
        const observations = Array.isArray(details.linkObservations)
            ? details.linkObservations.filter((item) => Boolean(item &&
                typeof item === "object" &&
                Number.isSafeInteger(item.ordinal) &&
                typeof item.url === "string"))
            : [];
        if (!evidenceRef || !finalUrl || observations.length === 0)
            return;
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
                status: "allowed",
                canonicalUrl: observation.url,
            })),
            maxCandidates: Math.max(1, MAX_RUNTIME_LINK_CANDIDATES - observedCandidates.size),
        }, createFingerprint);
        for (const candidate of projection.candidates) {
            if (observedCandidates.size >= MAX_RUNTIME_LINK_CANDIDATES)
                break;
            observedCandidates.set(candidate.sourceUrl, candidate);
        }
    };
    const attachLinkCandidates = (result) => {
        if (observedCandidates.size === 0)
            return result;
        return {
            ...result,
            details: {
                ...detailsRecord(result.details),
                internalObservedFetchCandidates: [...observedCandidates.values()],
            },
        };
    };
    const admitTerminalProjection = async (result) => {
        if (!result.success)
            return result;
        const terminal = await executeWebResearchTerminalProposal({
            runId: input.context.runId,
            evidenceRefs: [...evidenceRefs],
            attemptedStrategyFingerprints: [],
            completionAllowed: true,
            blockedAllowed: false,
            provider: methodProvider,
            createFingerprint,
        });
        if (terminal.ok && terminal.action.kind === "propose_complete")
            return result;
        const reasonCode = terminal.ok
            ? "web_research_terminal_action_invalid"
            : terminal.reasonCode;
        return {
            success: false,
            output: "",
            error: reasonCode,
            details: {
                kind: "web_research_terminal_admission_failure",
                reasonCode,
            },
        };
    };
    return Object.freeze({
        projectSearchResult: async (request) => {
            collectEvidenceRefs("web_search", request.searchResult);
            const internalActions = new Map();
            const fetchSource = createWebEvidenceSourceFetchPort({
                dispatcher: {
                    dispatch: (toolName, params, context) => dispatchRunScopedTool({
                        scope: input.scope,
                        runId: context.runId,
                        ownerAgentId: input.ownerAgentId,
                        toolName,
                        params,
                        context,
                        dispatcher: input.dispatcher,
                    }).then((result) => {
                        collectLinkCandidates(result);
                        return result;
                    }),
                },
                context: input.context,
                freshnessPolicy: request.freshnessPolicy,
                onDispatchStarted: ({ candidateRef, url }) => {
                    const strategyFingerprint = createFingerprint("web-internal-fetch:v1", {
                        candidateRef,
                        url,
                    });
                    const actionReceiptId = `receipt:web-internal:${strategyFingerprint.slice("sha256:".length, 39)}`;
                    internalActions.set(candidateRef, { actionReceiptId, strategyFingerprint });
                    input.traceObserver?.onInternalFetchStarted({
                        actionReceiptId,
                        candidateRef,
                        strategyFingerprint,
                    });
                },
                onDispatchFinished: ({ candidateRef, result }) => {
                    const action = internalActions.get(candidateRef);
                    if (!action)
                        return;
                    input.traceObserver?.onInternalFetchFinished({
                        ...action,
                        candidateRef,
                        result,
                    });
                },
            });
            const projected = await projectWebSearchResultForAgent({
                requestGoal: request.requestGoal,
                requiredFactKeys: request.requiredFactKeys,
                modelContextTokens: request.modelContextTokens,
                systemToolText: request.systemToolText,
                conversationText: request.conversationText,
                searchResult: request.searchResult,
                signal: request.signal,
            }, {
                runPipeline: (pipelineInput) => runWebEvidencePipeline(pipelineInput, {
                    estimator,
                    sourceSelectionPort: ai,
                    fetchSource,
                    chunkSelectionPort: ai,
                    compressionPort: ai,
                    evidenceReviewPort: ai,
                    verifierPort: ai,
                }),
            });
            const terminalProjection = await admitTerminalProjection(projected);
            input.traceObserver?.onVerificationFinished({
                success: terminalProjection.success,
                reasonCode: terminalProjection.success
                    ? null
                    : terminalProjection.error?.trim() || "web_evidence_failed",
            });
            return attachLinkCandidates(terminalProjection);
        },
        projectFetchResult: async (request) => {
            collectLinkCandidates(request.documentResult);
            const projected = await projectWebFetchResultForAgent(request, {
                runPipeline: (pipelineInput) => runDirectWebEvidencePipeline(pipelineInput, {
                    estimator,
                    chunkSelectionPort: ai,
                    compressionPort: ai,
                    evidenceReviewPort: ai,
                    verifierPort: ai,
                }),
            });
            const terminalProjection = await admitTerminalProjection(projected);
            input.traceObserver?.onVerificationFinished({
                success: terminalProjection.success,
                reasonCode: terminalProjection.success
                    ? null
                    : terminalProjection.error?.trim() || "web_evidence_failed",
            });
            return attachLinkCandidates(terminalProjection);
        },
    });
}
//# sourceMappingURL=web-evidence-runtime-composition.js.map