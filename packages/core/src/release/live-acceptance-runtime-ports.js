import { produceChannelLiveAcceptanceEvidence } from "./channel-live-acceptance-evidence.js";
import { produceExtensionLiveAcceptanceEvidence } from "./extension-live-acceptance-evidence.js";
import { createSigningRequestPayloadSink, runLiveAcceptanceCollection, } from "./live-acceptance-runner.js";
import { produceWebLiveAcceptanceEvidence } from "./web-live-acceptance-evidence.js";
import { produceYeonjangLiveAcceptanceEvidence } from "./yeonjang-live-acceptance-evidence.js";
export function createLiveAcceptanceRuntimePorts(input) {
    const preflight = Object.freeze({
        capturedAt: input.preflight.capturedAt,
        stages: Object.freeze(Object.fromEntries(Object.entries(input.preflight.stages).map(([stage, readiness]) => [
            stage,
            Object.freeze({ ...readiness }),
        ]))),
    });
    const expected = {
        channels: ["webui", "telegram", "slack"],
        web: ["web"],
        extensions: ["skill", "mcp"],
        yeonjang: ["yeonjang"],
    };
    function port(stage) {
        return Object.freeze({
            async execute(context) {
                const readiness = preflight.stages[stage];
                if (readiness.status === "unavailable")
                    return readiness;
                if (input.maxPreflightAgeMs <= 0 ||
                    preflight.capturedAt > context.observedAt ||
                    context.observedAt - preflight.capturedAt > input.maxPreflightAgeMs) {
                    return {
                        status: "unavailable",
                        reasonCode: "live_preflight_stale",
                    };
                }
                if (context.requiredCapabilities.length !== expected[stage].length ||
                    context.requiredCapabilities.some((capability, index) => capability !== expected[stage][index])) {
                    return {
                        status: "unavailable",
                        reasonCode: "live_stage_capability_contract_mismatch",
                    };
                }
                if (stage === "channels") {
                    return {
                        status: "produced",
                        result: produceChannelLiveAcceptanceEvidence(await input.executors.channels(context)),
                    };
                }
                if (stage === "web") {
                    return {
                        status: "produced",
                        result: produceWebLiveAcceptanceEvidence({
                            run: await input.executors.web(context),
                            now: context.observedAt,
                            maxSourceAgeMs: input.maxWebSourceAgeMs,
                        }),
                    };
                }
                if (stage === "extensions") {
                    return {
                        status: "produced",
                        result: produceExtensionLiveAcceptanceEvidence(await input.executors.extensions(context)),
                    };
                }
                return {
                    status: "produced",
                    result: produceYeonjangLiveAcceptanceEvidence({
                        run: await input.executors.yeonjang(context),
                        now: context.observedAt,
                        maxSessionAgeMs: input.maxYeonjangSessionAgeMs,
                    }),
                };
            },
        });
    }
    return Object.freeze({
        channels: port("channels"),
        web: port("web"),
        extensions: port("extensions"),
        yeonjang: port("yeonjang"),
    });
}
export async function runProductionLiveAcceptance(input) {
    const ports = createLiveAcceptanceRuntimePorts({
        preflight: input.preflight,
        executors: input.executors,
        maxPreflightAgeMs: input.maxPreflightAgeMs,
        maxWebSourceAgeMs: input.maxWebSourceAgeMs,
        maxYeonjangSessionAgeMs: input.maxYeonjangSessionAgeMs,
    });
    return runLiveAcceptanceCollection({
        candidate: input.candidate,
        approval: input.approval,
        ports,
        payloadSink: createSigningRequestPayloadSink({
            candidate: input.candidate,
            requestedKeyId: input.requestedKeyId,
            now: input.now,
            requestSink: input.requestSink,
        }),
        failurePolicy: input.failurePolicy,
        now: input.now,
        maxEvidenceAgeMs: input.maxEvidenceAgeMs,
        isCancelled: input.isCancelled,
    });
}
//# sourceMappingURL=live-acceptance-runtime-ports.js.map