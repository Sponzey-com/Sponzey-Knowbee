import crypto from "node:crypto";
import { isExternalChannelProvider } from "../channels/contracts.js";
import { recordControlEventFromLedger } from "../control-plane/timeline.js";
import { getDb, getMessageLedgerEventByIdempotencyKey, insertDiagnosticEvent, insertMessageLedgerEvent, listMessageLedgerEvents, transitionMessageLedgerEvent, } from "../db/index.js";
import { redactLogText } from "../logger/index.js";
import { redactInternalEvidenceText } from "../security/internal-evidence-redaction.js";
import { buildWebRetrievalPolicyDecision, evaluateWebRetrievalTransitionAdmission, } from "./web-retrieval-policy.js";
function messageLedgerErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
const DEDUPE_TOOL_NAMES = new Set([
    "web_fetch",
    "screen_capture",
    "telegram_send_file",
    "slack_send_file",
    "yeonjang_camera_capture",
]);
const UNCHANGED_RECOVERY_REJECT_TOOL_NAMES = new Set([
    "yeonjang_camera_capture",
]);
const SECRET_KEY_PATTERN = /(?:api[_-]?key|token|secret|password|credential|authorization|cookie|raw[_-]?(?:body|response))/i;
function resolveRunLedgerContext(runId) {
    if (!runId)
        return undefined;
    return getDb()
        .prepare(`SELECT id AS runId, request_group_id AS requestGroupId, session_id AS sessionKey, source AS channel
       FROM root_runs
       WHERE id = ?
       LIMIT 1`)
        .get(runId);
}
function sanitizeLedgerDetail(value, depth = 0) {
    if (value == null)
        return value;
    if (depth > 8)
        return "[truncated]";
    if (typeof value === "string")
        return sanitizeLedgerText(value);
    if (Array.isArray(value))
        return value.slice(0, 50).map((item) => sanitizeLedgerDetail(item, depth + 1));
    if (typeof value !== "object")
        return value;
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
        if (SECRET_KEY_PATTERN.test(key)) {
            result[key] = "[redacted]";
            continue;
        }
        result[key] = sanitizeLedgerDetail(nested, depth + 1);
    }
    return result;
}
function sanitizeLedgerText(raw) {
    return redactInternalEvidenceText(raw);
}
export function recordMessageLedgerEvent(input) {
    try {
        const resolved = resolveRunLedgerContext(input.runId ?? input.parentRunId);
        const requestGroupId = input.requestGroupId ?? resolved?.requestGroupId ?? input.runId ?? null;
        const sessionKey = input.sessionKey ?? resolved?.sessionKey ?? null;
        const channel = input.channel ?? resolved?.channel ?? "unknown";
        const threadKey = input.threadKey ?? requestGroupId ?? input.runId ?? sessionKey ?? null;
        const detailSource = {
            ...(input.detail ?? {}),
            ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
            ...(input.subSessionId ? { subSessionId: input.subSessionId } : {}),
            ...(input.agentId ? { agentId: input.agentId } : {}),
            ...(input.teamId ? { teamId: input.teamId } : {}),
            ...(input.deliveryKind ? { deliveryKind: input.deliveryKind } : {}),
        };
        const detail = Object.keys(detailSource).length > 0
            ? sanitizeLedgerDetail(detailSource)
            : undefined;
        const id = insertMessageLedgerEvent({
            runId: input.runId ?? input.parentRunId ?? resolved?.runId ?? null,
            requestGroupId,
            sessionKey,
            threadKey,
            channel,
            eventKind: input.eventKind,
            deliveryKey: input.deliveryKey ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            status: input.status,
            summary: input.summary,
            ...(detail ? { detail } : {}),
            ...(input.createdAt ? { createdAt: input.createdAt } : {}),
        });
        if (id) {
            recordControlEventFromLedger({
                runId: input.runId ?? input.parentRunId ?? resolved?.runId ?? null,
                requestGroupId,
                sessionKey,
                channel,
                eventKind: input.eventKind,
                deliveryKey: input.deliveryKey ?? null,
                idempotencyKey: input.idempotencyKey ?? null,
                status: input.status,
                summary: input.summary,
                ...(detail ? { detail } : {}),
            });
        }
        return id;
    }
    catch (error) {
        try {
            const message = messageLedgerErrorMessage(error);
            insertDiagnosticEvent({
                kind: "message_ledger_degraded",
                summary: `message ledger write failed: ${message}`,
                detail: {
                    eventKind: input.eventKind,
                    runId: input.runId ?? null,
                    requestGroupId: input.requestGroupId ?? null,
                },
            });
        }
        catch {
            // Admission callers detect null and fail closed; diagnostic-only callers remain best-effort.
        }
        return null;
    }
}
export function findMessageLedgerEventByIdempotencyKey(idempotencyKey) {
    const key = idempotencyKey?.trim();
    if (!key)
        return undefined;
    return getMessageLedgerEventByIdempotencyKey(key);
}
export function reserveIngressAdmission(input) {
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey)
        return { status: "persistence_unavailable" };
    const eventId = recordMessageLedgerEvent({
        runId: input.runId,
        requestGroupId: input.runId,
        sessionKey: input.sessionId,
        channel: input.source,
        eventKind: "ingress_admission_reserved",
        idempotencyKey,
        status: "started",
        summary: "Ingress execution admitted.",
    });
    if (eventId)
        return { status: "admitted" };
    const existing = findMessageLedgerEventByIdempotencyKey(idempotencyKey);
    return existing?.run_id
        ? { status: "existing", runId: existing.run_id }
        : { status: "persistence_unavailable" };
}
function parseWebRetrievalTransitionReceipt(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const record = value;
    if (record.schemaVersion !== 1)
        return null;
    if (record.kind !== "discovery" && record.kind !== "direct_fetch_attempt")
        return null;
    if (!Array.isArray(record.candidateRefs))
        return null;
    const candidateRefs = record.candidateRefs.filter((item) => typeof item === "string" && item.startsWith("web-candidate:"));
    if (candidateRefs.length !== record.candidateRefs.length)
        return null;
    return { schemaVersion: 1, kind: record.kind, candidateRefs };
}
export function evaluatePersistedWebRetrievalTransition(input) {
    const receipts = listMessageLedgerEvents({
        requestGroupId: input.requestGroupId,
        limit: 1000,
    }).flatMap((event) => {
        if (!event.detail_json)
            return [];
        try {
            const detail = JSON.parse(event.detail_json);
            const receipt = parseWebRetrievalTransitionReceipt(detail.webRetrievalTransition);
            return receipt ? [receipt] : [];
        }
        catch {
            return [];
        }
    });
    return evaluateWebRetrievalTransitionAdmission({
        nextToolName: input.nextToolName,
        receipts,
    });
}
export function reserveMessageDeliveryAdmission(input) {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey)
        return { status: "persistence_unavailable" };
    const eventId = recordMessageLedgerEvent({
        ...input,
        idempotencyKey,
        eventKind: "delivery_attempted",
        status: "started",
        summary: "final delivery admitted",
    });
    if (eventId)
        return { status: "admitted", eventId };
    const existing = findMessageLedgerEventByIdempotencyKey(idempotencyKey);
    return existing ? { status: "existing", event: existing } : { status: "persistence_unavailable" };
}
export function completeMessageDeliveryAdmission(input) {
    try {
        return transitionMessageLedgerEvent({
            idempotencyKey: input.idempotencyKey,
            expectedEventKind: "delivery_attempted",
            expectedStatus: "started",
            eventKind: input.delivered ? "text_delivered" : "text_delivery_failed",
            status: input.delivered ? "delivered" : "failed",
            summary: input.delivered ? "응답 텍스트 전달 완료" : "응답 텍스트 전달 실패",
            ...(input.detail
                ? { detail: sanitizeLedgerDetail(input.detail) }
                : {}),
        });
    }
    catch (error) {
        try {
            insertDiagnosticEvent({
                kind: "message_ledger_degraded",
                summary: `delivery admission transition failed: ${messageLedgerErrorMessage(error)}`,
                detail: { delivered: input.delivered },
            });
        }
        catch {
            // The caller treats a failed compare-and-set as an unresolved delivery.
        }
        return false;
    }
}
export function cancelMessageDeliveryAdmission(input) {
    try {
        return transitionMessageLedgerEvent({
            idempotencyKey: input.idempotencyKey,
            expectedEventKind: "delivery_attempted",
            expectedStatus: "started",
            eventKind: "text_delivery_suppressed",
            status: "suppressed",
            summary: "final delivery cancelled before provider invocation",
            ...(input.detail
                ? { detail: sanitizeLedgerDetail(input.detail) }
                : {}),
        });
    }
    catch {
        return false;
    }
}
export function stableStringify(value) {
    if (value === undefined)
        return "null";
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    const entries = Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`;
}
export function hashLedgerValue(value) {
    return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}
function normalizeChannelTarget(target) {
    return target?.trim() || "default";
}
export function buildTextDeliveryKey(channel, target, text) {
    return `text:${channel ?? "unknown"}:${normalizeChannelTarget(target)}:${hashLedgerValue(text.trim())}`;
}
export function buildArtifactDeliveryKey(channel, target, artifactPath) {
    return `artifact:${channel ?? "unknown"}:${normalizeChannelTarget(target)}:${hashLedgerValue(artifactPath)}`;
}
function canonicalToolParams(params) {
    const result = {};
    for (const [key, value] of Object.entries(params).sort(([left], [right]) => left.localeCompare(right))) {
        if (key === "allowRepeatReason")
            continue;
        result[key] = value;
    }
    return result;
}
export function isDedupeTargetTool(toolName) {
    return DEDUPE_TOOL_NAMES.has(toolName);
}
export function rejectsDuplicateAsUnchangedRecovery(toolName) {
    return UNCHANGED_RECOVERY_REJECT_TOOL_NAMES.has(toolName);
}
export function getAllowRepeatReason(params) {
    const value = params.allowRepeatReason;
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
export function buildToolCallIdempotencyKey(input) {
    const owner = input.requestGroupId ?? input.runId ?? "unknown-run";
    const hash = hashLedgerValue({
        toolName: input.toolName,
        params: canonicalToolParams(input.params),
    });
    return `tool:${owner}:${input.toolName}:${hash}`;
}
export function findDuplicateToolCall(input) {
    const baseKey = buildToolCallIdempotencyKey(input);
    const webRetrievalPolicy = buildWebRetrievalPolicyDecision({
        toolName: input.toolName,
        params: input.params,
    });
    const keys = [
        baseKey,
        ...(webRetrievalPolicy
            ? [
                buildToolCallIdempotencyKey({
                    ...input,
                    params: webRetrievalPolicy.canonicalParams,
                }),
            ]
            : []),
    ];
    for (const key of [...new Set(keys)]) {
        const duplicate = getMessageLedgerEventByIdempotencyKey(`${key}:result`) ??
            getMessageLedgerEventByIdempotencyKey(`${key}:started`);
        if (duplicate)
            return duplicate;
    }
    return undefined;
}
function eventSucceeded(event) {
    return event.status === "sent" || event.status === "delivered" || event.status === "succeeded";
}
export function messageLedgerEventSucceeded(event) {
    return Boolean(event && eventSucceeded(event));
}
export function messageLedgerEventHasRequiredDeliveryEvidence(event) {
    if (!event)
        return false;
    if (!isExternalChannelProvider(event.channel))
        return true;
    if (!event.detail_json)
        return false;
    try {
        const detail = JSON.parse(event.detail_json);
        return detail.providerEvidence === "confirmed";
    }
    catch {
        return false;
    }
}
function eventFailed(event) {
    return (event.status === "failed" ||
        event.status === "suppressed" ||
        event.event_kind.endsWith("_failed") ||
        event.event_kind === "recovery_stop_generated");
}
export function finalizeDeliveryForRun(params) {
    if (params.requestedStatus !== "failed" &&
        params.requestedStatus !== "cancelled" &&
        params.requestedStatus !== "interrupted") {
        return { shouldProtectDeliveredAnswer: false, outcome: "unchanged" };
    }
    const resolved = resolveRunLedgerContext(params.runId);
    const events = listMessageLedgerEvents({
        ...(resolved?.requestGroupId
            ? { requestGroupId: resolved.requestGroupId }
            : { runId: params.runId }),
        limit: 1000,
    });
    const hasDeliveredAnswer = events.some((event) => event.event_kind === "text_delivered" &&
        eventSucceeded(event) &&
        messageLedgerEventHasRequiredDeliveryEvidence(event));
    if (!hasDeliveredAnswer)
        return { shouldProtectDeliveredAnswer: false, outcome: "unchanged" };
    const hasLaterFailure = events.some(eventFailed);
    const outcome = hasLaterFailure ? "partial_success" : "success";
    const summary = outcome === "partial_success"
        ? "응답은 이미 전달됐고, 후속 전달/복구 실패는 부분 실패로 기록했습니다."
        : "응답 전달이 완료되어 후속 실패가 전체 실패로 덮어써지지 않았습니다.";
    recordMessageLedgerEvent({
        runId: params.runId,
        requestGroupId: resolved?.requestGroupId ?? params.runId,
        sessionKey: resolved?.sessionKey ?? null,
        channel: resolved?.channel ?? null,
        eventKind: "delivery_finalized",
        idempotencyKey: `delivery-finalized:${params.runId}:${params.requestedStatus}:${outcome}`,
        status: outcome === "partial_success" ? "degraded" : "succeeded",
        summary,
        detail: {
            requestedStatus: params.requestedStatus,
            requestedSummary: params.requestedSummary ?? null,
            outcome,
        },
    });
    return {
        shouldProtectDeliveredAnswer: true,
        outcome,
        runStatus: "completed",
        summary,
    };
}
//# sourceMappingURL=message-ledger.js.map