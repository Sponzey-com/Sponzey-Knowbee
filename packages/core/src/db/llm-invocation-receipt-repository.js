import { isDeepStrictEqual } from "node:util";
import { buildLlmInvocationReceipt, } from "../observability/llm-invocation-receipt.js";
import { getOrchestrationEventById, insertOrchestrationEvent, listOrchestrationEvents, } from "./index.js";
const SOURCE = "llm_invocation:v1";
const EVENT_PREFIX = "llm_invocation:";
function eventId(receipt) {
    return `${EVENT_PREFIX}${receipt.invocationId}:${receipt.phase}`;
}
function parseRow(row) {
    try {
        const payload = JSON.parse(row.payload_redacted_json);
        const validation = buildLlmInvocationReceipt(payload);
        return validation.status === "ready" ? validation.receipt : null;
    }
    catch {
        return null;
    }
}
export class SqliteLlmInvocationReceiptRepository {
    append(receipt) {
        const validation = buildLlmInvocationReceipt(receipt);
        if (validation.status === "rejected")
            return validation;
        const id = eventId(validation.receipt);
        const existing = getOrchestrationEventById(id);
        if (existing) {
            const stored = parseRow(existing);
            return stored && isDeepStrictEqual(stored, validation.receipt)
                ? { status: "stored", inserted: false }
                : { status: "rejected", reasonCode: "receipt_conflict" };
        }
        insertOrchestrationEvent({
            id,
            createdAt: validation.receipt.at,
            emittedAt: validation.receipt.at,
            eventKind: `${EVENT_PREFIX}${validation.receipt.phase}`,
            runId: validation.receipt.context.runId ?? null,
            requestGroupId: validation.receipt.context.requestGroupId ?? null,
            correlationId: validation.receipt.invocationId,
            dedupeKey: id,
            source: SOURCE,
            severity: validation.receipt.phase === "failed" ? "warning" : "debug",
            summary: `LLM invocation ${validation.receipt.phase}`,
            payloadRedacted: {
                ...validation.receipt,
                context: { ...validation.receipt.context },
            },
            producerTask: "task116",
        });
        return { status: "stored", inserted: true };
    }
    list(query = {}) {
        const limit = Math.max(1, Math.min(2_000, Math.floor(query.limit ?? 500)));
        return listOrchestrationEvents({
            ...(query.runId ? { runId: query.runId } : {}),
            ...(query.requestGroupId ? { requestGroupId: query.requestGroupId } : {}),
            limit: Math.min(2_000, limit * 4),
        })
            .filter((row) => row.source === SOURCE && row.event_kind.startsWith(EVENT_PREFIX))
            .map(parseRow)
            .filter((receipt) => receipt !== null)
            .slice(0, limit);
    }
}
//# sourceMappingURL=llm-invocation-receipt-repository.js.map