export async function consumeApprovedOperationContinuation(input, dependencies) {
    if (input.signal.aborted) {
        const settled = dependencies.repository.cancel({
            continuationId: input.continuation.continuationId,
            ownerId: input.ownerId,
        });
        return settled.status === "cancelled"
            ? {
                status: "cancelled",
                reasonCode: "approval_continuation_cancelled_before_execution",
                toolName: input.continuation.toolName,
            }
            : {
                status: "blocked",
                reasonCode: settled.reasonCode,
                toolName: input.continuation.toolName,
            };
    }
    const adapter = dependencies.adapters.find((candidate) => candidate.toolName === input.continuation.toolName);
    const execution = adapter
        ? await adapter.execute({
            continuation: input.continuation,
            signal: input.signal,
        })
        : {
            status: "blocked",
            reasonCode: "approval_continuation_adapter_missing",
        };
    if (execution.status === "completed") {
        const handedOff = await dependencies.handoffCompletedResult({
            continuation: input.continuation,
            toolUseId: execution.toolUseId,
            result: execution.result,
        });
        if (!handedOff.ok) {
            const settled = dependencies.repository.fail({
                continuationId: input.continuation.continuationId,
                ownerId: input.ownerId,
            });
            return settled.status === "failed"
                ? {
                    status: "blocked",
                    reasonCode: handedOff.reasonCode,
                    toolName: input.continuation.toolName,
                }
                : {
                    status: "blocked",
                    reasonCode: settled.reasonCode,
                    toolName: input.continuation.toolName,
                };
        }
        const settled = dependencies.repository.complete({
            continuationId: input.continuation.continuationId,
            ownerId: input.ownerId,
        });
        return settled.status === "completed"
            ? { status: "completed", toolName: input.continuation.toolName }
            : {
                status: "blocked",
                reasonCode: settled.reasonCode,
                toolName: input.continuation.toolName,
            };
    }
    if (execution.status === "cancelled") {
        const settled = dependencies.repository.cancel({
            continuationId: input.continuation.continuationId,
            ownerId: input.ownerId,
        });
        return settled.status === "cancelled"
            ? {
                status: "cancelled",
                reasonCode: execution.reasonCode,
                toolName: input.continuation.toolName,
            }
            : {
                status: "blocked",
                reasonCode: settled.reasonCode,
                toolName: input.continuation.toolName,
            };
    }
    const settled = dependencies.repository.fail({
        continuationId: input.continuation.continuationId,
        ownerId: input.ownerId,
    });
    return settled.status === "failed"
        ? {
            status: execution.status,
            reasonCode: execution.reasonCode,
            toolName: input.continuation.toolName,
        }
        : {
            status: "blocked",
            reasonCode: settled.reasonCode,
            toolName: input.continuation.toolName,
        };
}
//# sourceMappingURL=approved-operation-continuation-consumer.js.map