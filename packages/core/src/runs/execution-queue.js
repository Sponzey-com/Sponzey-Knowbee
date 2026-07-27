import { redactLogText } from "../logger/index.js";
import { DEFAULT_QUEUE_BUDGETS, QueueBackpressureError, recordQueueBackpressureEvent, } from "./queue-backpressure.js";
const requestGroupExecutionQueues = new Map();
function appendExecutionQueueEvent(dependencies, runId, message) {
    try {
        dependencies.appendRunEvent?.(runId, message);
    }
    catch {
        // Queue tracing must never block execution.
    }
}
function safeQueueErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
export function hasRequestGroupExecutionQueue(requestGroupId) {
    return requestGroupExecutionQueues.has(requestGroupId);
}
export function enqueueRequestGroupExecution(params, dependencies) {
    const existing = requestGroupExecutionQueues.get(params.requestGroupId);
    const maxPending = Math.max(0, Math.floor(params.maxPending ?? DEFAULT_QUEUE_BUDGETS.interactive_run.maxPending));
    const pendingCount = existing ? Math.max(0, existing.outstanding - 1) : 0;
    if (existing && pendingCount >= maxPending) {
        dependencies.logWarn(`request-group execution admission rejected: queue full; runId=${params.runId}; requestGroupId=${params.requestGroupId}; pending=${pendingCount}`);
        appendExecutionQueueEvent(dependencies, params.runId, "execution_queue_rejected:queue_full");
        recordQueueBackpressureEvent({
            queueName: "interactive_run",
            eventKind: "rejected",
            actionTaken: "queue_full",
            runId: params.runId,
            requestGroupId: params.requestGroupId,
            pendingCount,
        });
        const error = new QueueBackpressureError("queue_full", "interactive_run", "interactive_run queue is full");
        return dependencies.onAdmissionRejected
            ? dependencies.onAdmissionRejected({
                error,
                runId: params.runId,
                requestGroupId: params.requestGroupId,
                pendingCount,
            })
            : Promise.reject(error);
    }
    if (existing) {
        dependencies.logInfo("request-group execution queued behind active execution task", {
            runId: params.runId,
            requestGroupId: params.requestGroupId,
        });
        appendExecutionQueueEvent(dependencies, params.runId, "execution_queue_waiting");
        recordQueueBackpressureEvent({
            queueName: "interactive_run",
            eventKind: "queued",
            actionTaken: "wait_request_group_execution",
            runId: params.runId,
            requestGroupId: params.requestGroupId,
            pendingCount: pendingCount + 1,
        });
    }
    const state = existing ?? {
        tail: Promise.resolve(undefined),
        outstanding: 0,
    };
    state.outstanding += 1;
    const next = state.tail
        .catch((error) => {
        const message = safeQueueErrorMessage(error);
        dependencies.logWarn(`previous request-group execution queue recovered: ${message}`);
        return undefined;
    })
        .then(() => {
        appendExecutionQueueEvent(dependencies, params.runId, "execution_queue_running");
        recordQueueBackpressureEvent({
            queueName: "interactive_run",
            eventKind: "running",
            actionTaken: "run_request_group_execution",
            runId: params.runId,
            requestGroupId: params.requestGroupId,
        });
        return params.task();
    })
        .catch((error) => {
        const message = safeQueueErrorMessage(error);
        dependencies.logError("request-group execution queue task failed", {
            runId: params.runId,
            requestGroupId: params.requestGroupId,
            error: message,
        });
        recordQueueBackpressureEvent({
            queueName: "interactive_run",
            eventKind: "failed",
            actionTaken: "request_group_execution_failed",
            runId: params.runId,
            requestGroupId: params.requestGroupId,
            detail: { error: message },
        });
        return dependencies.getRootRun(params.runId);
    })
        .finally(() => {
        state.outstanding = Math.max(0, state.outstanding - 1);
        if (requestGroupExecutionQueues.get(params.requestGroupId) === state &&
            state.outstanding === 0) {
            requestGroupExecutionQueues.delete(params.requestGroupId);
        }
        appendExecutionQueueEvent(dependencies, params.runId, "execution_queue_released");
        recordQueueBackpressureEvent({
            queueName: "interactive_run",
            eventKind: "completed",
            actionTaken: "release_request_group_execution",
            runId: params.runId,
            requestGroupId: params.requestGroupId,
        });
    });
    state.tail = next;
    requestGroupExecutionQueues.set(params.requestGroupId, state);
    return next;
}
//# sourceMappingURL=execution-queue.js.map