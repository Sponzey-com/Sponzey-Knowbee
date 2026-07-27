export async function applyUserExecutionControl(input) {
    if (input.decision.status === "ignored")
        return input.decision;
    await input.cancelRun(input.currentRunId);
    if (input.decision.status === "cancelled") {
        return { status: "cancelled", runId: input.currentRunId, commandId: input.decision.commandId };
    }
    const nextRunId = await input.startRedirectedRun({
        previousRunId: input.currentRunId,
        newGoalRef: input.decision.newGoalRef,
        commandId: input.decision.commandId,
    });
    return {
        status: "redirected",
        previousRunId: input.currentRunId,
        nextRunId,
        newGoalRef: input.decision.newGoalRef,
        commandId: input.decision.commandId,
    };
}
//# sourceMappingURL=user-execution-control-application.js.map