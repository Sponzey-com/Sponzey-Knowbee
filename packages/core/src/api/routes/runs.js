import crypto from "node:crypto";
import { resolveMainAgentSelfName } from "../../agent/main-agent-identity.js";
import { createArtifactStorageContext, } from "../../artifacts/lifecycle.js";
import { exportRetrievalEvidenceTimeline, getRetrievalEvidenceTimeline, } from "../../control-plane/timeline.js";
import { listMemoryAccessTraceForRun, listTaskContinuityForLineages } from "../../db/index.js";
import { SqliteTypedObservabilityEventRepository } from "../../db/typed-observability-event-repository.js";
import { createCommandWorkspaceStorage, resolveFocusBinding, } from "../../orchestration/command-workspace.js";
import { createAgentHierarchyStorage, } from "../../orchestration/hierarchy.js";
import { buildActiveRunProjections } from "../../runs/active-run-projection.js";
import { submitUserRequest } from "../../runs/ingress.js";
import { DEFAULT_STALE_RUN_MS, buildOperationsSummary } from "../../runs/operations.js";
import { buildRunRuntimeInspectorProjection } from "../../runs/runtime-inspector-projection.js";
import { buildRuntimeInspectorTypedTrace } from "../../runs/runtime-inspector-typed-trace.js";
import { cancelRootRun, cleanupStaleRunStates, clearHistoricalRunHistory, deleteRunHistory, getRootRun, getRequestExecutionOutcome, listActiveRootRuns, listRootRuns, listRunsForRecentRequestGroups, } from "../../runs/store.js";
import { buildTaskModels } from "../../runs/task-model.js";
import { redactUiValue } from "../../ui/redaction.js";
import { authMiddleware } from "../middleware/auth.js";
import { getApiRuntimeConfig } from "../runtime-context.js";
import { createWebUiChunkDeliveryHandler } from "../ws/chunk-delivery.js";
function parseTimelineLimit(value) {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return undefined;
    return Math.min(parsed, 2_000);
}
const WEBUI_CLIENT_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
export function resolveWebUiClientRequestId(value) {
    if (value === undefined)
        return { ok: true, clientRequestId: undefined };
    if (typeof value !== "string")
        return { ok: false, reasonCode: "invalid_client_request_id" };
    const clientRequestId = value.trim();
    return WEBUI_CLIENT_REQUEST_ID_PATTERN.test(clientRequestId)
        ? { ok: true, clientRequestId }
        : { ok: false, reasonCode: "invalid_client_request_id" };
}
export function buildWebUiTransportIdentity(input) {
    const messageId = input.clientRequestId ?? input.runId;
    return {
        source: "webui",
        channelEventId: messageId,
        externalChatId: input.sessionId,
        externalThreadId: input.sessionId,
        externalMessageId: messageId,
    };
}
function projectPublicRunEvents(events) {
    return redactUiValue(events, { audience: "advanced" }).value;
}
export function buildRunExecutionOutcomes(runs, readOutcome = getRequestExecutionOutcome) {
    const outcomes = {};
    for (const run of runs) {
        const outcome = readOutcome(run.id);
        if (outcome)
            outcomes[run.id] = outcome;
    }
    return outcomes;
}
export function resolveRunTimelineAudience(value, exposureContext) {
    if (exposureContext !== "audit")
        return "user";
    return value === "developer" ? "developer" : "user";
}
function parseTimelineFormat(value) {
    return value === "json" ? "json" : "markdown";
}
function buildRuntimeInspectorResponse(run, runtimeConfig) {
    const rootAgentNameSnapshot = resolveMainAgentSelfName(runtimeConfig);
    const typedTrace = buildRuntimeInspectorTypedTrace({
        repository: new SqliteTypedObservabilityEventRepository(),
        run,
    });
    return redactUiValue({
        projection: buildRunRuntimeInspectorProjection(run, {
            rootAgentNameSnapshot,
            typedTrace,
        }),
    }, { audience: "advanced" }).value;
}
export async function startLocalRun(params) {
    const ingress = startCanonicalLocalRun(params);
    const { started, acknowledgement, requestId, source } = ingress;
    return {
        requestId,
        runId: started.runId,
        sessionId: ingress.sessionId,
        source,
        status: started.status,
        acknowledgement,
        ...(params.focusResolution
            ? {
                focus: {
                    binding: params.focusResolution.binding,
                    plannerTarget: params.focusResolution.plannerTarget,
                    enforcement: params.focusResolution.enforcement,
                },
            }
            : {}),
    };
}
export function startCanonicalLocalRun(params) {
    const runId = crypto.randomUUID();
    const sessionId = params.sessionId ?? crypto.randomUUID();
    const runtimeConfig = params.config;
    const workDir = runtimeConfig.profile.workspace;
    return submitUserRequest({
        artifactStorage: params.artifactStorage,
        memoryJournal: params.memoryJournal,
        hierarchyStorage: params.hierarchyStorage,
        config: runtimeConfig,
        message: params.message,
        model: params.model,
        runId,
        sessionId,
        workDir,
        transport: params.source === "webui"
            ? buildWebUiTransportIdentity({
                runId,
                sessionId,
                ...(params.clientRequestId ? { clientRequestId: params.clientRequestId } : {}),
            })
            : {
                source: params.source,
                channelEventId: runId,
                externalChatId: sessionId,
                externalThreadId: sessionId,
                externalMessageId: runId,
            },
        ...(params.focusResolution
            ? { orchestrationPlannerIntent: params.focusResolution.plannerIntent }
            : {}),
        ...(params.source === "webui"
            ? {
                onChunk: createWebUiChunkDeliveryHandler({
                    artifactStorage: params.artifactStorage,
                    sessionId,
                    runId,
                }),
            }
            : {}),
    });
}
export function registerRunsRoute(app, memoryJournal) {
    const artifactStorage = createArtifactStorageContext(app.knowbeeRuntimeContext.paths);
    const commandWorkspaceStorage = createCommandWorkspaceStorage(app.knowbeeRuntimeContext.paths);
    const hierarchyStorage = createAgentHierarchyStorage(app.knowbeeRuntimeContext.paths);
    function listTaskSnapshot(limitGroups, limitRuns) {
        const runs = listRunsForRecentRequestGroups(limitGroups, limitRuns);
        const continuity = listTaskContinuityForLineages(runs.map((run) => run.lineageRootRunId || run.requestGroupId || run.id));
        const tasks = buildTaskModels(runs, continuity, artifactStorage);
        return { runs, tasks };
    }
    app.get("/api/runs", { preHandler: authMiddleware }, async () => {
        const runs = listRootRuns();
        return {
            runs,
            executionOutcomes: buildRunExecutionOutcomes(runs),
            activeRunProjections: buildActiveRunProjections(runs.filter((run) => run.status === "queued" ||
                run.status === "running" ||
                run.status === "awaiting_approval" ||
                run.status === "awaiting_user")),
        };
    });
    app.get("/api/runs/active", { preHandler: authMiddleware }, async () => {
        const runs = listActiveRootRuns();
        return {
            runs,
            executionOutcomes: buildRunExecutionOutcomes(runs),
            activeRunProjections: buildActiveRunProjections(runs),
        };
    });
    app.get("/api/work/snapshot", { preHandler: authMiddleware }, async () => {
        const runs = listRootRuns();
        const taskSnapshot = listTaskSnapshot(30, 300);
        return {
            observedAt: Date.now(),
            runs,
            executionOutcomes: buildRunExecutionOutcomes(runs),
            activeRunProjections: buildActiveRunProjections(runs.filter((run) => run.status === "queued" ||
                run.status === "running" ||
                run.status === "awaiting_approval" ||
                run.status === "awaiting_user")),
            tasks: taskSnapshot.tasks,
            operationsSummary: buildOperationsSummary({
                ...taskSnapshot,
                staleThresholdMs: DEFAULT_STALE_RUN_MS,
            }),
        };
    });
    app.get("/api/tasks", { preHandler: authMiddleware }, async () => {
        return { tasks: listTaskSnapshot().tasks };
    });
    app.get("/api/runs/operations/summary", { preHandler: authMiddleware }, async (req) => {
        const staleMs = Number.parseInt(req.query.staleMs ?? "", 10);
        const snapshot = listTaskSnapshot();
        return {
            summary: buildOperationsSummary({
                ...snapshot,
                staleThresholdMs: Number.isFinite(staleMs) && staleMs > 0 ? staleMs : DEFAULT_STALE_RUN_MS,
            }),
        };
    });
    app.post("/api/runs/operations/stale-cleanup", { preHandler: authMiddleware }, async (req) => {
        const staleMs = typeof req.body?.staleMs === "number" && Number.isFinite(req.body.staleMs)
            ? req.body.staleMs
            : undefined;
        const cleanup = cleanupStaleRunStates({ ...(staleMs ? { staleMs } : {}) });
        const snapshot = listTaskSnapshot();
        return {
            ok: true,
            cleanup,
            summary: buildOperationsSummary({
                ...snapshot,
                staleThresholdMs: cleanup.thresholdMs,
            }),
        };
    });
    app.get("/api/runs/:id", { preHandler: authMiddleware }, async (req, reply) => {
        const run = getRootRun(req.params.id);
        if (!run)
            return reply.status(404).send({ error: "Run not found" });
        return { run, outcome: getRequestExecutionOutcome(run.id) };
    });
    app.get("/api/runs/:id/steps", { preHandler: authMiddleware }, async (req, reply) => {
        const run = getRootRun(req.params.id);
        if (!run)
            return reply.status(404).send({ error: "Run not found" });
        return { steps: run.steps };
    });
    app.get("/api/runs/:id/timeline", { preHandler: authMiddleware }, async (req, reply) => {
        const run = getRootRun(req.params.id);
        if (!run)
            return reply.status(404).send({ error: "Run not found" });
        return { events: projectPublicRunEvents(run.recentEvents) };
    });
    app.get("/api/runs/:id/runtime-inspector", { preHandler: authMiddleware }, async (req, reply) => {
        const run = getRootRun(req.params.id);
        if (!run)
            return reply.status(404).send({ error: "Run not found" });
        const runtimeConfig = getApiRuntimeConfig(req);
        return buildRuntimeInspectorResponse(run, runtimeConfig);
    });
    app.get("/api/runs/:id/retrieval-timeline", { preHandler: authMiddleware }, async (req, reply) => {
        const run = getRootRun(req.params.id);
        if (!run)
            return reply.status(404).send({ error: "Run not found" });
        const limit = parseTimelineLimit(req.query.limit);
        return {
            timeline: getRetrievalEvidenceTimeline({
                requestGroupId: run.requestGroupId || run.id,
                ...(limit !== undefined ? { limit } : {}),
            }, resolveRunTimelineAudience(req.query.audience, "public")),
        };
    });
    app.get("/api/runs/:id/retrieval-timeline/export", { preHandler: authMiddleware }, async (req, reply) => {
        const run = getRootRun(req.params.id);
        if (!run)
            return reply.status(404).send({ error: "Run not found" });
        const limit = parseTimelineLimit(req.query.limit);
        return {
            export: exportRetrievalEvidenceTimeline({
                requestGroupId: run.requestGroupId || run.id,
                audience: resolveRunTimelineAudience(req.query.audience, "public"),
                format: parseTimelineFormat(req.query.format),
                ...(limit !== undefined ? { limit } : {}),
            }),
        };
    });
    app.get("/api/runs/:id/memory-trace", { preHandler: authMiddleware }, async (req, reply) => {
        const run = getRootRun(req.params.id);
        if (!run)
            return reply.status(404).send({ error: "Run not found" });
        const parsedLimit = Number.parseInt(req.query.limit ?? "", 10);
        return {
            traces: listMemoryAccessTraceForRun(req.params.id, Number.isFinite(parsedLimit) ? parsedLimit : 100),
        };
    });
    app.post("/api/runs", { preHandler: authMiddleware }, async (req, reply) => {
        const message = req.body?.message?.trim();
        if (!message)
            return reply.status(400).send({ error: "message is required" });
        const clientRequestId = resolveWebUiClientRequestId(req.body.clientRequestId);
        if (!clientRequestId.ok) {
            return reply.status(400).send({
                error: clientRequestId.reasonCode,
                reasonCode: clientRequestId.reasonCode,
            });
        }
        const runtimeConfig = getApiRuntimeConfig(req);
        const focusThreadId = req.body.focusThreadId?.trim();
        const parentAgentId = req.body.parentAgentId?.trim();
        const focusResolution = focusThreadId
            ? resolveFocusBinding({
                config: runtimeConfig,
                threadId: focusThreadId,
                ...(parentAgentId ? { parentAgentId } : {}),
            }, commandWorkspaceStorage)
            : undefined;
        if (focusResolution && !focusResolution.ok) {
            return reply.status(focusResolution.statusCode).send({
                ok: false,
                error: focusResolution.reasonCode,
                reasonCode: focusResolution.reasonCode,
                ...(focusResolution.binding ? { binding: focusResolution.binding } : {}),
                ...(focusResolution.details ? { details: focusResolution.details } : {}),
            });
        }
        return startLocalRun({
            artifactStorage,
            memoryJournal,
            hierarchyStorage,
            config: runtimeConfig,
            message,
            sessionId: req.body.sessionId,
            model: req.body.model,
            source: "webui",
            ...(clientRequestId.clientRequestId
                ? { clientRequestId: clientRequestId.clientRequestId }
                : {}),
            ...(focusResolution ? { focusResolution } : {}),
        });
    });
    app.post("/api/runs/:id/cancel", { preHandler: authMiddleware }, async (req, reply) => {
        const run = cancelRootRun(req.params.id);
        if (!run)
            return reply.status(404).send({ error: "Run not found or not cancellable" });
        return { run };
    });
    app.delete("/api/runs/history/inactive", { preHandler: authMiddleware }, async () => {
        const result = clearHistoricalRunHistory();
        return { ok: true, deletedRunCount: result.deletedRunCount };
    });
    app.delete("/api/runs/:id", { preHandler: authMiddleware }, async (req, reply) => {
        const result = deleteRunHistory(req.params.id);
        if (!result)
            return reply.status(404).send({ error: "Run not found" });
        if (result.blockedRunCount && result.blockedRunCount > 0) {
            return reply.status(409).send({
                error: "Active run history cannot be deleted",
                blockedRunCount: result.blockedRunCount,
            });
        }
        return { ok: true, deletedRunCount: result.deletedRunCount };
    });
}
//# sourceMappingURL=runs.js.map