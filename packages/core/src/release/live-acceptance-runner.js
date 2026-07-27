import { collectLiveAcceptancePayload, } from "./live-acceptance-collector.js";
import { createLiveAcceptanceSigningRequest, } from "./live-acceptance-signing-exchange.js";
export function createSigningRequestPayloadSink(input) {
    return Object.freeze({
        async write(payload) {
            const created = createLiveAcceptanceSigningRequest({
                value: payload,
                expectedCandidate: input.candidate,
                requestedKeyId: input.requestedKeyId,
                now: input.now,
            });
            if (created.status === "rejected")
                return created;
            try {
                return await input.requestSink.write(created.request);
            }
            catch {
                return { status: "rejected", reasonCode: "live_signing_request_write_failed" };
            }
        },
    });
}
export async function runLiveAcceptanceCollection(input) {
    const events = [{ state: "initialized" }];
    const stages = [
        { id: "channels", capabilities: ["webui", "telegram", "slack"] },
        { id: "web", capabilities: ["web"] },
        { id: "extensions", capabilities: ["skill", "mcp"] },
        { id: "yeonjang", capabilities: ["yeonjang"] },
    ];
    const produced = new Map();
    let failed = false;
    for (const stage of stages) {
        if (input.isCancelled()) {
            events.push({ state: "cancelled", stage: stage.id });
            return {
                status: "cancelled",
                blockers: Object.freeze(stage.capabilities.map((capability) => ({
                    capability,
                    reasonCode: "live_collection_cancelled",
                }))),
                events: Object.freeze(events),
            };
        }
        if (failed && input.failurePolicy === "stop_on_failure") {
            produced.set(stage.id, unavailableResult(input.candidate, stage.capabilities, "live_stage_skipped"));
            continue;
        }
        events.push({ state: "executing", stage: stage.id });
        let result;
        try {
            result = await input.ports[stage.id].execute({
                candidate: Object.freeze({ ...input.candidate }),
                observedAt: input.now,
                requiredCapabilities: stage.capabilities,
            });
        }
        catch {
            result = { status: "unavailable", reasonCode: "live_stage_execution_failed" };
        }
        events.push({ state: "validating", stage: stage.id });
        if (result.status === "unavailable") {
            failed = true;
            produced.set(stage.id, unavailableResult(input.candidate, stage.capabilities, result.reasonCode));
        }
        else {
            if (result.result.rejected.length > 0)
                failed = true;
            produced.set(stage.id, {
                candidate: Object.freeze({ ...input.candidate }),
                result: result.result,
            });
        }
    }
    const collection = collectLiveAcceptancePayload({
        candidate: input.candidate,
        approval: input.approval,
        channels: requiredResult(produced, "channels"),
        web: requiredResult(produced, "web"),
        extensions: requiredResult(produced, "extensions"),
        yeonjang: requiredResult(produced, "yeonjang"),
        now: input.now,
        maxEvidenceAgeMs: input.maxEvidenceAgeMs,
    });
    if (collection.status === "blocked") {
        events.push({ state: "blocked" });
        return {
            status: "blocked",
            blockers: collection.blockers,
            events: Object.freeze(events),
        };
    }
    events.push({ state: "coverage_complete" });
    if (input.isCancelled()) {
        events.push({ state: "cancelled" });
        return {
            status: "cancelled",
            blockers: Object.freeze([
                { capability: "collection", reasonCode: "live_collection_cancelled" },
            ]),
            events: Object.freeze(events),
        };
    }
    let writeResult;
    try {
        writeResult = await input.payloadSink.write(collection.payload);
    }
    catch {
        writeResult = { status: "rejected", reasonCode: "live_payload_write_failed" };
    }
    if (writeResult.status === "rejected") {
        events.push({ state: "blocked" });
        return {
            status: "blocked",
            blockers: Object.freeze([{ capability: "collection", reasonCode: writeResult.reasonCode }]),
            events: Object.freeze(events),
        };
    }
    events.push({ state: "payload_written" });
    return {
        status: "collected",
        payload: collection.payload,
        events: Object.freeze(events),
    };
}
function unavailableResult(candidate, capabilities, reasonCode) {
    return {
        candidate: Object.freeze({ ...candidate }),
        result: {
            accepted: [],
            rejected: capabilities.map((capability) => ({
                scenarioId: `${capability}-live`,
                capability,
                reasonCode,
            })),
        },
    };
}
function requiredResult(values, stage) {
    const value = values.get(stage);
    if (!value)
        throw new Error(`live_collection_stage_missing:${stage}`);
    return value;
}
//# sourceMappingURL=live-acceptance-runner.js.map