import { createLogger } from "../logger/index.js";
import { advanceGatewayStartupEvidence, initializeGatewayStartupEvidence, } from "./gateway-startup-evidence.js";
import { beginGatewayStartup, getGatewayStartupSnapshot, transitionGatewayReadiness, } from "./gateway-readiness.js";
export function createGatewayStartupLogPort(sink = createLogger("runtime:startup")) {
    return Object.freeze({
        product(event) {
            sink.product("gateway_startup_transition", event);
        },
        fieldDebug(event) {
            sink.fieldDebug("gateway_startup_diagnostic", event);
        },
    });
}
export async function startGatewayStartup(input) {
    const begun = beginGatewayStartup(input);
    if (begun.status === "rejected")
        return begun;
    const initialEvidence = await initializeGatewayStartupEvidence({
        port: input.evidencePort,
        snapshot: begun.startup,
    });
    input.logger?.product(Object.freeze({
        event: "started",
        startupId: begun.startup.startupId,
        elapsedMs: 0,
        reasonCode: null,
    }));
    if (initialEvidence.status !== "stored") {
        input.logger?.fieldDebug(Object.freeze({
            event: "evidence_unavailable",
            startupId: begun.startup.startupId,
            state: begun.startup.state,
            reasonCode: initialEvidence.reasonCode,
        }));
    }
    const progress = Object.freeze({
        startupId: input.startupId,
        pid: input.pid,
        getSnapshot() {
            return getGatewayStartupSnapshot();
        },
        async advance(event) {
            const current = getGatewayStartupSnapshot();
            if (current.startupId !== input.startupId || current.pid !== input.pid) {
                return { status: "rejected", reasonCode: "startup_identity_mismatch" };
            }
            const transition = transitionGatewayReadiness(event);
            if (transition.status === "rejected")
                return transition;
            const evidence = await advanceGatewayStartupEvidence({
                port: input.evidencePort,
                startupId: input.startupId,
                pid: input.pid,
                event,
            });
            if (evidence.status !== "stored") {
                input.logger?.fieldDebug(Object.freeze({
                    event: "evidence_unavailable",
                    startupId: transition.startup.startupId,
                    state: transition.startup.state,
                    reasonCode: evidence.reasonCode,
                }));
            }
            if (transition.startup.state === "ready" ||
                transition.startup.state === "failed" ||
                transition.startup.state === "cancelled") {
                input.logger?.product(Object.freeze({
                    event: transition.startup.state,
                    startupId: transition.startup.startupId,
                    elapsedMs: transition.startup.changedAt - transition.startup.startedAt,
                    reasonCode: transition.startup.reasonCode,
                }));
            }
            return {
                status: "advanced",
                evidence: evidence.status === "stored" ? "stored" : "unavailable",
                snapshot: transition.startup,
            };
        },
    });
    return {
        status: "started",
        evidence: initialEvidence.status === "stored" ? "stored" : "unavailable",
        progress,
    };
}
//# sourceMappingURL=gateway-startup-coordinator.js.map