import { eventBus } from "../../events/index.js";
import { createLogger } from "../../logger/index.js";
import { recordLatencyMetric } from "../../observability/latency.js";
import { listRunsForActiveRequestGroups } from "../../runs/store.js";
import { listPendingInteractions, resolvePendingInteraction } from "../../tools/runtime-dispatcher.js";
import { redactUiValue } from "../../ui/redaction.js";
import { authMiddleware } from "../middleware/auth.js";
const log = createLogger("api:ws");
const clients = new Set();
const REDACTED_RAW_PAYLOAD_REF = "[redacted-raw-payload-ref]";
export function getWebUiWsClientCount() {
    return clients.size;
}
function broadcast(data) {
    const msg = JSON.stringify(projectWebUiBroadcastPayload(data));
    for (const ws of clients) {
        if (ws.readyState === 1 /* OPEN */) {
            ws.send(msg);
        }
    }
}
export function projectWebUiBroadcastPayload(data) {
    return redactWebUiTransportValue(stampBroadcastPayload(data));
}
function stampBroadcastPayload(data) {
    if (!data || typeof data !== "object" || Array.isArray(data))
        return data;
    const record = data;
    if (typeof record.emittedAt === "number")
        return data;
    return {
        ...record,
        emittedAt: Date.now(),
    };
}
export function redactWebUiTransportValue(value) {
    return redactUiValue(value, { audience: "advanced" }).value;
}
export function projectToolBeforeForWebUi(event) {
    return {
        type: "tool.before",
        ...event,
        params: redactWebUiTransportValue(event.params),
    };
}
export function projectRunEventForWebUi(type, event) {
    return {
        type,
        ...redactWebUiTransportValue(event),
    };
}
export function projectScheduleEventForWebUi(type, event) {
    return {
        type,
        ...redactWebUiTransportValue(event),
    };
}
export function projectControlEventForWebUi(event) {
    return {
        type: "control.event",
        ...redactWebUiTransportValue(event),
    };
}
export function projectOrchestrationEventForWebUi(event) {
    const redacted = redactWebUiTransportValue(event);
    return {
        type: "orchestration.event",
        ...redacted,
        payloadRawRef: redacted.payloadRawRef ? REDACTED_RAW_PAYLOAD_REF : null,
    };
}
export function projectApprovalRequestForWebUi(event) {
    return {
        type: "approval.request",
        ...(event.approvalId ? { approvalId: event.approvalId } : {}),
        runId: event.runId,
        toolName: event.toolName,
        params: redactWebUiTransportValue(event.params),
        ...(event.kind ? { kind: event.kind } : {}),
        ...(typeof event.guidance === "string" ? { guidance: redactWebUiTransportValue(event.guidance) } : {}),
        ...(event.expiresAt !== undefined ? { expiresAt: event.expiresAt } : {}),
    };
}
// Forward event bus events to all WebSocket clients
function setupEventForwarding() {
    eventBus.on("agent.start", (e) => broadcast({ type: "agent.start", ...e }));
    eventBus.on("agent.stream", (e) => broadcast({ type: "agent.stream", ...e }));
    eventBus.on("agent.artifact", (e) => broadcast({ type: "agent.artifact", ...e }));
    eventBus.on("agent.end", (e) => broadcast({ type: "agent.end", ...e }));
    eventBus.on("control.event", (e) => broadcast(projectControlEventForWebUi(e)));
    eventBus.on("orchestration.event", (e) => broadcast(projectOrchestrationEventForWebUi(e)));
    eventBus.on("run.created", (e) => broadcast(projectRunEventForWebUi("run.created", e)));
    eventBus.on("run.status", (e) => broadcast(projectRunEventForWebUi("run.status", e)));
    eventBus.on("run.step.started", (e) => broadcast(projectRunEventForWebUi("run.step.started", e)));
    eventBus.on("run.step.completed", (e) => broadcast(projectRunEventForWebUi("run.step.completed", e)));
    eventBus.on("run.progress", (e) => broadcast(projectRunEventForWebUi("run.progress", e)));
    eventBus.on("run.summary", (e) => broadcast(projectRunEventForWebUi("run.summary", e)));
    eventBus.on("run.completed", (e) => broadcast(projectRunEventForWebUi("run.completed", e)));
    eventBus.on("run.failed", (e) => broadcast(projectRunEventForWebUi("run.failed", e)));
    eventBus.on("run.cancel.requested", (e) => broadcast({ type: "run.cancel.requested", ...e }));
    eventBus.on("run.cancelled", (e) => broadcast(projectRunEventForWebUi("run.cancelled", e)));
    eventBus.on("tool.before", (e) => broadcast(projectToolBeforeForWebUi(e)));
    eventBus.on("tool.after", (e) => broadcast({ type: "tool.after", ...e }));
    eventBus.on("approval.request", (event) => {
        const { approvalId, runId, toolName, resolve } = event;
        registerApprovalFromWs(runId, resolve, approvalId);
        log.info(`approval.request registered for approvalId=${approvalId ?? "none"} runId=${runId} tool=${toolName}`);
        broadcast(projectApprovalRequestForWebUi(event));
    });
    eventBus.on("approval.resolved", (e) => {
        pendingApprovals.delete(e.runId);
        if (e.approvalId)
            pendingApprovals.delete(e.approvalId);
        log.info(`approval.resolved runId=${e.runId} decision=${e.decision} tool=${e.toolName}`);
        broadcast({ type: "approval.resolved", ...e });
    });
    eventBus.on("schedule.created", (e) => broadcast(projectScheduleEventForWebUi("schedule.created", e)));
    eventBus.on("schedule.cancelled", (e) => broadcast(projectScheduleEventForWebUi("schedule.cancelled", e)));
    eventBus.on("schedule.run.start", (e) => broadcast(projectScheduleEventForWebUi("schedule.run.start", e)));
    eventBus.on("schedule.run.complete", (e) => broadcast(projectScheduleEventForWebUi("schedule.run.complete", e)));
    eventBus.on("schedule.run.failed", (e) => broadcast(projectScheduleEventForWebUi("schedule.run.failed", e)));
}
// Map of runId → approval resolve fn (for WebSocket-based approval)
const pendingApprovals = new Map();
export function registerApprovalFromWs(runId, resolve, approvalId) {
    pendingApprovals.set(runId, resolve);
    if (approvalId)
        pendingApprovals.set(approvalId, resolve);
}
export function resolveRegisteredWebUiApproval(input) {
    const resolve = input.approvalId
        ? (pendingApprovals.get(input.approvalId) ?? pendingApprovals.get(input.runId))
        : pendingApprovals.get(input.runId);
    if (resolve) {
        resolve(input.decision, "user");
        pendingApprovals.delete(input.runId);
        if (input.approvalId)
            pendingApprovals.delete(input.approvalId);
        return true;
    }
    try {
        return resolvePendingInteraction(input.runId, input.decision);
    }
    catch {
        return false;
    }
}
export function resolveWebUiApprovalResponse(msg) {
    if (msg.type !== "approval.respond" || !msg.runId)
        return false;
    log.info(`approval.respond received runId=${msg.runId} decision=${typeof msg.decision === "string" ? msg.decision : "unknown"} tool=${typeof msg.toolName === "string" ? msg.toolName : "unknown"}`);
    const decision = msg.decision === "allow_run"
        ? "allow_run"
        : msg.decision === "allow_once"
            ? "allow_once"
            : "deny";
    if (resolveRegisteredWebUiApproval({
        ...(typeof msg.approvalId === "string" ? { approvalId: msg.approvalId } : {}),
        runId: msg.runId,
        decision,
    })) {
        eventBus.emit("approval.resolved", {
            ...(typeof msg.approvalId === "string" ? { approvalId: msg.approvalId } : {}),
            runId: msg.runId,
            decision,
            toolName: typeof msg.toolName === "string" ? msg.toolName : "unknown",
            reason: "user",
        });
        return true;
    }
    log.warn(`approval.respond ignored: no pending resolver for runId=${msg.runId}`);
    return false;
}
export function resolveWebUiLiveUpdateAck(msg, now = () => Date.now()) {
    if (msg.type !== "ui.live_update_ack" ||
        typeof msg.emittedAt !== "number" ||
        !Number.isFinite(msg.emittedAt)) {
        return false;
    }
    recordLatencyMetric({
        name: "webui_live_update_latency_ms",
        durationMs: Math.max(0, now() - msg.emittedAt),
        ...(typeof msg.runId === "string" ? { runId: msg.runId } : {}),
        ...(typeof msg.sessionId === "string" ? { sessionId: msg.sessionId } : {}),
        ...(typeof msg.requestGroupId === "string" ? { requestGroupId: msg.requestGroupId } : {}),
        source: typeof msg.source === "string" && msg.source.trim().length > 0 ? msg.source : "webui",
        detail: {
            eventType: typeof msg.eventType === "string" ? msg.eventType : "unknown",
        },
    });
    return true;
}
export function resetWebUiApprovalStateForTest() {
    pendingApprovals.clear();
}
export function registerWsRoute(app) {
    setupEventForwarding();
    app.get("/ws", { websocket: true, preHandler: authMiddleware }, (socket) => {
        clients.add(socket);
        log.info(`WebSocket client connected (total: ${clients.size})`);
        socket.send(JSON.stringify({
            type: "ws.init",
            runs: listRunsForActiveRequestGroups(200, 400),
            pendingInteractions: listPendingInteractions(),
        }));
        socket.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                resolveWebUiApprovalResponse(msg);
                resolveWebUiLiveUpdateAck(msg);
            }
            catch {
                /* ignore malformed messages */
            }
        });
        socket.on("close", () => {
            clients.delete(socket);
            log.info(`WebSocket client disconnected (total: ${clients.size})`);
        });
    });
}
//# sourceMappingURL=stream.js.map