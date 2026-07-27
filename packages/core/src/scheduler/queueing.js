import { redactLogText } from "../logger/index.js";
const scheduleExecutionQueues = new Map();
function scheduleQueueErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
export function hasScheduleExecutionQueue(scheduleId) {
    return scheduleExecutionQueues.has(scheduleId);
}
export function listScheduleExecutionQueueIds() {
    return [...scheduleExecutionQueues.keys()];
}
export function enqueueScheduleExecution(params, dependencies) {
    const previous = scheduleExecutionQueues.get(params.scheduleId);
    if (previous) {
        dependencies.logInfo("schedule run queued behind active schedule task", {
            scheduleId: params.scheduleId,
            scheduleName: params.scheduleName ?? null,
            trigger: params.trigger ?? null,
        });
    }
    const next = (previous ?? Promise.resolve())
        .catch((error) => {
        const message = scheduleQueueErrorMessage(error);
        dependencies.logWarn(`previous schedule queue recovered: ${message}`);
    })
        .then(() => params.task())
        .catch((error) => {
        const message = scheduleQueueErrorMessage(error);
        dependencies.logError("schedule queue task failed", {
            scheduleId: params.scheduleId,
            scheduleName: params.scheduleName ?? null,
            trigger: params.trigger ?? null,
            error: message,
        });
        throw error;
    })
        .finally(() => {
        if (scheduleExecutionQueues.get(params.scheduleId) === next) {
            scheduleExecutionQueues.delete(params.scheduleId);
        }
    });
    scheduleExecutionQueues.set(params.scheduleId, next);
    return next;
}
//# sourceMappingURL=queueing.js.map