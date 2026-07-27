import { createHash } from "node:crypto";
function required(value) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error("canonical_pending_response_invalid");
    return normalized;
}
function fingerprint(text) {
    return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}
function sha256(text) {
    return createHash("sha256").update(text.trim()).digest("hex");
}
const TEXT_SOURCES = new Set([
    "llm_generated",
    "llm_reviewed",
    "runtime_deterministic",
    "user_supplied_literal",
    "mixed",
]);
const CONTENT_KINDS = new Set([
    "direct_answer",
    "planning",
    "delegation",
    "tool_result",
    "yeonjang_result",
    "sub_agent_result",
    "prompt_improvement",
    "final_report",
    "safety_notice",
    "system_status",
    "validation_error",
    "fixed_notice",
]);
const LANGUAGES = new Set(["ko", "en", "unknown"]);
function parseReviewEnvelope(raw, responseText, finalOutcome) {
    if (!raw?.trim())
        return { reviewIssue: "review_envelope_missing" };
    try {
        const value = JSON.parse(raw);
        const receipt = value?.receipt;
        const terminalReportRequired = ["partial", "blocked", "exhausted"].includes(finalOutcome);
        if (terminalReportRequired && !value?.terminalReportFingerprint) {
            return { reviewIssue: "review_envelope_terminal_report_missing" };
        }
        const terminalFingerprintValid = value?.terminalReportFingerprint === undefined
            || /^sha256:[a-f0-9]{64}$/u.test(value.terminalReportFingerprint);
        const v2ProvenanceValid = receipt?.schemaVersion !== 2 || (receipt.contentKind === "direct_answer"
            && receipt.rawTextSource === "llm_generated"
            && receipt.promptSourceIds?.[0] === "task_intake"
            && receipt.promptSourceIds?.[1] === "final_response"
            && /^[a-f0-9]{64}$/u.test(receipt.promptSourceFingerprints?.taskIntakeSha256 ?? "")
            && /^[a-f0-9]{64}$/u.test(receipt.promptSourceFingerprints?.finalResponseSha256 ?? "")
            && typeof receipt.providerInvocationRef === "string"
            && receipt.providerInvocationRef.trim().length > 0);
        const valid = value?.schemaVersion === 1
            && /^[a-f0-9]{64}$/u.test(value.rawTextSha256)
            && terminalFingerprintValid
            && TEXT_SOURCES.has(value.rawTextSource)
            && CONTENT_KINDS.has(value.contentKind)
            && LANGUAGES.has(value.expectedLanguage)
            && (receipt?.schemaVersion === 1 || receipt?.schemaVersion === 2)
            && v2ProvenanceValid
            && typeof receipt.receiptId === "string"
            && receipt.receiptId.trim().length > 0
            && receipt.reviewedBy === "llm_final_response"
            && receipt.promptSourceId === "final_response"
            && receipt.rawTextSource === value.rawTextSource
            && receipt.contentKind === value.contentKind
            && receipt.rawTextSha256 === value.rawTextSha256
            && /^[a-f0-9]{64}$/u.test(receipt.responseTextSha256)
            && LANGUAGES.has(receipt.responseLanguage);
        if (!valid)
            return { reviewIssue: "review_envelope_invalid" };
        if (receipt.responseTextSha256 !== sha256(responseText)) {
            return { reviewIssue: "review_envelope_response_mismatch" };
        }
        return { reviewEnvelope: value };
    }
    catch {
        return { reviewIssue: "review_envelope_invalid" };
    }
}
function hydrate(row) {
    const text = required(row.response_text);
    const textFingerprint = fingerprint(text);
    if (row.text_fingerprint !== textFingerprint)
        throw new Error("canonical_pending_response_corrupt");
    const review = parseReviewEnvelope(row.review_envelope_json, text, row.final_outcome);
    return {
        runId: required(row.run_id),
        workId: required(row.work_id),
        sessionId: required(row.session_id),
        source: required(row.source),
        text,
        textSource: row.text_source,
        finalOutcome: row.final_outcome,
        textFingerprint,
        ...review,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
export class SqliteCanonicalPendingResponseRepository {
    db;
    now;
    constructor(db, now) {
        this.db = db;
        this.now = now;
    }
    stage(input) {
        const text = required(input.text);
        if (!input.reviewEnvelope)
            throw new Error("canonical_pending_response_review_required");
        if (["partial", "blocked", "exhausted"].includes(input.finalOutcome)
            && !input.reviewEnvelope.terminalReportFingerprint) {
            throw new Error("canonical_terminal_report_fingerprint_required");
        }
        const digest = fingerprint(text);
        const existing = this.load(input.runId);
        if (existing) {
            const exact = existing.workId === input.workId
                && existing.sessionId === input.sessionId
                && existing.source === input.source
                && existing.textFingerprint === digest
                && existing.textSource === input.textSource
                && existing.finalOutcome === input.finalOutcome
                && JSON.stringify(existing.reviewEnvelope) === JSON.stringify(input.reviewEnvelope);
            return exact ? { staged: true } : { staged: false, reasonCode: "canonical_pending_response_conflict" };
        }
        const now = this.now();
        this.db.prepare(`
      INSERT INTO canonical_pending_responses
        (run_id, work_id, session_id, source, response_text, text_source, final_outcome, text_fingerprint, review_envelope_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(input.runId, input.workId, input.sessionId, input.source, text, input.textSource, input.finalOutcome, digest, JSON.stringify(input.reviewEnvelope), now, now);
        return { staged: true };
    }
    load(runId) {
        const row = this.db.prepare("SELECT * FROM canonical_pending_responses WHERE run_id = ?").get(runId);
        return row ? hydrate(row) : undefined;
    }
    loadPending(runId) {
        const item = this.load(runId);
        return item?.status === "pending" ? item : undefined;
    }
    listPending(limit = 200) {
        const bounded = Math.max(1, Math.min(1_000, Math.floor(limit)));
        return this.db.prepare(`
      SELECT * FROM canonical_pending_responses
      WHERE status = 'pending'
      ORDER BY updated_at ASC, run_id ASC
      LIMIT ?
    `).all(bounded).map(hydrate);
    }
    markConsumed(runId) {
        const result = this.db.prepare(`
      UPDATE canonical_pending_responses SET status = 'consumed', updated_at = ?
      WHERE run_id = ? AND status = 'pending'
    `).run(this.now(), runId);
        if (result.changes === 1 || this.load(runId)?.status === "consumed")
            return { consumed: true };
        return { consumed: false, reasonCode: "canonical_pending_response_not_found" };
    }
}
//# sourceMappingURL=canonical-pending-response-repository.js.map