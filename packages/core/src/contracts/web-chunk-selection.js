import { createHash } from "node:crypto";
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
function sha256(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function exactText(value, maxLength) {
    if (typeof value !== "string")
        return null;
    const text = value.trim();
    return text && text.length <= maxLength ? text : null;
}
function hasExactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    return actual.length === keys.length &&
        [...keys].sort().every((key, index) => key === actual[index]);
}
export function createWebChunkSelectionSnapshot(rawChunks) {
    if (!Array.isArray(rawChunks) || rawChunks.length < 1) {
        return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_snapshot_invalid" });
    }
    const chunks = [...rawChunks].sort((left, right) => left.ordinal - right.ordinal);
    const documentEvidenceRef = exactText(chunks[0]?.documentEvidenceRef, 256);
    const budgetFingerprint = chunks[0]?.budgetFingerprint;
    const chunkRefs = new Set();
    const ordinals = new Set();
    const contentFingerprints = new Set();
    const admitted = [];
    const duplicateChunkRefs = [];
    if (!documentEvidenceRef || !budgetFingerprint || !SHA256.test(budgetFingerprint)) {
        return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_snapshot_invalid" });
    }
    for (const chunk of chunks) {
        const expectedContentFingerprint = sha256(chunk.content);
        if (chunk.documentEvidenceRef !== documentEvidenceRef ||
            chunk.budgetFingerprint !== budgetFingerprint ||
            !exactText(chunk.chunkRef, 512) ||
            chunkRefs.has(chunk.chunkRef) ||
            !Number.isInteger(chunk.ordinal) ||
            chunk.ordinal < 1 ||
            ordinals.has(chunk.ordinal) ||
            !Number.isInteger(chunk.estimatedTokens) ||
            chunk.estimatedTokens < 0 ||
            chunk.estimatedTokens > 600 ||
            chunk.contentFingerprint !== expectedContentFingerprint ||
            !Number.isInteger(chunk.sourceOffsets?.start) ||
            !Number.isInteger(chunk.sourceOffsets?.end) ||
            chunk.sourceOffsets.start < 0 ||
            chunk.sourceOffsets.end <= chunk.sourceOffsets.start) {
            return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_snapshot_invalid" });
        }
        chunkRefs.add(chunk.chunkRef);
        ordinals.add(chunk.ordinal);
        if (contentFingerprints.has(chunk.contentFingerprint)) {
            duplicateChunkRefs.push(chunk.chunkRef);
            continue;
        }
        contentFingerprints.add(chunk.contentFingerprint);
        admitted.push(chunk);
    }
    const stable = {
        documentEvidenceRef,
        budgetFingerprint,
        chunks: Object.freeze(admitted),
        duplicateChunkRefs: Object.freeze(duplicateChunkRefs),
    };
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            ...stable,
            snapshotFingerprint: sha256(JSON.stringify(stable)),
        }),
    });
}
export function admitWebChunkSelection(input) {
    if (!input.receipt || typeof input.receipt !== "object" || Array.isArray(input.receipt)) {
        return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_receipt_invalid" });
    }
    const receipt = input.receipt;
    if (!hasExactKeys(receipt, ["snapshotFingerprint", "budgetFingerprint", "selections"])) {
        return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_receipt_invalid" });
    }
    if (receipt.snapshotFingerprint !== input.snapshot.snapshotFingerprint ||
        receipt.budgetFingerprint !== input.snapshot.budgetFingerprint) {
        return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_fingerprint_mismatch" });
    }
    if (!Array.isArray(receipt.selections) ||
        receipt.selections.length < 1 ||
        receipt.selections.length > input.maxSelections) {
        return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_count_invalid" });
    }
    const availableRefs = new Set(input.snapshot.chunks.map((chunk) => chunk.chunkRef));
    const allowedFactKeys = new Set(input.requiredFactKeys);
    const selectedRefs = new Set();
    const selections = [];
    for (const rawSelection of receipt.selections) {
        if (!rawSelection || typeof rawSelection !== "object" || Array.isArray(rawSelection)) {
            return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_receipt_invalid" });
        }
        const selection = rawSelection;
        if (!hasExactKeys(selection, ["chunkRef", "relevanceScore", "factKeys"])) {
            return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_receipt_invalid" });
        }
        const chunkRef = exactText(selection.chunkRef, 512);
        if (!chunkRef || !availableRefs.has(chunkRef) || selectedRefs.has(chunkRef)) {
            return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_reference_invalid" });
        }
        if (typeof selection.relevanceScore !== "number" ||
            !Number.isFinite(selection.relevanceScore) ||
            selection.relevanceScore < 0 ||
            selection.relevanceScore > 1) {
            return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_score_invalid" });
        }
        if (!Array.isArray(selection.factKeys) ||
            selection.factKeys.length < 1 ||
            new Set(selection.factKeys).size !== selection.factKeys.length ||
            selection.factKeys.some((key) => !exactText(key, 128) || !allowedFactKeys.has(key))) {
            return Object.freeze({ ok: false, reasonCode: "web_chunk_selection_fact_invalid" });
        }
        selectedRefs.add(chunkRef);
        selections.push(Object.freeze({
            chunkRef,
            relevanceScore: selection.relevanceScore,
            factKeys: Object.freeze([...selection.factKeys]),
        }));
    }
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            snapshotFingerprint: input.snapshot.snapshotFingerprint,
            budgetFingerprint: input.snapshot.budgetFingerprint,
            selections: Object.freeze(selections),
        }),
    });
}
//# sourceMappingURL=web-chunk-selection.js.map