import { getOrchestrationEventById, insertOrchestrationEvent, listOrchestrationEvents, } from "./index.js";
import { isDeepStrictEqual } from "node:util";
import { buildTypedObservabilityEvent, } from "../observability/typed-event-contract.js";
const SCHEMA_VERSION = 1;
const SOURCE = "typed_observability:v1";
const EVENT_PREFIX = "typed_observability:";
function severityForPurpose(purpose) {
    return purpose === "product" ? "info" : "debug";
}
function parsePayload(row) {
    try {
        return JSON.parse(row.payload_redacted_json);
    }
    catch {
        return null;
    }
}
function mapStoredRow(row) {
    const payload = parsePayload(row);
    if (!payload || typeof payload !== "object")
        return { status: "issue", code: "stored_payload_invalid" };
    const candidate = payload;
    if (candidate.schemaVersion !== SCHEMA_VERSION)
        return { status: "issue", code: "schema_version_unsupported" };
    const kind = row.event_kind.startsWith(EVENT_PREFIX)
        ? row.event_kind.slice(EVENT_PREFIX.length)
        : null;
    if (!kind || !candidate.correlation || !candidate.purpose || !candidate.reasonCode) {
        return { status: "issue", code: "stored_payload_invalid" };
    }
    const result = buildTypedObservabilityEvent({
        eventId: row.id,
        kind,
        purpose: candidate.purpose,
        at: row.emitted_at,
        correlation: candidate.correlation,
        reasonCode: candidate.reasonCode,
        summary: row.summary,
        ...(candidate.attributes ? { attributes: candidate.attributes } : {}),
    });
    return result.status === "ready"
        ? { status: "ready", event: result.event }
        : { status: "issue", code: "stored_event_invalid" };
}
function matchesQuery(event, query) {
    return (!query.requestId || event.correlation.requestId === query.requestId)
        && (!query.requestGroupId || event.correlation.requestGroupId === query.requestGroupId)
        && (!query.rootRunId || event.correlation.rootRunId === query.rootRunId)
        && (!query.runId || event.correlation.runId === query.runId)
        && (!query.workId || event.correlation.workId === query.workId);
}
export class SqliteTypedObservabilityEventRepository {
    append(event) {
        const validation = buildTypedObservabilityEvent(event);
        if (validation.status === "rejected")
            return validation;
        const existing = getOrchestrationEventById(validation.event.eventId);
        if (existing) {
            const mapped = mapStoredRow(existing);
            return mapped.status === "ready" && isDeepStrictEqual(mapped.event, validation.event)
                ? { status: "stored", inserted: false, eventId: existing.id }
                : { status: "rejected", reasonCode: "event_id_conflict" };
        }
        const payload = {
            schemaVersion: SCHEMA_VERSION,
            purpose: validation.event.purpose,
            reasonCode: validation.event.reasonCode,
            correlation: { ...validation.event.correlation },
            ...(validation.event.attributes ? { attributes: { ...validation.event.attributes } } : {}),
        };
        const stored = insertOrchestrationEvent({
            id: validation.event.eventId,
            createdAt: validation.event.at,
            emittedAt: validation.event.at,
            eventKind: `${EVENT_PREFIX}${validation.event.kind}`,
            runId: validation.event.correlation.runId,
            ...(validation.event.correlation.parentRunId
                ? { parentRunId: validation.event.correlation.parentRunId }
                : {}),
            requestGroupId: validation.event.correlation.requestGroupId,
            correlationId: validation.event.correlation.requestId,
            dedupeKey: `typed-observability:${validation.event.eventId}`,
            source: SOURCE,
            severity: severityForPurpose(validation.event.purpose),
            summary: validation.event.summary,
            payloadRedacted: payload,
            producerTask: "task037",
        });
        return { status: "stored", inserted: true, eventId: stored.id };
    }
    list(query) {
        const limit = Math.max(1, Math.min(500, Math.floor(query.limit ?? 200)));
        const rows = listOrchestrationEvents({
            ...(query.requestId ? { correlationId: query.requestId } : {}),
            ...(query.requestGroupId ? { requestGroupId: query.requestGroupId } : {}),
            ...(query.runId ? { runId: query.runId } : {}),
            limit: Math.min(2_000, limit * 4),
        }).filter((row) => row.source === SOURCE && row.event_kind.startsWith(EVENT_PREFIX));
        const events = [];
        const issues = [];
        for (const row of rows) {
            const mapped = mapStoredRow(row);
            if (mapped.status === "issue") {
                issues.push({ code: mapped.code, eventId: row.id });
            }
            else if (matchesQuery(mapped.event, query) && events.length < limit) {
                events.push(mapped.event);
            }
        }
        return { events, issues };
    }
}
//# sourceMappingURL=typed-observability-event-repository.js.map