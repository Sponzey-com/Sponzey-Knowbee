import { getDb, getTaskContinuity, insertAuditLog, insertDiagnosticEvent, interruptUnfinishedScheduleRunsOnStartup, listMessageLedgerEvents, upsertTaskContinuity } from "../db/index.js";
import { assertMigrationWriteAllowed } from "../db/migration-safety.js";
import { eventBus } from "../events/index.js";
import { getLastRuntimeManifest } from "../runtime/manifest.js";
import { validateOrchestrationPlan } from "../contracts/sub-agent-orchestration.js";
import { canTransitionRunStatus, isTerminalRunStatus, projectRequestExecutionOutcome, resolveRunFlowIdentifiers, } from "./flow-contract.js";
import { finalizeDeliveryForRun, messageLedgerEventHasRequiredDeliveryEvidence, recordMessageLedgerEvent, } from "./message-ledger.js";
import { buildStartupRecoverySummary, classifyStartupRecovery, setLastStartupRecoverySummary, summarizeInterruptedScheduleRun } from "./startup-recovery.js";
import { DEFAULT_RUN_STEPS } from "./types.js";
import { decideCleanupCandidate } from "../maintenance/cleanup-decision.js";
import { canonicalWorkIdForRootRun, createCanonicalWorkAggregate, } from "../contracts/canonical-work-aggregate.js";
import { SqliteCanonicalWorkRepository } from "../db/canonical-work-repository.js";
import { SqliteCanonicalPendingResponseRepository } from "../db/canonical-pending-response-repository.js";
import { SqliteCanonicalWorkReceiptRepository } from "../db/canonical-work-receipt-repository.js";
import { SqliteSideEffectOperationRepository } from "../db/side-effect-operation-repository.js";
import { validateCanonicalWorkReceiptForEvent } from "../contracts/canonical-work-receipt.js";
import { executeCanonicalWorkTransition, } from "./canonical-work-transition-use-case.js";
import { classifyCanonicalStartupRecovery } from "./canonical-startup-recovery.js";
import { buildCanonicalRecoveredDeliveryDescriptor, recordCanonicalFinalizationTransition, } from "./canonical-finalization-lifecycle.js";
import { SqliteTypedObservabilityEventRepository } from "../db/typed-observability-event-repository.js";
import { recordCanonicalRequestReceivedObservability, recordCanonicalTransitionObservability, } from "../observability/canonical-transition-events.js";
import { createLogger, redactLogText } from "../logger/index.js";
const log = createLogger("runs:store");
const activeRunControllers = new Map();
const ACTIVE_WORKER_SESSION_STATUSES = ["queued", "running", "awaiting_approval", "awaiting_user"];
const ACTIVE_REQUEST_GROUP_STATUSES = ["queued", "running", "awaiting_approval", "awaiting_user"];
const DEFAULT_STALE_RUN_CLEANUP_MS = 30 * 60 * 1000;
function truncateTitle(prompt) {
    const normalized = prompt.trim().replace(/\s+/g, " ");
    return normalized.length > 72 ? `${normalized.slice(0, 72)}…` : normalized;
}
function isActiveRequestGroupStatus(status) {
    return ACTIVE_REQUEST_GROUP_STATUSES.includes(status);
}
function mapStep(row) {
    return {
        key: row.step_key,
        title: row.title,
        index: row.step_index,
        status: row.status,
        summary: row.summary,
        ...(row.started_at ? { startedAt: row.started_at } : {}),
        ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    };
}
function mapEvent(row) {
    return {
        id: row.id,
        at: row.at,
        label: row.label,
    };
}
function parsePromptSourceSnapshot(value) {
    if (!value)
        return undefined;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function parseOrchestrationModeFromSnapshot(snapshot) {
    const orchestration = snapshot?.orchestration;
    if (!orchestration || typeof orchestration !== "object" || Array.isArray(orchestration))
        return undefined;
    const mode = orchestration.mode;
    return mode === "single_knowbee" || mode === "orchestration" ? mode : undefined;
}
function parseOrchestrationPlanFromSnapshot(snapshot) {
    const validation = validateOrchestrationPlan(snapshot?.orchestrationPlan);
    return validation.ok ? validation.value : undefined;
}
function hydrateRun(row) {
    const db = getDb();
    assertMigrationWriteAllowed(db, "run.create");
    const promptSourceSnapshot = parsePromptSourceSnapshot(row.prompt_source_snapshot);
    const orchestrationMode = parseOrchestrationModeFromSnapshot(promptSourceSnapshot);
    const orchestrationPlanSnapshot = parseOrchestrationPlanFromSnapshot(promptSourceSnapshot);
    const steps = db
        .prepare(`SELECT run_id, step_key, title, step_index, status, summary, started_at, finished_at
       FROM run_steps WHERE run_id = ? ORDER BY step_index ASC`)
        .all(row.id)
        .map(mapStep);
    const recentEvents = db
        .prepare(`SELECT id, run_id, at, label
       FROM run_events WHERE run_id = ? ORDER BY at DESC LIMIT 12`)
        .all(row.id)
        .map(mapEvent)
        .sort((a, b) => a.at - b.at);
    return {
        id: row.id,
        sessionId: row.session_id,
        requestGroupId: row.request_group_id || row.id,
        lineageRootRunId: row.lineage_root_run_id || row.request_group_id || row.id,
        runScope: row.run_scope ?? "root",
        ...(row.parent_run_id ? { parentRunId: row.parent_run_id } : {}),
        ...(row.handoff_summary ? { handoffSummary: row.handoff_summary } : {}),
        title: row.title,
        prompt: row.prompt,
        source: row.source,
        status: row.status,
        taskProfile: row.task_profile,
        ...(row.target_id ? { targetId: row.target_id } : {}),
        ...(row.target_label ? { targetLabel: row.target_label } : {}),
        ...(row.worker_runtime_kind ? { workerRuntimeKind: row.worker_runtime_kind } : {}),
        ...(row.worker_session_id ? { workerSessionId: row.worker_session_id } : {}),
        contextMode: row.context_mode ?? "full",
        ...(orchestrationMode ? { orchestrationMode } : {}),
        ...(orchestrationPlanSnapshot ? { orchestrationPlanSnapshot } : {}),
        delegationTurnCount: row.delegation_turn_count,
        maxDelegationTurns: row.max_delegation_turns,
        ...(row.runtime_manifest_id ? { runtimeManifestId: row.runtime_manifest_id } : {}),
        currentStepKey: row.current_step_key,
        currentStepIndex: row.current_step_index,
        totalSteps: row.total_steps,
        summary: row.summary,
        canCancel: Boolean(row.can_cancel),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        steps,
        recentEvents,
        ...(promptSourceSnapshot ? { promptSourceSnapshot } : {}),
    };
}
function buildSqlPlaceholders(count) {
    return Array.from({ length: count }, () => "?").join(", ");
}
function resolveLineageKey(row) {
    return row.lineage_root_run_id || row.request_group_id || row.id;
}
function selectRunRowsForLineage(lineageKey) {
    return getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE COALESCE(lineage_root_run_id, request_group_id, id) = ?
       ORDER BY created_at ASC, updated_at ASC`)
        .all(lineageKey);
}
function deleteRunRows(params) {
    const { runIds, requestGroupIds } = params;
    if (runIds.length === 0)
        return 0;
    for (const runId of runIds) {
        const controller = activeRunControllers.get(runId);
        if (controller)
            controller.abort();
        clearActiveRunController(runId);
    }
    const db = getDb();
    const tx = db.transaction(() => {
        const runPlaceholders = buildSqlPlaceholders(runIds.length);
        db.prepare(`DELETE FROM messages WHERE root_run_id IN (${runPlaceholders})`).run(...runIds);
        db.prepare(`DELETE FROM channel_message_refs WHERE root_run_id IN (${runPlaceholders})`).run(...runIds);
        if (requestGroupIds.length > 0) {
            const requestGroupPlaceholders = buildSqlPlaceholders(requestGroupIds.length);
            db.prepare(`DELETE FROM channel_message_refs WHERE request_group_id IN (${requestGroupPlaceholders})`).run(...requestGroupIds);
        }
        db.prepare(`DELETE FROM root_runs WHERE id IN (${runPlaceholders})`).run(...runIds);
    });
    tx();
    return runIds.length;
}
export function listRootRuns(limit = 50) {
    return getDb()
        .prepare(`SELECT *
       FROM root_runs
       ORDER BY created_at DESC, updated_at DESC
       LIMIT ?`)
        .all(limit)
        .map(hydrateRun);
}
export function listActiveRootRuns(limit = 100) {
    return getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE status IN ('queued', 'running', 'awaiting_approval', 'awaiting_user')
       ORDER BY created_at DESC, updated_at DESC
       LIMIT ?`)
        .all(limit)
        .map(hydrateRun);
}
export function listActiveSessionRequestGroups(sessionId, excludingRunId) {
    const rows = excludingRunId
        ? getDb()
            .prepare(`SELECT *
           FROM root_runs
           WHERE session_id = ?
             AND id <> ?
             AND status IN ('queued', 'running', 'awaiting_approval', 'awaiting_user')
           ORDER BY updated_at DESC`)
            .all(sessionId, excludingRunId)
        : getDb()
            .prepare(`SELECT *
           FROM root_runs
           WHERE session_id = ?
             AND status IN ('queued', 'running', 'awaiting_approval', 'awaiting_user')
           ORDER BY updated_at DESC`)
            .all(sessionId);
    const grouped = new Map();
    for (const run of rows.map(hydrateRun)) {
        if (!grouped.has(run.requestGroupId))
            grouped.set(run.requestGroupId, run);
    }
    return [...grouped.values()];
}
export function listRunsForActiveRequestGroups(limitGroups = 100, limitRuns = 300) {
    const activeGroups = [...new Set(listActiveRootRuns(limitGroups).map((run) => run.requestGroupId))];
    if (activeGroups.length === 0)
        return [];
    const placeholders = activeGroups.map(() => "?").join(", ");
    return getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE request_group_id IN (${placeholders})
       ORDER BY updated_at DESC
       LIMIT ?`)
        .all(...activeGroups, limitRuns)
        .map(hydrateRun);
}
export function listRunsForRecentRequestGroups(limitGroups = 120, limitRuns = 1000) {
    const groups = getDb()
        .prepare(`SELECT COALESCE(lineage_root_run_id, request_group_id, id) AS lineage_key, MAX(updated_at) AS latest_updated
       FROM root_runs
       GROUP BY COALESCE(lineage_root_run_id, request_group_id, id)
       ORDER BY latest_updated DESC
       LIMIT ?`)
        .all(limitGroups)
        .map((row) => row.lineage_key)
        .filter((value) => typeof value === "string" && value.length > 0);
    if (groups.length === 0)
        return [];
    const placeholders = groups.map(() => "?").join(", ");
    return getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE COALESCE(lineage_root_run_id, request_group_id, id) IN (${placeholders})
       ORDER BY updated_at DESC
       LIMIT ?`)
        .all(...groups, limitRuns)
        .map(hydrateRun);
}
const terminalCanonicalRecoveryStates = new Set([
    "SUCCEEDED",
    "PARTIALLY_SUCCEEDED",
    "BLOCKED",
    "EXHAUSTED",
    "CANCELLED",
    "USER_REPORT",
]);
function recordCanonicalStartupReconciliation(params) {
    const recoveryKey = [
        "canonical-startup-reconciliation",
        params.run.id,
        params.aggregateWorkId,
        params.aggregateRevision,
        params.reasonCode,
    ].join(":");
    const existing = getDb()
        .prepare(`SELECT id
       FROM diagnostic_events
       WHERE recovery_key = ?
       LIMIT 1`)
        .get(recoveryKey);
    if (existing)
        return;
    insertDiagnosticEvent({
        kind: "canonical_startup_reconciliation_required",
        summary: params.reasonCode === "canonical_recovery_manifest_mismatch"
            ? "현재 runtime manifest와 실행 snapshot이 달라 자동 재실행을 차단했습니다."
            : "종료된 실행과 미완료 canonical 상태의 불일치를 자동 변경 없이 격리했습니다.",
        runId: params.run.id,
        sessionId: params.run.sessionId,
        requestGroupId: params.run.requestGroupId,
        recoveryKey,
        detail: {
            reasonCode: params.reasonCode,
            rootRunStatus: params.run.status,
            aggregateState: params.aggregateState,
            aggregateRevision: params.aggregateRevision,
            aggregateWorkId: params.aggregateWorkId,
            runtimeManifestMatches: runtimeManifestMatches(params.run),
            storedRuntimeManifestId: params.run.runtimeManifestId,
            activeRuntimeManifestId: getLastRuntimeManifest()?.id,
        },
    });
}
function runtimeManifestMatches(run) {
    return !run.runtimeManifestId || run.runtimeManifestId === getLastRuntimeManifest()?.id;
}
export function recoverActiveRunsOnStartup() {
    const canonicalRepository = new SqliteCanonicalWorkRepository(getDb(), () => Date.now());
    const pendingResponseRepository = new SqliteCanonicalPendingResponseRepository(getDb(), () => Date.now());
    const sideEffectRepository = new SqliteSideEffectOperationRepository(getDb(), () => Date.now());
    const recoverableAggregates = canonicalRepository.listRecoverable(1_000);
    const activeById = new Map(listActiveRootRuns(200).map((run) => [run.id, run]));
    for (const aggregate of recoverableAggregates) {
        const run = getRootRun(aggregate.rootRunId);
        if (run)
            activeById.set(run.id, run);
    }
    const activeRuns = [...activeById.values()];
    const recovered = [];
    const runSummaries = [];
    for (const run of activeRuns) {
        const continuity = getTaskContinuity(run.lineageRootRunId);
        const aggregate = recoverableAggregates.find((candidate) => candidate.rootRunId === run.id);
        if (aggregate
            && isTerminalRunStatus(run.status)
            && !terminalCanonicalRecoveryStates.has(aggregate.state)) {
            const reasonCode = runtimeManifestMatches(run)
                ? "terminal_root_run_with_nonterminal_aggregate"
                : "canonical_recovery_manifest_mismatch";
            recordCanonicalStartupReconciliation({
                run,
                aggregateState: aggregate.state,
                aggregateRevision: aggregate.revision,
                aggregateWorkId: aggregate.workId,
                reasonCode,
            });
            runSummaries.push({
                runId: run.id,
                lineageRootRunId: run.lineageRootRunId,
                previousStatus: run.status,
                recoveryStatus: "stale",
                summary: reasonCode === "canonical_recovery_manifest_mismatch"
                    ? "runtime manifest 불일치를 기존 실행 이력 변경 없이 격리했습니다."
                    : "종료된 실행의 canonical 상태 불일치를 reconciliation 대상으로 격리했습니다.",
                pendingApprovals: [],
                pendingDelivery: [],
                duplicateRisk: false,
            });
            continue;
        }
        const responseArtifactAvailable = (() => {
            if (!aggregate)
                return false;
            try {
                const pending = pendingResponseRepository.loadPending(run.id);
                if (!pending || pending.workId !== aggregate.workId)
                    return false;
                if (!pending.reviewEnvelope || pending.reviewIssue)
                    return false;
                const expectedOutcome = aggregate.state === "SUCCEEDED"
                    ? "succeeded"
                    : aggregate.state === "PARTIALLY_SUCCEEDED"
                        ? "partial"
                        : aggregate.state === "BLOCKED"
                            ? "blocked"
                            : aggregate.state === "EXHAUSTED"
                                ? "exhausted"
                                : aggregate.state === "CANCELLED"
                                    ? "cancelled"
                                    : undefined;
                return expectedOutcome !== undefined && pending.finalOutcome === expectedOutcome;
            }
            catch {
                return false;
            }
        })();
        const committedDelivery = aggregate && aggregate.revision > 0
            ? listMessageLedgerEvents({ runId: run.id, limit: 1_000 }).find((event) => event.event_kind === "final_answer_delivered"
                && (event.status === "delivered" || event.status === "succeeded" || event.status === "sent")
                && Boolean(event.delivery_key)
                && Boolean(event.idempotency_key)
                && messageLedgerEventHasRequiredDeliveryEvidence(event))
            : undefined;
        const canonicalDecision = aggregate && aggregate.revision > 0
            ? classifyCanonicalStartupRecovery({
                aggregate,
                rootRunStatus: run.status,
                committedFinalDelivery: Boolean(committedDelivery),
                responseArtifactAvailable,
                sideEffectReceiptAvailable: sideEffectRepository.listByRun(run.id, 1).length > 0,
                runtimeManifestMatches: runtimeManifestMatches(run),
            })
            : undefined;
        if (aggregate
            && canonicalDecision?.kind === "manual_intervention"
            && canonicalDecision.reasonCode === "canonical_recovery_manifest_mismatch") {
            recordCanonicalStartupReconciliation({
                run,
                aggregateState: aggregate.state,
                aggregateRevision: aggregate.revision,
                aggregateWorkId: aggregate.workId,
                reasonCode: canonicalDecision.reasonCode,
            });
            runSummaries.push({
                runId: run.id,
                lineageRootRunId: run.lineageRootRunId,
                previousStatus: run.status,
                recoveryStatus: "interrupted",
                nextRunStatus: "interrupted",
                summary: "runtime manifest 불일치로 자동 재실행을 차단하고 별도 진단에 기록했습니다.",
                pendingApprovals: [],
                pendingDelivery: [],
                duplicateRisk: true,
            });
            upsertTaskContinuity({
                lineageRootRunId: run.lineageRootRunId,
                ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
                ...(run.handoffSummary ? { handoffSummary: run.handoffSummary } : {}),
                lastGoodState: run.summary,
                pendingApprovals: [],
                pendingDelivery: [],
                status: "interrupted",
            });
            const updated = updateRunStatus(run.id, "interrupted", run.summary, false);
            if (updated)
                recovered.push(updated);
            continue;
        }
        if (canonicalDecision?.kind === "resume_delivery"
            && canonicalDecision.deliveryMode === "commit_transition_only"
            && committedDelivery?.delivery_key
            && committedDelivery.idempotency_key) {
            const aggregateRevision = aggregate?.revision;
            if (aggregateRevision === undefined)
                continue;
            const finalOutcome = aggregate?.state === "SUCCEEDED"
                ? "succeeded"
                : aggregate?.state === "PARTIALLY_SUCCEEDED"
                    ? "partial"
                    : aggregate?.state === "BLOCKED"
                        ? "blocked"
                        : aggregate?.state === "EXHAUSTED"
                            ? "exhausted"
                            : "cancelled";
            const built = buildCanonicalRecoveredDeliveryDescriptor({
                runId: run.id,
                finalOutcome,
                committedLedgerEventId: committedDelivery.id,
                deliveryKey: committedDelivery.delivery_key,
                idempotencyKey: committedDelivery.idempotency_key,
            });
            const receiptRepository = new SqliteCanonicalWorkReceiptRepository(getDb(), () => Date.now());
            const recorded = built.ok
                ? recordCanonicalFinalizationTransition(built.descriptor, {
                    issueReceipt: (receipt) => receiptRepository.issue(receipt),
                    loadReceipt: (receiptId) => receiptRepository.load(receiptId),
                    applyTransition: ({ runId, workId, event, receiptRef, finalOutcome }) => applyCanonicalRunTransition({
                        runId,
                        workId,
                        expectedRevision: aggregateRevision,
                        event,
                        receiptRef,
                        ...(finalOutcome ? { finalOutcome } : {}),
                    }),
                })
                : built;
            const updated = getRootRun(run.id);
            const summary = recorded.ok
                ? "재시작 전 커밋된 최종 전달을 재전송하지 않고 canonical 종료 전이만 복구했습니다."
                : `canonical delivery 복구가 차단되었습니다: ${recorded.reasonCode}`;
            runSummaries.push({
                runId: run.id,
                lineageRootRunId: run.lineageRootRunId,
                previousStatus: run.status,
                recoveryStatus: recorded.ok ? "delivered" : "stale",
                ...(updated ? { nextRunStatus: updated.status } : {}),
                summary,
                pendingApprovals: [],
                pendingDelivery: [],
                duplicateRisk: false,
            });
            appendRunEvent(run.id, summary);
            if (updated)
                recovered.push(updated);
            continue;
        }
        const recovery = canonicalDecision
            ? canonicalDecision.kind === "resume_waiting"
                ? classifyStartupRecovery({ ...run, status: canonicalDecision.projectionStatus }, continuity)
                : canonicalDecision.kind === "resume_delivery"
                    ? {
                        status: "pending_delivery",
                        nextRunStatus: "awaiting_user",
                        summary: "canonical 최종 결과가 있으나 안전하게 복원할 응답 artifact가 없어 자동 전달하지 않습니다.",
                        pendingApprovals: [],
                        pendingDelivery: [`canonical-delivery:${run.id}`],
                        safeToAutoExecute: false,
                        safeToAutoDeliver: false,
                        requiresUserConfirmation: true,
                        duplicateRisk: true,
                    }
                    : {
                        status: "interrupted",
                        nextRunStatus: "interrupted",
                        summary: `canonical 재시작 복구가 자동 실행을 차단했습니다: ${canonicalDecision.reasonCode}`,
                        pendingApprovals: [],
                        pendingDelivery: [],
                        safeToAutoExecute: false,
                        safeToAutoDeliver: false,
                        requiresUserConfirmation: true,
                        duplicateRisk: true,
                    }
            : classifyStartupRecovery(run, continuity);
        runSummaries.push({
            runId: run.id,
            lineageRootRunId: run.lineageRootRunId,
            previousStatus: run.status,
            recoveryStatus: recovery.status,
            ...(recovery.nextRunStatus ? { nextRunStatus: recovery.nextRunStatus } : {}),
            summary: recovery.summary,
            pendingApprovals: recovery.pendingApprovals ?? [],
            pendingDelivery: recovery.pendingDelivery ?? [],
            duplicateRisk: recovery.duplicateRisk,
        });
        upsertTaskContinuity({
            lineageRootRunId: run.lineageRootRunId,
            ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
            ...(run.handoffSummary ? { handoffSummary: run.handoffSummary } : {}),
            lastGoodState: recovery.summary,
            ...(recovery.pendingApprovals ? { pendingApprovals: recovery.pendingApprovals } : {}),
            ...(recovery.pendingDelivery ? { pendingDelivery: recovery.pendingDelivery } : {}),
            status: recovery.status,
        });
        if (recovery.status === "delivered") {
            appendRunEvent(run.id, "프로세스 재시작 후 전달 완료 상태 복구");
            setRunStepStatus(run.id, "finalizing", "completed", recovery.summary);
            setRunStepStatus(run.id, "completed", "completed", recovery.summary);
            const updated = updateRunStatus(run.id, "completed", recovery.summary, false);
            if (updated)
                recovered.push(updated);
            continue;
        }
        if (recovery.status === "awaiting_approval") {
            appendRunEvent(run.id, "프로세스 재시작 후 승인 대기 상태 복구");
            setRunStepStatus(run.id, "awaiting_approval", "running", recovery.summary);
            const updated = updateRunStatus(run.id, "awaiting_approval", recovery.summary, true);
            if (updated)
                recovered.push(updated);
            continue;
        }
        if (recovery.status === "pending_delivery" || recovery.status === "awaiting_user") {
            appendRunEvent(run.id, "프로세스 재시작 후 사용자 확인 대기 상태 복구");
            setRunStepStatus(run.id, "awaiting_user", "running", recovery.summary);
            const updated = updateRunStatus(run.id, "awaiting_user", recovery.summary, true);
            if (updated)
                recovered.push(updated);
            continue;
        }
        if (recovery.status === "interrupted") {
            appendRunEvent(run.id, "프로세스 재시작으로 자동 재실행 없이 중단 처리");
            setRunStepStatus(run.id, resolveInterruptStepKey(run), "cancelled", recovery.summary);
            const updated = updateRunStatus(run.id, "interrupted", recovery.summary, false);
            if (updated)
                recovered.push(updated);
        }
    }
    const interruptedSchedules = interruptUnfinishedScheduleRunsOnStartup();
    setLastStartupRecoverySummary(buildStartupRecoverySummary({
        runs: runSummaries,
        schedules: interruptedSchedules.map(summarizeInterruptedScheduleRun),
    }));
    return recovered;
}
export function getRootRun(runId) {
    const row = getDb()
        .prepare("SELECT * FROM root_runs WHERE id = ?")
        .get(runId);
    return row ? hydrateRun(row) : undefined;
}
function resolveStoredDeliveryOutcome(runId) {
    const events = listMessageLedgerEvents({ runId, limit: 1_000 });
    const delivered = events.some((event) => event.event_kind === "final_answer_delivered"
        && (event.status === "delivered" || event.status === "succeeded" || event.status === "sent")
        && messageLedgerEventHasRequiredDeliveryEvidence(event));
    if (delivered)
        return "delivered";
    const pendingResponse = new SqliteCanonicalPendingResponseRepository(getDb(), () => Date.now()).loadPending(runId);
    if (pendingResponse)
        return "pending";
    if (events.some((event) => event.event_kind === "text_delivery_failed"
        || event.event_kind === "final_answer_suppressed"))
        return "failed";
    if (events.some((event) => event.event_kind === "final_answer_generated"))
        return "pending";
    return "not_started";
}
export function getRequestExecutionOutcome(runId) {
    const run = getRootRun(runId);
    if (!run)
        return undefined;
    const aggregate = new SqliteCanonicalWorkRepository(getDb(), () => Date.now()).load(canonicalWorkIdForRootRun(runId));
    if (!aggregate)
        return undefined;
    return projectRequestExecutionOutcome({
        aggregate,
        runStatus: run.status,
        deliveryStatus: resolveStoredDeliveryOutcome(runId),
    });
}
export function listRequestGroupRuns(requestGroupId) {
    return getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE request_group_id = ?
       ORDER BY created_at ASC, updated_at ASC`)
        .all(requestGroupId)
        .map(hydrateRun);
}
function listCancellationScopeRuns(current) {
    const lineageKey = current.lineageRootRunId || current.requestGroupId || current.id;
    const rows = getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE id = ?
          OR request_group_id = ?
          OR parent_run_id = ?
          OR COALESCE(lineage_root_run_id, request_group_id, id) = ?
       ORDER BY created_at ASC, updated_at ASC`)
        .all(current.id, current.requestGroupId, current.id, lineageKey)
        .map(hydrateRun);
    const deduped = new Map();
    for (const run of rows) {
        if (deduped.has(run.id))
            continue;
        deduped.set(run.id, run);
    }
    return [...deduped.values()].filter((run) => ACTIVE_REQUEST_GROUP_STATUSES.includes(run.status) || activeRunControllers.has(run.id));
}
export function hasActiveRequestGroupRuns(requestGroupId) {
    return listRequestGroupRuns(requestGroupId).some((run) => ACTIVE_REQUEST_GROUP_STATUSES.includes(run.status));
}
export function isReusableRequestGroup(requestGroupId) {
    const runs = listRequestGroupRuns(requestGroupId);
    if (runs.length === 0)
        return false;
    return runs.some((run) => ACTIVE_REQUEST_GROUP_STATUSES.includes(run.status));
}
export function getRequestGroupDelegationTurnCount(requestGroupId) {
    const row = getDb()
        .prepare(`SELECT MAX(delegation_turn_count) as max_count
       FROM root_runs
       WHERE request_group_id = ?`)
        .get(requestGroupId);
    return row?.max_count ?? 0;
}
export function findReconnectRequestGroupSelection(sessionId, message) {
    void message;
    const runs = getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE session_id = ?
       ORDER BY updated_at DESC
       LIMIT 80`)
        .all(sessionId)
        .map(hydrateRun);
    const grouped = new Map();
    for (const run of runs) {
        if (!grouped.has(run.requestGroupId)) {
            grouped.set(run.requestGroupId, run);
        }
    }
    const reusableRuns = [...grouped.values()].filter((run) => isActiveRequestGroupStatus(run.status));
    return {
        candidates: reusableRuns.slice(0, 3),
        ambiguous: reusableRuns.length > 1,
    };
}
export function findReconnectRequestGroup(sessionId, message) {
    return findReconnectRequestGroupSelection(sessionId, message).best;
}
function resolveInterruptStepKey(run) {
    if (DEFAULT_RUN_STEPS.some((step) => step.key === run.currentStepKey)) {
        return run.currentStepKey;
    }
    switch (run.status) {
        case "awaiting_approval":
            return "awaiting_approval";
        case "awaiting_user":
            return "awaiting_user";
        case "queued":
            return "received";
        default:
            return "executing";
    }
}
export function findLatestWorkerSessionRun(requestGroupId, workerSessionId, excludingRunId) {
    const runs = getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE request_group_id = ?
         AND worker_session_id = ?
       ORDER BY updated_at DESC
       LIMIT 40`)
        .all(requestGroupId, workerSessionId)
        .map(hydrateRun);
    return runs.find((run) => (excludingRunId ? run.id !== excludingRunId : true));
}
export function interruptOrphanWorkerSessionRuns(params) {
    const summary = params.summary ?? "새 작업 세션이 시작되어 이전 실행을 정리했습니다.";
    const runs = getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE request_group_id = ?
         AND worker_session_id = ?
         AND id != ?
       ORDER BY updated_at DESC`)
        .all(params.requestGroupId, params.workerSessionId, params.keepRunId)
        .map(hydrateRun)
        .filter((run) => ACTIVE_WORKER_SESSION_STATUSES.includes(run.status));
    const interrupted = [];
    for (const run of runs) {
        const controller = activeRunControllers.get(run.id);
        if (controller) {
            controller.abort();
            clearActiveRunController(run.id);
        }
        appendRunEvent(run.id, "새 작업 세션이 연결되어 이전 실행을 중단합니다.");
        setRunStepStatus(run.id, resolveInterruptStepKey(run), "cancelled", summary);
        const updated = updateRunStatus(run.id, "interrupted", summary, false);
        interrupted.push(updated ?? run);
    }
    return interrupted;
}
export function createRootRun(params) {
    const now = Date.now();
    const totalSteps = DEFAULT_RUN_STEPS.length;
    const taskProfile = params.taskProfile ?? "general_chat";
    const summary = params.prompt.trim();
    const title = truncateTitle(params.prompt);
    const runtimeManifestId = (() => {
        const current = getLastRuntimeManifest();
        if (current)
            return current.id;
        return null;
    })();
    const db = getDb();
    const identifiers = resolveRunFlowIdentifiers({
        runId: params.id,
        sessionId: params.sessionId,
        ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
        ...(params.lineageRootRunId ? { lineageRootRunId: params.lineageRootRunId } : {}),
        ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
        ...(params.runScope ? { runScope: params.runScope } : {}),
    });
    const promptSourceSnapshot = {
        ...(params.promptSourceSnapshot ?? {}),
        ...(params.orchestrationMode && !params.promptSourceSnapshot?.orchestration
            ? { orchestration: { mode: params.orchestrationMode } }
            : {}),
    };
    const tx = db.transaction(() => {
        db.prepare(`INSERT INTO root_runs
       (id, session_id, request_group_id, lineage_root_run_id, parent_run_id, run_scope, handoff_summary,
        title, prompt, source, status, task_profile, target_id, target_label,
        worker_runtime_kind, worker_session_id, context_mode,
        delegation_turn_count, max_delegation_turns, current_step_key, current_step_index,
        total_steps, summary, can_cancel, prompt_source_snapshot, runtime_manifest_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(params.id, params.sessionId, identifiers.requestGroupId, identifiers.lineageRootRunId, identifiers.parentRunId ?? null, identifiers.runScope, params.handoffSummary ?? null, title, params.prompt, params.source, "queued", taskProfile, params.targetId ?? null, params.targetLabel ?? null, params.workerRuntimeKind ?? null, params.workerSessionId ?? null, params.contextMode ?? "full", params.delegationTurnCount ?? 0, params.maxDelegationTurns ?? 0, "received", 1, totalSteps, summary, 1, Object.keys(promptSourceSnapshot).length > 0 ? JSON.stringify(promptSourceSnapshot) : null, runtimeManifestId, now, now);
        const insertStep = db.prepare(`INSERT INTO run_steps
       (id, run_id, step_key, title, step_index, status, summary, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        DEFAULT_RUN_STEPS.forEach((step, index) => {
            insertStep.run(crypto.randomUUID(), params.id, step.key, step.title, index + 1, index === 0 ? "running" : "pending", index === 0 ? "요청을 받았습니다." : "", index === 0 ? now : null, null);
        });
        db.prepare(`INSERT INTO run_events (id, run_id, at, label)
       VALUES (?, ?, ?, ?)`).run(crypto.randomUUID(), params.id, now, "요청 수신");
        if (identifiers.runScope === "root") {
            const canonical = new SqliteCanonicalWorkRepository(db, () => now);
            const created = canonical.create(createCanonicalWorkAggregate({
                workId: canonicalWorkIdForRootRun(params.id),
                rootRunId: params.id,
            }));
            if (!created.created)
                throw new Error("Canonical root work aggregate already exists.");
        }
    });
    tx();
    const run = getRootRun(params.id);
    if (!run)
        throw new Error(`Created root run could not be reloaded: ${params.id}`);
    recordMessageLedgerEvent({
        runId: params.id,
        requestGroupId: run.requestGroupId,
        sessionKey: params.sessionId,
        channel: params.source,
        eventKind: "ingress_received",
        idempotencyKey: `ingress:${params.id}`,
        status: "received",
        summary: "요청을 수신했습니다.",
        detail: {
            source: params.source,
            promptLength: params.prompt.length,
            taskProfile,
        },
    });
    if (run.runScope === "root") {
        recordCanonicalRequestReceivedObservability({
            repository: new SqliteTypedObservabilityEventRepository(),
            workId: canonicalWorkIdForRootRun(run.id),
            context: {
                requestId: run.id,
                requestGroupId: run.requestGroupId,
                rootRunId: run.lineageRootRunId,
                runId: run.id,
                ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
                at: run.createdAt,
            },
            onDegraded: (error) => log.fieldDebug(`Typed ingress observability write degraded: ${redactLogText(error instanceof Error ? error.message : String(error), "debug")}`),
        });
    }
    eventBus.emit("run.created", { run });
    eventBus.emit("run.progress", { run });
    return run;
}
export function appendRunEvent(runId, label) {
    const at = Date.now();
    getDb()
        .prepare("INSERT INTO run_events (id, run_id, at, label) VALUES (?, ?, ?, ?)")
        .run(crypto.randomUUID(), runId, at, label);
}
export function mergeRunPromptSourceSnapshot(runId, patch) {
    const current = getRootRun(runId);
    if (!current)
        return undefined;
    const nextSnapshot = {
        ...(current.promptSourceSnapshot ?? {}),
        ...patch,
    };
    const now = Date.now();
    getDb()
        .prepare("UPDATE root_runs SET prompt_source_snapshot = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(nextSnapshot), now, runId);
    const updated = getRootRun(runId);
    if (updated)
        eventBus.emit("run.progress", { run: updated });
    return updated;
}
export function updateRunSummary(runId, summary) {
    const now = Date.now();
    getDb()
        .prepare("UPDATE root_runs SET summary = ?, updated_at = ? WHERE id = ?")
        .run(summary, now, runId);
    const run = getRootRun(runId);
    if (run) {
        eventBus.emit("run.summary", { runId, summary: run.summary, run });
        eventBus.emit("run.progress", { run });
    }
    return run;
}
export function updateRunStatus(runId, status, summary, canCancel) {
    const now = Date.now();
    const current = getRootRun(runId);
    if (!current)
        return undefined;
    let nextStatus = status;
    let nextSummary = summary ?? current.summary;
    let nextCanCancel = canCancel ?? current.canCancel;
    let deliveredAnswerProtected = false;
    if ((status === "failed" || status === "cancelled" || status === "interrupted") && current.status !== "completed") {
        const finalizer = finalizeDeliveryForRun({
            runId,
            requestedStatus: status,
            ...(summary !== undefined ? { requestedSummary: summary } : {}),
        });
        if (finalizer.shouldProtectDeliveredAnswer && finalizer.runStatus) {
            nextStatus = finalizer.runStatus;
            nextSummary = finalizer.summary ?? nextSummary;
            nextCanCancel = false;
            deliveredAnswerProtected = true;
            appendRunEvent(runId, `delivery_finalizer:${finalizer.outcome}`);
        }
    }
    const transition = canTransitionRunStatus(current.status, nextStatus);
    if (!transition.allowed) {
        appendRunEvent(runId, `status_transition_blocked:${transition.reason}`);
        return current;
    }
    getDb()
        .prepare("UPDATE root_runs SET status = ?, summary = ?, can_cancel = ?, updated_at = ? WHERE id = ?")
        .run(nextStatus, nextSummary, nextCanCancel ? 1 : 0, now, runId);
    if (deliveredAnswerProtected && nextStatus === "completed") {
        for (const stepKey of [
            "received",
            "classified",
            "target_selected",
            "executing",
            "reviewing",
            "finalizing",
            "completed",
        ]) {
            setRunStepStatus(runId, stepKey, "completed", nextSummary);
        }
    }
    const run = getRootRun(runId);
    if (run) {
        eventBus.emit("run.status", { run });
        eventBus.emit("run.progress", { run });
        if (nextStatus === "completed")
            eventBus.emit("run.completed", { run });
        if (nextStatus === "failed")
            eventBus.emit("run.failed", { run });
        if (nextStatus === "cancelled")
            eventBus.emit("run.cancelled", { run });
    }
    return run;
}
export function applyCanonicalRunTransition(command) {
    const db = getDb();
    let result;
    try {
        result = db.transaction(() => {
            const run = getRootRun(command.runId);
            if (!run)
                return { status: "rejected", reasonCode: "aggregate_not_found" };
            const repository = new SqliteCanonicalWorkRepository(db, () => Date.now());
            const receiptRepository = new SqliteCanonicalWorkReceiptRepository(db, () => Date.now());
            const receipt = receiptRepository.load(command.receiptRef);
            if (!receipt)
                return { status: "receipt_rejected", reasonCode: "receipt_not_found" };
            const receiptValidation = validateCanonicalWorkReceiptForEvent({
                receipt,
                workId: canonicalWorkIdForRootRun(command.runId),
                event: command.event,
            });
            if (!receiptValidation.ok)
                return { status: "receipt_rejected", reasonCode: receiptValidation.reasonCode };
            const decision = executeCanonicalWorkTransition({
                repository,
                input: {
                    workId: canonicalWorkIdForRootRun(command.runId),
                    expectedRevision: command.expectedRevision,
                    event: command.event,
                    receiptRef: command.receiptRef,
                    ...(command.waitingKind ? { waitingKind: command.waitingKind } : {}),
                    ...(command.finalOutcome ? { finalOutcome: command.finalOutcome } : {}),
                },
            });
            if (decision.status !== "applied")
                return decision;
            const consumed = receiptRepository.consume({
                receiptId: command.receiptRef,
                workId: decision.aggregate.workId,
                revision: decision.aggregate.revision,
            });
            if (!consumed.consumed)
                throw new Error("Canonical transition receipt consumption failed.");
            const projectedStatus = decision.runProjection.runStatus;
            const canCancel = !["completed", "failed", "cancelled", "interrupted"].includes(projectedStatus);
            const update = db.prepare(`
        UPDATE root_runs SET status = ?, can_cancel = ?, updated_at = ? WHERE id = ?
      `).run(projectedStatus, canCancel ? 1 : 0, Date.now(), command.runId);
            if (update.changes !== 1)
                throw new Error("Canonical RootRun projection target is missing.");
            const updated = getRootRun(command.runId);
            if (!updated)
                throw new Error("Canonical RootRun projection could not be loaded.");
            return { ...decision, run: updated };
        })();
    }
    catch {
        return { status: "persistence_failed", reasonCode: "canonical_run_transition_persistence_failed" };
    }
    if (result.status === "applied") {
        recordCanonicalTransitionObservability({
            repository: new SqliteTypedObservabilityEventRepository(),
            aggregate: result.aggregate,
            context: {
                requestId: result.run.id,
                requestGroupId: result.run.requestGroupId,
                rootRunId: result.run.lineageRootRunId,
                runId: result.run.id,
                ...(result.run.parentRunId ? { parentRunId: result.run.parentRunId } : {}),
                at: result.run.updatedAt,
            },
            onDegraded: (error) => log.fieldDebug(`Typed observability write degraded: ${redactLogText(error instanceof Error ? error.message : String(error), "debug")}`),
        });
        eventBus.emit("run.status", { run: result.run });
        eventBus.emit("run.progress", { run: result.run });
        if (result.run.status === "completed")
            eventBus.emit("run.completed", { run: result.run });
        if (result.run.status === "failed")
            eventBus.emit("run.failed", { run: result.run });
        if (result.run.status === "cancelled")
            eventBus.emit("run.cancelled", { run: result.run });
    }
    return result;
}
export function incrementDelegationTurnCount(runId, summary) {
    const now = Date.now();
    const current = getRootRun(runId);
    if (!current)
        return undefined;
    const nextCount = current.delegationTurnCount + 1;
    getDb()
        .prepare(`UPDATE root_runs
       SET delegation_turn_count = CASE
             WHEN delegation_turn_count < ? THEN ?
             ELSE delegation_turn_count
           END,
           summary = CASE WHEN id = ? THEN ? ELSE summary END,
           updated_at = CASE WHEN id = ? THEN ? ELSE updated_at END
       WHERE request_group_id = ?`)
        .run(nextCount, nextCount, runId, summary ?? current.summary, runId, now, current.requestGroupId);
    const runs = listRequestGroupRuns(current.requestGroupId);
    for (const run of runs) {
        eventBus.emit("run.progress", { run });
    }
    return runs.find((run) => run.id === runId);
}
export function updateActiveRunsMaxDelegationTurns(maxDelegationTurns) {
    const now = Date.now();
    getDb()
        .prepare(`UPDATE root_runs
       SET max_delegation_turns = ?, updated_at = ?
       WHERE status IN ('queued', 'running', 'awaiting_approval', 'awaiting_user')`)
        .run(maxDelegationTurns, now);
    const runs = getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE status IN ('queued', 'running', 'awaiting_approval', 'awaiting_user')
       ORDER BY updated_at DESC`)
        .all()
        .map(hydrateRun);
    for (const run of runs) {
        eventBus.emit("run.progress", { run });
    }
    return runs;
}
export function setRunStepStatus(runId, stepKey, status, summary) {
    const now = Date.now();
    const step = DEFAULT_RUN_STEPS.find((item) => item.key === stepKey);
    if (!step)
        return undefined;
    const currentRow = getDb()
        .prepare(`SELECT run_id, step_key, title, step_index, status, summary, started_at, finished_at
       FROM run_steps WHERE run_id = ? AND step_key = ?`)
        .get(runId, stepKey);
    if (!currentRow)
        return undefined;
    const startedAt = currentRow.started_at ?? now;
    const finishedAt = status === "running" ? null : now;
    getDb()
        .prepare(`UPDATE run_steps
       SET status = ?, summary = ?, started_at = ?, finished_at = ?
       WHERE run_id = ? AND step_key = ?`)
        .run(status, summary, startedAt, finishedAt, runId, stepKey);
    getDb()
        .prepare(`UPDATE root_runs
       SET current_step_key = ?, current_step_index = ?, summary = ?, updated_at = ?
       WHERE id = ?`)
        .run(stepKey, currentRow.step_index, summary, now, runId);
    const run = getRootRun(runId);
    if (run) {
        const updatedStep = run.steps.find((item) => item.key === stepKey);
        if (updatedStep) {
            if (status === "running")
                eventBus.emit("run.step.started", { runId, step: updatedStep, run });
            else
                eventBus.emit("run.step.completed", { runId, step: updatedStep, run });
        }
        eventBus.emit("run.progress", { run });
    }
    return run;
}
export function bindActiveRunController(runId, controller) {
    activeRunControllers.set(runId, controller);
}
export function clearActiveRunController(runId) {
    activeRunControllers.delete(runId);
}
export function cancelRootRun(runId, options = {}) {
    const current = getRootRun(runId);
    if (!current)
        return undefined;
    const activeRuns = listCancellationScopeRuns(current);
    if (activeRuns.length === 0)
        return undefined;
    for (const run of activeRuns) {
        appendRunEvent(run.id, options.eventLabel ?? "취소 요청");
        eventBus.emit("run.cancel.requested", { runId: run.id });
        const controller = activeRunControllers.get(run.id);
        if (controller) {
            controller.abort();
            clearActiveRunController(run.id);
        }
        const stepKey = resolveInterruptStepKey(run);
        setRunStepStatus(run.id, stepKey, "cancelled", options.stepSummary ?? "사용자가 실행 취소를 요청했습니다.");
        updateRunStatus(run.id, "cancelled", options.runSummary ?? "사용자가 실행을 취소했습니다.", false);
    }
    return getRootRun(runId) ?? current;
}
export function cleanupStaleRunStates(options = {}) {
    const now = options.now ?? Date.now();
    const thresholdMs = Math.max(60_000, options.staleMs ?? DEFAULT_STALE_RUN_CLEANUP_MS);
    const cutoff = now - thresholdMs;
    const rows = getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE status IN ('queued', 'running', 'awaiting_approval', 'awaiting_user')
         AND updated_at <= ?
       ORDER BY updated_at ASC`)
        .all(cutoff);
    const cleanedRunIds = [];
    const skippedRunIds = [];
    for (const row of rows) {
        const run = hydrateRun(row);
        const controller = activeRunControllers.get(run.id);
        if (controller) {
            controller.abort();
            clearActiveRunController(run.id);
        }
        const summary = staleCleanupSummary(run);
        appendRunEvent(run.id, "운영자가 오래된 대기 상태를 정리했습니다.");
        setRunStepStatus(run.id, resolveInterruptStepKey(run), "cancelled", summary);
        const updated = updateRunStatus(run.id, "interrupted", summary, false);
        if (updated?.status === "interrupted") {
            cleanedRunIds.push(run.id);
            insertDiagnosticEvent({
                kind: "stale_run_cleanup",
                summary,
                runId: run.id,
                sessionId: run.sessionId,
                requestGroupId: run.requestGroupId,
                detail: {
                    previousStatus: run.status,
                    ageMs: now - run.updatedAt,
                    thresholdMs,
                },
            });
        }
        else {
            skippedRunIds.push(run.id);
        }
    }
    insertAuditLog({
        timestamp: now,
        session_id: null,
        source: "system",
        tool_name: "stale_run_cleanup",
        params: JSON.stringify({ thresholdMs }),
        output: JSON.stringify({ cleanedRunIds, skippedRunIds }),
        result: skippedRunIds.length === 0 ? "success" : "partial",
        duration_ms: 0,
        approval_required: 1,
        approved_by: "webui",
    });
    return {
        cleanedRunCount: cleanedRunIds.length,
        skippedRunCount: skippedRunIds.length,
        cleanedRunIds,
        skippedRunIds,
        thresholdMs,
    };
}
function staleCleanupSummary(run) {
    switch (run.status) {
        case "awaiting_approval":
            return "오래된 승인 대기 상태를 운영 정리했습니다. 작업은 자동 재실행하지 않습니다.";
        case "awaiting_user":
            return "오래된 사용자 확인 또는 결과 전달 대기 상태를 운영 정리했습니다. 작업은 자동 재전송하지 않습니다.";
        case "queued":
            return "오래된 실행 대기 상태를 운영 정리했습니다. 작업은 자동 실행하지 않습니다.";
        case "running":
            return "오래된 실행 중 상태를 운영 정리했습니다. 작업은 자동 재실행하지 않습니다.";
        default:
            return "오래된 실행 상태를 운영 정리했습니다.";
    }
}
export function deleteRunHistory(runId) {
    const target = getDb()
        .prepare("SELECT * FROM root_runs WHERE id = ?")
        .get(runId);
    if (!target)
        return undefined;
    const lineageKey = resolveLineageKey(target);
    const rows = selectRunRowsForLineage(lineageKey);
    const retainedRows = rows.filter((row) => decideCleanupCandidate({
        candidateId: `run_history:${row.id}`,
        dataKind: "run_history",
        retentionClass: "expired",
        activeReferenceCount: ACTIVE_REQUEST_GROUP_STATUSES.includes(row.status) || activeRunControllers.has(row.id) ? 1 : 0,
        referenceScanCompleted: true,
        migrationRequired: false,
        rollbackRequired: false,
        deletionApproved: true,
    }).decision === "retain");
    if (retainedRows.length > 0) {
        insertDiagnosticEvent({
            kind: "active_run_delete_blocked",
            summary: "진행 중인 실행 기록 삭제 요청을 차단했습니다.",
            runId,
            requestGroupId: target.request_group_id ?? target.id,
            sessionId: target.session_id,
            detail: {
                lineageKey,
                blockedRunIds: retainedRows.map((row) => row.id),
            },
        });
        return { deletedRunCount: 0, blockedRunCount: retainedRows.length };
    }
    const runIds = rows.map((row) => row.id);
    const requestGroupIds = [...new Set(rows.map((row) => row.request_group_id).filter((value) => typeof value === "string" && value.length > 0))];
    return {
        deletedRunCount: deleteRunRows({ runIds, requestGroupIds }),
    };
}
export function clearHistoricalRunHistory() {
    const rows = getDb()
        .prepare(`SELECT *
       FROM root_runs
       WHERE status IN ('completed', 'failed', 'cancelled', 'interrupted')
       ORDER BY updated_at DESC`)
        .all();
    if (rows.length === 0) {
        return { deletedRunCount: 0 };
    }
    const deletableRows = rows.filter((row) => decideCleanupCandidate({
        candidateId: `run_history:${row.id}`,
        dataKind: "run_history",
        retentionClass: "expired",
        activeReferenceCount: activeRunControllers.has(row.id) ? 1 : 0,
        referenceScanCompleted: true,
        migrationRequired: false,
        rollbackRequired: false,
        deletionApproved: true,
    }).decision === "delete");
    const runIds = deletableRows.map((row) => row.id);
    const requestGroupIds = [...new Set(deletableRows.map((row) => row.request_group_id).filter((value) => typeof value === "string" && value.length > 0))];
    return {
        deletedRunCount: deleteRunRows({ runIds, requestGroupIds }),
    };
}
//# sourceMappingURL=store.js.map