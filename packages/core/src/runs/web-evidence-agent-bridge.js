import { projectWebToolResultObservation } from "../contracts/web-research-observation.js";
export function projectValidatedWebToolResultForAgent(toolName, result) {
    if (!result.success) {
        const reasonCode = result.error?.trim() ||
            (toolName === "web_search" ? "web_search_failed" : "web_fetch_failed");
        return {
            success: false,
            output: "",
            error: reasonCode,
            details: {
                kind: toolName === "web_search" ? "web_search_failure" : "web_fetch_failure",
                reasonCode,
            },
        };
    }
    const observation = projectWebToolResultObservation(toolName, result);
    if (!observation.ok) {
        const reasonCode = toolName === "web_search"
            ? "web_search_evidence_invalid"
            : "web_document_evidence_invalid";
        return {
            success: false,
            output: "",
            error: reasonCode,
            details: {
                kind: toolName === "web_search" ? "web_search_failure" : "web_fetch_failure",
                reasonCode,
            },
        };
    }
    if (observation.value.kind === "search_metadata") {
        return {
            success: true,
            output: "",
            details: {
                kind: "web_search_evidence",
                provider: observation.value.provider,
                retrievedAt: observation.value.retrievedAt,
                resultCount: observation.value.resultCount,
                results: observation.value.results,
            },
            ...(result.evidenceSource ? { evidenceSource: result.evidenceSource } : {}),
        };
    }
    const { markdown, ...documentMetadata } = observation.value.document;
    return {
        success: true,
        output: markdown,
        details: {
            kind: "web_document_evidence",
            document: documentMetadata,
        },
        ...(result.evidenceSource ? { evidenceSource: result.evidenceSource } : {}),
    };
}
function normalizeFactKeys(values) {
    const normalized = values
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= 128);
    const unique = [...new Set(normalized)];
    return Object.freeze(unique.length > 0 ? unique : ["request_goal"]);
}
function pipelineFailure(reasonCode) {
    return {
        success: false,
        output: "",
        error: reasonCode,
        details: {
            kind: "web_evidence_pipeline_failure",
            reasonCode,
        },
    };
}
function projectVerification(verification) {
    const details = {
        kind: "web_evidence_verification",
        status: verification.status,
        supportedEvidenceCount: verification.supportedUnitRefs.length,
        unresolvedFactKeys: [...verification.unresolvedFactKeys],
    };
    if (verification.status === "sufficient" && verification.answerDraft) {
        return {
            success: true,
            output: verification.answerDraft,
            details,
        };
    }
    return {
        success: false,
        output: "",
        error: verification.status === "conflicted"
            ? "web_evidence_conflicted"
            : "web_evidence_insufficient",
        details,
    };
}
export async function projectWebSearchResultForAgent(input, dependencies) {
    if (input.signal.aborted) {
        return pipelineFailure("web_evidence_pipeline_cancelled");
    }
    if (!input.searchResult.success) {
        const reasonCode = input.searchResult.error?.trim() || "web_search_failed";
        return {
            success: false,
            output: "",
            error: reasonCode,
            details: {
                kind: "web_search_failure",
                reasonCode,
            },
        };
    }
    const result = await dependencies.runPipeline({
        requestGoal: input.requestGoal,
        requiredFactKeys: normalizeFactKeys(input.requiredFactKeys),
        modelContextTokens: input.modelContextTokens,
        systemToolText: input.systemToolText,
        conversationText: input.conversationText,
        searchResult: input.searchResult,
        signal: input.signal,
    });
    return result.ok ? projectVerification(result.value) : pipelineFailure(result.reasonCode);
}
export async function projectWebFetchResultForAgent(input, dependencies) {
    if (input.signal.aborted) {
        return pipelineFailure("web_evidence_pipeline_cancelled");
    }
    if (!input.documentResult.success) {
        const reasonCode = input.documentResult.error?.trim() || "web_fetch_failed";
        return {
            success: false,
            output: "",
            error: reasonCode,
            details: {
                kind: "web_fetch_failure",
                reasonCode,
            },
        };
    }
    const result = await dependencies.runPipeline({
        requestGoal: input.requestGoal,
        requiredFactKeys: normalizeFactKeys(input.requiredFactKeys),
        modelContextTokens: input.modelContextTokens,
        systemToolText: input.systemToolText,
        conversationText: input.conversationText,
        documentResult: input.documentResult,
        signal: input.signal,
    });
    return result.ok ? projectVerification(result.value) : pipelineFailure(result.reasonCode);
}
//# sourceMappingURL=web-evidence-agent-bridge.js.map