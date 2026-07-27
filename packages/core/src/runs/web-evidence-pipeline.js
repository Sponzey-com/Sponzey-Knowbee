import { projectWebToolResultObservation, } from "../contracts/web-research-observation.js";
import { createWebResearchContextBudget, } from "../contracts/web-research-context-budget.js";
import { chunkWebDocument } from "../contracts/web-document-chunk.js";
import { createWebSearchMetadataSnapshot, selectWebResearchSources, } from "./web-source-selection.js";
import { createWebChunkSelectionSnapshot, selectWebResearchChunks, } from "./web-chunk-selection.js";
import { compressWebResearchEvidence, } from "./web-evidence-compression.js";
import { reviewAndAssembleWebEvidencePack, } from "./web-evidence-pack.js";
import { verifyWebEvidencePack, } from "./web-evidence-verifier.js";
function failure(reasonCode) {
    return Object.freeze({ ok: false, reasonCode });
}
export async function runWebEvidencePipeline(input, dependencies) {
    const cancelled = () => input.signal.aborted;
    if (cancelled())
        return failure("web_evidence_pipeline_cancelled");
    const budget = createWebResearchContextBudget({
        modelContextTokens: input.modelContextTokens,
        systemToolText: input.systemToolText,
        conversationText: input.conversationText,
    }, dependencies.estimator);
    if (!budget.ok)
        return failure("web_evidence_pipeline_budget_failed");
    const searchObservation = projectWebToolResultObservation("web_search", input.searchResult);
    if (!searchObservation.ok || searchObservation.value.kind !== "search_metadata") {
        return failure("web_evidence_pipeline_search_observation_failed");
    }
    const sourceSnapshot = createWebSearchMetadataSnapshot({
        observation: searchObservation.value,
        budgetFingerprint: budget.value.fingerprint,
    });
    if (!sourceSnapshot.ok)
        return failure("web_evidence_pipeline_search_observation_failed");
    const selectedSources = await selectWebResearchSources({
        requestGoal: input.requestGoal,
        requiredFactKeys: input.requiredFactKeys,
        snapshot: sourceSnapshot.value,
    }, dependencies.sourceSelectionPort);
    if (cancelled())
        return failure("web_evidence_pipeline_cancelled");
    if (!selectedSources.ok)
        return failure("web_evidence_pipeline_source_selection_failed");
    const compressionResults = [];
    for (const selection of selectedSources.value.selections) {
        const candidate = sourceSnapshot.value.candidates.find((item) => item.candidateRef === selection.candidateRef);
        if (!candidate)
            return failure("web_evidence_pipeline_source_selection_failed");
        let fetchedResult;
        try {
            fetchedResult = await dependencies.fetchSource(Object.freeze({
                candidateRef: candidate.candidateRef,
                url: candidate.url,
                signal: input.signal,
            }));
        }
        catch {
            return failure("web_evidence_pipeline_fetch_failed");
        }
        if (cancelled())
            return failure("web_evidence_pipeline_cancelled");
        const documentObservation = projectWebToolResultObservation("web_fetch", fetchedResult);
        if (!documentObservation.ok || documentObservation.value.kind !== "document") {
            return failure("web_evidence_pipeline_fetch_failed");
        }
        const chunked = chunkWebDocument({
            document: documentObservation.value.document,
            budgetFingerprint: budget.value.fingerprint,
        }, dependencies.estimator);
        if (!chunked.ok)
            return failure("web_evidence_pipeline_chunk_failed");
        const chunkSnapshot = createWebChunkSelectionSnapshot(chunked.value);
        if (!chunkSnapshot.ok)
            return failure("web_evidence_pipeline_chunk_failed");
        const selectedChunks = await selectWebResearchChunks({
            requestGoal: input.requestGoal,
            requiredFactKeys: selection.factKeys,
            snapshot: chunkSnapshot.value,
        }, dependencies.chunkSelectionPort);
        if (cancelled())
            return failure("web_evidence_pipeline_cancelled");
        if (!selectedChunks.ok) {
            return failure("web_evidence_pipeline_chunk_selection_failed");
        }
        const chunks = selectedChunks.value.selections.map((selected) => chunkSnapshot.value.chunks.find((chunk) => chunk.chunkRef === selected.chunkRef));
        if (chunks.some((chunk) => !chunk)) {
            return failure("web_evidence_pipeline_chunk_selection_failed");
        }
        const document = documentObservation.value.document;
        const compressed = await compressWebResearchEvidence({
            requestGoal: input.requestGoal,
            requiredFactKeys: selection.factKeys,
            source: Object.freeze({
                sourceTitle: document.title,
                url: document.url,
                publishedAt: document.sourceEvidence.sourceTimestamp ?? null,
                retrievedAt: document.sourceEvidence.fetchTimestamp,
                evidenceRef: document.evidenceRef,
                budgetFingerprint: budget.value.fingerprint,
            }),
            selectedChunks: chunks,
        }, dependencies.compressionPort);
        if (cancelled())
            return failure("web_evidence_pipeline_cancelled");
        if (!compressed.ok)
            return failure("web_evidence_pipeline_compression_failed");
        compressionResults.push(compressed.value);
    }
    const evidencePack = await reviewAndAssembleWebEvidencePack({
        requestGoal: input.requestGoal,
        requiredFactKeys: input.requiredFactKeys,
        budget: budget.value,
        compressionResults,
    }, {
        reviewPort: dependencies.evidenceReviewPort,
        estimator: dependencies.estimator,
    });
    if (cancelled())
        return failure("web_evidence_pipeline_cancelled");
    if (!evidencePack.ok)
        return failure("web_evidence_pipeline_pack_failed");
    const verification = await verifyWebEvidencePack({
        requestGoal: input.requestGoal,
        requiredFactKeys: input.requiredFactKeys,
        evidencePack: evidencePack.value,
    }, dependencies.verifierPort);
    if (cancelled())
        return failure("web_evidence_pipeline_cancelled");
    if (!verification.ok)
        return failure("web_evidence_pipeline_verification_failed");
    return Object.freeze({ ok: true, value: verification.value });
}
export async function runDirectWebEvidencePipeline(input, dependencies) {
    const cancelled = () => input.signal.aborted;
    if (cancelled())
        return failure("web_evidence_pipeline_cancelled");
    const budget = createWebResearchContextBudget({
        modelContextTokens: input.modelContextTokens,
        systemToolText: input.systemToolText,
        conversationText: input.conversationText,
    }, dependencies.estimator);
    if (!budget.ok)
        return failure("web_evidence_pipeline_budget_failed");
    const documentObservation = projectWebToolResultObservation("web_fetch", input.documentResult);
    if (!documentObservation.ok || documentObservation.value.kind !== "document") {
        return failure("web_evidence_pipeline_fetch_failed");
    }
    const document = documentObservation.value.document;
    const chunked = chunkWebDocument({
        document,
        budgetFingerprint: budget.value.fingerprint,
    }, dependencies.estimator);
    if (!chunked.ok)
        return failure("web_evidence_pipeline_chunk_failed");
    const chunkSnapshot = createWebChunkSelectionSnapshot(chunked.value);
    if (!chunkSnapshot.ok)
        return failure("web_evidence_pipeline_chunk_failed");
    const selectedChunks = await selectWebResearchChunks({
        requestGoal: input.requestGoal,
        requiredFactKeys: input.requiredFactKeys,
        snapshot: chunkSnapshot.value,
    }, dependencies.chunkSelectionPort);
    if (cancelled())
        return failure("web_evidence_pipeline_cancelled");
    if (!selectedChunks.ok)
        return failure("web_evidence_pipeline_chunk_selection_failed");
    const chunks = selectedChunks.value.selections.map((selected) => chunkSnapshot.value.chunks.find((chunk) => chunk.chunkRef === selected.chunkRef));
    if (chunks.some((chunk) => !chunk)) {
        return failure("web_evidence_pipeline_chunk_selection_failed");
    }
    const compressed = await compressWebResearchEvidence({
        requestGoal: input.requestGoal,
        requiredFactKeys: input.requiredFactKeys,
        source: Object.freeze({
            sourceTitle: document.title,
            url: document.url,
            publishedAt: document.sourceEvidence.sourceTimestamp ?? null,
            retrievedAt: document.sourceEvidence.fetchTimestamp,
            evidenceRef: document.evidenceRef,
            budgetFingerprint: budget.value.fingerprint,
        }),
        selectedChunks: chunks,
    }, dependencies.compressionPort);
    if (cancelled())
        return failure("web_evidence_pipeline_cancelled");
    if (!compressed.ok)
        return failure("web_evidence_pipeline_compression_failed");
    const evidencePack = await reviewAndAssembleWebEvidencePack({
        requestGoal: input.requestGoal,
        requiredFactKeys: input.requiredFactKeys,
        budget: budget.value,
        compressionResults: [compressed.value],
    }, {
        reviewPort: dependencies.evidenceReviewPort,
        estimator: dependencies.estimator,
    });
    if (cancelled())
        return failure("web_evidence_pipeline_cancelled");
    if (!evidencePack.ok)
        return failure("web_evidence_pipeline_pack_failed");
    const verification = await verifyWebEvidencePack({
        requestGoal: input.requestGoal,
        requiredFactKeys: input.requiredFactKeys,
        evidencePack: evidencePack.value,
    }, dependencies.verifierPort);
    if (cancelled())
        return failure("web_evidence_pipeline_cancelled");
    if (!verification.ok)
        return failure("web_evidence_pipeline_verification_failed");
    return Object.freeze({ ok: true, value: verification.value });
}
//# sourceMappingURL=web-evidence-pipeline.js.map